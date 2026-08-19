/**
 * Alinea y une por mes las dos curvas de TCR de `/tcr.html` (blue y oficial), que
 * pueden tener pisos distintos — el oficial arranca en 2010-06, mucho después que el
 * blue (2002-01). El eje temporal del gráfico es la UNIÓN de los meses de las dos,
 * no la intersección ("cada serie se dibuja hasta donde llega", ver el spec, sección
 * "El eje temporal: unión, no intersección"): la serie más corta lleva `null` en los
 * meses que no cubre en vez de recortar el gráfico entero a su propio piso.
 */
import type { PuntoActualizadoDoble } from "../engine/actualizar.js";
import { reescalarCrossCheck } from "../engine/actualizar.js";
import { nombrarMes } from "../engine/mes.js";
import type { Mes, SerieValores } from "../engine/types.js";

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

export type LineaBcra = {
  /** Ausente si el snapshot no trae la serie, o si no cubre ningún mes del rango visible. */
  serie?: { label: string; valores: (number | null)[] };
  /** Ausente = no mostrar ninguna nota. */
  nota?: string;
};

/**
 * Arma una línea del BCRA (el cross-check bilateral o el multilateral, mismo trato
 * para las dos) alineada a `mesesVisibles`. Se reancla al ÚLTIMO DATO PROPIO de la
 * serie, no al mes objetivo que eligió quien usa la página: es una comparación de
 * forma, no de nivel (el BCRA publica con rezago), y reanclar al mes objetivo haría
 * que la línea desapareciera cada vez que ese mes todavía no tiene dato del BCRA.
 * Mismo criterio que ya usaba `armarCrossCheck` en `tcr-main.ts` antes de que hubiera
 * una segunda línea del BCRA — factorizado acá para no repetir el mismo cálculo dos
 * veces (regla 4 de AGENTS.md).
 *
 * `nombreCorto` ("bilateral"/"multilateral") va en la nota, no en `label`: las dos
 * líneas del BCRA hoy terminan en el mismo mes (la misma familia de series, mismo
 * rezago de publicación — ver docs/decisiones/0017), así que sin identificar a cuál
 * línea se refiere cada nota, las dos quedan como el mismo párrafo repetido dos
 * veces — hallazgo de los tres revisores en la vuelta que agregó la segunda línea.
 */
export function armarLineaBcra(
  datos: SerieValores | null,
  mesesVisibles: Mes[],
  label: string,
  nombreCorto: string,
): LineaBcra {
  if (!datos) return {};

  const primerMes = datos.datos[0]!.mes;
  const mesAncla = datos.datos.at(-1)!.mes;
  const reescalado = reescalarCrossCheck(datos.datos, mesAncla);
  const valores = alinearPorMes(reescalado, mesesVisibles);

  if (valores.some((v) => v !== null)) {
    return {
      serie: { label, valores },
      nota:
        `La línea del BCRA (${nombreCorto}) es una comparación de forma, no de nivel: está reescalada ` +
        `a 100 en ${nombrarMes(mesAncla)} (su último dato disponible), porque es un índice y no un ` +
        `monto en pesos. Que las curvas se muevan parecido no significa que valgan lo mismo.`,
    };
  }

  return {
    // Reporta las dos puntas de cobertura (no sólo dónde termina la serie): con el
    // multilateral, que arranca recién en 2012, un rango de antes de esa fecha no
    // tiene dato porque la serie TODAVÍA no empezó, no porque ya haya terminado —
    // decir sólo "llega hasta <mesAncla>" sugeriría lo segundo.
    nota:
      `El BCRA (${nombreCorto}) no tiene dato de tipo de cambio real en el rango que se está mostrando ` +
      `(su serie cubre ${nombrarMes(primerMes)}–${nombrarMes(mesAncla)}); el gráfico muestra igual las ` +
      `otras curvas.`,
  };
}
