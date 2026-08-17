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
  Fecha,
  Fila,
  Mes,
  Metodo,
  Metodologia,
  Punto,
  Resultado,
  SerieIndice,
  Origen,
  FuentesDeSerie,
} from "./types.js";
import { PROYECCION } from "./types.js";
import {
  aOrdinal,
  compararMeses,
  compararPuntos,
  ordenReal,
  deOrdinal,
  diaDe,
  diffMeses,
  esFecha,
  largoEnDias,
  interpolarEnMes,
  mesDe,
  nombrarMes,
  primerDia,
  rangoMeses,
  restarDias,
  sumarMeses,
  ultimoDia,
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
  origenDe(mes: Mes): Origen;
  /** Si un mes tiene dato publicado. Lo necesita el cálculo del sesgo de la ventana. */
  tieneDato(mes: Mes): boolean;
  /** Se copia al resultado para que explicarlo no necesite volver a la serie. */
  fuentes: FuentesDeSerie;
};

function armarIndice(serie: SerieIndice): Indice {
  const { datos } = serie;
  if (datos.length < 2) {
    throw new RangoError("La serie necesita al menos 2 meses");
  }

  const porMes = new Map<Mes, number>();
  const origenPorMes = new Map<Mes, Origen>();
  for (const p of datos) {
    porMes.set(p.mes, p.indice);
    origenPorMes.set(p.mes, p.origen);
  }

  const primerMes = datos[0]!.mes;
  const ultimoOficial = serie.ultimo_oficial;
  /*
   * Quién publica esta serie hoy: el organismo del tramo más reciente, que es el que va a
   * publicar los meses que todavía faltan. Se toma su `publicadosPor` porque ya viene con
   * el artículo puesto ("el INDEC", "la dirección de estadística de Córdoba") y el género
   * de una sigla no se puede adivinar: "El DEIE" está mal y "La INDEC" también.
   */
  const publicaAhora = serie.fuentes.at(-1)?.etiqueta.publicadosPor ?? "el organismo";
  const organismoCorto = publicaAhora.charAt(0).toUpperCase() + publicaAhora.slice(1);
  const ultimo = datos.at(-1)!;
  const penultimo = datos.at(-2)!;

  function indiceDeMes(mes: Mes): number {
    const valor = porMes.get(mes);
    if (valor !== undefined) return valor;
    throw new RangoError(
      compararMeses(mes, primerMes) < 0
        ? `No hay datos de inflación anteriores a ${nombrarMes(primerMes)}. Pediste ${nombrarMes(mes)}.`
        : `${organismoCorto} todavía no publicó ${nombrarMes(mes)}.`,
    );
  }

  return {
    primerMes,
    ultimoOficial,
    ultimaVariacionPct: (ultimo.indice / penultimo.indice - 1) * 100,
    // Un mes sin origen conocido llega acá por dos caminos: una fila proyectada, o una
    // fila prorrateada cuyo punto final cae en un mes sin publicar y que igual descansa en
    // el mes anterior —el tramo "17 jul → 1 ago" con agosto sin salir—. El respaldo es la
    // fuente del tramo más reciente, que es la que publica lo que sigue, así que las dos
    // quedan bien atribuidas. Estaba escrito que el segundo caso no podía pasar.
    origenDe: (mes) => origenPorMes.get(mes) ?? serie.fuentes.at(-1)?.id ?? PROYECCION,
    tieneDato: (mes) => porMes.has(mes),
    fuentes: { fuentes: serie.fuentes, etiquetaCombinada: serie.etiquetaCombinada },

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
      // El día 1 es, por construcción, el mismo punto que el cierre del mes anterior
      // (ver `interpolarEnMes`): `fraccionDeMes` da 0 y la fórmula devuelve `inicio` sin
      // usar `fin`. Pedir igual `indiceDeMes(mes)` era una `RangoError` innecesaria un mes
      // entero antes de que hiciera falta — la raíz del bug que `mesTopeNecesario` ya
      // documentaba abajo pero que esta función no consultaba.
      if (diaDe(punto) === 1) return indiceDeMes(anterior);
      return interpolarEnMes(indiceDeMes(anterior), indiceDeMes(mes), punto);
    },
  };
}

