/**
 * Qué moneda corría en cada fecha, y cuánto valía cada una.
 *
 * El índice de precios es continuo a través de los cambios de moneda —mide precios, no
 * billetes— y el motor no los toca: un monto de enero de 1970 entra en pesos ley y el resultado
 * sale en pesos ley. Con el índice nacional desde 1990 el resultado es "$ 16.101.575" y en
 * pesos son $ 1.610, que es el caso más peligroso porque el número es creíble. Este módulo es
 * lo único que sabe de monedas, para que la interfaz pueda decir en cuál está cada punta y
 * cuánto es en la de la otra: la tabla vive una sola vez (regla 4), y las copias de
 * `PRIMER_ANIO_EN_PESOS` están atadas a ella por un test.
 *
 * Por **día** y no por mes: el austral arranca el 15 de junio de 1985, así que un monto "de
 * junio 1985" pudo estar en cualquiera de las dos monedas, y un mes así devuelve las dos.
 * Normas, fechas y equivalencias, cotejadas contra el texto oficial y el BCRA: ver
 * `datos.html#monedas`.
 */

import { esFecha, primerDia, ultimoDia } from "./mes.js";
import type { Fecha, Punto } from "./types.js";

export type Moneda = {
  /** Como se la nombra entera: "peso ley 18.188". */
  nombre: string;
  /** Una unidad, en una equivalencia: "1 peso ley = …". */
  singular: string;
  /** Una cantidad: "2.270 pesos ley". */
  plural: string;
  /** El primer día en que corre. `null` en la primera: ninguna serie arranca antes de 1968. */
  desde: Fecha | null;
  /** Cuántos pesos moneda nacional vale una unidad. */
  unidad: number;
};

export const MONEDAS: readonly Moneda[] = [
  {
    nombre: "peso moneda nacional",
    singular: "peso moneda nacional",
    plural: "pesos moneda nacional",
    desde: null,
    unidad: 1,
  },
  // 1 peso ley = 100 pesos moneda nacional (Ley 18.188, que fijó el 1 de enero de 1970 como
  // fecha tope; la fecha de arranque la puso un decreto).
  { nombre: "peso ley 18.188", singular: "peso ley", plural: "pesos ley", desde: "1970-01-01", unidad: 100 },
  // Ley 22.707, art. 1: 1 peso argentino = 10.000 pesos ley. La fecha la fijó el Poder
  // Ejecutivo por decreto; la ley decía "a más tardar el 30 de junio de 1983".
  { nombre: "peso argentino", singular: "peso argentino", plural: "pesos argentinos", desde: "1983-06-01", unidad: 1e6 },
  // Decreto 1096/85, art. 1: 1 austral = 1.000 pesos argentinos.
  { nombre: "austral", singular: "austral", plural: "australes", desde: "1985-06-15", unidad: 1e9 },
  // Decreto 2128/91, arts. 1 y 2, dictado en uso del art. 12 de la Ley 23.928: 1 peso = 10.000 australes.
  { nombre: "peso", singular: "peso", plural: "pesos", desde: "1992-01-01", unidad: 1e13 },
];

export const PESO: Moneda = MONEDAS.at(-1)!;

/** La moneda que corría ese día. */
export function monedaEn(fecha: Fecha): Moneda {
  // Las fechas ISO se comparan bien como texto.
  return [...MONEDAS].reverse().find((m) => m.desde === null || m.desde <= fecha)!;
}

/**
 * Las monedas en las que pudo estar un monto de ese punto: una para un día, y para un mes todas
 * las que corrieron en algún día de ese mes. Un cambio el día 1 no parte el mes.
 */
export function monedasDe(punto: Punto): Moneda[] {
  if (esFecha(punto)) return [monedaEn(punto)];
  const primera = MONEDAS.indexOf(monedaEn(primerDia(punto)));
  const ultima = MONEDAS.indexOf(monedaEn(ultimoDia(punto)));
  return MONEDAS.slice(primera, ultima + 1);
}

export type Equivalencia = {
  /** La moneda en la que está el resultado, que es la del monto. */
  de: Moneda;
  /** La moneda de la otra punta. */
  a: Moneda;
  /** El resultado pasado a `a`. */
  monto: number;
  /** La más nueva de las dos, y cuántas de la otra vale una: "1 peso = 100.000.000.000 pesos ley". */
  mayor: Moneda;
  menor: Moneda;
  cuantas: number;
};

export type MonedasDelPeriodo = {
  origen: Moneda[];
  destino: Moneda[];
  /** Una por cada par de monedas distintas entre las dos puntas. Vacía si es la misma. */
  equivalencias: Equivalencia[];
};

/**
 * En qué moneda está cada punta y cuánto es el resultado en la moneda de destino.
 *
 * `null` cuando las dos puntas están en pesos: no hay nada que decir. El resultado del motor
 * está siempre en la moneda del monto, así que pasarlo a la de destino es multiplicar por
 * U(origen)/U(destino): de 1970 a 2026, ×10⁻¹¹; de 2026 a 1975, ×10¹¹. Se multiplica antes de
 * dividir para no perder exactitud en el factor.
 */
export function monedasDelPeriodo(desde: Punto, hasta: Punto, montoAjustado: number): MonedasDelPeriodo | null {
  const origen = monedasDe(desde);
  const destino = monedasDe(hasta);
  if ([...origen, ...destino].every((m) => m === PESO)) return null;

  const equivalencias = origen.flatMap((de) =>
    destino
      .filter((a) => a !== de)
      .map((a) => {
        const [mayor, menor] = de.unidad > a.unidad ? [de, a] : [a, de];
        return { de, a, monto: (montoAjustado * de.unidad) / a.unidad, mayor, menor, cuantas: mayor.unidad / menor.unidad };
      }),
  );
  return { origen, destino, equivalencias };
}
