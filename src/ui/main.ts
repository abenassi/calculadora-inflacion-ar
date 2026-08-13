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

import { adjust, mesActual, RangoError, sePuedeEvitarEstimar, tasaMensualDelRem } from "../engine/adjust.js";
import * as analytics from "./analytics.js";
import {
  abreviarPunto,
  aOrdinal,
  deOrdinal,
  esFecha,
  diasEntre,
  esFechaValida,
  esMesValido,
  mesDe,
  nombrarMes,
  nombrarPunto,
  primerDia,
} from "../engine/mes.js";
import type { Mes, Metodologia, Punto, Resultado, SerieIndice } from "../engine/types.js";
import { dibujar } from "./chart.js";
import { rotularFila } from "./etiquetas.js";
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
  // navegador no ofrezca fechas que el motor va a rechazar. El piso es el segundo
  // mes de la serie: prorratear un día necesita el mes anterior, y el primero no
  // lo tiene.
  for (const id of ["desde-dia", "hasta-dia"]) {
    const input = el<HTMLInputElement>(id);
    input.min = primerDia(deOrdinal(aOrdinal(primero) + 1));
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
      // Con fechas exactas el período casi nunca son meses redondos: del 15 de mayo
      // al 10 de agosto no pasaron 3 meses, pasaron 87 días. Decir "3 meses" es
      // falso y lo detecta cualquiera que mire el calendario.
      const largo = esFecha(r.desde) || esFecha(r.hasta)
        ? `pasaron ${diasEntre(r.desde, r.hasta)} días`
        : plural(mesesDelPeriodo, "pasó 1 mes", `pasaron ${mesesDelPeriodo} meses`);
      const contexto =
        `De ${nombrarPunto(r.desde)} a ${nombrarPunto(r.hasta)} ${largo}, y el INDEC ` +
        `todavía no publicó ${frasearMeses(mesesSinPublicar, "ni")}. `;
      // El resultado se muestra con "~" y antes esta frase decía que no había
      // ninguna estimación. Las dos cosas son ciertas y juntas se contradicen, así
      // que la aproximación tiene que quedar atribuida a su causa real.
      const cierre =
        "Son todos datos publicados por el INDEC; el ~ está porque el tramo que se usó " +
        "no es exactamente el tuyo.";

      // En modo por día las filas son fechas, no meses: enumerar sus meses
      // duplicaría el del extremo. Se nombra el tramo por sus puntas, que además
      // es lo que efectivamente se calculó.
      if (esFecha(r.desglose[0]!.punto)) {
        return (
          `${contexto}Así que usamos el tramo equivalente más reciente que sí está publicado: ` +
          `del ${nombrarPunto(r.desglose[0]!.punto)} al ${nombrarPunto(r.desglose.at(-1)!.punto)} ` +
          `(${diasEntre(r.desglose[0]!.punto, r.desglose.at(-1)!.punto)} días). ${cierre}`
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

      // Se puede pedir una metodología de estimación sobre un período que ya está
      // publicado entero: no queda nada que estimar y la frase salía con la lista de
      // meses vacía — "El INDEC todavía no publicó ," con la coma colgando.
      if (n === 0) {
        return "Todos los meses del cálculo son datos oficiales ya publicados por el INDEC.";
      }

      // Acá había una aclaración para el caso "elegiste no estimar ninguno y aun así
      // estás viendo filas estimadas". Ya no puede pasar: cuando el período obliga a
      // proyectar, esa opción queda deshabilitada en el selector y el desplegable pasa
      // solo a la metodología que se está usando. El motivo se explica al lado del
      // control, que es donde se toma la decisión, en vez de acá abajo.
      const faltan =
        `El INDEC todavía no publicó ${frasearMeses(mesesEstimados, "ni")}, así que ` +
        `${plural(n, "ese mes se estima", "esos meses se estiman")} `;

      if (base.fuente === "rem") {
        const { mesesDeLaSenda, mesesExtrapolados } = base;
        const rem = `REM del BCRA (encuesta de ${nombrarMes(base.mesEncuesta)})`;

        // La senda llega hasta unos seis meses; más allá no hay pronóstico mes a mes
        // y hay que repartir el número a doce meses. Esa parte es una cuenta
        // nuestra, no algo que los analistas hayan dicho, así que va nombrada aparte.
        if (mesesExtrapolados.length === 0) {
          return (
            `${faltan}con el ${rem}: los analistas pronosticaron un valor para cada uno de ` +
            `esos meses, y son los que ves en la columna Subió.`
          );
        }
        if (mesesDeLaSenda.length === 0) {
          return (
            `${faltan}con el ${rem}. Su pronóstico mes a mes no llega tan lejos, así que se ` +
            `reparte pareja su expectativa a doce meses ` +
            `(${porcentaje(base.expectativaAnualPct, false)}), o sea ` +
            `${porcentaje(tasaMensualDelRem(base.expectativaAnualPct))} por mes.`
          );
        }
        return (
          `El INDEC todavía no publicó ${frasearMeses(mesesEstimados, "ni")}. Hasta ` +
          `${nombrarMes(mesesDeLaSenda.at(-1)!)} se usa el pronóstico mes a mes del ${rem}. ` +
          `De ahí en adelante el REM mensual ya no llega, así que ${frasearMeses(mesesExtrapolados)} ` +
          `${plural(mesesExtrapolados.length, "sale", "salen")} de repartir pareja su expectativa ` +
          `a doce meses (${porcentaje(base.expectativaAnualPct, false)}), o sea ` +
          `${porcentaje(tasaMensualDelRem(base.expectativaAnualPct))} por mes.`
        );
      }

      return (
        `${faltan}repitiendo la última inflación publicada, la de ` +
        `${nombrarMes(base.mes)} (${porcentaje(tasaMensualPct ?? 0)}).`
      );
    }
  }
}

