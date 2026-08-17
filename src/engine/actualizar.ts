/**
 * Reindexa una serie de valores contra el IPC: cada punto queda expresado en los
 * pesos de un único mes objetivo, en vez de en los pesos del mes en que se publicó.
 *
 * No hace ninguna cuenta propia: por cada punto llama al `adjust()` que ya existe.
 * Los puntos que `adjust()` sólo podría resolver estimando —lo contesta
 * `motivoParaEstimar`— se descartan en vez de graficarse con una tasa inventada
 * mezclada en silencio entre los que sí son cálculo directo.
 */
import { adjust, motivoParaEstimar } from "./adjust.js";
import type { Mes, PuntoValor, SerieIndice } from "./types.js";

export type PuntoActualizado = {
  mes: Mes;
  valorOriginal: number;
  valorActualizado: number;
};

export function actualizarSerie(
  datos: PuntoValor[],
  mesObjetivo: Mes,
  ipc: SerieIndice,
): PuntoActualizado[] {
  const salida: PuntoActualizado[] = [];

  for (const punto of datos) {
    if (motivoParaEstimar(punto.mes, mesObjetivo, ipc) !== null) continue;

    const resultado = adjust(punto.valor, punto.mes, mesObjetivo, ipc);
    salida.push({
      mes: punto.mes,
      valorOriginal: punto.valor,
      valorActualizado: resultado.montoAjustado,
    });
  }

  return salida;
}
