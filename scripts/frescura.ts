import { diffMeses } from "../src/engine/mes.js";
import type { Mes } from "../src/engine/types.js";

/**
 * Si el último IPC nacional del snapshot ya no puede ser el vigente.
 *
 * El INDEC publica el mes M a mediados de M+1, así que hasta esa fecha lo normal es tener
 * dos meses de atraso. Tres quiere decir que se perdió una publicación entera: el MCP dejó
 * de traerla, y el snapshot sigue "sin cambios" y en verde. Sólo tiene sentido para el
 * nacional: hay índices provinciales que se publican con meses de rezago (Neuquén).
 */
export function ipcAtrasado(ultimoOficial: Mes, mesHoy: Mes): boolean {
  return diffMeses(ultimoOficial, mesHoy) > 2;
}