/* --------------------------------------------------------- meses y ventanas */

/**
 * Cuántos meses hay que retroceder un punto para que su índice sea calculable con
 * datos publicados.
 *
 * Sobre `mesTopeNecesario` y no sobre `mesDe`: un día 1 no necesita su propio mes (ver
 * ahí el porqué). Medirlo sobre `mesDe` hacía que **cualquier fecha del día 1** un mes
 * más allá de lo publicado —el caso de libro es el aniversario de un contrato: "1 de
 * julio de este año al 1 de julio del que viene"— entrara por `ventana_reciente` en vez
 * de `directo`, con la ventana arrastrando un mes que la respuesta exacta no necesitaba.
 * `calcularProyectando` ya usaba el tope correcto; esta función, que decide si hace falta
 * estimar, usaba el otro. Las dos versiones del mismo criterio conviviendo es como una
 * mentira de texto sobrevive: la que se ve en pantalla decía "el índice viene atrasado"
 * sobre un período publicado entero.
 */
function desplazamientoNecesario(punto: Punto, ultimoOficial: Mes): number {
  return Math.max(0, diffMeses(ultimoOficial, mesTopeNecesario(punto)));
}

function correr(punto: Punto, meses: number): Punto {
  if (meses === 0) return punto;
  const mes = sumarMeses(mesDe(punto), -meses);
  return esFecha(punto) ? `${mes}-${punto.slice(8, 10)}` : mes;
}

/**
 * El tramo publicado que se usa de referencia cuando el período pedido no llegó a
 * publicarse: el más reciente del mismo largo que el que pediste.
 *
 * **Con meses enteros** son los `desplazamiento` meses corridos hacia atrás, y el
 * extremo nuevo cae justo sobre el último mes publicado.
 *
 * **Con fechas** eso mismo —correr meses enteros conservando el día— dejaba la ventana
 * terminando a mitad del último mes publicado: del 17 de julio al 15 de agosto salía el
 * tramo 17 de mayo → 15 de junio, con junio ya publicado entero. Tres consecuencias, y
 * las tres se ven:
 *
 * 1. Tiraba media publicación a la basura. El tramo publicado más reciente de 29 días no
 *    termina el 15 de junio, termina cuando termina junio.
 * 2. El pie de la tabla promete "el tramo publicado más reciente del mismo largo", y con
 *    esa ventana era falso. La promesa no se puede cumplir corriendo meses.
 * 3. Obligaba a explicar por qué aparece el 17 de mayo, o sea a mezclar dos meses en una
 *    ventana que entra entera en uno. Con el ancla al final se dice en una frase: "la
 *    inflación de junio prorrateada a 29 de sus 30 días".
 *
 * Así que la ventana por día se ancla al final y no a la fecha pedida: son los N días que
 * terminan con el último mes publicado. Es la misma regla que el modo mensual —la ventana
 * termina donde terminan los datos—, medida en días porque el período está en días.
 *
 * Termina el **último día** del mes y no en el 1 del siguiente, que sería el cierre exacto
 * y un día más fresco: rotular una fila "1 ago 2026" tres renglones abajo de "el INDEC
 * todavía no publicó agosto" se lee como una contradicción aunque no lo sea. El día que se
 * pierde es 1/31 de un mes en el peor caso.
 */
function ventanaDeReferencia(
  desde: Punto,
  hasta: Punto,
  ultimoOficial: Mes,
  desplazamiento: number,
): [Punto, Punto] {
  if (!esFecha(desde) && !esFecha(hasta)) {
    return [correr(desde, desplazamiento), correr(hasta, desplazamiento)];
  }
  const fin = ultimoDia(ultimoOficial);
  // `largoEnDias` y no `diasEntre`: con un extremo mes y el otro día, `diasEntre` toma el
  // mes por su día 1 y el motor lo valúa en su cierre. La ventana de `2026-07 → 2026-08-15`
  // salía de 45 días cuando el período pedido son 14, o sea 3,2 veces más larga.
  const inicio = restarDias(fin, largoEnDias(desde, hasta));
  // Deflactando, el extremo viejo es `hasta`: la ventana se recorre al revés para que el
  // resultado siga dividiendo, no multiplicando.
  return compararPuntos(desde, hasta) <= 0 ? [inicio, fin] : [fin, inicio];
}

