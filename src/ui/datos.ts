/**
 * Rellena los datos de frescura de la página de fuentes.
 *
 * La prosa es estática, pero las fechas no pueden serlo: si esta página dijera
 * "actualizado hasta junio" en texto fijo, quedaría desactualizada al día siguiente
 * y contradiría a la calculadora, que es justo lo que este proyecto critica.
 */

import { nombrarMes } from "../engine/mes.js";
import {
  agruparParaSelector,
  SLUG_NACIONAL,
  type CatalogoIndices,
  type EntradaCatalogo,
} from "../engine/indices.js";
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

/**
 * La tabla de índices se arma desde el catálogo y no a mano.
 *
 * Es la misma razón que las fechas de arriba: escrita a mano, esta tabla anunciaría rangos
 * que dejaron de ser ciertos —y peor, seguiría ofreciendo un índice el día que se caiga del
 * catálogo—. El desplegable de la calculadora sale de este mismo archivo, así que las dos
 * listas no se pueden separar.
 */
async function pintarTablaDeIndices(): Promise<void> {
  const cuerpo = document.getElementById("tabla-indices");
  if (!cuerpo) return;

  const r = await fetch(`${import.meta.env.BASE_URL}data/indices.json`);
  if (!r.ok) throw new Error(String(r.status));
  const catalogo = (await r.json()) as CatalogoIndices;
  const { nacional, provincias, regiones } = agruparParaSelector(catalogo);

  const serieDe = async (i: EntradaCatalogo) => {
    const ruta =
      i.slug === SLUG_NACIONAL
        ? `${import.meta.env.BASE_URL}data/ipc.json`
        : `${import.meta.env.BASE_URL}data/indices/${i.slug}.json`;
    const res = await fetch(ruta);
    return (await res.json()) as { fuentes: { organismoCorto: string }[] };
  };

  const orden = [nacional, ...provincias, ...regiones];
  const organismos = await Promise.all(orden.map(serieDe));

  // Construido con nodos y no con innerHTML: los nombres y las coberturas vienen del
  // snapshot, y así no hay forma de que un cambio de forma inyecte markup en la página.
  cuerpo.replaceChildren(
    ...orden.map((i, n) => {
      const tr = document.createElement("tr");
      for (const texto of [
        i.nombre,
        organismos[n]!.fuentes.map((f) => f.organismoCorto).join(" · "),
        nombrarMes(i.primerMes),
        nombrarMes(i.ultimoOficial),
        i.cubre,
      ]) {
        const td = document.createElement("td");
        td.textContent = texto;
        tr.append(td);
      }
      return tr;
    }),
  );
}

pintarTablaDeIndices().catch(() => {
  // Igual que arriba: sin catálogo la prosa sigue explicando el método. La tabla queda
  // con su guion en vez de dejar la página a medio pintar.
});

iniciar().catch(() => {
  // Sin metadatos la página sigue siendo útil: la prosa explica el método igual.
  // Dejamos los guiones en vez de romper el render.
});
