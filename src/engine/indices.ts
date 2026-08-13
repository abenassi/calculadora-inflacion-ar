/**
 * El catálogo de índices con los que se puede calcular.
 *
 * Vive en `engine/` y no en `ui/` porque es dato, no pintura: el pipeline lo escribe en
 * `public/data/indices.json` y la interfaz lo lee. Acá adentro no se hace ninguna cuenta.
 *
 * Es un archivo aparte del de cada serie —y chico, un kilobyte— porque se baja siempre,
 * incluso para quien nunca abre el selector. Los índices en sí pesan cien veces más y se
 * bajan sólo cuando se eligen.
 */

import type { Mes } from "./types.js";

/**
 * Qué es la jurisdicción que se eligió.
 *
 * `region` no es un detalle de presentación: son las seis regiones del INDEC, que existen
 * porque catorce provincias **no miden su propia inflación**. Una región cubre a varias
 * provincias y no mide a ninguna en particular, así que la interfaz tiene que poder
 * decirlo en vez de dejar que se lea como el índice de la provincia de quien la eligió.
 */
export type TipoIndice = "nacional" | "provincia" | "region";

export type EntradaCatalogo = {
  slug: string;
  /** Cómo se llama en el desplegable. */
  nombre: string;
  tipo: TipoIndice;
  /**
   * Qué mide de verdad, en una oración. Se muestra sólo cuando el índice elegido no es el
   * nacional. Es lo que impide que una región se lea como si fuera un índice provincial.
   */
  cubre: string;
  primerMes: Mes;
  ultimoOficial: Mes;
};

export type CatalogoIndices = {
  indices: EntradaCatalogo[];
  actualizado: string;
};

export const SLUG_NACIONAL = "nacional";

/**
 * El índice pedido, o el nacional si no existe.
 *
 * No tira: un `?indice=` viejo, mal tipeado o copiado de un fork no puede dejar la página
 * en blanco. Se cae al nacional, que es lo que la persona habría visto sin el parámetro.
 */
export function buscarIndice(catalogo: CatalogoIndices, slug: string | null): EntradaCatalogo {
  const nacional = catalogo.indices.find((i) => i.slug === SLUG_NACIONAL);
  if (!nacional) throw new Error("El catálogo no trae el índice nacional");
  if (!slug) return nacional;
  return catalogo.indices.find((i) => i.slug === slug) ?? nacional;
}

/**
 * Los tres grupos del desplegable: el nacional primero y solo, después las provincias que
 * miden, y al final las regiones.
 *
 * El orden es alfabético **por nombre** y con `localeCompare` en es-AR. Ordenar por slug
 * daría un orden que nadie puede predecir mirando la lista —"caba" cae antes que "córdoba"
 * pero se lee "Ciudad de Buenos Aires"— y un sort binario mandaría los acentos y la Ñ al
 * final.
 */
export function agruparParaSelector(catalogo: CatalogoIndices): {
  nacional: EntradaCatalogo;
  provincias: EntradaCatalogo[];
  regiones: EntradaCatalogo[];
} {
  const porNombre = (a: EntradaCatalogo, b: EntradaCatalogo) =>
    a.nombre.localeCompare(b.nombre, "es-AR");

  return {
    nacional: buscarIndice(catalogo, SLUG_NACIONAL),
    provincias: catalogo.indices.filter((i) => i.tipo === "provincia").sort(porNombre),
    regiones: catalogo.indices.filter((i) => i.tipo === "region").sort(porNombre),
  };
}

/**
 * Cuántos meses hay que estar detrás del índice nacional para que valga la pena avisarlo.
 *
 * Dos, porque uno es lo normal: los organismos provinciales publican en fechas distintas
 * y en cualquier momento del mes hay alguno que todavía no sacó el mes anterior. Avisar
 * de eso sería un cartel permanente que nadie lee. Tres o más meses de atraso, en cambio,
 * cambia de verdad la ventana sobre la que se calcula y hay que decirlo.
 */
export const MESES_DE_ATRASO_TOLERADOS = 2;
