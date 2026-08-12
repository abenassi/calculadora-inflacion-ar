/**
 * Rellena los datos de frescura de la página de fuentes.
 *
 * La prosa es estática, pero las fechas no pueden serlo: si esta página dijera
 * "actualizado hasta junio" en texto fijo, quedaría desactualizada al día siguiente
 * y contradiría a la calculadora, que es justo lo que este proyecto critica.
 */

import { nombrarMes } from "../engine/mes.js";
import { fechaLarga } from "./format.js";

type Meta = {
  actualizado: string;
  ultimo_oficial: string;
  primer_mes: string;
  meses: number;
};

async function iniciar(): Promise<void> {
  const r = await fetch(`${import.meta.env.BASE_URL}data/meta.json`);
  if (!r.ok) throw new Error(String(r.status));
  const meta = (await r.json()) as Meta;

  const poner = (id: string, texto: string) => {
    const nodo = document.getElementById(id);
    if (nodo) nodo.textContent = texto;
  };

  poner("actualizado", fechaLarga(meta.actualizado));
  poner("ultimo-oficial", nombrarMes(meta.ultimo_oficial));
  poner(
    "cobertura",
    `${nombrarMes(meta.primer_mes)} a ${nombrarMes(meta.ultimo_oficial)} (${meta.meses} meses)`,
  );
}

iniciar().catch(() => {
  // Sin metadatos la página sigue siendo útil: la prosa explica el método igual.
  // Dejamos los guiones en vez de romper el render.
});
