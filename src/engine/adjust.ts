/**
 * Motor de ajuste por inflación.
 *
 * El problema de fondo: el IPC se publica con semanas de retraso, así que el mes en
 * curso nunca tiene dato y el anterior muchas veces tampoco. Y el uso dominante de
 * una calculadora de inflación es justamente traer un monto del pasado al presente.
 * O sea que el hueco no es un caso raro: es el caso normal.
 *
 * La respuesta de este motor tiene tres formas, según qué tan lejos llega el
 * período pedido (ver `Metodo` en types.ts):
 *
 *   directo           todo publicado, no hay nada que resolver
 *   ventana_reciente  el destino ya pasó pero no se publicó → se usa la inflación
 *                     de los últimos N meses publicados, sin inventar ningún número
 *   proyeccion        se estiman los meses que faltan con una tasa mensual fija,
 *                     que sale del último mes publicado o del REM del BCRA
 *
 * Cuál de las tres sale depende de la metodología elegida (`OpcionesAjuste`) y de si
 * el período llega o no más allá del mes en curso. `sin_proyectar` es el default y
 * sólo proyecta cuando le piden un mes futuro, donde no hay alternativa.
 *
 * La regla que gobierna el archivo sigue siendo la misma: nunca devolver un número
 * sin poder decir exactamente de qué meses salió. Por eso el desglose muestra
 * siempre los meses que se usaron de verdad, no los que se pidieron.
 */

// El motor mira cómo se imprime un porcentaje en un solo lugar: la frase que promete el
// resultado de sumar una columna tiene que dar lo que da sumar esa columna en pantalla.
import { comoSeMuestra } from "../ui/format.js";
import type {
  BaseProyeccion,
  Fila,
  Mes,
  Metodo,
  Metodologia,
  Punto,
  Resultado,
  SerieIndice,
} from "./types.js";
import {
  aOrdinal,
  compararMeses,
  deOrdinal,
  diaDe,
  diffMeses,
  esFecha,
  interpolarEnMes,
  mesDe,
  nombrarMes,
  primerDia,
  rangoMeses,
  sumarMeses,
} from "./mes.js";

export class RangoError extends RangeError {}

export type OpcionesAjuste = {
  /** Mes en curso. Parametrizable para poder testear sin depender del reloj. */
  hoy?: Mes;
  /** Qué hacer con los meses sin publicar. Default: no estimar nada. */
  metodologia?: Metodologia;
};

/**
 * Tasa mensual equivalente a una expectativa a doce meses, repartida pareja.
 *
 * Sólo se usa para los meses que quedan más allá del horizonte de la senda del REM.
 * Para los que la senda cubre se usa el valor que publicó el relevamiento.
 */
export function tasaMensualDelRem(expectativaAnualPct: number): number {
  return (Math.pow(1 + expectativaAnualPct / 100, 1 / 12) - 1) * 100;
}

/* ------------------------------------------------------------------- índice */

type Indice = {
  valorEn(punto: Punto): number;
  primerMes: Mes;
  ultimoOficial: Mes;
  /** Variación mensual del último mes publicado, en porcentaje. */
  ultimaVariacionPct: number;
  origenDe(mes: Mes): "indec" | "bcra";
};

