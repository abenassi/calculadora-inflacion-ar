/**
 * El selector "qué hacer con los meses que el INDEC no publicó", compartido entre
 * `main.ts` (un solo período) y `actualizar-main.ts` (una serie de puntos). Antes
 * vivía sólo en `main.ts`; se extrae para que las dos páginas ofrezcan las mismas
 * tres opciones con el mismo texto — regla 4 de `AGENTS.md`.
 */
import type { Metodologia } from "../engine/types.js";
import type { motivoParaEstimar } from "../engine/adjust.js";

export const METODOLOGIAS: Metodologia[] = ["sin_proyectar", "repite_ultimo", "rem"];

export function esMetodologia(v: string | null): v is Metodologia {
  return v !== null && (METODOLOGIAS as string[]).includes(v);
}

/**
 * Por qué «no estimar ninguno» no da un resultado para un período dado, en las
 * palabras de cada caso — mismo texto para las dos páginas.
 */
export const MOTIVOS: Record<NonNullable<ReturnType<typeof motivoParaEstimar>>, string> = {
  futuro:
    "«No estimar ninguno» no está disponible para este período: el mes de destino todavía " +
    "no llegó, así que no existe ningún tramo ya publicado que sirva de referencia. " +
    "Cualquier respuesta va a ser una estimación.",
  ventana_no_cabe:
    "«No estimar ninguno» no está disponible para este período: para tomar como referencia " +
    "un tramo publicado del mismo largo habría que ir más atrás de donde arranca esta " +
    "serie. Cualquier respuesta va a ser una estimación.",
  ventana_sesgada:
    "«No estimar ninguno» no está disponible para este período: este índice viene atrasado, " +
    "y esa opción daría un número bastante distinto de la inflación real del período. " +
    "Preferimos estimar y decirlo.",
};
