/**
 * Orquestación de `/actualizar.html`: lee la serie que la persona pegó o subió,
 * la reindexa contra el IPC y la grafica. Ninguna cuenta de inflación se hace acá
 * — vive en `parsearSerie` (texto → puntos) y `actualizarSerie` (puntos → serie
 * actualizada), que a su vez reusa `adjust()` tal cual.
 */
import { actualizarSerie } from "../engine/actualizar.js";
import type { PuntoSerieActualizado } from "../engine/actualizar.js";
import { esMesValido, nombrarMes, nombrarPunto } from "../engine/mes.js";
import { parsearSerie } from "../engine/parse-serie.js";
import type { FilaInvalida } from "../engine/parse-serie.js";
import type { Mes, Metodologia, SerieIndice } from "../engine/types.js";
import { dibujarSerieActualizada } from "./chart-serie.js";
import { esMetodologia, MOTIVOS } from "./metodologia.js";
import { pesos } from "./format.js";

/**
 * Antes de 1992 Argentina tenía el austral, no el peso — mismo valor y motivo que
 * `PRIMER_ANIO_EN_PESOS` de `scripts/generar-paginas.ts` y de la versión anterior
 * de este archivo.
 */
const PRIMER_ANIO_EN_PESOS = 1992;

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
  el<HTMLSelectElement>("objetivo-anio").replaceChildren(...anios.map((a) => opcion(String(a), String(a))));
}

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

function leerObjetivo(): Mes {
  const mes = el<HTMLSelectElement>("objetivo-mes").value;
  const anio = el<HTMLSelectElement>("objetivo-anio").value;
  return `${anio}-${mes}`;
}

function leerMetodologia(): Metodologia {
  const v = el<HTMLSelectElement>("metodologia").value;
  return esMetodologia(v) ? v : "sin_proyectar";
}

function poblarSelectorMetodologia(): void {
  const hayRem = ipc.rem !== undefined;
  el<HTMLOptionElement>("opcion-rem").hidden = !hayRem;
  if (!hayRem && leerMetodologia() === "rem") {
    el<HTMLSelectElement>("metodologia").value = "sin_proyectar";
  }
}

/* ------------------------------------------------------------- errores de parseo */

function pintarErrores(errores: FilaInvalida[]): void {
  const lista = el<HTMLUListElement>("errores-parseo");
  lista.replaceChildren(
    ...errores.map((e) => {
      const li = document.createElement("li");
      li.textContent = `Línea ${e.linea}: ${e.motivo}`;
      return li;
    }),
  );
  lista.hidden = errores.length === 0;
}

/* ---------------------------------------------------------------------- tabla */

function pintarTabla(resultado: PuntoSerieActualizado[]): void {
  const tabla = el<HTMLTableElement>("tabla-resultado");
  const cuerpo = el<HTMLTableSectionElement>("cuerpo-resultado");

  if (resultado.length === 0) {
    tabla.hidden = true;
    cuerpo.replaceChildren();
    return;
  }

  tabla.hidden = false;
  cuerpo.replaceChildren(
    ...resultado.map((p) => {
      const fila = document.createElement("tr");

      const celdaFecha = document.createElement("td");
      celdaFecha.textContent = nombrarPunto(p.punto);
      fila.append(celdaFecha);

      const celdaOriginal = document.createElement("td");
      celdaOriginal.textContent = pesos(p.valorOriginal);
      fila.append(celdaOriginal);

      const celdaActualizada = document.createElement("td");
      if (p.valorActualizado === null) {
        celdaActualizada.textContent =
          p.motivo === "fuera_de_cobertura"
            ? "no se puede actualizar: es anterior a la serie de inflación"
            : "no se pudo actualizar sin estimar";
        celdaActualizada.title = MOTIVOS[p.motivo!];
        fila.classList.add("fila-sin-actualizar");
      } else {
        celdaActualizada.textContent = pesos(p.valorActualizado);
        if (p.esProyeccion) {
          celdaActualizada.textContent += " (estimado)";
          fila.classList.add("fila-estimada");
        }
      }
      fila.append(celdaActualizada);

      return fila;
    }),
  );
}

/* ------------------------------------------------------------------- cálculo */