/** El párrafo completo de la tarjeta: el resultado más su justificación. */
function explicar(r: Resultado): string {
  return `${resumir(r)} ${explicarMetodo(r)}`;
}

/**
 * Las filas de las puntas, en modo por día, son días sueltos: llevan la parte
 * proporcional de la inflación de su mes, no un número que el INDEC haya publicado.
 * Mezcladas con meses completos en la misma columna, hay que decirlo.
 */
function aclararParciales(r: Resultado): string {
  const parciales = r.desglose.filter((f) => f.esParcial).length;
  if (parciales === 0) return "";
  return (
    ` ${plural(parciales, "La fila marcada como prorrateada no es un mes entero", "Las filas marcadas como prorrateadas no son meses enteros")}: ` +
    `${plural(parciales, "es un tramo", "son tramos")} de días sueltos, y ` +
    `${plural(parciales, "le toca", "les toca")} la parte proporcional de la inflación de su mes.`
  );
}

/**
 * Si en la tabla hay algún dato oficial que la persona pueda señalar con el dedo.
 *
 * Mira **todas** las filas, incluida la de partida: con un origen ya publicado, esa fila
 * lleva su sello del INDEC impreso, así que decir "acá no hay ningún dato oficial" la
 * contradice a dos centímetros. Y sale de una sola función porque el pie de la tabla y la
 * referencia del gráfico afirman lo mismo y se leen juntos: dos copias del predicado es
 * exactamente cómo terminan diciendo cosas distintas (regla 4).
 */
function hayDatoOficial(r: Resultado): boolean {
  return r.desglose.some((f) => !f.esProyeccion);
}

/** Si algo de lo que se muestra es efectivamente una estimación. */
function hayAlgoEstimado(r: Resultado): boolean {
  return r.desglose.some((f) => f.esProyeccion);
}

/**
 * Si el resultado se muestra con `~`.
 *
 * Con `ventana_reciente` el `~` no es por estimar —son todos datos publicados— sino
 * porque el tramo que se usó no es exactamente el pedido. Con `proyeccion` es por
 * estimar, y entonces depende de que haya algo estimado de verdad.
 */
function esAproximado(r: Resultado): boolean {
  return r.metodo.tipo === "ventana_reciente" || hayAlgoEstimado(r);
}