function armarIndice(serie: SerieIndice): Indice {
  const { datos } = serie;
  if (datos.length < 2) {
    throw new RangoError("La serie necesita al menos 2 meses");
  }

  const porMes = new Map<Mes, number>();
  const origenPorMes = new Map<Mes, "indec" | "bcra">();
  for (const p of datos) {
    porMes.set(p.mes, p.indice);
    origenPorMes.set(p.mes, p.origen);
  }

  const primerMes = datos[0]!.mes;
  const ultimoOficial = serie.ultimo_oficial;
  const ultimo = datos.at(-1)!;
  const penultimo = datos.at(-2)!;

  function indiceDeMes(mes: Mes): number {
    const valor = porMes.get(mes);
    if (valor !== undefined) return valor;
    throw new RangoError(
      compararMeses(mes, primerMes) < 0
        ? `No hay datos de inflación anteriores a ${nombrarMes(primerMes)}. Pediste ${nombrarMes(mes)}.`
        : `El INDEC todavía no publicó ${nombrarMes(mes)}.`,
    );
  }

  return {
    primerMes,
    ultimoOficial,
    ultimaVariacionPct: (ultimo.indice / penultimo.indice - 1) * 100,
    origenDe: (mes) => origenPorMes.get(mes) ?? "indec",

    /**
     * Para un mes, su índice. Para un día, la parte proporcional de la inflación de
     * su propio mes (ver `interpolarEnMes`).
     */
    valorEn(punto: Punto): number {
      const mes = mesDe(punto);
      if (!esFecha(punto)) return indiceDeMes(mes);
      const anterior = sumarMeses(mes, -1);
      if (compararMeses(anterior, primerMes) < 0) {
        throw new RangoError(
          `Para una fecha de ${nombrarMes(mes)} hace falta el índice del mes anterior, ` +
            `y la serie arranca en ${nombrarMes(primerMes)}.`,
        );
      }
      return interpolarEnMes(indiceDeMes(anterior), indiceDeMes(mes), punto);
    },
  };
}

/* --------------------------------------------------------- meses y ventanas */

/**
 * Cuántos meses hay que retroceder un punto para que su índice sea calculable con
 * datos publicados.
 *
 * Días y meses tienen el mismo requisito —que el mes del punto esté publicado—
 * porque prorratear un día usa su propio mes y el anterior, nunca el siguiente.
 */
function desplazamientoNecesario(punto: Punto, ultimoOficial: Mes): number {
  return Math.max(0, diffMeses(ultimoOficial, mesDe(punto)));
}

function correr(punto: Punto, meses: number): Punto {
  if (meses === 0) return punto;
  const mes = sumarMeses(mesDe(punto), -meses);
  return esFecha(punto) ? `${mes}-${punto.slice(8, 10)}` : mes;
}

/**
 * El mes más nuevo que hace falta tener publicado para poder ubicar un punto.
 *
 * Un mes entero necesita su propio índice. Un día necesita el de su mes y el del
 * anterior, salvo el día 1, que es exactamente el cierre del mes anterior y por eso
 * no necesita el suyo. Esa excepción no es un detalle: sin ella, el tramo que va del
 * 1 de junio al 1 de julio queda marcado como estimado porque "julio no salió",
 * cuando lo que contiene es la inflación de junio, ya publicada.
 */
function mesTopeNecesario(punto: Punto): Mes {
  const mes = mesDe(punto);
  return esFecha(punto) && diaDe(punto) === 1 ? sumarMeses(mes, -1) : mes;
}

/**
 * Si el tramo entre dos puntos consecutivos del desglose abarca un mes calendario
 * completo. Con meses enteros siempre; con días, sólo cuando va del 1 de un mes al 1
 * del siguiente. Las puntas del período nunca lo cumplen.
 */
function cubreUnMesEntero(a: Punto, b: Punto): boolean {
  const arrancaElUno = (p: Punto) => !esFecha(p) || diaDe(p) === 1;
  return (
    arrancaElUno(a) && arrancaElUno(b) && Math.abs(diffMeses(mesDe(a), mesDe(b))) === 1
  );
}

/** El extremo más nuevo del intervalo, sin importar en qué orden vinieron. */
function extremoNuevo(desde: Punto, hasta: Punto): Punto {
  return compararMeses(mesDe(hasta), mesDe(desde)) >= 0 ? hasta : desde;
}

/**
 * Los puntos que componen el desglose.
 *
 * Con meses enteros es la lista de meses. Con días, a los extremos se les suman los
 * días 1 de cada mes que quede estrictamente en el medio, para que ninguna fila
 * abarque más de un mes: un tramo del 1 de julio al 5 de agosto mostrado como una
 * sola fila se leería como si fuera la inflación de un mes, y son 35 días.
 */
