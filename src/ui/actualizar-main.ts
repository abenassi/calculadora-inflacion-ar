/**
 * Orquestación de `/actualizar.html`: lee el mes objetivo, reindexa el dólar blue
 * contra el IPC y lo grafica. Ninguna cuenta de inflación se hace acá — vive en
 * `actualizarSerie`, que a su vez reusa `adjust()` tal cual.
 */
import { actualizarSerie } from "../engine/actualizar.js";
import { nombrarMes } from "../engine/mes.js";
import type { Mes, SerieIndice, SerieValores } from "../engine/types.js";
import { dibujarSerieActualizada } from "./chart-serie.js";
import { fechaLarga } from "./format.js";

const NOMBRES_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Antes de 1992 Argentina tenía el austral, no el peso: "actualizar a pesos de 1990"
 * no es una pregunta que se pueda contestar. Mismo valor y mismo motivo que
 * `PRIMER_ANIO_EN_PESOS` de `scripts/generar-paginas.ts` (ver también `datos.html` y
 * la decisión 0009); no se importa de ahí porque `scripts/` es pipeline de Node y
 * esto es código de browser que Vite empaqueta aparte.
 */
const PRIMER_ANIO_EN_PESOS = 1992;

const el = <T extends HTMLElement>(id: string): T => {
  const nodo = document.getElementById(id);
  if (!nodo) throw new Error(`Falta el elemento #${id}`);
  return nodo as T;
};

let ipc: SerieIndice;
let dolarBlue: SerieValores;

/**
 * El rango de meses objetivo que el motor puede resolver sin estimar nada: nunca
 * antes de 1992 (austral) ni después de `ultimo_oficial` (lo que el INDEC todavía no
 * publicó). El límite de abajo es el más tardío entre el arranque de la serie del
 * IPC y 1992-01, por si algún día el IPC no llegara tan atrás.
 */
function limiteObjetivo(): { primero: Mes; ultimo: Mes } {
  const desdeSerie = ipc.datos[0]!.mes;
  const primero = desdeSerie > `${PRIMER_ANIO_EN_PESOS}-01` ? desdeSerie : `${PRIMER_ANIO_EN_PESOS}-01`;
  return { primero, ultimo: ipc.ultimo_oficial };
}

function poblarSelectorObjetivo(): void {
  const { primero, ultimo } = limiteObjetivo();

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

/**
 * Deshabilita, dentro del selector de mes, las opciones que el año elegido no puede
 * ofrecer (el primer y el último año del rango casi nunca tienen los doce), y
 * reacota el valor si el cambio de año lo dejó fuera de rango. Mismo patrón que
 * `acotarMesesDelAnio` en `src/ui/main.ts`, adaptado a un solo selector en vez de dos.
 */
function acotarMesesObjetivo(): void {
  const { primero, ultimo } = limiteObjetivo();
  const anio = el<HTMLSelectElement>("objetivo-anio").value;
  const selectMes = el<HTMLSelectElement>("objetivo-mes");

  const minimo = anio === primero.slice(0, 4) ? primero.slice(5, 7) : "01";
  const maximo = anio === ultimo.slice(0, 4) ? ultimo.slice(5, 7) : "12";

  for (const opcion of selectMes.options) {
    opcion.disabled = opcion.value < minimo || opcion.value > maximo;
  }
  if (selectMes.value < minimo) selectMes.value = minimo;
  if (selectMes.value > maximo) selectMes.value = maximo;
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
  // El default es el último mes que el motor puede resolver sin estimar nada
  // (`ipc.ultimo_oficial`), no el mes calendario en curso: éste último puede estar un
  // mes por delante de la última publicación, y arrancar ahí hacía que todos los
  // puntos resolvieran por `ventana_reciente` en vez de `directo`.
  const { ultimo } = limiteObjetivo();
  el<HTMLSelectElement>("objetivo-anio").value = ultimo.slice(0, 4);
  el<HTMLSelectElement>("objetivo-mes").value = ultimo.slice(5, 7);
  acotarMesesObjetivo();

  el("actualizado").textContent = fechaLarga(dolarBlue.actualizado);
  el("formulario").addEventListener("input", (ev) => {
    const objetivo = ev.target as HTMLElement;
    // El primer y el último año del rango no tienen los doce meses habilitados: hay
    // que reacotar el selector de mes cada vez que cambia el año, igual que hace
    // `acotarMesesDelAnio` en `src/ui/main.ts` para sus selectores de desde/hasta.
    if (objetivo.id === "objetivo-anio") acotarMesesObjetivo();
    actualizar();
  });
  actualizar();
}

iniciar().catch((e: unknown) => {
  const error = el("error");
  error.textContent = `No se pudieron cargar los datos: ${(e as Error).message}`;
  error.hidden = false;
});
