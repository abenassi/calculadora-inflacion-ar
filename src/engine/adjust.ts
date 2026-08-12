/**
 * Motor de ajuste por inflación.
 *
 * La regla que gobierna todo el archivo: nunca devolver un número solo cuando parte
 * de ese número es una estimación. Si el período pedido incluye meses que el INDEC
 * todavía no publicó, `Resultado` trae `oficial` y `estimado` por separado, el
 * desglose marca fila por fila de dónde salió cada dato, y `estimado.base` expone
 * los meses concretos cuyo promedio produjo la tasa de proyección.
 *
 * Esa última parte importa tanto como el número: alguien que usa esto para
 * justificar un precio ante un cliente necesita poder decir "sale del promedio de
 * abril, mayo y junio", no "lo dice la calculadora".
 *
 * La proyección usa el promedio de las últimas 3 variaciones mensuales publicadas,
 * que es exactamente lo que hace la tool `ajuste_por_inflacion` de Argentina Data
 * MCP. Es una decisión de diseño, no una coincidencia: el sitio y el MCP tienen que
 * dar siempre el mismo número, y hay un test que lo verifica.
 */

import type {
  Fila,
  Mes,
  MesBase,
  Origen,
  Punto,
  Resultado,
  SerieIndice,
  Tramo,
  TramoEstimado,
} from "./types.js";
import {
  aOrdinal,
  compararMeses,
  deOrdinal,
  diaDe,
  diffMeses,
  esFecha,
  fraccionDeMes,
  mesDe,
  nombrarMes,
  primerDia,
  rangoMeses,
} from "./mes.js";

/** Cuántos meses publicados promedia la proyección. Alineado con `ajuste_por_inflacion`. */
export const MESES_PROMEDIO_PROYECCION = 3;

export class RangoError extends RangeError {}

type Indice = {
  valorEn(punto: Punto): number;
  esProyectado(punto: Punto): boolean;
  origenDe(punto: Punto): Origen;
  primerMes: Mes;
  ultimoOficial: Mes;
  tasaProyeccionPct: number;
  base: MesBase[];
};

/**
 * Envuelve la serie en un índice consultable que además la extiende hacia el futuro
 * bajo demanda. Extender bajo demanda —en vez de materializar N meses de
 * proyección— evita tener que decidir arbitrariamente hasta dónde proyectar.
 */