function puntosDelRecorrido(desde: Punto, hasta: Punto): Punto[] {
  if (!esFecha(desde) && !esFecha(hasta)) return rangoMeses(desde, hasta);

  const comoDia = (p: Punto) => (esFecha(p) ? p : primerDia(p));
  const inicio = comoDia(desde);
  const fin = comoDia(hasta);
  const haciaAdelante = fin >= inicio;

  const intermedios = rangoMeses(mesDe(desde), mesDe(hasta))
    .map(primerDia)
    .filter((d) => (haciaAdelante ? d > inicio && d < fin : d < inicio && d > fin));

  return [desde, ...intermedios, hasta];
}

/* ------------------------------------------------------------------- ajuste */

/**
 * Ajusta `monto` desde el punto `desde` hasta el punto `hasta`.
 *
 * Los extremos pueden ser meses (`2026-05`) o días (`2026-05-15`), y se pueden
 * mezclar. Funciona en las dos direcciones: si `hasta` es anterior a `desde`,
 * deflacta.
 */
export function adjust(
  monto: number,
  desde: Punto,
  hasta: Punto,
  serie: SerieIndice,
  opciones: OpcionesAjuste = {},
): Resultado {
  if (!Number.isFinite(monto)) throw new RangoError("El monto tiene que ser un número");

  const metodologia = opciones.metodologia ?? "sin_proyectar";
  return { ...resolver(), metodologia };

  function resolver(): Resultado {
  const idx = armarIndice(serie);
  const { desplazamiento, sinEstimarPosible } = evaluarPeriodo(desde, hasta, idx, opciones.hoy);

  // Sin meses faltantes las tres metodologías coinciden: no hay nada que estimar.
  if (desplazamiento === 0) {
    return calcularDirecto(monto, desde, hasta, idx);
  }

  if (metodologia === "sin_proyectar" && sinEstimarPosible) {
    return calcularVentanaReciente(monto, desde, hasta, idx, desplazamiento);
  }

  if (metodologia === "rem") {
    const rem = serie.rem;
    if (!rem) {
      throw new RangoError("No hay datos del REM en este snapshot.");
    }
    const senda = new Map(rem.senda.map((p) => [p.mes, p.tasaPct]));
    const paraElResto = tasaMensualDelRem(rem.expectativaAnualPct);
    return calcularProyectando(
      monto,
      desde,
      hasta,
      idx,
      serie,
      (mes) => senda.get(mes) ?? paraElResto,
      null,
      (mesesEstimados) => ({
        fuente: "rem",
        mesEncuesta: rem.mes,
        expectativaAnualPct: rem.expectativaAnualPct,
        mesesDeLaSenda: mesesEstimados.filter((m) => senda.has(m)),
        mesesExtrapolados: mesesEstimados.filter((m) => !senda.has(m)),
      }),
    );
  }

  const tasa = idx.ultimaVariacionPct;
  return calcularProyectando(monto, desde, hasta, idx, serie, () => tasa, tasa, () => ({
    fuente: "ultimo_mes",
    mes: idx.ultimoOficial,
  }));
  }
}

/**
 * Decide si un período se puede resolver SIN estimar ningún mes, y con qué corrimiento.
 *
 * Vive en una función propia porque la contesta el motor y la necesita también la UI, que
 * usa la respuesta para deshabilitar la metodología "sin estimación" cuando elegirla sería
 * mentira. Si cada uno tuviera su copia del criterio, tarde o temprano el dropdown diría
 * una cosa y el cálculo haría otra — que es exactamente el bug que esto vino a cerrar.
 */
