/**
 * Orquestación de la página: lee el estado del formulario y la URL, llama al motor
 * y pinta. Toda la lógica de cálculo vive en `src/engine`; acá no se hace ninguna
 * cuenta de inflación.
 */

import { adjust, mesActual, RangoError } from "../engine/adjust.js";
import { abreviarMes, aOrdinal, deOrdinal, diffMeses, esMesValido, nombrarMes } from "../engine/mes.js";
import type { Mes, Resultado, SerieIndice } from "../engine/types.js";
import { dibujar } from "./chart.js";
import { fechaLarga, indice, pesos, pesosRedondo, porcentaje } from "./format.js";
import { destinoPorPeriodicidad, esIdPreset, ORDEN_PRESETS, PRESETS, type IdPreset } from "./presets.js";

const NOMBRES_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const el = <T extends HTMLElement>(id: string): T => {
  const nodo = document.getElementById(id);
  if (!nodo) throw new Error(`Falta el elemento #${id}`);
  return nodo as T;
};

let serie: SerieIndice;
let ultimoResultado: Resultado | null = null;
let preset: IdPreset = "hoy";

/* ---------------------------------------------------------------- formulario */

function poblarSelects(): void {
  const primero = serie.datos[0]!.mes;
  // Se puede elegir hasta 24 meses hacia adelante: proyectar más lejos que eso con
  // el promedio de 3 meses es ruido con forma de número.
  const ultimo = deOrdinal(aOrdinal(serie.ultimo_oficial) + 24);

  for (const id of ["desde-mes", "hasta-mes"]) {
    const sel = el<HTMLSelectElement>(id);
    sel.innerHTML = NOMBRES_MES.map(
      (n, i) => `<option value="${String(i + 1).padStart(2, "0")}">${n}</option>`,
    ).join("");
  }

  const anioMin = Number(primero.slice(0, 4));
  const anioMax = Number(ultimo.slice(0, 4));
  const anios = Array.from({ length: anioMax - anioMin + 1 }, (_, i) => anioMin + i);
  for (const id of ["desde-anio", "hasta-anio"]) {
    el<HTMLSelectElement>(id).innerHTML = anios
      .map((a) => `<option value="${a}">${a}</option>`)
      .join("");
  }
}

function leerMes(prefijo: "desde" | "hasta"): Mes {
  const mes = el<HTMLSelectElement>(`${prefijo}-mes`).value;
  const anio = el<HTMLSelectElement>(`${prefijo}-anio`).value;
  return `${anio}-${mes}`;
}

function escribirMes(prefijo: "desde" | "hasta", mes: Mes): void {
  el<HTMLSelectElement>(`${prefijo}-anio`).value = mes.slice(0, 4);
  el<HTMLSelectElement>(`${prefijo}-mes`).value = mes.slice(5, 7);
}

/** Acepta "520.000", "520000", "520000,50". Devuelve NaN si no hay un número. */
function leerMonto(): number {
  const crudo = el<HTMLInputElement>("monto").value.replace(/\./g, "").replace(",", ".");
  const n = Number(crudo.replace(/[^\d.-]/g, ""));
  return crudo.trim() === "" ? Number.NaN : n;
}

function formatearMontoEnVivo(): void {
  const input = el<HTMLInputElement>("monto");
  const n = leerMonto();
  if (!Number.isFinite(n)) return;
  const cursorAlFinal = input.selectionStart === input.value.length;
  input.value = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);
  if (cursorAlFinal) input.setSelectionRange(input.value.length, input.value.length);
}

/* -------------------------------------------------------------------- presets */

function pintarPresets(): void {
  el("presets").innerHTML = ORDEN_PRESETS.map((id) => {
    const p = PRESETS[id];
    const activo = id === preset;
    return `<button type="button" class="preset${activo ? " preset--activo" : ""}"
      data-preset="${id}" aria-pressed="${activo}">${p.etiqueta}</button>`;
  }).join("");
}

type OpcionesPreset = {
  recalcular?: boolean;
  /**
   * No pisar el mes de destino con la periodicidad por defecto. Se usa al abrir un
   * link compartido: si alguien mandó una consulta concreta, tiene que reproducirse
   * tal cual, no reescribirse porque el preset tiene otra idea.
   */
  respetarDestino?: boolean;
};