function armarIndice(serie: SerieIndice): Indice {
  const { datos } = serie;
  if (datos.length === 0) throw new RangoError("La serie de índices está vacía");

  const porMes = new Map<Mes, number>();
  const origenPorMes = new Map<Mes, Origen>();
  for (const p of datos) {
    porMes.set(p.mes, p.indice);
    origenPorMes.set(p.mes, p.origen);
  }

  const primerMes = datos[0]!.mes;
  const ultimoOficial = serie.ultimo_oficial;

  const indiceAncla = porMes.get(ultimoOficial);
  if (indiceAncla === undefined) {
    throw new RangoError(
      `La serie declara ultimo_oficial="${ultimoOficial}" pero no tiene ese mes entre sus datos`,
    );
  }
  // Copia a una constante ya tipada como `number`: `indiceDeMes` es una declaración
  // hoisteada, y TypeScript no propaga el estrechamiento del `if` hacia adentro de
  // funciones que podrían llamarse antes.
  const anclaProyeccion: number = indiceAncla;

  const base = mesesBase(datos);
  const tasaProyeccionPct = base.reduce((a, m) => a + m.varMensualPct, 0) / base.length;

  /** Índice al día 1 de un mes; proyecta si el mes todavía no se publicó. */
  function indiceDeMes(mes: Mes): number {
    const conocido = porMes.get(mes);
    if (conocido !== undefined) return conocido;

    if (compararMeses(mes, primerMes) < 0) {
      throw new RangoError(
        `No hay datos de inflación anteriores a ${nombrarMes(primerMes)}. ` +
          `Pediste ${nombrarMes(mes)}.`,
      );
    }
    const meses = diffMeses(ultimoOficial, mes);
    return anclaProyeccion * Math.pow(1 + tasaProyeccionPct / 100, meses);
  }

  return {
    primerMes,
    ultimoOficial,
    tasaProyeccionPct,
    base,

    /**
     * Para un mes, el índice de ese mes. Para un día, interpola geométricamente
     * entre el índice de su mes y el del siguiente, en proporción a los días
     * transcurridos. Es el mismo criterio con el que el BCRA convierte el IPC
     * mensual en el coeficiente diario CER.
     */
    valorEn(punto: Punto): number {
      const mes = mesDe(punto);
      const inicio = indiceDeMes(mes);
      if (!esFecha(punto) || diaDe(punto) === 1) return inicio;

      const siguiente = indiceDeMes(deOrdinal(aOrdinal(mes) + 1));
      return inicio * Math.pow(siguiente / inicio, fraccionDeMes(punto));
    },

    /**
     * Un día posterior al 1 del último mes publicado ya depende del índice del mes
     * siguiente, que todavía no existe: aunque su propio mes esté publicado, el
     * valor interpolado es en parte proyección. Decirlo es incómodo pero es la
     * verdad, y callarlo sería exactamente el problema que este sitio ataca.
     */
    esProyectado(punto: Punto): boolean {
      const mes = mesDe(punto);
      const comparacion = compararMeses(mes, ultimoOficial);
      if (comparacion > 0) return true;
      return comparacion === 0 && esFecha(punto) && diaDe(punto) > 1;
    },

    origenDe(punto: Punto): Origen {
      if (this.esProyectado(punto)) return "proyeccion";
      return origenPorMes.get(mesDe(punto)) ?? "proyeccion";
    },
  };
}

/** Las últimas variaciones mensuales publicadas, de la más vieja a la más nueva. */
function mesesBase(datos: SerieIndice["datos"]): MesBase[] {
  const salida: MesBase[] = [];
  for (let i = datos.length - 1; i > 0 && salida.length < MESES_PROMEDIO_PROYECCION; i--) {
    const actual = datos[i]!;
    const previo = datos[i - 1]!;
    salida.push({
      mes: actual.mes,
      varMensualPct: (actual.indice / previo.indice - 1) * 100,
    });
  }
  if (salida.length === 0) {
    throw new RangoError("La serie necesita al menos 2 meses para poder proyectar");
  }
  return salida.reverse();
}

/** Un punto como día concreto, para poder comparar meses y fechas entre sí. */
function comoDia(punto: Punto): string {
  return esFecha(punto) ? punto : primerDia(punto);
}

/**
 * Los puntos que componen el desglose.
 *
 * Con meses enteros es simplemente la lista de meses. Con días, a los dos extremos
 * pedidos se les suman los días 1 de cada mes que quede estrictamente en el medio.
 *
 * El corte en los días 1 no es cosmético: garantiza que **ninguna fila abarque más
 * de un mes**. Sin él, un período del 1 de julio al 5 de agosto aparecería como una
 * sola fila de +2,49%, y quien la lea va a suponer que es la inflación de un mes
 * cuando en realidad son 35 días.
 */
function puntosDelRecorrido(desde: Punto, hasta: Punto): Punto[] {
  if (!esFecha(desde) && !esFecha(hasta)) return rangoMeses(desde, hasta);

  const inicio = comoDia(desde);
  const fin = comoDia(hasta);
  const haciaAdelante = fin >= inicio;

  const intermedios = rangoMeses(mesDe(desde), mesDe(hasta))
    .map(primerDia)
    .filter((d) => (haciaAdelante ? d > inicio && d < fin : d < inicio && d > fin));

  return [desde, ...intermedios, hasta];
}