function evaluarPeriodo(desde: Punto, hasta: Punto, idx: Indice, hoy?: Mes) {
  const mesHoy = hoy ?? mesActual();
  const nuevo = extremoNuevo(desde, hasta);

  const desplazamiento = Math.max(
    desplazamientoNecesario(desde, idx.ultimoOficial),
    desplazamientoNecesario(hasta, idx.ultimoOficial),
  );

  // El destino es futuro de verdad (posterior al mes en curso): no hay ventana publicada
  // equivalente que sirva de referencia, hay que proyectar.
  const esFuturo = compararMeses(mesDe(nuevo), mesHoy) > 0;

  // Correr la ventana no puede empujar el origen antes de donde arranca la serie.
  const cabeLaVentana =
    compararMeses(mesDe(correr(desde, desplazamiento)), idx.primerMes) >= 0 &&
    compararMeses(mesDe(correr(hasta, desplazamiento)), idx.primerMes) >= 0;

  return {
    desplazamiento,
    esFuturo,
    // La ventana corrida sólo sirve como referencia de un período que YA transcurrió. Para
    // un mes futuro no existe equivalente publicado, así que aun la metodología que no
    // estima nada tiene que proyectar.
    sinEstimarPosible: desplazamiento === 0 || (!esFuturo && cabeLaVentana),
  };
}

/**
 * ¿Existe alguna forma de contestar este período sin estimar?
 *
 * `false` significa que las tres metodologías van a proyectar sí o sí, así que ofrecer
 * "sin estimación" en la interfaz sería ofrecer algo que no se puede cumplir.
 */
/**
 * La suma llana de la columna «Subió», que **no** es la inflación del período.
 *
 * Existe para poder decir la diferencia con números en vez de con un adjetivo. Sumar esa
 * columna con la calculadora del celular es lo primero que hace cualquiera que desconfía
 * del resultado, y el sitio decía "el acumulado siempre da un poco más que la suma": en
 * 2024 la brecha son 36 puntos (81,94% contra 117,76%), o sea que "un poco" pierde a la
 * persona justo cuando estaba comprobando.
 *
 * Y "siempre" era directamente falso. Con meses negativos el acumulado queda **por
 * debajo** de la suma: de enero de 1999 a diciembre de 2001 la suma da −4,60% y el
 * acumulado −4,52%. Por eso lo que se muestra son los dos números y no una relación entre
 * ellos.
 *
 * Sale de una sola función porque la calculadora y las páginas por año afirman lo mismo:
 * dos copias es cómo terminan diciendo cosas distintas (regla 4).
 *
 * Suma **lo que está impreso en la columna**, no el flotante que hay detrás. La frase
 * promete el resultado de una cuenta que la persona puede rehacer a mano, y sumando los
 * valores redondeados no da lo mismo: en 2017 el flotante da 22,38% y la pantalla 22,37%.
 * Un centésimo de diferencia en la única cifra que el sitio invita a comprobar es
 * exactamente el tipo de detalle que hace desconfiar de todo lo demás.
 */
export function sumaDeVariaciones(filas: Fila[]): number {
  return filas.reduce((suma, f) => suma + comoSeMuestra(f.varMensualPct ?? 0), 0);
}

export function sePuedeEvitarEstimar(
  desde: Punto,
  hasta: Punto,
  serie: SerieIndice,
  hoy?: Mes,
): boolean {
  return evaluarPeriodo(desde, hasta, armarIndice(serie), hoy).sinEstimarPosible;
}

/** Arma el desglose y el resultado a partir de una lista de puntos ya calculables. */
function armarResultado(
  monto: number,
  desde: Punto,
  hasta: Punto,
  puntos: Punto[],
  idx: Indice,
  metodo: Metodo,
  esProyeccion: (punto: Punto, anterior: Punto | null) => boolean,
): Resultado {
  const indiceBase = idx.valorEn(puntos[0]!);

  const desglose: Fila[] = puntos.map((punto, i) => {
    const indice = idx.valorEn(punto);
    const previo = i === 0 ? null : idx.valorEn(puntos[i - 1]!);
    const proyectado = esProyeccion(punto, i === 0 ? null : puntos[i - 1]!);
    return {
      punto,
      indice,
      varMensualPct: previo === null ? null : (indice / previo - 1) * 100,
      acumuladoPct: i === 0 ? null : (indice / indiceBase - 1) * 100,
      monto: (monto * indice) / indiceBase,
      esProyeccion: proyectado,
      origen: proyectado ? "proyeccion" : idx.origenDe(mesDe(punto)),
      esParcial: i > 0 && !cubreUnMesEntero(puntos[i - 1]!, punto),
    };
  });

  const factor = idx.valorEn(puntos.at(-1)!) / indiceBase;
  return {
    // Lo pisa `adjust`, que es quien sabe qué se pidió.
    metodologia: "sin_proyectar",
    monto,
    desde,
    hasta,
    montoAjustado: monto * factor,
    variacionPct: (factor - 1) * 100,
    metodo,
    desglose,
  };
}