function aplicarPreset(id: IdPreset, opciones: OpcionesPreset = {}): void {
  const { recalcular = true, respetarDestino = false } = opciones;
  preset = id;
  const p = PRESETS[id];

  el("titulo").textContent = p.titulo;
  el("bajada").textContent = p.bajada;
  el("etiqueta-monto").textContent = p.etiquetaMonto;
  el("etiqueta-desde").textContent = p.etiquetaDesde;
  el("etiqueta-hasta").textContent = p.etiquetaHasta;
  document.title = `${p.titulo} de Argentina`;

  const aviso = el("advertencia");
  aviso.textContent = p.advertencia ?? "";
  aviso.hidden = !p.advertencia;

  const campo = el("campo-periodicidad");
  if (p.periodicidades) {
    const select = el<HTMLSelectElement>("periodicidad");
    select.innerHTML = p.periodicidades
      .map((x) => `<option value="${x.meses}">${x.etiqueta}</option>`)
      .join("");
    campo.hidden = false;

    if (respetarDestino) {
      // Si el período que viene en la URL coincide con una periodicidad conocida,
      // dejamos el selector reflejándola; si no, el destino manda igual.
      const meses = diffMeses(leerMes("desde"), leerMes("hasta"));
      if (p.periodicidades.some((x) => x.meses === meses)) select.value = String(meses);
    } else {
      aplicarPeriodicidad(false);
    }
  } else {
    campo.hidden = true;
  }

  pintarPresets();
  if (recalcular) calcular();
}

function aplicarPeriodicidad(recalcular = true): void {
  const meses = Number(el<HTMLSelectElement>("periodicidad").value);
  if (!Number.isFinite(meses)) return;
  escribirMes("hasta", destinoPorPeriodicidad(leerMes("desde"), meses));
  if (recalcular) calcular();
}

/* ------------------------------------------------------------------ resultado */

function pintarResultado(r: Resultado): void {
  const hayEstimacion = r.estimado !== undefined;
  const origenEsProyectado = r.oficial.hasta === r.desde && hayEstimacion;

  const bloqueOficial = el("bloque-oficial");
  bloqueOficial.hidden = origenEsProyectado;
  if (!origenEsProyectado) {
    el("rotulo-oficial").textContent = hayEstimacion
      ? "Con datos oficiales publicados"
      : "Equivale a";
    el("cifra-oficial").textContent = pesosRedondo(r.oficial.monto);
    el("detalle-oficial").textContent =
      `IPC del INDEC hasta ${nombrarMes(r.oficial.hasta)} · ${porcentaje(r.oficial.variacionPct)} ` +
      `desde ${nombrarMes(r.desde)}`;
  }

  const bloqueEstimado = el("bloque-estimado");
  bloqueEstimado.hidden = !hayEstimacion;
  if (r.estimado) {
    const e = r.estimado;
    const plural = e.mesesProyectados === 1 ? "mes" : "meses";
    el("cifra-estimado").textContent = `~${pesosRedondo(e.monto)}`;
    el("detalle-estimado").textContent =
      `A ${nombrarMes(e.hasta)}, proyectando ${e.mesesProyectados} ${plural} a ` +
      `${porcentaje(e.tasaMensualPct, false)} mensual · ${porcentaje(e.variacionPct)} en total. ` +
      `El INDEC todavía no publicó esos meses.`;
  }

  // Construido con nodos en vez de innerHTML: la tabla es lo único que se arma a
  // partir de datos, y así el snapshot nunca puede inyectar markup por más que
  // cambie de forma.
  const cuerpo = el("cuerpo-desglose");
  cuerpo.replaceChildren(
    ...r.desglose.map((f) => {
      const tr = document.createElement("tr");
      if (f.esProyeccion) tr.className = "fila--estimada";

      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = abreviarMes(f.mes);
      tr.append(th);

      const celda = (texto: string) => {
        const td = document.createElement("td");
        td.textContent = texto;
        return td;
      };
      tr.append(
        celda(indice(f.indice)),
        celda(f.varMensualPct === null ? "—" : porcentaje(f.varMensualPct)),
        celda(f.acumuladoPct === null ? "—" : porcentaje(f.acumuladoPct)),
        celda(pesos(f.monto)),
      );

      const tdOrigen = document.createElement("td");
      const marca = document.createElement("span");
      marca.className = `origen origen--${f.origen}`;
      marca.textContent =
        f.origen === "indec" ? "INDEC ✓" : f.origen === "bcra" ? "BCRA ✓" : "estimado";
      tdOrigen.append(marca);
      tr.append(tdOrigen);

      return tr;
    }),
  );

  dibujar(el<HTMLCanvasElement>("grafico"), r);
}

