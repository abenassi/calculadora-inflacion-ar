/**
 * Aritmética de meses sobre strings `YYYY-MM`.
 *
 * La aritmética se hace sobre los strings, no con `Date`: el sistema razona en meses
 * calendario, y `Date` arrastra zonas horarias que acá no significan nada y sólo
 * generan off-by-one (un `2026-08-01T00:00:00Z` renderizado en ART es julio).
 *
 * Las excepciones son las tres funciones que necesitan el calendario y no el almanaque
 * de meses —`diasEnMes`, `restarDias` y `diasEntre`—, donde `Date` en **UTC** es la forma
 * más corta de resolver bisiestos y largos de mes y no hay ambigüedad posible, porque no
 * interviene ninguna hora. Si agregás una cuarta, sumala acá: esta lista existe para que
 * el próximo `Date` sea una decisión y no un descuido.
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

/**
 * `2026-08` → `"agosto"`. Para cuando el año ya está en el título o en la columna.
 *
 * Vive acá y no en quien lo necesita porque estaba escrito dos veces afuera, las dos como
 * `nombrarMes(m).replace(/ \d{4}$/, "")`: una regex que depende del formato exacto que
 * devuelve la función de al lado. Cambiar `nombrarMes` a `"agosto de 2026"` —que es
 * justo la forma que después hizo falta— dejaba las dos copias devolviendo `"agosto de"`,
 * en silencio y sin que ningún test lo agarrara.
 */
export function soloMes(mes: Mes): string {
  return NOMBRES[aOrdinal(mes) % 12]!;
}

/** `2026-08` → `"agosto de 2026"`. La forma que pide el texto corrido. */
export function mesConAnio(mes: Mes): string {
  return `${soloMes(mes)} de ${mes.slice(0, 4)}`;
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

/** Último día de `mes`, como fecha completa. */
export function ultimoDia(mes: Mes): Fecha {
  return `${mes}-${String(diasEnMes(mes)).padStart(2, "0")}`;
}

/**
 * Resta `n` días a una fecha.
 *
 * Una de las tres cuentas del archivo que no sale del string: cruzar de mes hacia atrás
 * necesita saber cuántos días tiene el anterior. `Date` en UTC no tiene ambigüedad
 * posible acá —no hay hora ni zona en juego, igual que en `diasEnMes`— y `Date.UTC`
 * normaliza solo el desborde de día.
 */
export function restarDias(fecha: Fecha, n: number): Fecha {
  const t = Date.UTC(
    Number(fecha.slice(0, 4)),
    Number(fecha.slice(5, 7)) - 1,
    diaDe(fecha) - n,
  );
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Ordena dos puntos en el tiempo, tomando el día 1 cuando el punto es un mes.
 *
 * Comparar por mes no alcanza cuando los dos puntos caen en el mismo: del 17 al 5 de
 * julio hay que saber que va hacia atrás. Los strings ISO ordenan solos, y `2026-07`
 * queda antes que `2026-07-05`, que es exactamente donde vale el día 1.
 */
export function compararPuntos(a: Punto, b: Punto): number {
  const clave = (p: Punto) => (esFecha(p) ? p : primerDia(p));
  return clave(a) < clave(b) ? -1 : clave(a) > clave(b) ? 1 : 0;
}

/**
 * Resta `n` meses a una fecha, recortando el día si el mes de destino es más corto.
 *
 * 31 de marzo menos 1 mes cae en un mes que no tiene día 31: el resultado es el
 * último día de febrero (28 o 29), no marzo desbordado a abril.
 */
export function restarMesesAFecha(fecha: Fecha, n: number): Fecha {
  const mesDestino = deOrdinal(aOrdinal(mesDe(fecha)) - n);
  const dia = Math.min(diaDe(fecha), diasEnMes(mesDestino));
  return `${mesDestino}-${String(dia).padStart(2, "0")}`;
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

/** Preposiciones que se contraen con el artículo. Las demás lo llevan suelto. */
const CONTRAIDAS: Partial<Record<Preposicion, string>> = { de: "del", a: "al" };

type Preposicion = "de" | "a" | "en" | "desde" | "hasta";

/**
 * Un punto detrás de una preposición, con el artículo que pide el castellano.
 *
 * Un día lo lleva y un mes no: se dice "**del** 17 de julio de 2026" pero "**de** julio
 * 2026". Escrito a mano en cada frase salía "de 17 de julio" y "en 15 de agosto", que es
 * el tipo de detalle por el que un texto suena a máquina justo donde tiene que sonar
 * defendible. Va acá y no en cada llamador porque son ocho oraciones repartidas entre la
 * tarjeta, la nota del índice y el texto que se copia.
 */
export function conPreposicion(prep: Preposicion, punto: Punto): string {
  if (!esFecha(punto)) return `${prep} ${nombrarMes(punto)}`;
  return `${CONTRAIDAS[prep] ?? `${prep} el`} ${nombrarPunto(punto)}`;
}

/**
 * El destino de una frase de equivalencia: `"en agosto 2026"`, `"al 15 de agosto de 2026"`.
 *
 * La preposición cambia con el modo, y por eso no sale de `conPreposicion` a secas: un mes
 * es el período dentro del cual vale el monto ("en agosto"), y un día es el instante al
 * que se lo trae ("al 15 de agosto"). "A agosto 2026" y "en el 15 de agosto" son las dos
 * combinaciones que ninguna persona escribiría.
 */
export function comoDestino(punto: Punto): string {
  return conPreposicion(esFecha(punto) ? "a" : "en", punto);
}

/**
 * El instante que representa un punto: un día es él mismo, y un mes es su **cierre**.
 *
 * Es la convención de `valorEn`, y no la del día 1: el índice de un mes es el nivel al que
 * se llega al terminarlo (0004), así que el punto `2026-07` vale lo mismo que el `2026-08-01`.
 *
 * Existe porque `diasEntre` toma un mes por su día 1 y las dos convenciones convivían
 * desfasadas un mes sin cruzarse nunca. Se cruzaron cuando la ventana de referencia empezó
 * a medirse en días: `2026-07 → 2026-08-15` son 14 días de valor y `diasEntre` decía 45, así
 * que la ventana salía 3,2 veces más larga que el período pedido.
 */
export function comoInstante(punto: Punto): Fecha {
  return esFecha(punto) ? punto : primerDia(sumarMeses(punto, 1));
}

/**
 * El largo de un período en días, con cada punto valuado como lo valúa el motor.
 *
 * Es lo que hay que usar para medir un período pedido. `diasEntre` mide entre dos puntos
 * crudos y sirve cuando los dos son fechas —las puntas de una ventana, por ejemplo—; con
 * un mes de un lado y un día del otro, sólo esta función da el largo que después se
 * calcula.
 */
export function largoEnDias(a: Punto, b: Punto): number {
  return diasEntre(comoInstante(a), comoInstante(b));
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