function recalcular(): void {
  const texto = el<HTMLTextAreaElement>("entrada-serie").value;
  const { puntos, errores } = parsearSerie(texto);
  pintarErrores(errores);

  const aviso = el("aviso-serie");
  const canvas = el<HTMLCanvasElement>("grafico");

  if (puntos.length < 2) {
    canvas.hidden = true;
    el<HTMLTableElement>("tabla-resultado").hidden = true;
    aviso.hidden = false;
    aviso.textContent =
      puntos.length === 0
        ? "Pegá o subí tu serie para ver el gráfico."
        : "Hace falta al menos 2 puntos válidos para poder graficar.";
    return;
  }

  const mesObjetivo = leerObjetivo();
  const metodologia = leerMetodologia();

  let resultado: PuntoSerieActualizado[];
  try {
    resultado = actualizarSerie(puntos, mesObjetivo, ipc, { metodologia });
  } catch (e: unknown) {
    canvas.hidden = true;
    el<HTMLTableElement>("tabla-resultado").hidden = true;
    aviso.hidden = true;
    const error = el("error");
    error.textContent = `No se pudo actualizar la serie: ${(e as Error).message}`;
    error.hidden = false;
    return;
  }

  const todoSinResolver = resultado.every((p) => p.valorActualizado === null);
  if (todoSinResolver) {
    canvas.hidden = true;
    el<HTMLTableElement>("tabla-resultado").hidden = true;
    aviso.hidden = false;
    aviso.textContent =
      "Ningún punto se pudo actualizar sin estimar para el mes elegido. Probá otra " +
      "metodología, o un mes objetivo más cercano a tu serie.";
    return;
  }

  aviso.hidden = true;
  canvas.hidden = false;
  dibujarSerieActualizada(canvas, resultado, nombrarMes(mesObjetivo));
  pintarTabla(resultado);
}

/* ------------------------------------------------------------------- archivo */

function leerArchivoComoTexto(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result ?? ""));
    lector.onerror = () => reject(new Error("No se pudo leer el archivo"));
    lector.readAsText(archivo, "utf-8");
  });
}

/* ----------------------------------------------------------------------- URL */

function leerUrl(): { mes: string | null } {
  const p = new URLSearchParams(location.search);
  return { mes: p.get("mes") };
}

async function iniciar(): Promise<void> {
  const rIpc = await fetch(`${import.meta.env.BASE_URL}data/ipc.json`);
  if (!rIpc.ok) throw new Error(`No se pudo cargar el IPC (HTTP ${rIpc.status})`);
  ipc = (await rIpc.json()) as SerieIndice;

  poblarSelectorObjetivo();
  poblarSelectorMetodologia();

  const { ultimo } = limiteObjetivo();
  el<HTMLSelectElement>("objetivo-anio").value = ultimo.slice(0, 4);
  el<HTMLSelectElement>("objetivo-mes").value = ultimo.slice(5, 7);

  const { mes } = leerUrl();
  if (mes !== null && esMesValido(mes)) {
    const { primero } = limiteObjetivo();
    if (mes >= primero && mes <= ultimo) {
      el<HTMLSelectElement>("objetivo-anio").value = mes.slice(0, 4);
      el<HTMLSelectElement>("objetivo-mes").value = mes.slice(5, 7);
    }
  }
  acotarMesesObjetivo();

  el<HTMLTextAreaElement>("entrada-serie").addEventListener("input", recalcular);

  el<HTMLInputElement>("entrada-archivo").addEventListener("change", (ev) => {
    const archivo = (ev.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    void leerArchivoComoTexto(archivo)
      .then((texto) => {
        el<HTMLTextAreaElement>("entrada-serie").value = texto;
        recalcular();
      })
      .catch((e: unknown) => {
        // Sin esto, un archivo ilegible (permiso revocado, borrado después de
        // elegirlo, etc.) no cambiaba nada en pantalla — regla 3 de AGENTS.md:
        // un control no ofrece lo que no puede cumplir sin decirlo al lado.
        const error = el("error");
        error.textContent = `No se pudo leer el archivo: ${(e as Error).message}`;
        error.hidden = false;
      });
  });

  el("formulario").addEventListener("input", (ev) => {
    const objetivo = ev.target as HTMLElement;
    if (objetivo.id === "objetivo-anio") acotarMesesObjetivo();
    if (objetivo.id === "entrada-serie" || objetivo.id === "entrada-archivo") return; // ya tienen su propio listener
    recalcular();
  });

  recalcular();
}

iniciar().catch((e: unknown) => {
  const error = el("error");
  error.textContent = `No se pudieron cargar los datos: ${(e as Error).message}`;
  error.hidden = false;
});
