/**
 * Falla si el snapshot dejó algún índice jurisdiccional con los datos de la corrida anterior
 * (ver `indices-conservados.ts`).
 *
 * Corre al final del workflow del snapshot, como `verificar-frescura.ts`, y también cuando falló
 * algún paso posterior a la bajada: un índice que no se pudo bajar no tiene que frenar a los
 * demás, pero el diagnóstico tiene que salir junto a cualquier otro rojo. El job en rojo es el
 * aviso.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ARCHIVO_CONSERVADOS, avisosDeConservados } from "./indices-conservados.js";

// Desde la raíz del repo, como la escribe `fetch-snapshot.ts`, y no desde el directorio en el
// que se corra el comando.
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let texto: string | null;
try {
  texto = readFileSync(resolve(RAIZ, ARCHIVO_CONSERVADOS), "utf8");
} catch {
  texto = null;
}

const avisos = avisosDeConservados(texto);
if (avisos.length > 0) {
  for (const a of avisos) console.log(a);
  process.exit(1);
}
console.log("Ningún índice quedó con los datos de la corrida anterior.");
