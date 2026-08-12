/**
 * Motor de ajuste por inflación.
 *
 * La regla que gobierna todo el archivo: nunca devolver un número solo cuando parte
 * de ese número es una estimación. Si el período pedido incluye meses que el INDEC
 * todavía no publicó, `Resultado` trae `oficial` y `estimado` por separado, y el
 * desglose marca fila por fila de dónde salió cada dato.
 *
 * La proyección usa el promedio de las últimas 3 variaciones mensuales oficiales,
 * que es exactamente lo que hace la tool `ajuste_por_inflacion` de Argentina Data
 * MCP. Es una decisión de diseño, no una coincidencia: el sitio y el MCP tienen que
 * dar siempre el mismo número, y hay un test que lo verifica.
 */

import type { Fila, Mes, Origen, Resultado, SerieIndice, Tramo, TramoEstimado } from "./types.js";
import { aOrdinal, compararMeses, deOrdinal, diffMeses, nombrarMes, rangoMeses, sumarMeses } from "./mes.js";

/** Cuántos meses oficiales promedia la proyección. Alineado con `ajuste_por_inflacion`. */
export const MESES_PROMEDIO_PROYECCION = 3;

export class RangoError extends RangeError {}

type Indice = {
  valorEn(mes: Mes): number;
  origenDe(mes: Mes): Origen;
  primerMes: Mes;
  ultimoOficial: Mes;
  tasaProyeccionPct: number;
};

/**
 * Envuelve la serie en un índice consultable que además extiende la serie hacia el
 * futuro bajo demanda. Extender bajo demanda —en vez de materializar N meses de
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

  const indiceUltimoOficial = porMes.get(ultimoOficial);
  if (indiceUltimoOficial === undefined) {
    throw new RangoError(
      `La serie declara ultimo_oficial="${ultimoOficial}" pero no tiene ese mes entre sus datos`,
    );
  }

  return {
    primerMes,
    ultimoOficial,
    tasaProyeccionPct: tasaProyeccion(datos.map((p) => p.indice)),
    valorEn(mes: Mes): number {
      const conocido = porMes.get(mes);
      if (conocido !== undefined) return conocido;

      if (compararMeses(mes, primerMes) < 0) {
        throw new RangoError(
          `No hay datos de inflación anteriores a ${nombrarMes(primerMes)}. ` +
            `Pediste ${nombrarMes(mes)}.`,
        );
      }
      // Posterior al último oficial: se proyecta capitalizando la tasa mensual.
      const meses = diffMeses(ultimoOficial, mes);
      return indiceUltimoOficial * Math.pow(1 + this.tasaProyeccionPct / 100, meses);
    },
    origenDe(mes: Mes): Origen {
      return origenPorMes.get(mes) ?? "proyeccion";
    },
  };
}

/** Promedio aritmético de las últimas `MESES_PROMEDIO_PROYECCION` variaciones mensuales. */
function tasaProyeccion(indices: number[]): number {
  const variaciones: number[] = [];
  for (let i = indices.length - 1; i > 0 && variaciones.length < MESES_PROMEDIO_PROYECCION; i--) {
    const actual = indices[i]!;
    const previo = indices[i - 1]!;
    variaciones.push((actual / previo - 1) * 100);
  }
  if (variaciones.length === 0) {
    throw new RangoError("La serie necesita al menos 2 meses para poder proyectar");
  }
  return variaciones.reduce((a, b) => a + b, 0) / variaciones.length;
}

/**
 * Ajusta `monto` desde el mes `desde` hasta el mes `hasta`.
 *
 * Funciona en ambas direcciones: si `hasta` es anterior a `desde` deflacta, y el
 * desglose camina hacia atrás. En cualquier dirección, el acumulado de cada fila se
 * mide siempre contra el mes de origen.
 */
export function adjust(monto: number, desde: Mes, hasta: Mes, serie: SerieIndice): Resultado {
  if (!Number.isFinite(monto)) throw new RangoError("El monto tiene que ser un número");

  const idx = armarIndice(serie);
  const indiceDesde = idx.valorEn(desde);
  const meses = rangoMeses(desde, hasta);

  const desglose: Fila[] = meses.map((mes, i) => {
    const indice = idx.valorEn(mes);
    const previo = i === 0 ? null : idx.valorEn(meses[i - 1]!);
    const origen = idx.origenDe(mes);
    return {
      mes,
      indice,
      varMensualPct: previo === null ? null : (indice / previo - 1) * 100,
      acumuladoPct: i === 0 ? null : (indice / indiceDesde - 1) * 100,
      monto: (monto * indice) / indiceDesde,
      esProyeccion: origen === "proyeccion",
      origen,
    };
  });

  const tramoEn = (mes: Mes): Tramo => {
    const indice = idx.valorEn(mes);
    return {
      hasta: mes,
      monto: (monto * indice) / indiceDesde,
      variacionPct: (indice / indiceDesde - 1) * 100,
    };
  };

  // El tramo oficial llega hasta el último mes del recorrido que tenga dato
  // publicado. Si el propio mes de origen ya es proyección (alguien parte de un mes
  // sin IPC publicado), queda como el tramo trivial en `desde`: la UI lo detecta y
  // muestra sólo la estimación en vez de fingir que hay un dato oficial.
  const ultimoOficialDelRecorrido =
    desglose.filter((f) => !f.esProyeccion).at(-1)?.mes ?? desde;

  const resultado: Resultado = {
    monto,
    desde,
    hasta,
    oficial: tramoEn(ultimoOficialDelRecorrido),
    desglose,
  };

  const mesesProyectados = desglose.filter((f) => f.esProyeccion).length;
  if (mesesProyectados > 0) {
    const estimado: TramoEstimado = {
      ...tramoEn(hasta),
      mesesProyectados,
      tasaMensualPct: idx.tasaProyeccionPct,
    };
    resultado.estimado = estimado;
  }

  return resultado;
}

/** El mes más nuevo que la UI permite elegir: el actual, aunque sea proyección. */
export function mesActual(ahora = new Date()): Mes {
  return deOrdinal(aOrdinal(`${ahora.getUTCFullYear()}-01`) + ahora.getUTCMonth());
}

/** Aplica un ajuste de N meses hacia adelante, para los presets con periodicidad. */
export function sumarPeriodicidad(mes: Mes, meses: number): Mes {
  return sumarMeses(mes, meses);
}
