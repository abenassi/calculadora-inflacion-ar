/**
 * Los índices que el snapshot no pudo actualizar y dejó publicados con los datos de la corrida
 * anterior.
 *
 * `construirCatalogo` atrapa el error de cada índice jurisdiccional para que uno roto no saque a
 * los demás del desplegable, y conserva la entrada de ayer. Eso sigue así. Lo que estaba mal es
 * que era silencioso: un `console.warn` y el job en verde. Con la guarda de no encoger, un recorte
 * de más (ver `recorte-representable.ts`) congelaba a Córdoba para siempre sin que nadie se
 * enterara. Ahora la lista queda en un archivo fuera de `public/`, que nunca se commitea, y el
 * último paso del workflow la lee (`verificar-indices-conservados.ts`) y pone el job en rojo
 * nombrando cada índice, después de commitear y publicar lo demás. Es el patrón de
 * `verificar-frescura.ts`.
 *
 * Sin nada de `fs` acá: la parte que decide qué se avisa se prueba sin tocar el disco.
 */

/** Relativo a la raíz del repo. Fuera de `public/` para que el paso que commitea no lo vea. */
export const ARCHIVO_CONSERVADOS = ".snapshot/indices-conservados.json";

export type IndiceConservado = {
  slug: string;
  nombre: string;
  /** El mensaje del error que impidió actualizarlo. */
  motivo: string;
  /** No había entrada anterior que conservar: el índice quedó fuera del desplegable. */
  fueraDelCatalogo?: boolean;
};

/**
 * Un `%` o un salto de línea cortan la anotación de GitHub: el `%` se escapa como pide su
 * sintaxis de comandos y el salto se vuelve espacio, para que el motivo entre en un renglón.
 */
function escapar(texto: string): string {
  return texto.replace(/%/g, "%25").replace(/\s*[\r\n]+\s*/g, " ");
}

/**
 * Las anotaciones `::error::` para la lista escrita por el snapshot, una por índice.
 *
 * `null` es que el archivo no está, y eso también avisa: si el snapshot no llegó a escribirla,
 * no hay forma de saber si algún índice quedó congelado, y dar la corrida por buena sería
 * volver al silencio.
 */
export function avisosDeConservados(texto: string | null): string[] {
  if (texto === null) {
    return [
      `::error::No está ${ARCHIVO_CONSERVADOS}: el snapshot no llegó a escribir la lista de índices ` +
        "que no pudo actualizar, así que no se sabe si alguno quedó con los datos de la corrida anterior.",
    ];
  }
  let lista: IndiceConservado[];
  try {
    lista = JSON.parse(texto) as IndiceConservado[];
  } catch {
    return [`::error::${ARCHIVO_CONSERVADOS} no es un JSON válido: no se sabe qué índices quedaron sin actualizar.`];
  }
  return lista.map(
    (i) =>
      `::error::${i.nombre} (${i.slug}) no se actualizó en esta corrida y ` +
      `${i.fueraDelCatalogo ? "quedó fuera del catálogo" : "quedó publicado con los datos de la anterior"}. ` +
      `Motivo: ${escapar(i.motivo)}`,
  );
}
