/**
 * Cómo se nombra cada fila del desglose.
 *
 * Vive fuera de `main.ts` porque la tabla y el gráfico tienen que decir lo mismo: si
 * la fila de la tabla se llama "jun 2026" y la barra del gráfico se llama
 * "1 jul 2026", son la misma fila con dos nombres y nadie las relaciona.
 *
 * El problema que resuelve: en modo por día no alcanza con nombrar el punto final.
 * La fila que termina el 1 de julio cubre el tramo que arranca el 1 de junio, o sea
 * la inflación de junio. Nombrarla "1 jul" invierte la lectura. Los tramos que
 * cubren un mes entero se nombran por ese mes —igual que en modo por meses— y las
 * puntas, que son días sueltos, muestran el rango explícito.
 */

import { abreviarMes, abreviarPunto, compararMeses, esFecha, mesDe } from "../engine/mes.js";
import type { Fila } from "../engine/types.js";

/** El mes calendario que cubre un tramo completo: el más viejo de sus dos extremos. */
function mesDelTramo(desglose: Fila[], i: number): string {
  const anterior = desglose[i - 1]!.punto;
  const actual = desglose[i]!.punto;
  return compararMeses(mesDe(anterior), mesDe(actual)) < 0 ? mesDe(anterior) : mesDe(actual);
}

/**
 * El rótulo de la tabla.
 *
 * `corto` saca los años del rango de las puntas, para el eje del gráfico, donde
 * "15 may 2026 → 1 jun 2026" no entra sin pisarse con la barra vecina.
 */
export function rotularFila(desglose: Fila[], i: number, corto = false): string {
  const fila = desglose[i]!;
  if (i === 0 || !esFecha(fila.punto)) return abreviarPunto(fila.punto);
  if (!fila.esParcial) return abreviarMes(mesDelTramo(desglose, i));

  const anterior = abreviarPunto(desglose[i - 1]!.punto);
  const actual = abreviarPunto(fila.punto);
  const sinAnio = (s: string) => s.replace(/ \d{4}$/, "");
  return corto ? `${sinAnio(anterior)} → ${sinAnio(actual)}` : `${anterior} → ${actual}`;
}
