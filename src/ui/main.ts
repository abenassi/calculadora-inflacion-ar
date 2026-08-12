/**
 * Orquestación de la página: lee el estado del formulario y la URL, llama al motor
 * y pinta. Toda la lógica de cálculo vive en `src/engine`; acá no se hace ninguna
 * cuenta de inflación.
 *
 * Hay un solo modo de cálculo. Antes existían "casos de uso" (presupuesto, sueldo,
 * alquiler) que sugerían cálculos distintos cuando en realidad siempre era el
 * mismo: un monto, dos fechas, el IPC. Eran ruido que hacía dudar al usuario sobre
 * si había elegido bien.
 */

import { adjust, mesActual, RangoError } from "../engine/adjust.js";
import {
  abreviarPunto,
  aOrdinal,
  deOrdinal,
  esFechaValida,
  esMesValido,
  mesDe,
  nombrarMes,
  nombrarPunto,
  primerDia,
} from "../engine/mes.js";
import type { Mes, Punto, Resultado, SerieIndice } from "../engine/types.js";
import { dibujar } from "./chart.js";
import { fechaLarga, indice, pesos, pesosRedondo, porcentaje } from "./format.js";

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

/** Hasta cuántos meses más allá del último dato oficial se puede pedir. */
const HORIZONTE_MESES = 24;

/* ---------------------------------------------------------------- formulario */

function usaDias(): boolean {
  return el<HTMLInputElement>("usar-dias").checked;
}