/**
 * El mes publicado más viejo que hace falta para ubicar un punto.
 *
 * Un día siempre necesita el mes anterior, aunque sea el día 1: prorratear arranca del
 * nivel con el que cerró ese mes. Es la contraparte de `mesTopeNecesario`, y decide si la
 * ventana de referencia entra en la serie o hay que proyectar.
 */
function mesPisoNecesario(punto: Punto): Mes {
  return esFecha(punto) ? sumarMeses(mesDe(punto), -1) : mesDe(punto);
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
  return ordenReal(hasta, desde) >= 0 ? hasta : desde;
}

/** El extremo más viejo. Es el que arrastra los meses cuando se corre la ventana. */
function extremoViejo(desde: Punto, hasta: Punto): Punto {
  return ordenReal(hasta, desde) >= 0 ? desde : hasta;
}

/**
 * Los puntos que componen el desglose, **siempre del más viejo al más nuevo**.
 *
 * Con meses enteros es la lista de meses. Con días, a los extremos se les suman los
 * días 1 de cada mes que quede estrictamente en el medio, para que ninguna fila
 * abarque más de un mes: un tramo del 1 de julio al 5 de agosto mostrado como una
 * sola fila se leería como si fuera la inflación de un mes, y son 35 días.
 *
 * Cronológico también cuando se deflacta, y ésa es la decisión de la 0014. Recorriendo del
 * punto nuevo al viejo, cada fila terminaba mezclando dos meses —el rótulo y el porcentaje de
 * uno, el índice y el monto del otro— y la columna Índice IPC contestaba 11.826,41 para junio
 * de ida y 11.607,39 de vuelta. Yendo siempre para adelante, cada fila es de un solo mes y la
 * tabla de vuelta queda estructuralmente idéntica a la de ida. Lo que cambia con la dirección
 * es **dónde se apoya el monto**, no en qué orden se leen los meses.
 */
