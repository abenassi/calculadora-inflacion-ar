import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * La fecha en que cambió por última vez cualquier serie del snapshot.
 *
 * Cada archivo sólo mueve su `actualizado` cuando cambian sus datos (ver `escribirSiMejora`),
 * así que el más reciente de todos es "cuándo cambiaron los datos del sitio". Es lo que
 * `datos.html` muestra como "Última actualización": con la fecha del IPC nacional decía
 * "15 de agosto" el mismo día que se habían actualizado el dólar, la UVA y CABA.
 */
export function ultimoCambio(contenidos: unknown[]): string {
  const fechas = contenidos
    .map((c) => (c as { actualizado?: unknown }).actualizado)
    .filter((f): f is string => typeof f === "string");
  if (fechas.length === 0) throw new Error("ninguna serie del snapshot trae `actualizado`");
  // Todas salen de `toISOString()`, en UTC y con el mismo largo: ordenar el texto es
  // ordenar las fechas.
  return fechas.reduce((a, b) => (b > a ? b : a));
}

/** `ultimoCambio` sobre los archivos de `dir`, sin contar `meta.json`, que es quien lo usa. */
export async function ultimoCambioEn(dir: string): Promise<string> {
  const archivos = (await readdir(dir, { recursive: true })).filter(
    (a) => a.endsWith(".json") && a !== "meta.json",
  );
  const contenidos = await Promise.all(
    archivos.map(async (a) => JSON.parse(await readFile(resolve(dir, a), "utf8")) as unknown),
  );
  return ultimoCambio(contenidos);
}