/** El pie de la tabla, que dice qué está mirando el lector. */
function explicarTabla(r: Resultado): string {
  switch (r.metodo.tipo) {
    case "directo":
      return (
        "Todas las filas salen de datos oficiales publicados por el INDEC. Acá no hay nada estimado." +
        aclararParciales(r)
      );
    case "ventana_reciente":
      return (
        `Este es el tramo publicado más reciente del mismo largo que el que pediste. Lo usamos ` +
        `como referencia porque los últimos meses del tuyo todavía no salieron.` +
        aclararParciales(r)
      );
    case "proyeccion": {
      const { base, tasaMensualPct } = r.metodo;
      // Se cuentan los tramos, no las filas. La fila de partida también sale resaltada
      // —su índice está estimado— pero no muestra ningún porcentaje, así que llamarla
      // "tramo proyectado" daba un número que no coincidía con lo que se puede contar
      // en la tabla: decía 8 donde había 7 porcentajes.
      const tramos = r.desglose.slice(1);
      const proyectadas = tramos.filter((f) => f.esProyeccion).length;
      // Pedir una metodología de estimación no obliga a que haya algo estimado: si el
      // período pedido está enteramente publicado, no hay ningún tramo proyectado y el
      // pie decía "Los 0 porcentajes resaltados son tramos proyectados" sobre una tabla
      // con todas las filas selladas por el INDEC.
      if (proyectadas === 0) {
        return (
          "Todas las filas salen de datos oficiales publicados por el INDEC: el período " +
          "que pediste ya está publicado entero, así que no hubo nada que estimar." +
          aclararParciales(r)
        );
      }
      const de =
        base.fuente === "rem"
          ? `el REM del BCRA de ${nombrarMes(base.mesEncuesta)}`
          : `la inflación de ${nombrarMes(base.mes)}`;
      // Con la senda del REM cada mes tiene su propia tasa y está en su fila, así
      // que nombrar "una" tasa sería inventar un promedio que no se usó.
      const aQueTasa = tasaMensualPct === null ? "" : `, a ${porcentaje(tasaMensualPct)} por mes`;
      // "El resto son datos oficiales" prometía una parte oficial que muchas veces no
      // existe: cuando el destino todavía no llegó, la tabla entera está estimada y esa
      // frase mandaba a buscar un dato del INDEC que no se puede señalar en ningún lado.
      const cierre = hayDatoOficial(r)
        ? " El resto son datos oficiales."
        : " En esta tabla no hay ningún dato oficial: el INDEC todavía no publicó ninguno de estos meses.";
      return (
        `Estos son los meses que pediste. ${plural(proyectadas, "El porcentaje resaltado", `Los ${proyectadas} porcentajes resaltados`)} ` +
        `${plural(proyectadas, "es un tramo proyectado", "son tramos proyectados")}, que el INDEC ` +
        `todavía no publicó: ${plural(proyectadas, "se estimó", "se estimaron")} con ${de}` +
        `${aQueTasa}.${cierre}` + aclararParciales(r)
      );
    }
  }
}

