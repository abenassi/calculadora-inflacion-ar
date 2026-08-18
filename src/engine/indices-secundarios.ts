/**
 * El catálogo de índices secundarios con los que se puede componer un ajuste que ya
 * está corriendo — hoy sólo el CPI de Estados Unidos, para pasar de "pesos
 * constantes" a "tipo de cambio real bilateral" en `/actualizar.html`.
 *
 * Mismo patrón que `indices.ts`/`scripts/indices-declarados.ts` para el índice
 * primario, y por la misma razón: el pipeline es quien sabe qué se pudo bajar de
 * verdad (`scripts/indices-secundarios-declarados.ts` declara la intención, pero un
 * índice puede quedar afuera si el MCP falló ese día), y la interfaz sólo puede leer
 * lo que el pipeline efectivamente escribió — nunca `scripts/`, que es código de
 * pipeline y no se empaqueta para el browser.
 */

import type { DireccionSecundaria } from "./actualizar.js";

export type EntradaCatalogoSecundario = {
  slug: string;
  nombre: string;
  /**
   * Con qué signo se compone sobre el ajuste del índice base — la interfaz la
   * necesita para llamar `actualizarSerieDoble` con la dirección correcta sin
   * duplicar el criterio del catálogo del pipeline (regla 4).
   */
  direccion: DireccionSecundaria;
  /** slug del `IndiceDeclarado` primario que hace falta tener activo para poder elegir éste. */
  requiereIndiceBase: "nacional";
  /** Si el pipeline pudo escribir `crosscheck-${slug}.json` esta corrida (o una anterior). */
  tieneCrossCheck: boolean;
};

export type CatalogoIndicesSecundarios = {
  indices: EntradaCatalogoSecundario[];
  actualizado: string;
};

/**
 * Si una entrada del catálogo secundario se puede ofrecer con el índice primario
 * activo. Vive acá y no repetida en la interfaz porque es la regla 4: si el
 * desplegable decide por su cuenta cuándo habilitar una opción, dos criterios
 * pueden terminar en desacuerdo sin que nadie se entere.
 */
export function indiceSecundarioDisponible(
  entrada: EntradaCatalogoSecundario,
  slugIndicePrimario: string,
): boolean {
  return entrada.requiereIndiceBase === slugIndicePrimario;
}