function puntosDelRecorrido(desde: Punto, hasta: Punto): Punto[] {
  const [viejo, nuevo] = ordenReal(desde, hasta) <= 0 ? [desde, hasta] : [hasta, desde];
  if (!esFecha(viejo) && !esFecha(nuevo)) return rangoMeses(viejo, nuevo);

  const comoDia = (p: Punto) => (esFecha(p) ? p : primerDia(p));
  const inicio = comoDia(viejo);
  const fin = comoDia(nuevo);

  const intermedios = rangoMeses(mesDe(viejo), mesDe(nuevo))
    .map(primerDia)
    .filter((d) => d > inicio && d < fin);

  return [viejo, ...intermedios, nuevo];
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
/**
 * Cuánto distorsiona correr la ventana, en tanto por uno.
 *
 * `ventana_reciente` contesta `I(U)/I(A−d)` cuando lo honesto sería `I(B)/I(A)`. El
 * cociente entre las dos se despeja exacto:
 *
 * ```
 *   distorsión = [ I(A) / I(A−d) ]  ÷  [ I(B) / I(B−d) ]
 * ```
 *
 * o sea **la inflación de los `d` meses que la ventana mete, dividida por la de los `d`
 * meses que saca**. El denominador es desconocido por construcción —son los meses que
 * todavía no se publicaron— y el mejor sustituto disponible es el tramo publicado más
 * reciente del mismo largo, que es literalmente lo que ya usa `repite_ultimo`.
 *
 * **Por qué esto y no un tope de `d`.** Contar meses mide lo que no importa. Con un solo
 * mes de corrimiento sobre diciembre de 2023 la distorsión ya llega al 23%, y con cinco
 * meses en un tramo estable queda en 2,6% y es perfectamente defendible. Lo que rompe la
 * referencia no es cuántos meses entran sino qué pasó en ellos.
 *
 * El caso que lo destapó: Neuquén publicó hasta enero de 2026, así que un pedido a junio
 * corre la ventana cinco meses hasta diciembre de 2023 y se traga enero de 2024 (+24,5%).
 * Contestaba +238,77% cuando la inflación de Neuquén en el tramo que sí existe fue
 * +90,29%, y lo hacía desde la opción marcada «(recomendado)».
 *
 * **Se ancla en el extremo VIEJO del período, no en `desde`.** Los meses que la ventana
 * arrastra son siempre los previos al extremo viejo, vaya el cálculo hacia adelante o
 * hacia atrás. Anclarlo en `desde` dejaba pasar el mismo caso deflactando —pedir de junio
 * de 2026 a mayo de 2024 con Neuquén— porque ahí `desde` es el extremo nuevo, no tiene
 * dato publicado, y el guard se daba por vencido en vez de medir: contestaba −70,48% en
 * lugar de −44%, y otra vez desde la opción «(recomendado)».
 */
function sesgoDeLaVentana(idx: Indice, viejo: Punto, desplazamiento: number): number {
  if (desplazamiento === 0) return 0;

  // Se mide sobre MESES y no sobre el punto crudo: el sesgo es qué meses arrastra la
  // ventana, y el día dentro del mes no cambia cuáles son. Además `valorEn` de una fecha
  // necesita el índice del mes anterior para prorratear, y ese mes puede no existir.
  const mesDesde = mesDe(viejo);
  const mesArrastrado = sumarMeses(mesDesde, -desplazamiento);
  const mesReferencia = sumarMeses(idx.ultimoOficial, -desplazamiento);
  const extremos = [mesDesde, mesArrastrado, idx.ultimoOficial, mesReferencia];
  // Los cuatro tienen que estar publicados. Si alguno no lo está —el período pedido cae
  // entero después del último dato, o el tramo de referencia se sale por abajo de la
  // serie— no hay con qué medir el sesgo, y **la ausencia de evidencia no deshabilita
  // nada**: se contesta 0 y la opción sigue disponible. Bloquear sin medición sería
  // exactamente lo que este guard vino a evitar, sólo que para el otro lado.
  if (extremos.some((m) => !idx.tieneDato(m))) return 0;

  const arrastrado = idx.valorEn(mesDesde) / idx.valorEn(mesArrastrado);
  const reciente = idx.valorEn(idx.ultimoOficial) / idx.valorEn(mesReferencia);

  if (!Number.isFinite(arrastrado) || !Number.isFinite(reciente) || reciente === 0) return 0;
  return Math.abs(arrastrado / reciente - 1);
}

/**
 * Cuánta distorsión se tolera antes de dejar de ofrecer la ventana corrida.
 *
 * Diez por ciento, elegido barriendo todos los pares (desde, hasta) del índice nacional
 * desde 2004: con un mes de corrimiento —el caso más común, el de "todavía no salió el mes
 * pasado"— el 10% se toca en el 3,2% de los períodos, y cuando se toca corresponde: son los
 * meses parados sobre un salto real, devaluación o ajuste de tarifas. Con dos meses de
 * corrimiento —el caso de los índices que van sistemáticamente un mes atrás del
 * nacional— ya se toca el 10,4% de las veces, y con cinco (Neuquén hoy) el 37%. La revisión
 * de la vuelta 3 recalculó estos números de forma independiente y dio los mismos, con la
 * salvedad de que el primer borrador de este comentario decía 1,4% en vez de 3,2% para un
 * mes, y no mencionaba que la mayoría de los índices opera con dos meses y no con uno.
 *
 * Y tiene sentido fuera de la estadística: por encima del 10% el número deja de servir
 * para lo que la gente lo usa, que es discutir un alquiler o un presupuesto. El criterio
 * completo —qué mide `sesgoDeLaVentana`, por qué se ancla en el extremo viejo, y esta
 * calibración— está en `docs/decisiones/0010-indices-provinciales-y-regiones.md`.
 */
const SESGO_MAXIMO_DE_LA_VENTANA = 0.1;

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

  // La ventana no puede empujar el origen antes de donde arranca la serie. Se mide sobre
  // la ventana **que se va a usar de verdad** —la misma función que la construye— y no
  // sobre una segunda cuenta de meses: es la regla 4, y acá la diferencia es material,
  // porque prorratear un día necesita también el índice del mes anterior. Medido sin eso,
  // el motor ofrecía "sin estimación" para una ventana que después reventaba con
  // `RangoError` al pedir un mes que la serie no tiene.
  const ventana = ventanaDeReferencia(desde, hasta, idx.ultimoOficial, desplazamiento);
  const cabeLaVentana = ventana.every(
    (p) => compararMeses(mesPisoNecesario(p), idx.primerMes) >= 0,
  );

  // Y no puede arrastrar meses tan distintos de los que reemplaza como para que el número
  // deje de ser una referencia. Es un criterio del motor y no de la interfaz a propósito:
  // el desplegable lee esta misma respuesta, así que los dos no se pueden separar.
  const sesgoTolerable =
    !cabeLaVentana ||
    sesgoDeLaVentana(idx, extremoViejo(desde, hasta), desplazamiento) <=
      SESGO_MAXIMO_DE_LA_VENTANA;

  return {
    desplazamiento,
    esFuturo,
    cabeLaVentana,
    sesgoTolerable,
    // La ventana corrida sólo sirve como referencia de un período que YA transcurrió. Para
    // un mes futuro no existe equivalente publicado, así que aun la metodología que no
    // estima nada tiene que proyectar.
    sinEstimarPosible: desplazamiento === 0 || (!esFuturo && cabeLaVentana && sesgoTolerable),
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

/**
 * Por qué no se puede evitar estimar, o `null` si sí se puede.
 *
 * Sale de la **misma** evaluación que `sePuedeEvitarEstimar`, y no de una segunda lectura
 * del período en la interfaz, porque si no el cartel y el desplegable se separan: el sitio
 * ya tuvo un texto fijo que explicaba "el mes de destino todavía no llegó" arriba de un
 * caso donde el destino era junio y estábamos en agosto. La razón verdadera era otra.
 */
export function motivoParaEstimar(
  desde: Punto,
  hasta: Punto,
  serie: SerieIndice,
  hoy?: Mes,
): "futuro" | "ventana_no_cabe" | "ventana_sesgada" | null {
  const e = evaluarPeriodo(desde, hasta, armarIndice(serie), hoy);
  if (e.sinEstimarPosible) return null;
  if (e.esFuturo) return "futuro";
  if (!e.cabeLaVentana) return "ventana_no_cabe";
  return "ventana_sesgada";
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
  // El recorrido es cronológico siempre (ver `puntosDelRecorrido`), así que los porcentajes
  // salen solos: cada fila divide su índice por el de la anterior y eso **es** la inflación de
  // ese tramo, en las dos direcciones. Lo único que la dirección decide es dónde se apoya el
  // monto que la persona escribió.
  //
  // Deflactando, ese anclaje es la **última** fila: "cobré $1.000.000 el 15 de julio" pone el
  // millón en julio, y el resto de la columna sale de ahí para atrás hasta la respuesta, que
  // queda arriba de todo. Con `ventana_reciente` el anclaje no es `desde` sino la punta de la
  // ventana que le corresponde, porque las filas son el tramo de referencia y no el pedido.
  const deflacta = ordenReal(hasta, desde) < 0;
  const anclaje = deflacta ? puntos.at(-1)! : puntos[0]!;
  const destino = deflacta ? puntos[0]! : puntos.at(-1)!;
  const indiceBase = idx.valorEn(anclaje);
  const indicePrimero = idx.valorEn(puntos[0]!);

  const desglose: Fila[] = puntos.map((punto, i) => {
    const indice = idx.valorEn(punto);
    const previo = i === 0 ? null : idx.valorEn(puntos[i - 1]!);
    const proyectado = esProyeccion(punto, i === 0 ? null : puntos[i - 1]!);
    return {
      punto,
      indice,
      varMensualPct: previo === null ? null : (indice / previo - 1) * 100,
      // Acumulado desde la **primera** fila, que es la más vieja. Deflactando ésa no es
      // donde se apoya el monto —el monto está abajo— pero sí es desde donde se acumula la
      // inflación, que es lo que esta columna dice.
      acumuladoPct: i === 0 ? null : (indice / indicePrimero - 1) * 100,
      monto: (monto * indice) / indiceBase,
      esProyeccion: proyectado,
      // El sello de un tramo sale del extremo **viejo**, que con el recorrido cronológico es
      // siempre la fila anterior. La variación de diciembre de 2016 sale de dividir el índice
      // de diciembre —el primero que publicó el INDEC, 100— por el de noviembre, que no existe
      // y `splice.ts` retropola con el BCRA: el +1,20% es del BCRA, y con el origen sacado del
      // punto de llegada salía `INDEC ✓`. La primera fila no tiene tramo y conserva el origen
      // de su propio punto, que es lo que describe su índice.
      origen: proyectado ? "proyeccion" : idx.origenDe(mesDe(i === 0 ? punto : puntos[i - 1]!)),
      // La fila de partida también es parcial cuando su índice no es un dato publicado.
      //
      // Una fila lleva el sello del organismo si el número que muestra salió de él. Para
      // las filas con porcentaje eso se decide por el tramo; la de partida no tiene tramo,
      // pero **sí muestra un índice**, y en modo por día ese índice es una interpolación
      // nuestra: el 2 de julio de 2026 salía sellado `INDEC ✓` con 11.834,39, un número
      // que el INDEC nunca publicó —publicó 11.826,41 para junio y 12.076,39 para julio—.
      // Quien va a comprobarlo contra la publicación oficial no lo encuentra, y es la
      // única fila que le prometía que sí.
      //
      // `datos.html` y la decisión 0004 ya decían que **las dos** puntas van marcadas
      // prorrateado. Era cierto de una sola. Un día 1 no entra: ahí el índice del día es,
      // por construcción, el cierre del mes anterior, que sí es dato publicado.
      esParcial:
        i === 0
          ? esFecha(punto) && diaDe(punto) !== 1
          : !cubreUnMesEntero(puntos[i - 1]!, punto),
    };
  });

  const factor = idx.valorEn(destino) / indiceBase;
  return {
    // Lo pisa `adjust`, que es quien sabe qué se pidió.
    metodologia: "sin_proyectar",
    monto,
    desde,
    hasta,
    montoAjustado: monto * factor,
    variacionPct: (factor - 1) * 100,
    inflacionPct: (idx.valorEn(puntos.at(-1)!) / indicePrimero - 1) * 100,
    metodo,
    desglose,
    ...idx.fuentes,
  };
}

function calcularDirecto(monto: number, desde: Punto, hasta: Punto, idx: Indice): Resultado {
  const puntos = puntosDelRecorrido(desde, hasta);
  return armarResultado(monto, desde, hasta, puntos, idx, { tipo: "directo" }, () => false);
}

/**
 * Contesta con el tramo publicado más reciente del mismo largo que el pedido.
 *
 * De mayo a agosto pasan tres meses; si julio y agosto no salieron, se usa la
 * inflación de abril, mayo y junio. Con fechas el largo se mide en días y la ventana
 * termina con el último mes publicado (ver `ventanaDeReferencia`). En los dos casos el
 * resultado no lleva ningún número inventado, y la explicación cabe en una oración.
 */
function calcularVentanaReciente(
  monto: number,
  desde: Punto,
  hasta: Punto,
  idx: Indice,
  desplazamiento: number,
): Resultado {
  const ventana = ventanaDeReferencia(desde, hasta, idx.ultimoOficial, desplazamiento);
  const puntos = puntosDelRecorrido(ventana[0], ventana[1]);

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
      // Viaja en el resultado porque la explicación lo nombra —"julio, el último mes con
      // dato"— y deducirlo de las filas obliga a saber en qué orden quedaron, que con un
      // período que deflacta es al revés.
      ultimoPublicado: idx.ultimoOficial,
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

/**
 * El mes en curso, en hora local.
 *
 * No UTC: con UTC, en Argentina (UTC-3) las últimas tres horas de cada día —y del
 * mes— ya viven en el "mañana" del huso horario que usa `Date.getUTC*`. Un preset
 * de "ahora" calculado así puede adelantar un mes entero entre las 21:00 y la
 * medianoche local, el 31 de cualquier mes.
 */
export function mesActual(ahora = new Date()): Mes {
  return deOrdinal(aOrdinal(`${ahora.getFullYear()}-01`) + ahora.getMonth());
}

/** La fecha de hoy, en hora local. Ver `mesActual` sobre por qué no es UTC. */
export function hoyFecha(ahora = new Date()): Fecha {
  return `${mesActual(ahora)}-${String(ahora.getDate()).padStart(2, "0")}`;
}