function calcular(): void {
  const error = el("error");
  const monto = leerMonto();
  const desde = leerMes("desde");
  const hasta = leerMes("hasta");

  try {
    if (!Number.isFinite(monto)) throw new RangoError("Escribí un monto para calcular.");
    if (monto <= 0) throw new RangoError("El monto tiene que ser mayor que cero.");

    const r = adjust(monto, desde, hasta, serie);
    ultimoResultado = r;
    error.hidden = true;
    el("bloque-oficial").hidden = false;
    pintarResultado(r);
    sincronizarUrl(monto, desde, hasta);
  } catch (e) {
    ultimoResultado = null;
    error.textContent = e instanceof RangeError ? e.message : "No se pudo calcular.";
    error.hidden = false;
    el("bloque-oficial").hidden = true;
    el("bloque-estimado").hidden = true;
    el("cuerpo-desglose").innerHTML = "";
  }
}

/* ------------------------------------------------------------ URL compartible */

function sincronizarUrl(monto: number, desde: Mes, hasta: Mes): void {
  const p = new URLSearchParams({ monto: String(monto), desde, hasta, preset });
  history.replaceState(null, "", `?${p}`);
}

function leerUrl(): { destinoExplicito: boolean } {
  const p = new URLSearchParams(location.search);

  const presetUrl = p.get("preset");
  if (presetUrl && esIdPreset(presetUrl)) preset = presetUrl;

  const monto = Number(p.get("monto"));
  if (Number.isFinite(monto) && monto > 0) {
    el<HTMLInputElement>("monto").value = new Intl.NumberFormat("es-AR", {
      maximumFractionDigits: 2,
    }).format(monto);
  }

  const desde = p.get("desde");
  const hasta = p.get("hasta");
  if (desde && esMesValido(desde)) escribirMes("desde", desde);

  const destinoExplicito = Boolean(hasta && esMesValido(hasta));
  if (hasta && destinoExplicito) escribirMes("hasta", hasta);

  return { destinoExplicito };
}

/* -------------------------------------------------------------------- acciones */

async function copiarLink(boton: HTMLButtonElement): Promise<void> {
  const original = "Copiar link";
  try {
    await navigator.clipboard.writeText(location.href);
    boton.textContent = "¡Copiado!";
  } catch {
    // Sin permiso de portapapeles (o contexto inseguro): que al menos vea la URL.
    boton.textContent = "Copiá de la barra ↑";
  }
  setTimeout(() => (boton.textContent = original), 2000);
}

function descargarCsv(): void {
  if (!ultimoResultado) return;
  const filas = [
    ["mes", "indice_ipc", "var_mensual_pct", "acumulado_pct", "monto", "origen"],
    ...ultimoResultado.desglose.map((f) => [
      f.mes,
      f.indice.toFixed(6),
      f.varMensualPct?.toFixed(4) ?? "",
      f.acumuladoPct?.toFixed(4) ?? "",
      f.monto.toFixed(2),
      f.origen,
    ]),
  ];
  const csv = filas.map((f) => f.join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `inflacion-${ultimoResultado.desde}-a-${ultimoResultado.hasta}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ----------------------------------------------------------------------- init */

async function iniciar(): Promise<void> {
  const respuesta = await fetch(`${import.meta.env.BASE_URL}data/ipc.json`);
  if (!respuesta.ok) throw new Error(`No se pudo cargar la serie (HTTP ${respuesta.status})`);
  serie = (await respuesta.json()) as SerieIndice;

  poblarSelects();
  el("actualizado").textContent = fechaLarga(serie.actualizado);

  // Defaults: el caso testigo del proyecto, tres meses hacia atrás desde el último
  // dato oficial hasta el mes corriente.
  escribirMes("desde", deOrdinal(aOrdinal(serie.ultimo_oficial) - 1));
  escribirMes("hasta", mesActual());

  const { destinoExplicito } = leerUrl();
  aplicarPreset(preset, { recalcular: false, respetarDestino: destinoExplicito });

  el("formulario").addEventListener("input", (ev) => {
    if ((ev.target as HTMLElement).id === "periodicidad") return aplicarPeriodicidad();
    if ((ev.target as HTMLElement).id === "monto") formatearMontoEnVivo();
    calcular();
  });
  el("formulario").addEventListener("submit", (ev) => ev.preventDefault());

  el("presets").addEventListener("click", (ev) => {
    const boton = (ev.target as HTMLElement).closest<HTMLButtonElement>("[data-preset]");
    const id = boton?.dataset.preset;
    if (id && esIdPreset(id)) aplicarPreset(id);
  });

  el<HTMLButtonElement>("copiar").addEventListener("click", (ev) =>
    copiarLink(ev.currentTarget as HTMLButtonElement),
  );
  el("csv").addEventListener("click", descargarCsv);

  calcular();
}

iniciar().catch((e: unknown) => {
  const error = el("error");
  error.textContent = `No se pudieron cargar los datos: ${(e as Error).message}`;
  error.hidden = false;
});
