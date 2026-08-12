/**
 * Aritmética de meses sobre strings `YYYY-MM`.
 *
 * Deliberadamente sin `Date`: todo el sistema razona en meses calendario, y `Date`
 * arrastra zonas horarias y días que acá no significan nada y sólo generan bugs de
 * off-by-one (un `2026-08-01T00:00:00Z` renderizado en ART es julio).
 */

import type { Mes } from "./types.js";

const RE_MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function esMesValido(mes: string): mes is Mes {
  return RE_MES.test(mes);
}

/** Meses transcurridos desde el año 0. Sirve para comparar y restar. */
export function aOrdinal(mes: Mes): number {
  const m = RE_MES.exec(mes);
  if (!m) throw new RangeError(`Mes inválido: "${mes}" (se espera YYYY-MM)`);
  return Number(m[1]) * 12 + (Number(m[2]) - 1);
}

export function deOrdinal(ordinal: number): Mes {
  const anio = Math.floor(ordinal / 12);
  const mes = (ordinal % 12) + 1;
  return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}`;
}

export function sumarMeses(mes: Mes, n: number): Mes {
  return deOrdinal(aOrdinal(mes) + n);
}

/** `b - a` en meses. Negativo si `b` es anterior a `a`. */
export function diffMeses(a: Mes, b: Mes): number {
  return aOrdinal(b) - aOrdinal(a);
}

export function compararMeses(a: Mes, b: Mes): number {
  return aOrdinal(a) - aOrdinal(b);
}

/** Lista inclusiva de `a` a `b`. Va hacia atrás si `b` es anterior a `a`. */
export function rangoMeses(a: Mes, b: Mes): Mes[] {
  const paso = compararMeses(b, a) >= 0 ? 1 : -1;
  const salida: Mes[] = [];
  for (let o = aOrdinal(a); ; o += paso) {
    salida.push(deOrdinal(o));
    if (o === aOrdinal(b)) break;
  }
  return salida;
}

/** Normaliza una fecha ISO (`1990-01-31`, `2016-12-01T00:00:00Z`) a `YYYY-MM`. */
export function aMes(fechaIso: string): Mes {
  const mes = fechaIso.slice(0, 7);
  if (!esMesValido(mes)) throw new RangeError(`Fecha inválida: "${fechaIso}"`);
  return mes;
}

const NOMBRES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** `2026-08` → `"agosto 2026"`. Para texto corrido. */
export function nombrarMes(mes: Mes): string {
  const o = aOrdinal(mes);
  return `${NOMBRES[o % 12]} ${Math.floor(o / 12)}`;
}

/** `2026-08` → `"ago 2026"`. Para celdas de tabla. */
export function abreviarMes(mes: Mes): string {
  const o = aOrdinal(mes);
  return `${NOMBRES[o % 12]!.slice(0, 3)} ${Math.floor(o / 12)}`;
}