function calcularDirecto(monto: number, desde: Punto, hasta: Punto, idx: Indice): Resultado {
  const puntos = puntosDelRecorrido(desde, hasta);
  return armarResultado(monto, desde, hasta, puntos, idx, { tipo: "directo" }, () => false);
}

/**
 * Corre la ventana hacia atrás hasta que entre entera en los datos publicados.
 *
 * De mayo a agosto pasan tres meses; si julio y agosto no salieron, se usa la
 * inflación de abril, mayo y junio. El resultado no lleva ningún número inventado,
 * y la explicación cabe en una oración.
 */
function calcularVentanaReciente(
  monto: number,
  desde: Punto,
  hasta: Punto,
  idx: Indice,
  desplazamiento: number,
): Resultado {
  const puntos = puntosDelRecorrido(correr(desde, desplazamiento), correr(hasta, desplazamiento));

  const nuevo = extremoNuevo(desde, hasta);
  const viejo = nuevo === hasta ? desde : hasta;
  const mesesDelPeriodo = Math.abs(diffMeses(mesDe(viejo), mesDe(nuevo)));

  const sinPublicar = rangoMeses(sumarMeses(idx.ultimoOficial, 1), mesDe(nuevo));

  return armarResultado(
    monto,
    desde,
    hasta,
    puntos,
    idx,
    {
      tipo: "ventana_reciente",
      mesesDelPeriodo,
      desplazamiento,
      mesesSinPublicar: sinPublicar,
    },
    () => false,
  );
}

/**
 * Extiende la serie aplicando una tasa mensual constante a los meses sin publicar.
 *
 * La tasa entra por parámetro porque las dos proyecciones que ofrece el sitio se
 * diferencian sólo en ese número: repetir la última variación del INDEC, o repartir
 * la expectativa del REM entre doce meses. Todo lo demás —qué filas quedan marcadas,
 * cómo se interpola un día, qué meses se declaran estimados— es idéntico, y tenerlo
 * escrito una sola vez evita que las dos variantes se vayan separando.
 *
 * Ninguna de las dos pretende ser un pronóstico. La constancia de la tasa es
 * deliberada: cualquier cosa más sofisticada obliga a explicar un modelo.
 */
