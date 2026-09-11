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
 * lo mismo de chico —`4.33e-13` en enero de 1968— y trae sin truncar el float que sale de la
 * planilla que publicaba la provincia. Cortar por valor le sacaba 22 años de historia para
 * defenderse de un truncamiento que a ella nunca le pasó.
 *
 * **Lo que este corte no hace.** Protege contra las cifras que se perdieron al guardar; no
 * mejora las que se publicaron. El float de Córdoba trae 16 o 17 cifras, pero de 1968 a
 * mediados de los ochenta la provincia publicó el índice con cuatro: los cocientes entre meses
 * son fracciones exactas de cuatro cifras (1239/1229, 1452/1433, 5216/5291), y la variación
 * mensual que publica la provincia lo confirma. Las demás cifras son artefacto del
 * encadenamiento, y ahí cada punto puede estar corrido hasta 0,04% (lo dice `datos.html`).
 *
 * **Por qué cinco.** Es el umbral que declara `datos.html`, y para una serie con seis decimales
 * es exactamente el corte viejo: `0.010640` trae cinco y cualquier valor por debajo de 0,01 con
 * seis decimales trae cuatro o menos. Con cinco cifras el error relativo de redondeo es 0,005%
 * como mucho; con cuatro, 0,05%. Medido el 2026-09-11 sobre las quince series jurisdiccionales
 * y el CPI de EE.UU., el cambio de criterio sólo mueve a Córdoba (de 438 a 704 meses); todas
 * las demás quedan idénticas.
 *
 * **Cortar de más no es inofensivo.** El snapshot no puede encoger (`escribirSiMejora`): si este
 * corte le saca a una serie aunque sea un mes que ya estaba publicado, la escritura falla,
 * `construirCatalogo` conserva el índice de la corrida anterior y el índice deja de
 * actualizarse. Un cero final alcanza: JSON no escribe los ceros del final, así que un valor
 * publicado a ocho decimales como `0.00126100` llega como `0.001261`, y con el piso de seis
 * cuenta cuatro cifras en vez de seis. Pasaría si Córdoba revisa uno de los ocho puntos de
 * 1989-07 a 1990-02, que publica a ocho decimales, y termina en "00": se cortaría todo
 * 1968-1989. Por eso cada serie declara los decimales con los que publica su fuente cuando son
 * más de seis (`decimalesDeLaFuente`) y se usan como piso, y por eso un índice conservado ya no
 * pasa callado: pone el job en rojo (`indices-conservados.ts`).
 */
export const CIFRAS_MINIMAS = 5;

/**
 * Cuántas cifras significativas trae un valor tal como llegó del MCP.
 *
 * Se cuentan desde los decimales de la representación más corta, con un piso, porque el MCP
 * no manda los ceros finales: `0.01064` vino de un `0.010640`. El piso es seis —la escala con la
 * que el MCP sirvió todo hasta el 2026-09-05, el mismo de la comparación de snapshots— o los
 * decimales con los que publica la fuente, si son más. El orden de magnitud sale del exponente
 * de `toExponential()` y no de `Math.log10`, que en algunas potencias de diez da un pelo menos
 * y cambiaría la cuenta justo en el borde.
 *
 * Un cero, un negativo o algo que no es un número finito no traen ninguna cifra que sirva
 * para un índice de precios: devuelve 0.
 */
export function cifrasQueTrae(valor: number, decimalesDeLaFuente: number = DECIMALES_MINIMOS): number {
  if (!Number.isFinite(valor) || valor <= 0) return 0;
  const exponente = Number(valor.toExponential().split("e")[1]);
  return Math.max(decimales(valor), decimalesDeLaFuente, DECIMALES_MINIMOS) + exponente + 1;
}

/** Si un punto trae las cifras que hacen falta para entrar en la serie. */
export function esRepresentable(valor: number, decimalesDeLaFuente?: number): boolean {
  return cifrasQueTrae(valor, decimalesDeLaFuente) >= CIFRAS_MINIMAS;
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
export function recortarRepresentable(
  puntos: PuntoCrudo[],
  slug: string,
  decimalesDeLaFuente?: number,
): PuntoCrudo[] {
  let inicio = 0;
  for (let i = puntos.length - 1; i >= 0; i--) {
    if (!esRepresentable(puntos[i]!.valor, decimalesDeLaFuente)) {
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
