/**
 * Falla si el IPC nacional o la encuesta del REM del snapshot quedaron atrasados (ver
 * `datoAtrasado`).
 *
 * Corre al final del workflow del snapshot, después de commitear y publicar: un dato viejo
 * no tiene que frenar la actualización del resto de las series, sólo avisar. El job en rojo
 * es el aviso.
 */
import { readFileSync } from "node:fs";

import { aMes, esMesValido, nombrarMes } from "../src/engine/mes.js";
import { datoAtrasado } from "./frescura.js";

const leer = <T>(archivo: string): T => JSON.parse(readFileSync(`public/data/${archivo}`, "utf8")) as T;

const hoy = aMes(new Date().toISOString());
const atrasados: string[] = [];

const ultimo = leer<{ ultimo_oficial?: string }>("meta.json").ultimo_oficial ?? "";
if (!esMesValido(ultimo)) {
  atrasados.push(`meta.json no trae un ultimo_oficial válido: "${ultimo}"`);
} else if (datoAtrasado(ultimo, hoy)) {
  atrasados.push(
    `el último IPC nacional es ${nombrarMes(ultimo)}: se perdió al menos una publicación del INDEC`,
  );
} else {
  console.log(`IPC nacional al día: último dato ${nombrarMes(ultimo)}.`);
}

// Sin REM no hay nada que envejezca: la interfaz esconde la opción, y los tests del snapshot
// ya fallan por eso antes de llegar acá.
const encuesta = leer<{ rem?: { mes?: string } }>("ipc.json").rem?.mes;
if (encuesta !== undefined) {
  if (!esMesValido(encuesta)) {
    atrasados.push(`ipc.json trae un REM con un mes de encuesta inválido: "${encuesta}"`);
  } else if (datoAtrasado(encuesta, hoy)) {
    atrasados.push(
      `la encuesta del REM es de ${nombrarMes(encuesta)}: el snapshot la viene conservando porque ` +
        "no se pudo bajar una más nueva",
    );
  } else {
    console.log(`REM al día: encuesta de ${nombrarMes(encuesta)}.`);
  }
}

if (atrasados.length > 0) {
  for (const a of atrasados) {
    console.log(`::error::Ya es ${nombrarMes(hoy)} y ${a}. Revisar si el MCP lo tiene.`);
  }
  process.exit(1);
}