function poblarSelects(): void {
  const primero = serie.datos[0]!.mes;
  // Proyectar más lejos que dos años con el promedio de tres meses es ruido con
  // forma de número, así que ese es el techo.
  const ultimo = deOrdinal(aOrdinal(serie.ultimo_oficial) + HORIZONTE_MESES);

  for (const id of ["desde-mes", "hasta-mes"]) {
    el<HTMLSelectElement>(id).innerHTML = NOMBRES_MES.map(
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

  // Los input[type=date] se acotan al mismo rango, para que el calendario del
  // navegador no ofrezca fechas que el motor va a rechazar.
  for (const id of ["desde-dia", "hasta-dia"]) {
    const input = el<HTMLInputElement>(id);
    input.min = primerDia(primero);
    input.max = `${ultimo}-28`;
  }
}

function leerPunto(prefijo: "desde" | "hasta"): Punto {
  if (usaDias()) {
    const valor = el<HTMLInputElement>(`${prefijo}-dia`).value;
    if (!esFechaValida(valor)) {
      throw new RangoError("Elegí las dos fechas para poder calcular.");
    }
    return valor;
  }
  const mes = el<HTMLSelectElement>(`${prefijo}-mes`).value;
  const anio = el<HTMLSelectElement>(`${prefijo}-anio`).value;
  return `${anio}-${mes}`;
}

function escribirPunto(prefijo: "desde" | "hasta", punto: Punto): void {
  const mes = mesDe(punto);
  el<HTMLSelectElement>(`${prefijo}-anio`).value = mes.slice(0, 4);
  el<HTMLSelectElement>(`${prefijo}-mes`).value = mes.slice(5, 7);
  el<HTMLInputElement>(`${prefijo}-dia`).value = punto.length === 10 ? punto : primerDia(mes);
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

function alternarModo(): void {
  const dias = usaDias();
  for (const campo of document.querySelectorAll<HTMLElement>("[data-modo]")) {
    campo.hidden = (campo.dataset.modo === "dia") !== dias;
  }
  calcular();
}

/* ------------------------------------------------------------------ resultado */

/** A partir de cuántos meses estimados dejamos de tratarlo como una cuenta razonable. */
const MESES_PROYECCION_LARGA = 4;

function listar(nombres: string[], union = "y"): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} ${union} ${nombres.at(-1)}`;
}

/**
 * Nombra los meses faltantes en castellano legible.
 *
 * Hasta tres, los enumera colapsando el año repetido ("julio y agosto de 2026").
 * De ahí en más pasa a un rango: enumerar doce meses uno por uno produce una
 * oración que nadie lee, y el dato que importa es cuántos son y hasta dónde llegan.
 */
function frasearMeses(meses: Mes[], union = "y"): string {
  if (meses.length === 0) return "";
  if (meses.length > 3) {
    return `los ${meses.length} meses que van de ${nombrarMes(meses[0]!)} a ${nombrarMes(meses.at(-1)!)}`;
  }
  const anios = new Set(meses.map((m) => m.slice(0, 4)));
  if (anios.size === 1) {
    const soloMeses = meses.map((m) => nombrarMes(m).replace(/ \d{4}$/, ""));
    return `${listar(soloMeses, union)} de ${meses[0]!.slice(0, 4)}`;
  }
  return listar(meses.map(nombrarMes), union);
}

/** "un aumento de 11,53%" / "una baja de 10,34%". El signo no se lee en una frase. */
function frasearVariacion(pct: number): string {
  const palabra = pct < 0 ? "una baja" : "un aumento";
  return `${palabra} de ${porcentaje(Math.abs(pct), false)}`;
}

/**
 * La explicación de dónde sale la tasa de proyección.
 *
 * Es la respuesta a "¿de dónde sacaste ese porcentaje?". Sin esto, la tasa es un
 * número sin origen visible y el resultado no se puede defender ante nadie.
 */
function pintarBaseProyeccion(r: Resultado): void {
  const bloque = el("base-proyeccion");
  const e = r.estimado;
  bloque.hidden = !e;
  if (!e) return;

  el("base-resumen").textContent = `¿De dónde sale ese ${porcentaje(e.tasaMensualPct, false)}?`;

  el("base-cuerpo").replaceChildren(
    ...e.base.map((m) => {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = nombrarMes(m.mes);
      const td = document.createElement("td");
      td.textContent = porcentaje(m.varMensualPct);
      tr.append(th, td);
      return tr;
    }),
  );

  el("base-promedio").textContent = porcentaje(e.tasaMensualPct, false);
  el("base-nota").textContent =
    `Es el promedio de la inflación de los últimos ${e.base.length} meses que el INDEC ya ` +
    `publicó. Ese promedio se aplica a cada mes que todavía falta publicar.`;
}

function pintarResultado(r: Resultado): void {
  const e = r.estimado;

  // El bloque principal responde el período pedido, haya o no estimación.
  const tramo = e ?? r.oficial!;
  el("chip-estimado").hidden = !e;
  el("rotulo-principal").textContent = `A ${nombrarPunto(r.hasta)}`;
  el("cifra-principal").textContent = e ? `~${pesosRedondo(tramo.monto)}` : pesosRedondo(tramo.monto);

  if (e) {
    const uno = e.mesesFaltantes.length === 1;
    el("detalle-principal").textContent =
      `${pesos(r.monto)} de ${nombrarPunto(r.desde)}, con ${frasearVariacion(e.variacionPct)}. ` +
      `El INDEC todavía no publicó ${frasearMeses(e.mesesFaltantes, "ni")}, ` +
      `así que ${uno ? "ese mes se estima" : "esos meses se estiman"} en ` +
      `${porcentaje(e.tasaMensualPct, false)} cada uno.`;
  } else {
    el("detalle-principal").textContent =
      `${pesos(r.monto)} de ${nombrarPunto(r.desde)}, con ${frasearVariacion(tramo.variacionPct)}. ` +
      `Todos los meses del cálculo son datos oficiales ya publicados por el INDEC.`;
  }

  // Cuanto más lejos se proyecta, más deja de ser una cuenta y más se parece a un
  // pronóstico. Un aviso escalonado evita que una fecha lejana se lea con la misma
  // confianza que el mes que viene.
  const aviso = el("aviso-largo");
  const largo = (e?.mesesFaltantes.length ?? 0) >= MESES_PROYECCION_LARGA;
  aviso.hidden = !largo;
  if (largo && e) {
    aviso.textContent =
      `Son ${e.mesesFaltantes.length} meses sin publicar. Esto es una cuenta, no un ` +
      `pronóstico: la inflación real de esos meses puede ser bastante distinta.`;
  }

  pintarBaseProyeccion(r);

  // El respaldo sólo aparece cuando aporta algo: si no hubo estimación, ya es el
  // número principal, y si el origen tampoco está publicado, no existe.
  const respaldo = el("bloque-respaldo");
  respaldo.hidden = !e || !r.oficial;
  if (e && r.oficial) {
    el("cifra-respaldo").textContent = pesosRedondo(r.oficial.monto);
    el("detalle-respaldo").textContent =
      `A ${nombrarPunto(r.oficial.hasta)}, el último mes que publicó el INDEC. ` +
      `Sobre este número no hay nada estimado: es ${frasearVariacion(r.oficial.variacionPct)}.`;
  }

  // Construido con nodos en vez de innerHTML: la tabla es lo único que se arma a
  // partir de datos, y así el snapshot nunca puede inyectar markup por más que
  // cambie de forma.
  el("cuerpo-desglose").replaceChildren(
    ...r.desglose.map((f) => {
      const tr = document.createElement("tr");
      if (f.esProyeccion) tr.className = "fila--estimada";

      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = abreviarPunto(f.punto);
      tr.append(th);

      const celda = (texto: string, clase?: string) => {
        const td = document.createElement("td");
        td.textContent = texto;
        if (clase) td.className = clase;
        return td;
      };

      const tdOrigen = document.createElement("td");
      const marca = document.createElement("span");
      marca.className = `origen origen--${f.origen}`;
      marca.textContent =
        f.origen === "indec" ? "INDEC ✓" : f.origen === "bcra" ? "BCRA ✓" : "estimado";
      tdOrigen.append(marca);

      tr.append(
        celda(f.varMensualPct === null ? "—" : porcentaje(f.varMensualPct)),
        celda(f.acumuladoPct === null ? "—" : porcentaje(f.acumuladoPct), "col-acumulado"),
        celda(pesos(f.monto)),
        tdOrigen,
        celda(indice(f.indice), "col-tecnica"),
      );
      return tr;
    }),
  );

  const proyectadas = r.desglose.filter((f) => f.esProyeccion).length;
  el("pie-tabla").textContent = proyectadas
    ? `Las filas resaltadas (${proyectadas}) son las estimadas: el INDEC todavía no publicó ` +
      `esos meses. El resto son datos oficiales.`
    : "Todas las filas son datos oficiales publicados. Acá no hay ninguna estimación.";

  dibujar(el<HTMLCanvasElement>("grafico"), r);
}

/**
 * Un párrafo listo para pegar en un mensaje.
 *
 * El objetivo de quien usa esto no suele ser saber el número, sino justificarlo
 * ante otra persona. Un link y un CSV no sirven para eso: hay que poder mandar una
 * explicación que se lea sola y que traiga la fuente adentro.
 */
function armarExplicacion(r: Resultado): string {
  const e = r.estimado;
  const tramo = e ?? r.oficial!;
  const lineas: string[] = [];

  lineas.push(
    `${pesos(r.monto)} de ${nombrarPunto(r.desde)} equivalen a ` +
      `${e ? "unos " : ""}${pesosRedondo(tramo.monto)} en ${nombrarPunto(r.hasta)}.`,
    `Variación acumulada: ${porcentaje(tramo.variacionPct)} (inflación oficial, IPC del INDEC).`,
    "",
    "Mes a mes:",
  );

  for (const f of r.desglose.slice(1)) {
    const etiqueta = f.origen === "proyeccion" ? "estimado" : "oficial INDEC";
    lineas.push(`- ${abreviarPunto(f.punto)}: ${porcentaje(f.varMensualPct ?? 0)} (${etiqueta})`);
  }

  if (e) {
    lineas.push(
      "",
      `El INDEC todavía no publicó ${frasearMeses(e.mesesFaltantes, "ni")}. ` +
        `Se ${e.mesesFaltantes.length === 1 ? "estima" : "estiman"} en ` +
        `${porcentaje(e.tasaMensualPct, false)}, que es el promedio de los últimos ` +
        `${e.base.length} meses publicados (${e.base
          .map((m) => `${nombrarMes(m.mes)} ${porcentaje(m.varMensualPct)}`)
          .join(", ")}).`,
    );
    if (r.oficial) {
      lineas.push(
        `Contando solo los meses ya publicados, hasta ${nombrarPunto(r.oficial.hasta)}: ` +
          `${pesosRedondo(r.oficial.monto)} (${porcentaje(r.oficial.variacionPct)}).`,
      );
    }
  }

  lineas.push("", `Fuente: IPC Nivel General Nacional, INDEC. Calculado en ${location.href}`);
  return lineas.join("\n");
}

function calcular(): void {
  const error = el("error");
  try {
    const monto = leerMonto();
    if (!Number.isFinite(monto)) throw new RangoError("Escribí un monto para calcular.");
    if (monto <= 0) throw new RangoError("El monto tiene que ser mayor que cero.");

    const desde = leerPunto("desde");
    const hasta = leerPunto("hasta");

    const r = adjust(monto, desde, hasta, serie);
    ultimoResultado = r;
    error.hidden = true;
    el("bloque-principal").hidden = false;
    pintarResultado(r);
    sincronizarUrl(monto, desde, hasta);
  } catch (e) {
    ultimoResultado = null;
    error.textContent = e instanceof RangeError ? e.message : "No se pudo calcular.";
    error.hidden = false;
    el("bloque-principal").hidden = true;
    el("bloque-respaldo").hidden = true;
    el("cuerpo-desglose").replaceChildren();
    el("pie-tabla").textContent = "";
  }
}

/* ------------------------------------------------------------ URL compartible */

function sincronizarUrl(monto: number, desde: Punto, hasta: Punto): void {
  const p = new URLSearchParams({ monto: String(monto), desde, hasta });
  history.replaceState(null, "", `?${p}`);
}

function leerUrl(): void {
  const p = new URLSearchParams(location.search);

  const monto = Number(p.get("monto"));
  if (Number.isFinite(monto) && monto > 0) {
    el<HTMLInputElement>("monto").value = new Intl.NumberFormat("es-AR", {
      maximumFractionDigits: 2,
    }).format(monto);
  }

  const desde = p.get("desde");
  const hasta = p.get("hasta");
  const valido = (v: string | null): v is Punto =>
    v !== null && (esMesValido(v) || esFechaValida(v));

  // Un link con fechas completas abre directamente en modo por día, así se
  // reproduce exactamente la consulta que alguien compartió.
  if ((valido(desde) && desde.length === 10) || (valido(hasta) && hasta.length === 10)) {
    el<HTMLInputElement>("usar-dias").checked = true;
    for (const campo of document.querySelectorAll<HTMLElement>("[data-modo]")) {
      campo.hidden = campo.dataset.modo !== "dia";
    }
  }

  if (valido(desde)) escribirPunto("desde", desde);
  if (valido(hasta)) escribirPunto("hasta", hasta);
}

/* -------------------------------------------------------------------- acciones */

async function copiar(boton: HTMLButtonElement, texto: string, fallback: string): Promise<void> {
  const original = boton.textContent ?? "";
  try {
    await navigator.clipboard.writeText(texto);
    boton.textContent = "¡Copiado!";
  } catch {
    // Sin permiso de portapapeles (o contexto inseguro).
    boton.textContent = fallback;
  }
  setTimeout(() => (boton.textContent = original), 2500);
}

function descargarCsv(): void {
  const r = ultimoResultado;
  if (!r) return;

  const filas: string[][] = [
    ["# Calculadora de inflacion - IPC Nivel General Nacional, INDEC"],
    [`# Periodo: ${r.desde} a ${r.hasta}`],
    [`# Datos via Argentina Data MCP, actualizados al ${serie.actualizado.slice(0, 10)}`],
    [`# Ultimo mes publicado por el INDEC: ${serie.ultimo_oficial}`],
    [],
    ["punto", "indice_ipc", "variacion_pct", "acumulado_pct", "monto", "origen"],
    ...r.desglose.map((f) => [
      f.punto,
      f.indice.toFixed(4),
      f.varMensualPct?.toFixed(2) ?? "",
      f.acumuladoPct?.toFixed(2) ?? "",
      f.monto.toFixed(2),
      f.origen,
    ]),
  ];

  // Los meses base van dentro del CSV: si alguien descarga esto para mostrárselo a
  // otra persona, la justificación de la tasa tiene que viajar con los números.
  if (r.estimado) {
    filas.push([], ["proyeccion_base_mes", "variacion_pct"]);
    for (const m of r.estimado.base) filas.push([m.mes, m.varMensualPct.toFixed(2)]);
    filas.push(["promedio_aplicado", r.estimado.tasaMensualPct.toFixed(2)]);
  }

  const csv = filas.map((f) => f.join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `inflacion-${r.desde}-a-${r.hasta}.csv`;
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

  escribirPunto("desde", deOrdinal(aOrdinal(serie.ultimo_oficial) - 1));
  escribirPunto("hasta", mesActual());

  leerUrl();

  el("formulario").addEventListener("input", (ev) => {
    if ((ev.target as HTMLElement).id === "monto") formatearMontoEnVivo();
    calcular();
  });
  el("formulario").addEventListener("submit", (ev) => ev.preventDefault());
  el("usar-dias").addEventListener("change", alternarModo);

  el<HTMLButtonElement>("copiar").addEventListener("click", (ev) =>
    copiar(ev.currentTarget as HTMLButtonElement, location.href, "Copiá de la barra ↑"),
  );
  el<HTMLButtonElement>("copiar-explicacion").addEventListener("click", (ev) => {
    if (!ultimoResultado) return;
    copiar(
      ev.currentTarget as HTMLButtonElement,
      armarExplicacion(ultimoResultado),
      "No se pudo copiar",
    );
  });
  el("csv").addEventListener("click", descargarCsv);

  calcular();
}

iniciar().catch((e: unknown) => {
  const error = el("error");
  error.textContent = `No se pudieron cargar los datos: ${(e as Error).message}`;
  error.hidden = false;
});
