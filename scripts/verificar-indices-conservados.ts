/**
 * Falla si el snapshot dejó algún índice jurisdiccional con los datos de la corrida anterior
 * (ver `indices-conservados.ts`).
 *
 * Corre al final del workflow del snapshot, después de commitear y publicar, como
 * `verificar-frescura.ts`: un índice que no se pudo bajar no tiene que frenar a los demás, sólo
 * avisar. El job en rojo es el aviso.
 */
import { readFileSync } from "node:fs";

import { ARCHIVO_CONSERVADOS, avisosDeConservados } from "./indices-conservados.js";

let texto: string | null;
try {
  texto = readFileSync(ARCHIVO_CONSERVADOS, "utf8");
} catch {
  texto = null;
}

const avisos = avisosDeConservados(texto);
if (avisos.length > 0) {
  for (const a of avisos) console.log(a);
  process.exit(1);
}
console.log("Ningún índice quedó con los datos de la corrida anterior.");
