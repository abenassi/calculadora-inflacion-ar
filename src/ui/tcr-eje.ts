/**
 * Alinea y une por mes las dos curvas de TCR de `/tcr.html` (blue y oficial), que
 * pueden tener pisos distintos — el oficial arranca en 2010-06, mucho después que el
 * blue (2002-01). El eje temporal del gráfico es la UNIÓN de los meses de las dos,
 * no la intersección ("cada serie se dibuja hasta donde llega", ver el spec, sección
 * "El eje temporal: unión, no intersección"): la serie más corta lleva `null` en los
 * meses que no cubre en vez de recortar el gráfico entero a su propio piso.
 */
import type { PuntoActualizadoDoble } from "../engine/actualizar.js";
import type { Mes } from "../engine/types.js";

/** Un punto con mes y valor — lo mínimo que hace falta para alinear contra un eje. */
type ConMes = { mes: Mes; valor: number };

/**
 * Reindexa `puntos` contra `meses`: para cada mes del eje, el valor de `puntos` en
 * ese mes, o `null` si `puntos` no tiene dato ahí. Chart.js dibuja un `null` como
 * corte de línea, no como cero — la misma convención que ya usa el cross-check del
 * BCRA en `/actualizar.html`.
 */
export function alinearPorMes(puntos: ConMes[], meses: Mes[]): (number | null)[] {
  const porMes = new Map(puntos.map((p) => [p.mes, p.valor]));
  return meses.map((m) => porMes.get(m) ?? null);
}

export type EjeYSeries = {
  /** Unión ordenada de los meses de `blue` y `oficial`. */
  meses: Mes[];
  blue: (number | null)[];
  oficial: (number | null)[];
};

export function armarEjeYSeries(
  blue: PuntoActualizadoDoble[],
  oficial: PuntoActualizadoDoble[],
): EjeYSeries {
  const meses = Array.from(new Set([...blue.map((p) => p.mes), ...oficial.map((p) => p.mes)])).sort();

  const aConMes = (puntos: PuntoActualizadoDoble[]): ConMes[] =>
    puntos.map((p) => ({ mes: p.mes, valor: p.valorActualizado }));

  return {
    meses,
    blue: alinearPorMes(aConMes(blue), meses),
    oficial: alinearPorMes(aConMes(oficial), meses),
  };
}
