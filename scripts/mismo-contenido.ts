/**
 * Si el snapshot recién bajado dice lo mismo que el vigente, aunque no lo escriba igual.
 *
 * De esto depende que un día sin novedades no genere commit, y con eso el "Última
 * actualización" de `datos.html` (ver `ultimo-cambio.ts` y la 0001). Compararlo como texto
 * dejó de alcanzar el 2026-09-05: el MCP sacó la escala de 6 decimales de
 * `series_data.valor` (su `sql/170`) y los colectores empezaron a guardar el float tal cual lo
 * publica la fuente. Después, el 09-10, Córdoba pasó a una fuente que redondea a 8. El mismo
 * número llegó con 6, 18 y 8 decimales en tres días, y cada vez se commiteó y se publicó como
 * si hubiera cambiado un dato: nueve archivos en tres commits, sin una sola cifra distinta.
 */

/**
 * La precisión más gruesa con la que el MCP sirvió valores: su columna fue `numeric(20,6)` y
 * después `numeric(30,6)` hasta el `sql/170`, y al leerla `Number()` tira los ceros finales.
 * Por eso un `3.591` que vino de ahí no dice "tres decimales": es `3.591000`. Sin este piso,
 * un dólar de `1528.6` que al día siguiente vale `1528.62` se leería como el mismo número con
 * un decimal más, y se perdería una cotización real.
 */
const DECIMALES_MINIMOS = 6;

/** Cuántos decimales tiene la representación más corta de `x`, también en notación exponencial. */
export function decimales(x: number): number {
  const m = /^-?\d+(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(x));
  if (!m) return 0;
  return Math.max(0, (m[1]?.length ?? 0) - Number(m[2] ?? 0));
}

/**
 * Si dos números son el mismo dato escrito con distinta precisión: el más grueso es el más
 * fino redondeado a sus decimales, contando al menos seis.
 *
 * **No es una tolerancia relativa, y a propósito.** Se midió sobre todo el historial de
 * `public/data` (del 08-12 al 09-11): el cambio de sólo precisión más grande en términos
 * relativos es de 1,77e-5 (Córdoba 1990-05, `0.021458` → `0.021457619695164205`), y la
 * cotización real más chica que se movió es de 6,5e-6 (dólar `1533.22` → `1533.21`). No hay
 * umbral relativo que separe las dos: el ruido es de decimales, no de cifras significativas, así
 * que pesa más cuanto más chico es el valor, y una revisión real de la última cifra pesa menos
 * cuanto más grande. Medido en unidades del último decimal del número más grueso (piso de
 * seis), los 1.068 valores que sólo cambiaron de precisión quedan en 0,4997 o menos, y los 46
 * que cambiaron de verdad en 10.000 o más.
 *
 * Tampoco es redondear a decimales fijos: los valores chiquísimos (Córdoba encadenada desde
 * 1968, `4.3e-13`) se comparan con los decimales que traen, así que una revisión de `3.1e-10` a
 * `3.3e-10` cuenta. Seis decimales es el piso, no el techo.
 *
 * La holgura de cuatro épsilon es la del float, no una tolerancia: dos floats vecinos no son
 * dos datos, y ninguna cifra publicada vive en ese margen.
 */
export function mismoNumero(a: number, b: number): boolean {
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const n = Math.max(Math.min(decimales(a), decimales(b)), DECIMALES_MINIMOS);
  const mediaUnidad = 0.5 * 10 ** -n;
  const holguraFloat = 4 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= mediaUnidad + holguraFloat;
}

function iguales(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return mismoNumero(a, b);
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => iguales(x, b[i]));
  }
  if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    const claves = Object.keys(ra);
    return (
      claves.length === Object.keys(rb).length &&
      claves.every((k) => Object.hasOwn(rb, k) && iguales(ra[k], rb[k]))
    );
  }
  return a === b;
}

/**
 * Si dos snapshots de una serie dicen lo mismo.
 *
 * Ignora el `actualizado` de la raíz: cambia en cada corrida, y compararlo haría que todos los
 * días "cambie" algo. `meta.json` pide `compararActualizado`, porque ahí esa fecha ES el dato.
 * Todo lo que no es número se compara exacto, y un mes de más o de menos es un array de otro
 * largo, así que un mes nuevo siempre cuenta. El orden de las claves no cuenta: no es un dato.
 *
 * Cuando da igual el archivo no se reescribe, así que el vigente sigue siendo la referencia:
 * dos corrimientos chicos seguidos no se acumulan sin que nadie los vea, se comparan los dos
 * contra el mismo número de partida.
 */
export function mismoContenido(
  previo: unknown,
  nuevo: unknown,
  { compararActualizado = false } = {},
): boolean {
  const sinFecha = (x: unknown) => {
    if (compararActualizado || typeof x !== "object" || x === null || Array.isArray(x)) return x;
    const { actualizado: _descartado, ...resto } = x as Record<string, unknown>;
    return resto;
  };
  return iguales(sinFecha(previo), sinFecha(nuevo));
}