function pintarResultado(r: Resultado): void {
  // Se anuncia estimación cuando hay algo estimado, no cuando se pidió una metodología
  // que estima. Elegir "repetir el último mes" sobre un período ya publicado entero no
  // estima nada, y el sitio igual ponía el cartel ≈ ESTIMADO y el ~ sobre una tabla con
  // todas las filas selladas por el INDEC.
  const esProyeccion = hayAlgoEstimado(r);

  el("chip-estimado").hidden = !esProyeccion;
  // Anunciar "estimado" en la leyenda cuando no hay ninguna fila estimada hace
  // dudar de un resultado que es enteramente oficial. Y al revés: anunciar "dato
  // oficial" cuando todas las barras están rayadas manda a buscar una barra oficial
  // que no está, que es peor todavía porque hace desconfiar de lo que sí es cierto.
  el("leyenda-estimado").hidden = !esProyeccion;
  el("leyenda-oficial").hidden = !hayDatoOficial(r);
  // Con `ventana_reciente` el eje del gráfico son los meses de referencia, no los
  // del período pedido: el título lo dice para que nadie lea mal las fechas.
  el("titulo-grafico").textContent =
    r.metodo.tipo === "ventana_reciente"
      ? "Inflación mensual de los meses de referencia"
      : "Inflación mensual";
  el("rotulo-principal").textContent = `A ${nombrarPunto(r.hasta)}`;
  el("cifra-principal").textContent = esAproximado(r)
    ? `~${pesosRedondo(r.montoAjustado)}`
    : pesosRedondo(r.montoAjustado);
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
    ...r.desglose.map((f, i) => {
      const tr = document.createElement("tr");
      if (f.esProyeccion) tr.className = "fila--estimada";

      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = rotularFila(r.desglose, i);
      tr.append(th);

      const celda = (texto: string, clase?: string) => {
        const td = document.createElement("td");
        td.textContent = texto;
        if (clase) td.className = clase;
        return td;
      };

      // Una fila parcial no lleva el sello del INDEC: su número es la parte
      // proporcional que le toca a esos días, o sea una cuenta nuestra sobre un
      // dato del INDEC. Poner "INDEC ✓" ahí sería atribuirle una cifra que nunca
      // publicó. `estimado` gana sobre `prorrateado` porque es la advertencia que
      // más importa.
      const tdOrigen = document.createElement("td");
      const marca = document.createElement("span");
      const clase = f.esProyeccion ? "proyeccion" : f.esParcial ? "prorrateado" : f.origen;
      marca.className = `origen origen--${clase}`;
      marca.textContent = f.esProyeccion
        ? "estimado"
        : f.esParcial
          ? "prorrateado"
          : f.origen === "indec"
            ? "INDEC ✓"
            : "BCRA ✓";
      if (f.esParcial && !f.esProyeccion) {
        marca.title = `Parte proporcional de la inflación de ${nombrarMes(mesDe(f.punto))}, según el INDEC.`;
      }
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

  // Vanina, en el review: "esa tabla yo no se la puedo mostrar al cliente, lo
  // primero que me dice es '¿qué febrero? yo vine en mayo'". El título es lo
  // primero que se lee y lo único que puede anticipar la sorpresa.
  el("titulo-tabla").textContent =
    r.metodo.tipo === "ventana_reciente"
      ? "El cálculo, paso a paso (sobre el tramo de referencia)"
      : "El cálculo, paso a paso";
  el("pie-tabla").textContent = explicarTabla(r);
  // Con una sola variación no hay nada que sumar mal.
  el("nota-compuesto").hidden = r.desglose.length < 3;
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
  const estimado = hayAlgoEstimado(r);

  // En pantalla el cartel de ESTIMADO está pegado al número grande y se ve de lejos.
  // Pegado en un mensaje eso desaparece: quedaba arrancando con el monto y con "(IPC
  // del INDEC)" al lado de un porcentaje que el INDEC no publicó, y quien lo recibe
  // lee el primer renglón y nada más. El aviso va antes del número, no después.
  const lineas: string[] =
    estimado && r.metodo.tipo === "proyeccion"
      ? [
          `OJO: esto es una estimación, no un dato publicado. El INDEC todavía no publicó ` +
            `${frasearMeses(r.metodo.mesesEstimados, "ni")}.`,
          "",
        ]
      : [];

  lineas.push(
    `${pesos(r.monto)} de ${nombrarPunto(r.desde)} equivalen a ` +
      `${esAproximado(r) ? "unos " : ""}${pesosRedondo(r.montoAjustado)} ` +
      `en ${nombrarPunto(r.hasta)}.`,
    estimado
      ? `Inflación acumulada estimada: ${porcentaje(r.variacionPct)}.`
      : `Inflación acumulada: ${porcentaje(r.variacionPct)} (IPC del INDEC).`,
    "",
    r.metodo.tipo === "ventana_reciente" ? "Meses usados:" : "Mes a mes:",
  );

  for (const f of r.desglose.slice(1)) {
    const etiqueta = f.origen === "proyeccion" ? "estimado" : "oficial INDEC";
    lineas.push(`- ${abreviarPunto(f.punto)}: ${porcentaje(f.varMensualPct ?? 0)} (${etiqueta})`);
  }

  lineas.push("", explicarMetodo(r));
  lineas.push("", `Fuente: IPC Nivel General Nacional, INDEC. Calculado en ${location.href}`);
  return lineas.join("\n");
}

/**
 * El cálculo se recomputa en cada tecla del monto, así que el evento se emite recién cuando la
 * consulta se asienta. Sin esto, escribir "520000" emitiría seis eventos y la mediana de montos
 * mediría lo que la gente tipea a mitad de camino ($5, $52, $520…) en vez de lo que quiso
 * consultar. Los 1200 ms son cómodos para tipear un monto sin cortar en el medio.
 */
let temporizadorEvento: number | undefined;
let ultimoEventoEmitido = "";

function anotarCalculo(r: Resultado): void {
  clearTimeout(temporizadorEvento);
  temporizadorEvento = setTimeout(() => {
    // Además del debounce, no repetir una consulta idéntica: volver a la metodología anterior o
    // repintar no son consultas nuevas y contarlas infla los totales.
    const firma = `${r.monto}|${r.desde}|${r.hasta}|${r.metodologia}`;
    if (firma === ultimoEventoEmitido) return;
    ultimoEventoEmitido = firma;
    analytics.calculo(r);
  }, 1200) as unknown as number;
}

/**
 * Recuerda si "no estimar ninguno" lo sacamos NOSOTROS o lo cambió el usuario.
 *
 * Es la diferencia entre devolverle su elección y pisársela. Si el período obliga a
 * estimar movemos el selector solos; cuando esa restricción se va, hay que volver al
 * default — pero sólo si el que se movió fui yo. Alguien que eligió el REM a mano espera
 * seguir en el REM al cambiar una fecha.
 */
let metodologiaCambiadaPorNosotros = false;

/**
 * Deshabilita "no estimar ninguno" cuando el período no admite esa respuesta.
 *
 * Pasa siempre que el destino es un mes posterior al actual: no existe ningún tramo ya
 * publicado que sirva de referencia, así que las tres metodologías proyectan. Dejar la
 * opción elegible sería ofrecer algo que no se puede cumplir, y el resultado terminaba
 * mostrando una tabla llena de filas estimadas con el desplegable diciendo lo contrario.
 */
function sincronizarOpcionesDeMetodologia(desde: Punto, hasta: Punto): void {
  const select = el<HTMLSelectElement>("metodologia");
  const opcion = select.querySelector<HTMLOptionElement>('option[value="sin_proyectar"]');
  if (!opcion) return;

  const sePuede = sePuedeEvitarEstimar(desde, hasta, serie);
  opcion.disabled = !sePuede;
  // Dejarle el "(recomendado)" a la opción gris es recomendar justo la única que no se
  // puede elegir. La etiqueta tiene que decir por qué está gris, que es lo que la
  // persona va a buscar apenas la vea.
  opcion.textContent = sePuede
    ? "no estimar ninguno (recomendado)"
    : "no estimar ninguno (no disponible para este período)";
  el("nota-metodologia").hidden = sePuede;

  if (!sePuede && select.value === "sin_proyectar") {
    select.value = "repite_ultimo";
    metodologiaCambiadaPorNosotros = true;
  } else if (sePuede && metodologiaCambiadaPorNosotros) {
    select.value = "sin_proyectar";
    metodologiaCambiadaPorNosotros = false;
  }
}

function calcular(): void {
  const error = el("error");
  try {
    const monto = leerMonto();
    if (!Number.isFinite(monto)) throw new RangoError("Escribí un monto para calcular.");
    if (monto <= 0) throw new RangoError("El monto tiene que ser mayor que cero.");

    const desde = leerPunto("desde");
    const hasta = leerPunto("hasta");

    // Antes de calcular, no después: si el período obliga a estimar, el selector tiene que
    // quedar en la metodología que se va a usar de verdad. Al revés se pinta un resultado
    // proyectado con el desplegable diciendo "no estimar ninguno".
    sincronizarOpcionesDeMetodologia(desde, hasta);

    const metodologia = leerMetodologia();
    const r = adjust(monto, desde, hasta, serie, { metodologia });
    ultimoResultado = r;
    error.hidden = true;
    el("bloque-principal").hidden = false;
    pintarResultado(r);
    sincronizarUrl(monto, r.desde, r.hasta, metodologia);
    anotarCalculo(r);
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
      ["# tasa_mensual_aplicada_pct", r.metodo.tasaMensualPct?.toFixed(4) ?? "varía por mes"],
      ["# meses_estimados", r.metodo.mesesEstimados.join(" ")],
      base.fuente === "rem"
        ? [
            "# rem_encuesta",
            `${base.mesEncuesta} · senda: ${base.mesesDeLaSenda.join(" ") || "—"} · ` +
              `extrapolados a ${base.expectativaAnualPct}% anual: ${base.mesesExtrapolados.join(" ") || "—"}`,
          ]
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
  el("usar-dias").addEventListener("change", () => {
    alternarModo();
    analytics.cambioModo(el<HTMLInputElement>("usar-dias").checked ? "fecha" : "mes");
  });
  el("metodologia").addEventListener("change", () => {
    calcular();
    analytics.cambioMetodologia(leerMetodologia());
  });

  el<HTMLButtonElement>("copiar").addEventListener("click", (ev) => {
    analytics.evento("compartir");
    copiar(ev.currentTarget as HTMLButtonElement, location.href, "Copiá de la barra ↑");
  });
  el<HTMLButtonElement>("copiar-explicacion").addEventListener("click", (ev) => {
    if (!ultimoResultado) return;
    analytics.evento("copiar");
    copiar(
      ev.currentTarget as HTMLButtonElement,
      armarExplicacion(ultimoResultado),
      "No se pudo copiar",
    );
  });
  el("csv").addEventListener("click", descargarCsv);

  analytics.pageview();
  analytics.engancharClics();

  calcular();
}

iniciar().catch((e: unknown) => {
  const error = el("error");
  error.textContent = `No se pudieron cargar los datos: ${(e as Error).message}`;
  error.hidden = false;
});