/**
 * Ajusta `monto` desde el punto `desde` hasta el punto `hasta`.
 *
 * Los extremos pueden ser meses (`2026-05`) o días (`2026-05-15`), y se pueden
 * mezclar. Funciona en ambas direcciones: si `hasta` es anterior a `desde`
 * deflacta y el desglose camina hacia atrás. En cualquier dirección, el acumulado
 * de cada fila se mide siempre contra el origen.
 */
export function adjust(monto: number, desde: Punto, hasta: Punto, serie: SerieIndice): Resultado {
  if (!Number.isFinite(monto)) throw new RangoError("El monto tiene que ser un número");

  const idx = armarIndice(serie);
  const indiceDesde = idx.valorEn(desde);
  const puntos = puntosDelRecorrido(desde, hasta);

  const desglose: Fila[] = puntos.map((punto, i) => {
    const indice = idx.valorEn(punto);
    const previo = i === 0 ? null : idx.valorEn(puntos[i - 1]!);
    return {
      punto,
      indice,
      varMensualPct: previo === null ? null : (indice / previo - 1) * 100,
      acumuladoPct: i === 0 ? null : (indice / indiceDesde - 1) * 100,
      monto: (monto * indice) / indiceDesde,
      esProyeccion: idx.esProyectado(punto),
      origen: idx.origenDe(punto),
    };
  });

  const tramoEn = (punto: Punto): Tramo => {
    const indice = idx.valorEn(punto);
    return {
      hasta: punto,
      monto: (monto * indice) / indiceDesde,
      variacionPct: (indice / indiceDesde - 1) * 100,
    };
  };

  const resultado: Resultado = { monto, desde, hasta, desglose };

  /*
   * El tramo oficial existe sólo si el origen está publicado.
   *
   * Todo resultado es un cociente `idx(hasta) / idx(desde)`. Si `desde` cae en un
   * mes sin publicar, ese cociente arrastra una proyección en el denominador y
   * ningún punto del recorrido produce un número oficial, por más que el destino
   * sí esté publicado. Es el caso de "cobré esto en agosto, ¿cuánto era en marzo?"
   * cuando agosto todavía no salió.
   */
  if (!idx.esProyectado(desde)) {
    const ultimoPublicado = desglose.filter((f) => !f.esProyeccion).at(-1)?.punto ?? desde;
    resultado.oficial = tramoEn(ultimoPublicado);
  }

  const faltantes = mesesFaltantes(desglose, idx.ultimoOficial);
  if (faltantes.length > 0) {
    const estimado: TramoEstimado = {
      ...tramoEn(hasta),
      mesesFaltantes: faltantes,
      tasaMensualPct: idx.tasaProyeccionPct,
      base: idx.base,
    };
    resultado.estimado = estimado;
  }

  return resultado;
}

/**
 * Qué meses sin publicar necesita el cálculo, del más viejo al más nuevo.
 *
 * No alcanza con mirar el destino: yendo hacia atrás desde un mes sin publicar, los
 * meses estimados están del lado del origen. Se derivan del recorrido, que es lo
 * que efectivamente se usó.
 */
function mesesFaltantes(desglose: Fila[], ultimoOficial: Mes): Mes[] {
  let tope = 0;
  for (const fila of desglose) {
    if (!fila.esProyeccion) continue;
    // Un día posterior al 1 del último mes publicado necesita el índice del mes
    // siguiente: cuenta como un mes faltante aunque su propio mes esté publicado.
    tope = Math.max(tope, Math.max(1, diffMeses(ultimoOficial, mesDe(fila.punto))));
  }
  return Array.from({ length: tope }, (_, i) => deOrdinal(aOrdinal(ultimoOficial) + i + 1));
}

/** El mes más nuevo que la UI permite elegir: el actual, aunque sea proyección. */
export function mesActual(ahora = new Date()): Mes {
  return deOrdinal(aOrdinal(`${ahora.getUTCFullYear()}-01`) + ahora.getUTCMonth());
}
