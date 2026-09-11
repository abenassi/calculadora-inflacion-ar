import { diffMeses } from "../src/engine/mes.js";
import type { Mes } from "../src/engine/types.js";

/**
 * Si el último mes de una serie mensual del snapshot ya no puede ser el vigente.
 *
 * Vale para las dos que el sitio no puede dejar envejecer callado:
 * - El IPC nacional: el INDEC publica el mes M a mediados de M+1, así que hasta esa fecha lo
 *   normal es tener dos meses de atraso. Si el MCP deja de traerlo, el snapshot sigue "sin
 *   cambios" y en verde.
 * - La encuesta del REM: el BCRA publica la del mes M a principios de M+1. Si falla, el
 *   snapshot conserva la vigente en vez de omitirla, y también quedaría en verde.
 *
 * Tres meses de atraso quiere decir que se perdió una publicación entera. No sirve para los
 * índices provinciales: hay algunos que se publican con meses de rezago (Neuquén).
 */
export function datoAtrasado(ultimo: Mes, mesHoy: Mes): boolean {
  return diffMeses(ultimo, mesHoy) > 2;
}
