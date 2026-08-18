/**
 * Qué índices se pueden componer ENCIMA de un ajuste que ya está corriendo — hoy sólo
 * el CPI de Estados Unidos, para pasar de "dólar blue a pesos constantes" a "dólar
 * blue en tipo de cambio real bilateral".
 *
 * Deliberadamente separado de `indices-declarados.ts`: ese archivo declara el índice
 * PRIMARIO que gobierna toda la calculadora (el desplegable "¿qué inflación mirás?").
 * Éste declara índices secundarios, con reglas distintas: dirección fija (nunca un
 * control suelto en la interfaz — ver `DireccionSecundaria`), y no todos van a tener
 * un cross-check oficial con el que compararse.
 */

import type { DireccionSecundaria } from "../src/engine/actualizar.js";
import type { EtiquetaFuente } from "../src/engine/types.js";

export type IndiceSecundarioDeclarado = {
  slug: string;
  nombre: string;
  /** La serie del catálogo del MCP. */
  serie: string;
  direccion: DireccionSecundaria;
  organismo: string;
  url: string;
  etiqueta: EtiquetaFuente;
  /**
   * slug del `IndiceDeclarado` primario que sirve de índice base — hoy siempre
   * nacional, pero declararlo explícito documenta la restricción en vez de asumirla
   * en el código. Un índice provincial que arranca años después de 2002 dejaría la
   * mayoría de la serie de dólar blue sin componer.
   */
  requiereIndiceBase: "nacional";
  /**
   * `serie_id` de un índice oficial equivalente, si existe, para el overlay de
   * comparación. `undefined` si no hay cross-check publicado.
   */
  serieCrossCheck?: string;
};

export const INDICES_SECUNDARIOS: IndiceSecundarioDeclarado[] = [
  {
    slug: "cpi-eeuu",
    // "CPI" es la sigla en inglés y no se explica en ningún lado de la interfaz —lo
    // encontró `revisora-usuaria` en la vuelta 1: no es economista y no la reconoce,
    // a diferencia de "IPC" (la misma idea, pero en la sigla que el resto del sitio
    // ya usa sin traducir). `nombre` es lo único que llega al browser (selector,
    // título del gráfico, leyenda, badge — todo sale de este mismo string, regla 4),
    // así que corregirlo acá alcanza para arreglarlo en todos esos lugares a la vez.
    nombre: "Inflación de Estados Unidos",
    serie: "fred:cpi_us_nsa",
    // "multiplicar" porque, con el orden de desde/hasta invertido que usa
    // `actualizarSerieDoble` para el índice secundario, `factorSecundario` YA da
    // CPI_US(t)/CPI_US(t0) — combinado con `soloBase × factorSecundario` da
    // exactamente la fórmula de "La cuenta" del spec. Ver el comentario de
    // `actualizarSerieDoble` en `src/engine/actualizar.ts` para la derivación
    // completa: se verificó independientemente (no se transcribió del spec) antes de
    // implementar, porque una versión anterior del spec tenía esto al revés.
    direccion: "multiplicar",
    organismo: "Bureau of Labor Statistics (BLS) vía FRED",
    url: "https://fred.stlouisfed.org/series/CPIAUCNS",
    etiqueta: {
      corta: "CPI de Estados Unidos (BLS)",
      larga:
        "el Índice de Precios al Consumidor de Estados Unidos (BLS, vía FRED). El punto de " +
        "octubre de 2025 no es un dato relevado —el cierre del gobierno de EE.UU. impidió " +
        "esa medición— sino una interpolación que hace el propio FRED entre septiembre y " +
        "noviembre de 2025; el resto de la serie es dato oficial",
      publicadosPor: "el Bureau of Labor Statistics de Estados Unidos",
    },
    requiereIndiceBase: "nacional",
    // tipo_cambio_real_estados_unidos, BCRA — confirmado vía series_search el
    // 2026-08-17 como el serie_id vigente en el catálogo del MCP.
    serieCrossCheck: "indec:116.4_TCRZE_2015_D_31_73",
  },
];
