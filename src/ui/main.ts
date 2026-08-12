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
  esFecha,
  esFechaValida,
  esMesValido,
  mesDe,
  nombrarMes,
  nombrarPunto,
  primerDia,
} from "../engine/mes.js";
import type { Mes, Metodologia, Punto, Resultado, SerieIndice } from "../engine/types.js";
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

/** Largo del período que se muestra al entrar, en meses. */
const MESES_DEL_DEFAULT = 3;

/* ---------------------------------------------------------------- formulario */

function usaDias(): boolean {
  return el<HTMLInputElement>("usar-dias").checked;
}

const METODOLOGIAS: Metodologia[] = ["sin_proyectar", "repite_ultimo", "rem"];

function esMetodologia(v: string | null): v is Metodologia {
  return v !== null && (METODOLOGIAS as string[]).includes(v);
}

function leerMetodologia(): Metodologia {
  const v = el<HTMLSelectElement>("metodologia").value;
  return esMetodologia(v) ? v : "sin_proyectar";
}

function poblarSelects(): void {
  const primero = serie.datos[0]!.mes;
  // Repetir la última variación mensual más allá de dos años es ruido con forma
  // de número, así que ese es el techo.
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

/** A partir de cuántos meses proyectados dejamos de tratarlo como una cuenta razonable. */
const MESES_PROYECCION_LARGA = 4;

function listar(nombres: string[], union = "y"): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} ${union} ${nombres.at(-1)}`;
}

/**
 * Nombra una lista de meses en castellano legible: hasta tres los enumera
 * colapsando el año repetido ("julio y agosto de 2026"); de ahí en más los resume
 * como rango, porque enumerar doce meses produce una oración que nadie lee.
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
  return `${pct < 0 ? "una baja" : "un aumento"} de ${porcentaje(Math.abs(pct), false)}`;
}

function plural(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

/** El resultado dicho en una línea, antes de explicar de dónde sale. */
function resumir(r: Resultado): string {
  return `${pesos(r.monto)} de ${nombrarPunto(r.desde)}, con ${frasearVariacion(r.variacionPct)}.`;
}

/**
 * Por qué el número es ese y con qué meses se calculó.
 *
 * Es lo único que separa un resultado defendible de un número que apareció solo.
 * Tiene que nombrar los meses concretos que se usaron, siempre.
 *
 * Va separado de `resumir` porque el texto que se copia ya trae el monto y el
 * porcentaje en sus primeras dos líneas: repetirlos ahí lee como un error.
 */
function explicarMetodo(r: Resultado): string {
  switch (r.metodo.tipo) {
    case "directo":
      return "Todos los meses del cálculo son datos oficiales ya publicados por el INDEC.";

    case "ventana_reciente": {
      const { mesesDelPeriodo, mesesSinPublicar } = r.metodo;
      const contexto =
        `De ${nombrarPunto(r.desde)} a ${nombrarPunto(r.hasta)} ` +
        `${plural(mesesDelPeriodo, "pasó 1 mes", `pasaron ${mesesDelPeriodo} meses`)}, y el INDEC ` +
        `todavía no publicó ${frasearMeses(mesesSinPublicar, "ni")}. `;
      const cierre = "Para no tener que hacer ninguna estimación.";

      // En modo por día las filas son fechas, no meses: enumerar sus meses
      // duplicaría el del extremo. Se nombra el tramo por sus puntas, que además
      // es lo que efectivamente se calculó.
      if (esFecha(r.desglose[0]!.punto)) {
        return (
          `${contexto}Así que usamos el período equivalente más reciente que sí está publicado: ` +
          `del ${nombrarPunto(r.desglose[0]!.punto)} al ${nombrarPunto(r.desglose.at(-1)!.punto)}. ${cierre}`
        );
      }

      const usados = frasearMeses(r.desglose.slice(1).map((f) => mesDe(f.punto)));
      return (
        `${contexto}Así que usamos la inflación de ` +
        `${plural(mesesDelPeriodo, "el último mes publicado", `los últimos ${mesesDelPeriodo} meses publicados`)} ` +
        `(${usados}). ${cierre}`
      );
    }

    case "proyeccion": {
      const { mesesEstimados, tasaMensualPct, base } = r.metodo;
      const n = mesesEstimados.length;
      const faltan =
        `El INDEC todavía no publicó ${frasearMeses(mesesEstimados, "ni")}, así que ` +
        `${plural(n, "ese mes se estima", "esos meses se estiman")} `;

      if (base.fuente === "rem") {
        return (
          `${faltan}con el REM del BCRA: en la encuesta de ${nombrarMes(base.mesEncuesta)}, ` +
          `los analistas esperaban ${porcentaje(base.expectativaAnualPct, false)} de inflación ` +
          `para los doce meses siguientes, que repartido mes a mes da ` +
          `${porcentaje(tasaMensualPct)} por mes.`
        );
      }

      return (
        `${faltan}repitiendo la última inflación publicada, la de ` +
        `${nombrarMes(base.mes)} (${porcentaje(tasaMensualPct)}).`
      );
    }
  }
}

/** El párrafo completo de la tarjeta: el resultado más su justificación. */
function explicar(r: Resultado): string {
  return `${resumir(r)} ${explicarMetodo(r)}`;
}

/** El pie de la tabla, que dice qué está mirando el lector. */
function explicarTabla(r: Resultado): string {
  switch (r.metodo.tipo) {
    case "directo":
      return "Todas las filas son datos oficiales publicados por el INDEC. Acá no hay nada estimado.";
    case "ventana_reciente":
      return (
        `Estos son los últimos meses que publicó el INDEC. Los usamos como referencia porque ` +
        `el período que pediste tiene la misma cantidad de meses y los últimos todavía no salieron.`
      );
    case "proyeccion": {
      const { base, tasaMensualPct } = r.metodo;
      const proyectadas = r.desglose.filter((f) => f.esProyeccion).length;
      const de =
        base.fuente === "rem"
          ? `el REM del BCRA de ${nombrarMes(base.mesEncuesta)}`
          : `la inflación de ${nombrarMes(base.mes)}`;
      return (
        `Estos son los meses que pediste. ${plural(proyectadas, "La fila resaltada", `Las ${proyectadas} filas resaltadas`)} ` +
        `${plural(proyectadas, "es un mes proyectado", "son meses proyectados")}, no publicado${plural(proyectadas, "", "s")} ` +
        `por el INDEC: ${plural(proyectadas, "se estimó", "se estimaron")} con ${de}, a ` +
        `${porcentaje(tasaMensualPct)} por mes. El resto son datos oficiales.`
      );
    }
  }
}

function pintarResultado(r: Resultado): void {
  const esProyeccion = r.metodo.tipo === "proyeccion";

  el("chip-estimado").hidden = !esProyeccion;
  // Anunciar "estimado" en la leyenda cuando no hay ninguna fila estimada hace
  // dudar de un resultado que es enteramente oficial.
  el("leyenda-estimado").hidden = !esProyeccion;
  // Con `ventana_reciente` el eje del gráfico son los meses de referencia, no los
  // del período pedido: el título lo dice para que nadie lea mal las fechas.
  el("titulo-grafico").textContent =
    r.metodo.tipo === "ventana_reciente"
      ? "Inflación mensual de los meses de referencia"
      : "Inflación mensual";
  el("rotulo-principal").textContent = `A ${nombrarPunto(r.hasta)}`;
  el("cifra-principal").textContent =
    r.metodo.tipo === "directo" ? pesosRedondo(r.montoAjustado) : `~${pesosRedondo(r.montoAjustado)}`;
  el("detalle-principal").textContent = explicar(r);

  // Cuanto más lejos se proyecta, menos es una cuenta y más un pronóstico.
  const aviso = el("aviso-largo");
  const meses = r.metodo.tipo === "proyeccion" ? r.metodo.mesesEstimados.length : 0;
  aviso.hidden = meses < MESES_PROYECCION_LARGA;
  if (!aviso.hidden) {
    aviso.textContent =
      `Son ${meses} meses sin publicar. Esto es una cuenta, no un pronóstico: la inflación ` +
      `real de esos meses puede ser bastante distinta.`;
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

  el("pie-tabla").textContent = explicarTabla(r);
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
  const lineas: string[] = [
    `${pesos(r.monto)} de ${nombrarPunto(r.desde)} equivalen a ` +
      `${r.metodo.tipo === "directo" ? "" : "unos "}${pesosRedondo(r.montoAjustado)} ` +
      `en ${nombrarPunto(r.hasta)}.`,
    `Inflación acumulada: ${porcentaje(r.variacionPct)} (IPC del INDEC).`,
    "",
    r.metodo.tipo === "ventana_reciente" ? "Meses usados:" : "Mes a mes:",
  ];

  for (const f of r.desglose.slice(1)) {
    const etiqueta = f.origen === "proyeccion" ? "estimado" : "oficial INDEC";
    lineas.push(`- ${abreviarPunto(f.punto)}: ${porcentaje(f.varMensualPct ?? 0)} (${etiqueta})`);
  }

  lineas.push("", explicarMetodo(r));
  lineas.push("", `Fuente: IPC Nivel General Nacional, INDEC. Calculado en ${location.href}`);
  return lineas.join("\n");
}

function calcular(): void {
  const error = el("error");
  try {
    const monto = leerMonto();
    if (!Number.isFinite(monto)) throw new RangoError("Escribí un monto para calcular.");
    if (monto <= 0) throw new RangoError("El monto tiene que ser mayor que cero.");

    const metodologia = leerMetodologia();
    const r = adjust(monto, leerPunto("desde"), leerPunto("hasta"), serie, { metodologia });
    ultimoResultado = r;
    error.hidden = true;
    el("bloque-principal").hidden = false;
    pintarResultado(r);
    sincronizarUrl(monto, r.desde, r.hasta, metodologia);
  } catch (e) {
    ultimoResultado = null;
    error.textContent = e instanceof RangeError ? e.message : "No se pudo calcular.";
    error.hidden = false;
    el("bloque-principal").hidden = true;
    el("cuerpo-desglose").replaceChildren();
    el("pie-tabla").textContent = "";
  }
}

/* ------------------------------------------------------------ URL compartible */

function sincronizarUrl(
  monto: number,
  desde: Punto,
  hasta: Punto,
  metodologia: Metodologia,
): void {
  const p = new URLSearchParams({ monto: String(monto), desde, hasta });
  // La metodología default no viaja en la URL: el link más compartido tiene que
  // ser el más corto, y quien lo abra tiene que ver lo mismo que vería entrando
  // de cero.
  if (metodologia !== "sin_proyectar") p.set("metodo", metodologia);
  history.replaceState(null, "", `?${p}`);
}

function leerUrl(): void {
  const p = new URLSearchParams(location.search);

  // Sólo desde un link explícito: nunca se recuerda entre visitas. Quien llega
  // de cero ve siempre la metodología que no estima nada.
  const metodo = p.get("metodo");
  if (esMetodologia(metodo) && !(metodo === "rem" && !serie.rem)) {
    el<HTMLSelectElement>("metodologia").value = metodo;
  }

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

  // El método viaja adentro del archivo. Si alguien descarga esto para mostrárselo
  // a otra persona, los números solos no alcanzan: hay que poder decir de qué meses
  // salieron y por qué.
  filas.push([], ["# metodo", r.metodo.tipo]);
  if (r.metodo.tipo === "ventana_reciente") {
    filas.push(
      ["# meses_del_periodo", String(r.metodo.mesesDelPeriodo)],
      ["# meses_sin_publicar", r.metodo.mesesSinPublicar.join(" ")],
      ["# ventana_corrida_meses", String(r.metodo.desplazamiento)],
    );
  } else if (r.metodo.tipo === "proyeccion") {
    const { base } = r.metodo;
    filas.push(
      ["# base_proyeccion", base.fuente],
      ["# tasa_mensual_aplicada_pct", r.metodo.tasaMensualPct.toFixed(4)],
      ["# meses_estimados", r.metodo.mesesEstimados.join(" ")],
      base.fuente === "rem"
        ? ["# rem_encuesta", `${base.mesEncuesta} ${base.expectativaAnualPct}% a 12 meses`]
        : ["# mes_base", base.mes],
    );
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
  // Si el pipeline no pudo traer el REM, la opción no existe: es preferible una
  // opción menos a una que falla al elegirla.
  if (!serie.rem) el("opcion-rem").remove();

  // El default se corre solo con el calendario: siempre el mes en curso como
  // destino y tres meses antes como origen. En diciembre va a decir septiembre a
  // diciembre sin que nadie lo toque.
  //
  // Va anclado a `mesActual()` y no al último mes publicado a propósito: si el
  // INDEC se atrasa un mes, anclarlo al dato estiraría el período a cuatro meses
  // sin que eso signifique nada para quien entra.
  const hoy = mesActual();
  escribirPunto("desde", deOrdinal(aOrdinal(hoy) - MESES_DEL_DEFAULT));
  escribirPunto("hasta", hoy);

  leerUrl();

  el("formulario").addEventListener("input", (ev) => {
    if ((ev.target as HTMLElement).id === "monto") formatearMontoEnVivo();
    calcular();
  });
  el("formulario").addEventListener("submit", (ev) => ev.preventDefault());
  el("usar-dias").addEventListener("change", alternarModo);
  el("metodologia").addEventListener("change", calcular);

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