function calcularProyectando(
  monto: number,
  desde: Punto,
  hasta: Punto,
  idx: Indice,
  serie: SerieIndice,
  tasaDe: (mes: Mes) => number,
  /** La tasa, si es la misma todos los meses. `null` si cambia mes a mes. */
  tasaConstante: number | null,
  armarBase: (mesesEstimados: Mes[]) => BaseProyeccion,
): Resultado {
  const ultimoIndice = serie.datos.at(-1)!.indice;
  const ultimoOficial = idx.ultimoOficial;

  // La tasa puede cambiar mes a mes (la senda del REM lo hace), así que el índice
  // proyectado se encadena en vez de elevar una tasa única a la cantidad de meses.
  // Memorizado porque `valorEn` se llama varias veces por fila.
  const proyectados = new Map<Mes, number>();
  const indiceProyectado = (m: Mes): number => {
    const cacheado = proyectados.get(m);
    if (cacheado !== undefined) return cacheado;
    const previo = sumarMeses(m, -1);
    const base = compararMeses(previo, ultimoOficial) <= 0 ? ultimoIndice : indiceProyectado(previo);
    const valor = base * (1 + tasaDe(m) / 100);
    proyectados.set(m, valor);
    return valor;
  };

  const extendido: Indice = {
    ...idx,
    valorEn(punto: Punto): number {
      const mes = mesDe(punto);
      const indiceDe = (m: Mes) =>
        compararMeses(m, ultimoOficial) <= 0 ? idx.valorEn(m) : indiceProyectado(m);

      if (!esFecha(punto)) return indiceDe(mes);
      return interpolarEnMes(indiceDe(sumarMeses(mes, -1)), indiceDe(mes), punto);
    },
  };

  // Una fila es una estimación si el tramo que representa necesita algún mes sin
  // publicar. Se evalúa sobre el tramo y no sobre el punto final: la fila que va del
  // 1 de junio al 1 de julio contiene la inflación de junio y es un dato oficial,
  // por más que su etiqueta de punto final caiga en julio.
  const necesitaEstimar = (punto: Punto) =>
    compararMeses(mesTopeNecesario(punto), ultimoOficial) > 0;
  const esProyeccion = (punto: Punto, anterior: Punto | null): boolean =>
    necesitaEstimar(punto) || (anterior !== null && necesitaEstimar(anterior));

  const puntos = puntosDelRecorrido(desde, hasta);
  const mesTope = puntos
    .map(mesTopeNecesario)
    .filter((m) => compararMeses(m, ultimoOficial) > 0)
    .sort()
    .at(-1);

  // Los meses anteriores al extremo más viejo del recorrido no se nombran aunque haya
  // que estimarlos para construir el índice: el resultado es un cociente entre los
  // índices de las dos puntas, así que todo lo anterior se cancela y no mueve el número
  // ni un peso. Nombrarlos le hacía decir al sitio "el INDEC no publicó los 11 meses
  // desde julio" a alguien que había pedido octubre, contra las 7 filas con porcentaje
  // que tenía en pantalla. Los meses que se nombran son los que la persona puede contar.
  //
  // Se toma el extremo **más viejo**, no `desde`: deflactando hacia atrás `desde` es la
  // punta nueva, y arrancar por ahí dejaba el rango vacío y el texto decía "el INDEC
  // todavía no publicó ," con la coma colgando.
  //
  // Y si esa punta cae en un día que no es el 1, su propio mes entra: el tramo que va
  // del 15 de octubre al 1 de noviembre lleva la parte de octubre que va del 15 en
  // adelante, que es un mes sin publicar y que sí mueve el número.
  const extremos = [puntos[0]!, puntos.at(-1)!];
  const puntoViejo =
    compararMeses(mesTopeNecesario(extremos[0]!), mesTopeNecesario(extremos[1]!)) <= 0
      ? extremos[0]!
      : extremos[1]!;
  const arranqueParcial = esFecha(puntoViejo) && diaDe(puntoViejo) !== 1;
  const primeroQueMueveElNumero = arranqueParcial
    ? mesDe(puntoViejo)
    : sumarMeses(mesTopeNecesario(puntoViejo), 1);

  const piso =
    compararMeses(primeroQueMueveElNumero, sumarMeses(ultimoOficial, 1)) > 0
      ? primeroQueMueveElNumero
      : sumarMeses(ultimoOficial, 1);

  const estimados = mesTope && compararMeses(mesTope, piso) >= 0 ? rangoMeses(piso, mesTope) : [];

  return armarResultado(
    monto,
    desde,
    hasta,
    puntos,
    extendido,
    {
      tipo: "proyeccion",
      tasaMensualPct: tasaConstante,
      mesesEstimados: estimados,
      base: armarBase(estimados),
    },
    esProyeccion,
  );
}

/** El mes en curso. */
export function mesActual(ahora = new Date()): Mes {
  return deOrdinal(aOrdinal(`${ahora.getUTCFullYear()}-01`) + ahora.getUTCMonth());
}
