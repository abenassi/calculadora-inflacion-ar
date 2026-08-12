/**
 * Presets de caso de uso.
 *
 * Un preset sólo cambia el vocabulario y los valores por defecto del formulario.
 * Nunca cambia el cálculo: el motor recibe siempre monto, mes de origen y mes de
 * destino. Mantenerlo así evita que "actualizar un alquiler" y "actualizar un
 * sueldo" se conviertan con el tiempo en dos calculadoras distintas que se
 * contradicen.
 */

import type { Mes } from "../engine/types.js";
import { sumarMeses } from "../engine/mes.js";

export type IdPreset = "hoy" | "presupuesto" | "sueldo" | "alquiler";

export type Preset = {
  id: IdPreset;
  etiqueta: string;
  /** Título de la página cuando el preset está activo. */
  titulo: string;
  bajada: string;
  etiquetaMonto: string;
  etiquetaDesde: string;
  etiquetaHasta: string;
  /** Aviso al pie del formulario. Se muestra sólo si está definido. */
  advertencia?: string;
  /** Periodicidad en meses, para los casos con ciclo de actualización. */
  periodicidades?: { etiqueta: string; meses: number }[];
};

export const PRESETS: Record<IdPreset, Preset> = {
  hoy: {
    id: "hoy",
    etiqueta: "¿Cuánto vale hoy?",
    titulo: "Calculadora de inflación",
    bajada: "Cuánto valdría hoy un monto del pasado, según el IPC del INDEC.",
    etiquetaMonto: "Monto",
    etiquetaDesde: "en",
    etiquetaHasta: "equivale hoy, en",
  },
  presupuesto: {
    id: "presupuesto",
    etiqueta: "Actualizar un presupuesto",
    titulo: "Actualizar un presupuesto u honorarios",
    bajada:
      "Cotizaste un trabajo hace unos meses y querés saber cuánto habría que cobrar hoy para no perder contra la inflación.",
    etiquetaMonto: "Cotizaste",
    etiquetaDesde: "en",
    etiquetaHasta: "y querés actualizarlo a",
  },
  sueldo: {
    id: "sueldo",
    etiqueta: "Actualizar un sueldo",
    titulo: "Actualizar un sueldo",
    bajada:
      "Cuánto tendría que valer hoy un sueldo para mantener el mismo poder de compra que tenía.",
    etiquetaMonto: "El sueldo era",
    etiquetaDesde: "en",
    etiquetaHasta: "y hoy, en",
  },
  alquiler: {
    id: "alquiler",
    etiqueta: "Actualizar un alquiler",
    titulo: "Actualizar un alquiler por IPC",
    bajada: "Cuánto da la actualización de un alquiler ajustado por el IPC del INDEC.",
    etiquetaMonto: "El alquiler es",
    etiquetaDesde: "desde",
    etiquetaHasta: "y se actualiza en",
    advertencia:
      "Esto calcula la variación del IPC. Desde el DNU 70/2023 la actualización de un alquiler es la que las partes hayan pactado en el contrato, que puede usar otro índice o ninguno. Consultá tu contrato.",
    periodicidades: [
      { etiqueta: "Trimestral", meses: 3 },
      { etiqueta: "Cuatrimestral", meses: 4 },
      { etiqueta: "Semestral", meses: 6 },
      { etiqueta: "Anual", meses: 12 },
    ],
  },
};

export const ORDEN_PRESETS: IdPreset[] = ["hoy", "presupuesto", "sueldo", "alquiler"];

export function esIdPreset(v: string): v is IdPreset {
  return v in PRESETS;
}

/** Mes de destino sugerido al activar un preset con periodicidad. */
export function destinoPorPeriodicidad(desde: Mes, meses: number): Mes {
  return sumarMeses(desde, meses);
}
