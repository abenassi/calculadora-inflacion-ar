/**
 * Aritmética de meses sobre strings `YYYY-MM`.
 *
 * La aritmética se hace sobre los strings, no con `Date`: el sistema razona en meses
 * calendario, y `Date` arrastra zonas horarias que acá no significan nada y sólo
 * generan off-by-one (un `2026-08-01T00:00:00Z` renderizado en ART es julio). La
 * única excepción es `diasEnMes`, donde `Date` en UTC es la forma más corta de
 * resolver los años bisiestos y no hay ambigüedad posible.
 */

import type { Fecha, Mes, Punto } from "./types.js";

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

/* --------------------------------------------------------------------- días */

/*
 * El modo por día es opcional. Existe porque a veces el período que hay que
 * ajustar no empieza ni termina el día 1 (un contrato, una factura), pero el
 * default es mes a mes porque es lo que la gente entiende sin pensar.
 */

const RE_FECHA = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function esFechaValida(v: string): v is Fecha {
  const m = RE_FECHA.exec(v);
  if (!m) return false;
  // Descarta 31 de abril, 30 de febrero y compañía.
  return Number(m[3]) <= diasEnMes(`${m[1]}-${m[2]}`);
}

export function esFecha(punto: Punto): punto is Fecha {
  return punto.length === 10;
}

export function mesDe(punto: Punto): Mes {
  return punto.slice(0, 7);
}

export function diaDe(fecha: Fecha): number {
  return Number(fecha.slice(8, 10));
}

export function diasEnMes(mes: Mes): number {
  const anio = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  // Día 0 del mes siguiente = último día de este mes.
  return new Date(Date.UTC(anio, m, 0)).getUTCDate();
}

/** Primer día de `mes`, como fecha completa. */
export function primerDia(mes: Mes): Fecha {
  return `${mes}-01`;
}

/**
 * Qué proporción de la inflación del mes ya corrió antes de esta fecha. El día 1
 * vale 0 —todavía no corrió nada, o sea el nivel con el que cerró el mes anterior—
 * y el último día se acerca a 1.
 */
export function fraccionDeMes(fecha: Fecha): number {
  return (diaDe(fecha) - 1) / diasEnMes(mesDe(fecha));
}

/**
 * Interpola el índice de un día prorrateando la inflación de su propio mes.
 *
 * El índice de un mes se toma como el nivel al que se llega **al terminarlo**, así
 * que un día del mes M arranca del nivel de M-1 y acumula la parte proporcional de
 * lo que subió M. El 1 de junio y el cierre de mayo son, por construcción, el mismo
 * punto.
 *
 * El reparto es geométrico y no lineal para que encadenar los factores diarios de un
 * mes reproduzca exactamente el dato mensual del INDEC.
 *
 * La alternativa —tomar el índice del mes como el nivel del día 1— obligaba a pedir
 * el índice del mes siguiente para cualquier día posterior al 1, y llevaba a decir
 * que los días de mayo se ajustan con la inflación de junio. Además de inexplicable,
 * costaba un mes de frescura en la ventana de referencia.
 */
export function interpolarEnMes(inicio: number, fin: number, fecha: Fecha): number {
  return inicio * Math.pow(fin / inicio, fraccionDeMes(fecha));
}

/** `2026-08-15` → `"15 ago 2026"`; `2026-08` → `"ago 2026"`. */
export function abreviarPunto(punto: Punto): string {
  return esFecha(punto)
    ? `${diaDe(punto)} ${abreviarMes(mesDe(punto))}`
    : abreviarMes(punto);
}

/** `2026-08-15` → `"15 de agosto de 2026"`; `2026-08` → `"agosto 2026"`. */
export function nombrarPunto(punto: Punto): string {
  if (!esFecha(punto)) return nombrarMes(punto);
  const mes = mesDe(punto);
  const o = aOrdinal(mes);
  return `${diaDe(punto)} de ${NOMBRES[o % 12]} de ${Math.floor(o / 12)}`;
}

/** Días calendario entre dos puntos, tomando el día 1 cuando el punto es un mes. */
export function diasEntre(a: Punto, b: Punto): number {
  const aDate = (p: Punto) => Date.UTC(
    Number(p.slice(0, 4)),
    Number(p.slice(5, 7)) - 1,
    esFecha(p) ? diaDe(p) : 1,
  );
  return Math.abs(aDate(b) - aDate(a)) / 86_400_000;
}
