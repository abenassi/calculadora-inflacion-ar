/**
 * Hasta dónde para atrás un índice todavía trae las cifras que hacen falta para dividir.
 *
 * Vive fuera de `fetch-snapshot.ts` porque ese script corre `main()` apenas se importa, y el
 * mismo criterio lo necesita `tests/indices.test.ts` para revisar los datos publicados. Dos
 * copias del corte serían dos cortes (regla 4).
 */

import type { PuntoCrudo } from "../src/engine/splice.js";
import { decimales, DECIMALES_MINIMOS } from "./mismo-contenido.js";

/**
 * Las cifras significativas que un punto tiene que traer para entrar en la serie.
 *
 * **Por qué por cifras y no por valor.** Hasta el 2026-09-11 el corte era `valor >= 0,01`, y
 * nació de un problema del MCP que ya está arreglado: su columna `series_data.valor` era
 * `numeric(20,6)`, y un índice encadenado hacia atrás a través de los cambios de moneda
 * quedaba guardado como cero o con dos o tres cifras (medido el 2026-08-13: Chaco tenía 256
 * puntos en cero, Tucumán 167 y Mendoza 148). El 2026-09-05 el MCP le sacó la escala a la
 * columna y borró los ceros (su commit `49f185f`, `sql/170` a `sql/172`), pero **las filas
 * guardadas antes no se reescribieron**: el colector del INDEC sólo reescribe los últimos 24
 * puntos de cada serie. Medido contra el MCP el 2026-09-11, Chaco (87 puntos), Mendoza (97) y
 * Tucumán (87) siguen trayendo por debajo de 0,01 valores con seis decimales o menos y de una
 * a cuatro cifras (arrancan en `0.000001`).
 *
 * Lo que está mal en esos puntos no es que sean chicos: es que no traen cifras. Córdoba vale
 * lo mismo de chico —`4.33e-13` en enero de 1968— y trae el float completo de la planilla de
 * la provincia (de 6 a 17 cifras en sus 266 puntos por debajo de 0,01). Cortar por valor le
 * sacaba 22 años de historia cierta para defenderse de un truncamiento que a ella nunca le
 * pasó.
 *
 * **Por qué cinco.** Es lo que `datos.html` promete ("cinco cifras significativas como
 * mínimo"), y para una serie con seis decimales es exactamente el corte viejo: `0.010640`
 * trae cinco y cualquier valor por debajo de 0,01 con seis decimales trae cuatro o menos. Con
 * cinco cifras el error relativo de redondeo es 0,005% como mucho; con cuatro, 0,05%. Medido
 * el 2026-09-11 sobre las quince series jurisdiccionales y el CPI de EE.UU., el cambio de
 * criterio sólo mueve a Córdoba (de 438 a 704 meses); todas las demás quedan idénticas.
 *
 * Límite conocido: un valor que el MCP sirve redondeado a más de seis decimales y cuyos
 * últimos decimales son cero se lee con menos cifras de las que tiene (`0.00126100`, a ocho
 * decimales, llega como `0.001261` y cuenta cuatro). Es el lado inofensivo: se corta de más,
 * nunca se deja pasar un valor sin cifras. En Córdoba no pasa hoy: el punto con menos cifras
 * del tramo recuperado es 1989-07 (`0.00126139`, seis).
 */
export const CIFRAS_MINIMAS = 5;

/**
 * Cuántas cifras significativas trae un valor tal como llegó del MCP.
 *
 * Se cuentan desde los decimales de la representación más corta, con el mismo piso de seis
 * que usa la comparación de snapshots: el MCP no manda los ceros finales, así que `0.01064`
 * vino de un `0.010640`. El orden de magnitud sale del exponente de `toExponential()` y no de
 * `Math.log10`, que en algunas potencias de diez da un pelo menos y cambiaría la cuenta justo
 * en el borde.
 *
 * Un cero, un negativo o algo que no es un número finito no traen ninguna cifra que sirva
 * para un índice de precios: devuelve 0.
 */
export function cifrasQueTrae(valor: number): number {
  if (!Number.isFinite(valor) || valor <= 0) return 0;
  const exponente = Number(valor.toExponential().split("e")[1]);
  return Math.max(decimales(valor), DECIMALES_MINIMOS) + exponente + 1;
}

/** Si un punto trae las cifras que hacen falta para entrar en la serie. */
export function esRepresentable(valor: number): boolean {
  return cifrasQueTrae(valor) >= CIFRAS_MINIMAS;
}

/**
 * Recorta la serie al tramo final que se puede usar, y explota si no queda nada.
 *
 * Se corta desde el **último** punto sin cifras y no desde el primero con cifras: si
 * apareciera uno malo después de uno bueno, lo anterior queda bajo sospecha y lo único que
 * garantiza precisión pareja es quedarse con lo que viene después.
 *
 * Se recorta y no se reescala. Reescalar preservaría los cocientes, pero nuestros números
 * dejarían de coincidir con la tabla que publica el organismo, y eso es justo lo que alguien
 * cruza cuando quiere verificar. Menos historia con los números de la fuente.
 */
export function recortarRepresentable(puntos: PuntoCrudo[], slug: string): PuntoCrudo[] {
  let inicio = 0;
  for (let i = puntos.length - 1; i >= 0; i--) {
    if (!esRepresentable(puntos[i]!.valor)) {
      inicio = i + 1;
      break;
    }
  }

  const out = puntos.slice(inicio);
  if (out.length === 0) {
    throw new Error(
      `${slug}: no quedó ningún valor representable, ninguno trae ${CIFRAS_MINIMAS} cifras ` +
        `significativas. Revisá qué está sirviendo el MCP para esta serie.`,
    );
  }
  if (out.length < puntos.length) {
    console.log(
      `  ${slug}: se descartaron ${puntos.length - out.length} punto(s) del arranque con menos ` +
        `de ${CIFRAS_MINIMAS} cifras significativas; la serie arranca en ${out[0]!.mes}`,
    );
  }
  return out;
}
