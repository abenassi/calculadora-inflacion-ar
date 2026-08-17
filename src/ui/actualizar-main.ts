/**
 * Orquestación de `/actualizar.html`: lee el mes objetivo, reindexa el dólar blue
 * contra el IPC y lo grafica. Ninguna cuenta de inflación se hace acá — vive en
 * `actualizarSerie`, que a su vez reusa `adjust()` tal cual.
 */
import { mesActual } from "../engine/adjust.js";
import { actualizarSerie } from "../engine/actualizar.js";
import { nombrarMes } from "../engine/mes.js";
import type { SerieIndice, SerieValores } from "../engine/types.js";
import { dibujarSerieActualizada } from "./chart-serie.js";
import { fechaLarga } from "./format.js";

const NOMBRES_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const el = <T extends HTMLElement>(id: string): T => {
  const nodo = document.getElementById(id);
  if (!nodo) throw new Error(`Falta el elemento #${id}`);
  return nodo as T;
};

let ipc: SerieIndice;
let dolarBlue: SerieValores;

function poblarSelectorObjetivo(): void {
  const primero = ipc.datos[0]!.mes;
  const ultimo = mesActual();

  const opcion = (valor: string, texto: string) => {
    const o = document.createElement("option");
    o.value = valor;
    o.textContent = texto;
    return o;
  };

  el<HTMLSelectElement>("objetivo-mes").replaceChildren(
    ...NOMBRES_MES.map((n, i) => opcion(String(i + 1).padStart(2, "0"), n)),
  );

  const anioMin = Number(primero.slice(0, 4));
  const anioMax = Number(ultimo.slice(0, 4));
  const anios = Array.from({ length: anioMax - anioMin + 1 }, (_, i) => anioMin + i);
  el<HTMLSelectElement>("objetivo-anio").replaceChildren(
    ...anios.map((a) => opcion(String(a), String(a))),
  );
}

function leerObjetivo(): string {
  const mes = el<HTMLSelectElement>("objetivo-mes").value;
  const anio = el<HTMLSelectElement>("objetivo-anio").value;
  return `${anio}-${mes}`;
}

function actualizar(): void {
  const mesObjetivo = leerObjetivo();
  const puntos = actualizarSerie(dolarBlue.datos, mesObjetivo, ipc);
  dibujarSerieActualizada(el<HTMLCanvasElement>("grafico"), puntos, nombrarMes(mesObjetivo));
}

async function iniciar(): Promise<void> {
  const [rIpc, rDolar] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}data/ipc.json`),
    fetch(`${import.meta.env.BASE_URL}data/series/dolar-blue.json`),
  ]);
  if (!rIpc.ok) throw new Error(`No se pudo cargar el IPC (HTTP ${rIpc.status})`);
  if (!rDolar.ok) throw new Error(`No se pudo cargar el dólar blue (HTTP ${rDolar.status})`);

  ipc = (await rIpc.json()) as SerieIndice;
  dolarBlue = (await rDolar.json()) as SerieValores;

  poblarSelectorObjetivo();
  const hoy = mesActual();
  el<HTMLSelectElement>("objetivo-mes").value = hoy.slice(5, 7);
  el<HTMLSelectElement>("objetivo-anio").value = hoy.slice(0, 4);

  el("actualizado").textContent = fechaLarga(dolarBlue.actualizado);
  el("formulario").addEventListener("input", actualizar);
  actualizar();
}

iniciar().catch((e: unknown) => {
  const error = el("error");
  error.textContent = `No se pudieron cargar los datos: ${(e as Error).message}`;
  error.hidden = false;
});
