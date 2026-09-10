/**
 * Falla si el IPC nacional del snapshot quedó atrasado (ver `ipcAtrasado`).
 *
 * Corre al final del workflow del snapshot, después de commitear y publicar: un dato viejo
 * no tiene que frenar la actualización del resto de las series, sólo avisar. El job en rojo
 * es el aviso.
 */
import { readFileSync } from "node:fs";

import { aMes, esMesValido, nombrarMes } from "../src/engine/mes.js";
import { ipcAtrasado } from "./frescura.js";

const meta = JSON.parse(readFileSync("public/data/meta.json", "utf8")) as { ultimo_oficial?: string };
const ultimo = meta.ultimo_oficial ?? "";
if (!esMesValido(ultimo)) {
  console.log(`::error::meta.json no trae un ultimo_oficial válido: "${ultimo}"`);
  process.exit(1);
}

const hoy = aMes(new Date().toISOString());
if (ipcAtrasado(ultimo, hoy)) {
  console.log(
    `::error::El último IPC nacional del snapshot es ${nombrarMes(ultimo)} y ya es ${nombrarMes(hoy)}: ` +
      "se perdió al menos una publicación del INDEC. Revisar si el MCP la tiene.",
  );
  process.exit(1);
}
console.log(`IPC nacional al día: último dato ${nombrarMes(ultimo)}.`);
