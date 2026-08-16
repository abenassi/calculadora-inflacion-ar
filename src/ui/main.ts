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

import {
  adjust,
  hoyFecha,
  mesActual,
  RangoError,
  motivoParaEstimar,
  sumaDeVariaciones,
} from "../engine/adjust.js";
import * as analytics from "./analytics.js";
import {
  aOrdinal,
  compararMeses,
  comoDestino,
  compararPuntos,
  conPreposicion,
  deOrdinal,
  esFecha,
  esFechaValida,
  esMesValido,
  mesDe,
  nombrarMes,
  primerDia,
  restarMesesAFecha,
  sumarMeses,
} from "../engine/mes.js";
import type { Fila, Mes, Metodologia, Punto, Resultado, SerieIndice } from "../engine/types.js";
import {
  agruparParaSelector,
  buscarIndice,
  MESES_DE_ATRASO_TOLERADOS,
  rangoPedible,
  SLUG_NACIONAL,
  type CatalogoIndices,
  type EntradaCatalogo,
} from "../engine/indices.js";
import { dibujar } from "./chart.js";
import {
  fuenteDe,
  fuenteDeLaSerie,
  organismoDeFila,
  quienPublicaAhora,
  rotularFila,
  selloDeFila,
} from "./etiquetas.js";
import {
  avisarTramoAjeno,
  capitalizar,
  esAproximado,
  explicar,
  explicarCompuesto,
  explicarMetodo,
  explicarTabla,
  frasearMeses,
  fuenteDelTexto,
  hayAlgoEstimado,
  hayBarraOficial,
  MESES_PROYECCION_LARGA,
} from "./explicaciones.js";
import { fechaLarga, indice, pesos, pesosRedondo, porcentaje, seVenDistintos } from "./format.js";

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
let catalogo: CatalogoIndices;
let indiceActivo: EntradaCatalogo;
let ultimoResultado: Resultado | null = null;

/**
 * Las series ya bajadas.
 *
 * El índice se baja recién cuando alguien lo elige, y una vez elegido no se vuelve a
 * pedir: comparar dos provincias es ir y venir del desplegable, y sin esto cada ida y
 * vuelta serían cien kilobytes de red.
 */
const seriesCargadas = new Map<string, SerieIndice>();

/**
 * La frase del subtítulo tal como viene en el HTML.
 *
 * Se guarda para poder **volver** a ella: pintarla sólo cuando el índice no es el nacional
 * dejaba la bajada de Córdoba puesta al volver al nacional, que es la mitad que se olvida
 * de todo texto que se pisa.
 */
let bajadaOriginal = "";

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

/**
 * El primer mes que se puede pedir de verdad.
 *
 * En modo por mes es el primero de la serie: el índice de nivel alcanza. En modo por
 * día es uno después: prorratear un día del primer mes necesita el índice del mes
 * anterior, que no existe. Sale de una sola función porque `poblarSelects` (el mínimo
 * del calendario) y los atajos de fecha (`sincronizarAtajos`) tienen que estar de
 * acuerdo en el mismo piso — que quedaran separados es justo cómo un atajo podía
 * quedar habilitado un mes antes de donde el calendario ya no dejaba entrar, y tirar
 * el `RangoError` del motor en vez de aparecer gris.
 */
function primerMesPedible(dias: boolean): Mes {
  const { primero } = rangoPedible(serie);
  return dias ? sumarMeses(primero, 1) : primero;
}

function poblarSelects(): void {
  const { primero, ultimo } = rangoPedible(serie);

  const opcion = (valor: string, texto: string) => {
    const o = document.createElement("option");
    o.value = valor;
    o.textContent = texto;
    return o;
  };

  for (const id of ["desde-mes", "hasta-mes"]) {
    el<HTMLSelectElement>(id).replaceChildren(
      ...NOMBRES_MES.map((n, i) => opcion(String(i + 1).padStart(2, "0"), n)),
    );
  }

  const anioMin = Number(primero.slice(0, 4));
  const anioMax = Number(ultimo.slice(0, 4));
  const anios = Array.from({ length: anioMax - anioMin + 1 }, (_, i) => anioMin + i);
  for (const id of ["desde-anio", "hasta-anio"]) {
    el<HTMLSelectElement>(id).replaceChildren(...anios.map((a) => opcion(String(a), String(a))));
  }

  // Los input[type=date] se acotan al mismo rango, para que el calendario del
  // navegador no ofrezca fechas que el motor va a rechazar.
  for (const id of ["desde-dia", "hasta-dia"]) {
    const input = el<HTMLInputElement>(id);
    input.min = primerDia(primerMesPedible(true));
    input.max = `${ultimo}-28`;
  }
}

/**
 * Apaga los meses que el año elegido no puede ofrecer.
 *
 * Sólo el índice nacional arranca un 1° de enero; los otros quince arrancan en marzo, en
 * agosto, en diciembre. Con Santa Fe elegida —mide desde diciembre de 2013— el desplegable
 * ofrecía enero de 2013 y el motor contestaba "No hay datos anteriores a diciembre 2013",
 * escondiendo el resultado. Es la regla 3 en el control que más se usa: no se ofrece lo que
 * no se puede cumplir.
 *
 * Corre después de cada cambio de año y después de cada cambio de índice, y si el mes que
 * estaba elegido queda apagado, se corre al más cercano que sí se puede.
 */
function acotarMesesDelAnio(prefijo: "desde" | "hasta"): void {
  const { primero, ultimo } = rangoPedible(serie);
  const anio = el<HTMLSelectElement>(`${prefijo}-anio`).value;
  const selectMes = el<HTMLSelectElement>(`${prefijo}-mes`);

  const minimo = anio === primero.slice(0, 4) ? primero.slice(5, 7) : "01";
  const maximo = anio === ultimo.slice(0, 4) ? ultimo.slice(5, 7) : "12";

  for (const opcion of selectMes.options) {
    opcion.disabled = opcion.value < minimo || opcion.value > maximo;
  }
  if (selectMes.value < minimo) selectMes.value = minimo;
  if (selectMes.value > maximo) selectMes.value = maximo;
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
  el<HTMLButtonElement>("atajo-ahora").textContent = dias ? "hoy" : "ahora";
  calcular();
}

/* -------------------------------------------------------------------- atajos */

/**
 * El origen que resulta de restarle `meses` al destino ya cargado.
 *
 * Se ancla al destino elegido, no a hoy: si se ancla a hoy, un "12m" sobre un
 * destino puesto a mano en el pasado (por ejemplo mayo 2024) daría un origen
 * posterior al destino y el período quedaría invertido. Anclado al destino,
 * "12m" siempre significa "un período de 12 meses", sea cual sea el destino.
 */
function origenDelAtajo(hasta: Punto, meses: number): Punto {
  return esFecha(hasta) ? restarMesesAFecha(hasta, meses) : sumarMeses(hasta, -meses);
}

function fueraDelRangoPedible(mes: Mes, dias: boolean): boolean {
  const { ultimo } = rangoPedible(serie);
  return compararMeses(mes, primerMesPedible(dias)) < 0 || compararMeses(mes, ultimo) > 0;
}

/**
 * Habilita, deshabilita y marca los botones de atajo según el período cargado.
 *
 * Un atajo que caería antes de donde arranca la serie —típico de los índices
 * provinciales, más cortos que el nacional— se deshabilita en vez de calcular
 * mal: es la regla 3 en el control que se agregó ahora. El chip que reproduce
 * el valor ya cargado queda marcado, así que al entrar (destino = mes actual,
 * origen = 3 meses antes) ya se ve "ahora" y "3m" prendidos, sin que haga
 * falta tocar nada.
 *
 * "ahora" también se deshabilita si dejaría el destino antes del origen ya
 * cargado. Los chips de origen se anclan al destino para no invertir el
 * período (ver `origenDelAtajo`), pero "ahora" mueve el destino y no tiene
 * a qué anclarse: sin este chequeo, con un origen puesto a mano en el futuro
 * (por ejemplo un contrato que arranca en octubre, hoy agosto), "ahora"
 * dejaba el período invertido y el sitio lo calculaba igual —matemáticamente
 * válido, pero sin decir que el período había quedado dado vuelta—. La
 * comparación usa `compararPuntos`, la misma función de la que salen
 * `extremoNuevo`/`extremoViejo` en `adjust.ts` para decidir qué punta es la más
 * nueva: dos lugares de acuerdo sobre el mismo criterio, no dos criterios.
 *
 * El `title` en el atajo deshabilitado dice por qué: un control gris sin
 * explicación manda a buscar la razón en otro lado, y la mayoría no la busca.
 */
function sincronizarAtajos(desde: Punto, hasta: Punto): void {
  const dias = usaDias();
  const objetivoAhora = dias ? hoyFecha() : mesActual();
  const botonAhora = el<HTMLButtonElement>("atajo-ahora");
  const ahoraFueraDeRango = fueraDelRangoPedible(mesDe(objetivoAhora), dias);
  const ahoraInvertiria = !ahoraFueraDeRango && compararPuntos(objetivoAhora, desde) < 0;
  botonAhora.disabled = ahoraFueraDeRango || ahoraInvertiria;
  botonAhora.title = ahoraFueraDeRango
    ? `No hay datos disponibles todavía para ${dias ? "hoy" : "el mes actual"}.`
    : ahoraInvertiria
      ? `El origen que ya elegiste es posterior a ${dias ? "hoy" : "este mes"}.`
      : "";
  botonAhora.setAttribute("aria-pressed", String(!botonAhora.disabled && hasta === objetivoAhora));

  for (const boton of document.querySelectorAll<HTMLButtonElement>("[data-atajo-desde]")) {
    const meses = Number(boton.dataset.atajoDesde);
    const objetivo = origenDelAtajo(hasta, meses);
    boton.disabled = fueraDelRangoPedible(mesDe(objetivo), dias);
    boton.title = boton.disabled
      ? `No hay datos anteriores a ${nombrarMes(primerMesPedible(dias))}.`
      : "";
    boton.setAttribute("aria-pressed", String(!boton.disabled && desde === objetivo));
  }
}

function aplicarAtajoAhora(): void {
  escribirPunto("hasta", usaDias() ? hoyFecha() : mesActual());
  acotarMesesDelAnio("hasta");
  calcular();
  analytics.cambioPreset(usaDias() ? "hoy" : "ahora");
}

function aplicarAtajoDesde(meses: number): void {
  escribirPunto("desde", origenDelAtajo(leerPunto("hasta"), meses));
  acotarMesesDelAnio("desde");
  calcular();
  analytics.cambioPreset(`${meses}m`);
}

/* ------------------------------------------------------------------ resultado */

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
  // La referencia de prorrateado aparece sólo si hay alguna barra así, por lo mismo que la
  // de dato oficial: una referencia sin nada a lo que apuntar hace dudar de las otras.
  el("leyenda-prorrateado").hidden = !r.desglose
    .slice(1)
    .some((f) => f.esParcial && !f.esProyeccion);
  // La leyenda habla de las BARRAS, y el gráfico no dibuja la fila de partida.
  el("leyenda-oficial").hidden = !hayBarraOficial(r);
  // Con `ventana_reciente` el eje del gráfico son los meses de referencia, no los
  // del período pedido: el título lo dice para que nadie lea mal las fechas.
  //
  // Y no dice "mensual" cuando las barras no son meses. Con la ventana anclada, el caso
  // normal por día es **una sola barra** rotulada "2 jul → 31 jul" que vale 29/31 de la
  // inflación de julio: titularla "Inflación mensual" invita a leer 1,98% como el mes de
  // julio, que fue 2,11%. El título sigue al eje, igual que "Tramos usados:" en el texto
  // que se copia.
  const porTramos = esFecha(r.desglose[0]!.punto);
  const queMide = porTramos ? "Inflación de cada tramo" : "Inflación mensual";
  el("titulo-grafico").textContent =
    r.metodo.tipo === "ventana_reciente" ? `${queMide}, sobre el tramo de referencia` : queMide;
  el("grafico").setAttribute(
    "aria-label",
    `${queMide} del IPC en ${porTramos ? "los tramos" : "los meses"} usados para el cálculo`,
  );
  el("rotulo-principal").textContent = capitalizar(comoDestino(r.hasta));
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

      // Una fila parcial no lleva sello: su número es la parte proporcional que le
      // toca a esos días, o sea una cuenta nuestra sobre un dato ajeno. Sellarla sería
      // atribuirle al organismo una cifra que nunca publicó. `estimado` gana sobre
      // `prorrateado` porque es la advertencia que más importa.
      const tdOrigen = document.createElement("td");
      const marca = document.createElement("span");
      const sello = selloDeFila(f, r);
      const clase = f.esProyeccion ? "proyeccion" : f.esParcial ? "prorrateado" : "publicado";
      marca.className = `origen origen--${clase}`;
      marca.textContent = f.esProyeccion ? "estimado" : f.esParcial ? "prorrateado" : `${sello} ✓`;
      if (f.esParcial && !f.esProyeccion) {
        // El organismo sale del origen de la propia fila: en el tramo reconstruido del
        // nacional el dato de fondo es del BCRA, y decir INDEC acá contradice el sello
        // de al lado.
        const organismo = organismoDeFila(f, r);
        marca.title =
          `Parte proporcional de la inflación de ${nombrarMes(mesDe(f.punto))}` +
          (organismo ? `, según ${organismo}.` : ".");
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
  const avisoDelTramo = avisarTramoAjeno(r);
  el("aviso-tabla").textContent = avisoDelTramo;
  el("aviso-tabla").hidden = avisoDelTramo === "";
  el("pie-tabla").textContent = explicarTabla(r);
  // Solo cuando los dos números que la nota contrapone se ven distintos. Con una sola
  // variación son el mismo número, y en tramos cortos caen en el mismo redondeo.
  el("nota-compuesto").hidden = !seVenDistintos(sumaDeVariaciones(r.desglose), r.variacionPct);
  el("nota-compuesto").textContent = explicarCompuesto(r);
  dibujar(el<HTMLCanvasElement>("grafico"), r);
}

/**
 * El título de la lista de porcentajes del texto que se copia.
 *
 * Con la ventana de referencia en modo por día las filas son tramos de días —"2 jul 2026
 * → 31 jul 2026", que es la inflación de julio prorrateada— y "Meses usados:" arriba de
 * eso invita a leer un mes entero donde hay 29 días.
 */
function encabezadoDelDesglose(r: Resultado): string {
  if (r.metodo.tipo !== "ventana_reciente") return "Mes a mes:";
  return esFecha(r.desglose[0]!.punto) ? "Tramos usados:" : "Meses usados:";
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
          // El sujeto va primero, como en `explicaciones.ts`: "El IPEC, el instituto de
          // estadística de Santa Fe todavía no publicó ni julio ni agosto de 2026." Al
          // sacar el "El INDEC" fijo el sujeto se corrió al final de la lista de meses y
          // quedó "Todavía no publicó los 24 meses que van de julio 2026 a junio 2028 el
          // IPEC…" — la única línea de este mensaje que se lee sin buscar el sujeto.
          `OJO: esto es una estimación, no un dato publicado. ` +
            `${capitalizar(quienPublicaAhora(r))} todavía no publicó ` +
            `${frasearMeses(r.metodo.mesesEstimados, "ni")}.`,
          "",
        ]
      : [];

  lineas.push(
    `${pesos(r.monto)} ${conPreposicion("de", r.desde)} equivalen a ` +
      `${esAproximado(r) ? "unos " : ""}${pesosRedondo(r.montoAjustado)} ` +
      `${comoDestino(r.hasta)}.`,
    estimado
      ? `Inflación acumulada estimada: ${porcentaje(r.variacionPct)}.`
      : `Inflación acumulada: ${porcentaje(r.variacionPct)} (${fuenteDe(r.desglose, r).corta}).`,
    "",
    encabezadoDelDesglose(r),
  );

  for (const [i, f] of r.desglose.entries()) {
    if (i === 0) continue;
    // La etiqueta de cada línea tiene que ser el mismo sello que la persona ve en la tabla.
    // Decía "oficial INDEC" en filas selladas "BCRA ✓", así que el texto que se manda por
    // mensaje contradecía a la pantalla que el destinatario podía abrir.
    const organismo = organismoDeFila(f, r);
    const etiqueta = f.esProyeccion
      ? "estimado"
      : f.esParcial
        ? `prorrateado sobre el dato de ${organismo}`
        : `oficial ${organismo}`;
    // El mismo rótulo que la tabla, no el punto final a secas. Un tramo del 2 de mayo al
    // 1 de junio salía acá como "1 jun 2026: +2,08%", que se lee como que junio subió
    // 2,08% cuando ese número es la parte de mayo —junio subió 1,89%—. Y este texto se
    // manda por mensaje: se lee sin la tabla al lado, que es donde el rango sí estaba.
    lineas.push(
      `- ${rotularFila(r.desglose, i)}: ${porcentaje(f.varMensualPct ?? 0)} (${etiqueta})`,
    );
  }

  lineas.push("", explicarMetodo(r));
  lineas.push("", `Fuente: ${fuenteDelTexto(r)}. Calculado en ${location.href}`);
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
    const firma = `${r.monto}|${r.desde}|${r.hasta}|${r.metodologia}|${indiceActivo.slug}`;
    if (firma === ultimoEventoEmitido) return;
    ultimoEventoEmitido = firma;
    analytics.calculo(r, indiceActivo.slug);
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
 * Por qué «no estimar ninguno» quedó gris, en las palabras de cada caso.
 *
 * Antes había un solo texto fijo en el HTML que hablaba del destino futuro. Cuando el guard
 * de la ventana sesgada empezó a deshabilitar la opción, ese texto pasó a explicar una
 * razón que no era: decía "el mes de destino todavía no llegó" sobre un pedido a junio,
 * estando en agosto. El motivo lo contesta el motor, en la misma evaluación que decide si
 * la opción se puede ofrecer.
 */
const MOTIVOS: Record<NonNullable<ReturnType<typeof motivoParaEstimar>>, string> = {
  futuro:
    "«No estimar ninguno» no está disponible para este período: el mes de destino todavía " +
    "no llegó, así que no existe ningún tramo ya publicado que sirva de referencia. " +
    "Cualquier respuesta va a ser una estimación.",
  ventana_no_cabe:
    "«No estimar ninguno» no está disponible para este período: para tomar como referencia " +
    "un tramo publicado del mismo largo habría que ir más atrás de donde arranca esta " +
    "serie. Cualquier respuesta va a ser una estimación.",
  // Sin la explicación del mecanismo. Estaba en el medio —"el tramo publicado que habría
  // que usar como referencia arrastra meses muy distintos de los que reemplaza"— y en el
  // review no dejó nada: "tramo", "referencia" y "reemplaza" no significan nada para quien
  // no conoce el método. Lo que sí sirvió es la consecuencia, que además es un motivo para
  // confiar más y no menos: se sacó la opción para no pasarte un número inflado.
  ventana_sesgada:
    "«No estimar ninguno» no está disponible para este período: este índice viene atrasado, " +
    "y esa opción daría un número bastante distinto de la inflación real del período. " +
    "Preferimos estimar y decirlo.",
};

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

  const motivo = motivoParaEstimar(desde, hasta, serie);
  const sePuede = motivo === null;
  opcion.disabled = !sePuede;
  // Dejarle el "(recomendado)" a la opción gris es recomendar justo la única que no se
  // puede elegir. La etiqueta tiene que decir por qué está gris, que es lo que la
  // persona va a buscar apenas la vea.
  opcion.textContent = sePuede
    ? "no estimar ninguno (recomendado)"
    : "no estimar ninguno (no disponible para este período)";
  el("nota-metodologia").hidden = sePuede;
  if (motivo !== null) el("nota-metodologia").textContent = MOTIVOS[motivo];

  if (!sePuede && select.value === "sin_proyectar") {
    select.value = "repite_ultimo";
    metodologiaCambiadaPorNosotros = true;
  } else if (sePuede && metodologiaCambiadaPorNosotros) {
    select.value = "sin_proyectar";
    metodologiaCambiadaPorNosotros = false;
  }
}


/* ---------------------------------------------------------------- el índice */

/**
 * Baja la serie de un índice, o la devuelve de la memoria si ya se pidió.
 *
 * El nacional viene en `ipc.json` como siempre; los otros quince viven en un archivo
 * cada uno y no se piden hasta que hacen falta. Quien no toca el selector —que es casi
 * todo el mundo— baja un kilobyte más que antes, el del catálogo, y nada más.
 */
async function cargarIndice(slug: string): Promise<SerieIndice> {
  const cacheada = seriesCargadas.get(slug);
  if (cacheada) return cacheada;

  const ruta =
    slug === SLUG_NACIONAL
      ? `${import.meta.env.BASE_URL}data/ipc.json`
      : `${import.meta.env.BASE_URL}data/indices/${slug}.json`;

  const respuesta = await fetch(ruta);
  // El mensaje es sólo la causa, sin "no se pudo cargar" adelante: el que llama sabe qué
  // índice pidió y arma la oración con el nombre. Envolviendo un texto ya envuelto salía
  // "No se pudo cargar ese índice (No se pudo cargar el índice (HTTP 404))".
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  const cargada = (await respuesta.json()) as SerieIndice;
  seriesCargadas.set(slug, cargada);
  return cargada;
}

function poblarSelectorDeIndices(): void {
  const { nacional, provincias, regiones } = agruparParaSelector(catalogo);

  // Con nodos y no con innerHTML: los nombres vienen del snapshot, y aunque hoy los
  // controle el repo, es la regla 9 y el resto del proyecto la cumple. Tener dos formas de
  // pintar el mismo dato en el mismo cambio es cómo se pierde la regla.
  const opcion = (i: EntradaCatalogo) => {
    const o = document.createElement("option");
    o.value = i.slug;
    o.textContent = i.enElSelector ?? i.nombre;
    return o;
  };
  const grupo = (etiqueta: string, items: EntradaCatalogo[]) => {
    const g = document.createElement("optgroup");
    g.label = etiqueta;
    g.append(...items.map(opcion));
    return g;
  };

  // Los dos grupos van rotulados por lo que son, y **nada más que por lo que son**. El
  // rótulo decía "Regiones del INDEC (para las provincias que no miden)", que es una
  // recomendación implícita, y el economista la midió: entre las ocho provincias que sí
  // miden y están dentro de una región, la región le acierta más que el nacional apenas
  // 3 de 8 veces. Río Negro dio +72,10% contra +98,72% de su propia Región Patagónica:
  // 26,6 puntos, $138.429 sobre $520.000. La región no sabe más de tu provincia que el
  // nacional, así que el sitio no puede sugerir que sí.
  el<HTMLSelectElement>("indice").replaceChildren(
    opcion(nacional),
    grupo("Provincias que miden su propia inflación", provincias),
    grupo("Regiones del INDEC", regiones),
  );
}

/**
 * La línea que dice qué mide el índice elegido, y si viene atrasado.
 *
 * Con el nacional no se muestra nada: la pantalla queda igual que antes de que el
 * selector existiera, que es la condición de que esto no le meta ruido a quien no lo
 * necesita.
 */
function pintarNotaDelIndice(corridos: PeriodoCorrido[] = []): void {
  // El atraso se calcula SIEMPRE, incluso para el nacional, y por eso se resuelve antes de
  // cualquier `return`. `#aviso-atraso` vive en la tarjeta del resultado y lo enciende
  // cualquier índice: con el early return del nacional adentro del medio, volver de
  // Neuquén al nacional dejaba "Ojo: Neuquén publicó hasta enero 2026, 5 meses detrás del
  // índice nacional" pegado abajo del número del INDEC, que está al día. Con el nacional
  // el atraso da cero y el nodo se apaga solo.
  const nacional = buscarIndice(catalogo, SLUG_NACIONAL);
  const atraso = aOrdinal(nacional.ultimoOficial) - aOrdinal(indiceActivo.ultimoOficial);
  const aviso = el("aviso-atraso");
  aviso.hidden = atraso <= MESES_DE_ATRASO_TOLERADOS;
  // Un índice provincial puede ir meses detrás del nacional —el de Neuquén viene atrasado
  // desde enero— y eso cambia de verdad sobre qué ventana se calcula. Un mes de diferencia
  // es lo normal y no se avisa: sería un cartel permanente que nadie lee.
  //
  // El aviso NO va arriba con el resto de la nota: va pegado al número. Iba atrás de la
  // descripción, mismo gris y mismo tamaño, y en el review se salteó entero —se leyó
  // recién cuando el número raro obligó a buscar la causa—. Un aviso que sólo encontrás
  // cuando ya sospechás no es un aviso.
  aviso.textContent = aviso.hidden
    ? ""
    : `Ojo: ${indiceActivo.nombre} publicó hasta ${nombrarMes(indiceActivo.ultimoOficial)}, ` +
      `${atraso} ${atraso === 1 ? "mes" : "meses"} detrás del índice nacional. El cálculo ` +
      `no puede llegar más allá de ese mes con datos publicados.`;

  const partes = fraseDeLosCorridos(corridos);

  // Lo que mide el índice se dice sólo cuando no es el nacional: con el de siempre la
  // pantalla queda igual que antes de que el selector existiera, que es la condición de
  // que esto no le meta ruido a quien no lo necesita.
  if (indiceActivo.slug !== SLUG_NACIONAL) {
    partes.push(`${indiceActivo.cubre} Lo publica ${fuenteDe([], serie).publicadosPor}.`);
  }

  const nota = el("nota-indice");
  nota.textContent = partes.join(" ");
  nota.hidden = partes.length === 0;
}

/**
 * Las oraciones de la nota que explican por qué se corrió el período, ya armadas.
 *
 * Cuando se corren las DOS puntas —desde antes del arranque, hasta más allá del
 * horizonte— dos oraciones de `fraseDelCorrido` seguidas quedan larguísimas y repiten "así
 * que se corrió el período" dos veces. En el celular esa nota sola empuja el cartel
 * ESTIMADO y el número fuera de la pantalla: Vanina la leyó, dijo "la segunda vez ya no la
 * leí, salteé hasta el número", y con las dos puntas corridas el número quedaba tapado del
 * todo. Ese caso puntual —desde antes del arranque, hasta después del horizonte— se dice
 * en una sola oración con las dos fechas adentro. Cualquier otra combinación de corridos
 * (rara: las dos puntas del mismo lado) sigue frase por frase.
 */
function fraseDeLosCorridos(corridos: PeriodoCorrido[]): string[] {
  const desde = corridos.find((c) => c.punta === "desde" && c.contra === "primero");
  const hasta = corridos.find((c) => c.punta === "hasta" && c.contra === "ultimo");
  if (corridos.length === 2 && desde && hasta) {
    const { primero, ultimo } = rangoPedible(serie);
    return [
      `${indiceActivo.nombre} tiene datos de ${nombrarMes(primero)} a ` +
        `${nombrarMes(indiceActivo.ultimoOficial)} y el cálculo no estima más allá de ` +
        `${nombrarMes(ultimo)}, así que se corrió el período: pediste ` +
        `${conPreposicion("de", desde.pedido)} ${conPreposicion("a", hasta.pedido)}.`,
    ];
  }
  return corridos.map(fraseDelCorrido);
}

/**
 * Por qué se corrió una punta del período, en una oración.
 *
 * La nota explicaba **siempre** el piso, porque cuando se escribió eso era lo único que se
 * acotaba. Al empezar a acotar también por arriba, un `?indice=neuquen&hasta=2029-05`
 * contestaba "la serie arranca en noviembre 2001, así que se corrió el período: pediste
 * desde mayo 2029": las dos mitades falsas. Es el mismo error que `motivoParaEstimar`
 * arregló en el motor —texto fijo para una condición que dejó de ser única— y se arregla
 * igual: el que acota dice contra qué extremo se topó y la frase sale de ahí.
 */
function fraseDelCorrido(c: PeriodoCorrido): string {
  const { primero, ultimo } = rangoPedible(serie);
  const punta = c.punta === "desde" ? "desde" : "hasta";
  return c.contra === "primero"
    ? // "mide desde" era falso: Mendoza mide desde 1968 y publicó de corrido de 1988 a
      // 2012; lo que arranca en 2016 es la serie que nosotros servimos, después del
      // recorte por el hueco. Lo mismo para Córdoba y Chaco, que encadenan desde 1968.
      `La serie de ${indiceActivo.nombre} que usamos arranca en ${nombrarMes(primero)}, ` +
        `así que se corrió el período: pediste ${conPreposicion(punta, c.pedido)}.`
    : `${indiceActivo.nombre} publicó hasta ${nombrarMes(indiceActivo.ultimoOficial)} y el ` +
        `cálculo no estima más allá de ${nombrarMes(ultimo)}, así que se corrió el ` +
        `período: pediste ${conPreposicion(punta, c.pedido)}.`;
}

/**
 * Los dos textos fijos que nombraban al INDEC de arranque.
 *
 * El rótulo de la metodología y la nota legal del pie describen el cálculo que está en
 * pantalla, así que tienen que seguir al índice elegido. Es la regla 2 bis: si cambia el
 * comportamiento, hay que barrer los textos que lo describen. Que quedara "meses que el
 * INDEC no publicó" arriba de una tabla sellada `DGEyC Córdoba ✓` es exactamente el modo
 * de falla más repetido de este repo.
 */
function pintarTextosDeLaFuente(): void {
  const fuente = fuenteDe([], serie);
  el("rotulo-metodologia").textContent =
    `Meses que ${fuente.publicadosPor} todavía no publicó:`;
  // La bajada del encabezado también: quien eligió Tucumán no puede seguir leyendo arriba
  // de todo que el sitio calcula "según el IPC del INDEC".
  //
  // Con el nacional NO se toca. La frase del HTML dice "según el IPC del INDEC", que es
  // corta y verdadera; reemplazarla por la etiqueta larga metía el empalme con el BCRA en
  // el subtítulo del h1 sin que nadie lo hubiera pedido. El criterio de todo este cambio
  // es que con el índice de siempre la pantalla quede igual que antes.
  el("bajada-fuente").textContent =
    indiceActivo.slug === SLUG_NACIONAL
      ? bajadaOriginal
      : `Cuánto vale un monto de otra fecha, según ${fuenteDeLaSerie(serie).larga}.`;
  // La nota legal habla del índice y no del período que está en pantalla, así que para el
  // nacional tiene que seguir nombrando al BCRA aunque el cálculo elegido sea de 2024.
  el("nota-legal").textContent =
    `Cálculo orientativo basado en ${fuenteDeLaSerie(serie).larga}. No constituye ` +
    `asesoramiento contable, financiero ni legal.`;
}

/**
 * Cambia el índice con el que se calcula.
 *
 * Los años del desplegable se repueblan porque cada índice arranca donde arranca —Santa
 * Fe mide desde diciembre de 2013 y Chaco desde 1988— y un control no puede ofrecer un
 * año que el motor va a rechazar. Si el período que había cargado queda afuera, `calcular`
 * lo dice nombrando el mes en vez de recalcular otra cosa en silencio.
 */
async function cambiarIndice(slug: string): Promise<void> {
  const entrada = buscarIndice(catalogo, slug);
  const cargada = await cargarIndice(entrada.slug);
  indiceActivo = entrada;
  serie = cargada;

  // Los desplegables se rearman con el rango del índice nuevo, y `innerHTML` se lleva
  // puesta la selección: hay que leer el período ANTES y volver a escribirlo después.
  const antes = { desde: leerPuntoLaxo("desde"), hasta: leerPuntoLaxo("hasta") };
  poblarSelects();
  const corrido = escribirPeriodoAcotado(antes);

  el("actualizado").textContent = fechaLarga(serie.actualizado);
  pintarNotaDelIndice(corrido);
  pintarTextosDeLaFuente();
  sincronizarOpcionRem();
  calcular();
}

/** El punto que hay en el formulario, sin validar: sólo para conservarlo al cambiar de índice. */
function leerPuntoLaxo(prefijo: "desde" | "hasta"): Punto {
  if (usaDias()) return el<HTMLInputElement>(`${prefijo}-dia`).value;
  const mes = el<HTMLSelectElement>(`${prefijo}-mes`).value;
  const anio = el<HTMLSelectElement>(`${prefijo}-anio`).value;
  return `${anio}-${mes}`;
}

/** Una punta del período que no entraba en el índice elegido, y contra qué extremo se topó. */
type PeriodoCorrido = {
  punta: "desde" | "hasta";
  /** El punto que se había pedido. La nota lo nombra: correrlo en silencio sería cambiarle
   * la pregunta a la persona sin decírselo. */
  pedido: Punto;
  contra: "primero" | "ultimo";
};

/**
 * Devuelve el período al formulario, corriendo las puntas que el índice nuevo no alcanza.
 *
 * Devuelve cuáles se corrieron —y contra qué extremo— para que la nota lo diga. La
 * alternativa —dejar el desplegable en un año que ya no existe— es peor: el control
 * quedaría ofreciendo algo que el motor rechaza, que es justo lo que la regla 3 prohíbe.
 */
function escribirPeriodoAcotado(periodo: { desde: Punto; hasta: Punto }): PeriodoCorrido[] {
  const { primero, ultimo } = rangoPedible(serie);
  const corridos: PeriodoCorrido[] = [];

  for (const [prefijo, punto] of [
    ["desde", periodo.desde],
    ["hasta", periodo.hasta],
  ] as const) {
    // Se acota por las DOS puntas contra el mismo rango que puebla los desplegables. Antes
    // sólo se miraba el piso, y un índice que se atrasara hasta cruzar un año dejaba el
    // año elegido sin `option`: el `value` quedaba vacío y el sitio contestaba
    // `Mes inválido: "-05"`. Hoy no se dispara porque los dieciséis caen en el mismo año
    // tope, pero Neuquén ya lleva cinco meses de atraso y son doce los que hacen falta.
    const mes = mesDe(punto);
    const fuera =
      aOrdinal(mes) < aOrdinal(primero)
        ? primero
        : aOrdinal(mes) > aOrdinal(ultimo)
          ? ultimo
          : null;

    if (fuera === null) {
      escribirPunto(prefijo, punto);
    } else {
      corridos.push({
        punta: prefijo,
        pedido: punto,
        contra: fuera === primero ? "primero" : "ultimo",
      });
      escribirPunto(prefijo, usaDias() ? primerDia(fuera) : fuera);
    }
    acotarMesesDelAnio(prefijo);
  }
  return corridos;
}

/**
 * El REM sólo existe para el índice nacional.
 *
 * El Relevamiento de Expectativas de Mercado del BCRA pronostica el IPC nacional del
 * INDEC. No hay un REM provincial, y repartir el nacional entre las provincias sería
 * inventar un número y ponerlo al lado de otros que sí publicó alguien. Se deshabilita
 * en vez de esconderse: una opción que desaparece se lee como un bug, y ésta tiene una
 * razón que se puede escribir en una línea.
 */
function sincronizarOpcionRem(): void {
  const opcion = document.getElementById("opcion-rem") as HTMLOptionElement | null;
  if (!opcion) return;

  // El motivo sale de por qué está gris, no de una suposición. La condición es "esta serie
  // no trae REM", y eso pasa por dos razones distintas: el índice no es el nacional, o el
  // pipeline no pudo bajar el REM ese día. Un control gris que dice "sólo para el índice
  // nacional" estando en el nacional es peor que uno sin explicación.
  const hayRem = Boolean(serie.rem);
  opcion.disabled = !hayRem;
  opcion.textContent = hayRem
    ? "estimarlos con el REM del BCRA"
    : indiceActivo.slug === SLUG_NACIONAL
      ? "estimarlos con el REM del BCRA (no disponible en esta actualización)"
      : "estimarlos con el REM del BCRA (sólo para el índice nacional)";

  // Si estaba elegida y el índice nuevo no la soporta, el desplegable tiene que quedar en
  // la que se va a usar de verdad. Dejarlo mostrando una opción deshabilitada pintaría un
  // resultado que no se corresponde con lo que dice el control.
  if (!hayRem && leerMetodologia() === "rem") {
    el<HTMLSelectElement>("metodologia").value = "sin_proyectar";
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
    sincronizarAtajos(desde, hasta);

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
  // de cero. El índice sigue la misma regla, y por eso el link del caso común es
  // exactamente el que era antes de que el selector existiera.
  if (metodologia !== "sin_proyectar") p.set("metodo", metodologia);
  if (indiceActivo.slug !== SLUG_NACIONAL) p.set("indice", indiceActivo.slug);
  history.replaceState(null, "", `?${p}`);
}

function leerUrl(): PeriodoCorrido[] {
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

  // Se pasan por el mismo acotado que usa el cambio de índice, y no por `escribirPunto`
  // directo: un link con `?indice=santa-fe&desde=1995-01` pide un año que ese índice no
  // tiene, y asignarle al desplegable un año que no está entre sus opciones lo deja en
  // blanco sin error. El síntoma era "Mes inválido: -01" al abrir el link.
  return escribirPeriodoAcotado({
    desde: valido(desde) ? desde : leerPuntoLaxo("desde"),
    hasta: valido(hasta) ? hasta : leerPuntoLaxo("hasta"),
  });
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

  // Tabla pura: sólo cabecera de columnas y una fila por dato, sin filas de
  // metadata (`# ...`). Algunos programas que abren CSV no las entienden, y
  // arruinan la primera impresión de alguien que sólo quería ver los números.
  // La trazabilidad de cada fila —oficial, prorrateada o estimada— vive en `origen`;
  // el resto del contexto —fuente, período, método— se explica en la página,
  // no en el archivo.
  // El mismo criterio que el sello de la tabla. Una fila prorrateada salía con `indec` en
  // esta columna mientras la pantalla la marcaba "prorrateado": el archivo se abre lejos
  // del sitio, así que ahí es donde una atribución de más cuesta caro. `origen` sigue
  // diciendo de quién es el dato de fondo, porque el prorrateo se hace sobre un dato suyo.
  const origenCsv = (f: Fila) => (f.esParcial && !f.esProyeccion ? `${f.origen}-prorrateado` : f.origen);

  // `punto_inicial` es dónde arranca el tramo que mide `variacion_pct`. Sin él, la fila
  // `2026-06-01, 2.08` se lee como "junio subió 2,08%" —el INDEC publicó 2,15% para mayo y
  // nunca publicó 2,08%—, que es el mismo error que la tabla arregló rotulando el rango.
  // Vacía en la fila de partida, que no mide ningún tramo.
  const filas: string[][] = [
    ["punto", "punto_inicial", "indice_ipc", "variacion_pct", "acumulado_pct", "monto", "origen"],
    ...r.desglose.map((f, i) => [
      f.punto,
      i === 0 ? "" : r.desglose[i - 1]!.punto,
      f.indice.toFixed(4),
      f.varMensualPct?.toFixed(2) ?? "",
      f.acumuladoPct?.toFixed(2) ?? "",
      f.monto.toFixed(2),
      origenCsv(f),
    ]),
  ];

  const csv = filas.map((f) => f.join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  // El nombre del archivo lleva el índice: quien compara dos provincias termina con dos
  // CSV en la carpeta de descargas y sin esto los dos se llaman igual.
  const sufijo = indiceActivo.slug === SLUG_NACIONAL ? "" : `-${indiceActivo.slug}`;
  a.download = `inflacion${sufijo}-${r.desde}-a-${r.hasta}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ----------------------------------------------------------------------- init */

async function iniciar(): Promise<void> {
  const respuestaCatalogo = await fetch(`${import.meta.env.BASE_URL}data/indices.json`);
  if (!respuestaCatalogo.ok) {
    throw new Error(`No se pudo cargar el catálogo (HTTP ${respuestaCatalogo.status})`);
  }
  catalogo = (await respuestaCatalogo.json()) as CatalogoIndices;

  // El índice sale de la URL o es el nacional. **No se recuerda entre visitas**, igual
  // que la metodología: quien entra de cero ve el nacional aunque la vez pasada haya
  // mirado Tucumán. Un `?indice=` que no existe cae al nacional en vez de romper.
  indiceActivo = buscarIndice(catalogo, new URLSearchParams(location.search).get("indice"));
  serie = await cargarIndice(indiceActivo.slug);

  bajadaOriginal = el("bajada-fuente").textContent ?? "";
  poblarSelectorDeIndices();
  el<HTMLSelectElement>("indice").value = indiceActivo.slug;
  poblarSelects();
  el("actualizado").textContent = fechaLarga(serie.actualizado);
  pintarTextosDeLaFuente();
  sincronizarOpcionRem();

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

  const periodoCorrido = leerUrl();
  pintarNotaDelIndice(periodoCorrido);

  el("formulario").addEventListener("input", (ev) => {
    const objetivo = ev.target as HTMLElement;
    if (objetivo.id === "indice") return; // lo atiende `cambiarIndice`, que además baja la serie
    if (objetivo.id === "monto") formatearMontoEnVivo();
    // El primer y el último año del índice no tienen los doce meses. Se recalcula al
    // cambiar de año para que el desplegable de meses nunca ofrezca uno que el motor
    // rechaza — y para que elegir el año de arranque no deje seleccionado un mes muerto.
    if (objetivo.id === "desde-anio") acotarMesesDelAnio("desde");
    if (objetivo.id === "hasta-anio") acotarMesesDelAnio("hasta");
    // La nota de "se corrió el período" describe la corrección que hizo `cambiarIndice`
    // sobre el período que HABÍA antes. Si la persona toca el formulario a mano después,
    // esa frase queda hablando de un pedido que ya no existe: con Santa Fe, tras corregir
    // "pediste desde enero 1995" y mover el año a mano a 2020, la nota seguía diciendo
    // "pediste desde enero 1995" sobre un período que nunca se corrió. Cualquier campo de
    // fecha la vuelve a poner en blanco; `cambiarIndice` es la única que tiene algo que
    // contar ahí.
    if (/^(desde|hasta)-(anio|mes|dia)$/.test(objetivo.id)) pintarNotaDelIndice([]);
    calcular();
  });
  el("formulario").addEventListener("submit", (ev) => ev.preventDefault());
  el("formulario").addEventListener("click", (ev) => {
    const boton = (ev.target as HTMLElement).closest<HTMLButtonElement>(
      "#atajo-ahora, [data-atajo-desde]",
    );
    if (!boton || boton.disabled) return;
    if (boton.id === "atajo-ahora") {
      aplicarAtajoAhora();
    } else {
      aplicarAtajoDesde(Number(boton.dataset.atajoDesde));
    }
  });
  el("usar-dias").addEventListener("change", () => {
    alternarModo();
    analytics.cambioModo(el<HTMLInputElement>("usar-dias").checked ? "fecha" : "mes");
  });
  el("metodologia").addEventListener("change", () => {
    calcular();
    analytics.cambioMetodologia(leerMetodologia());
  });
  el("indice").addEventListener("change", (ev) => {
    const slug = (ev.target as HTMLSelectElement).value;
    // El listener de `input` del formulario también dispara con este select, así que el
    // cambio se atiende acá y allá se ignora: si no, se calcularía dos veces, una con la
    // serie vieja, y se vería el número anterior parpadear.
    void cambiarIndice(slug).then(
      () => analytics.cambioIndice(slug),
      // Si el archivo del índice no se puede bajar —un deploy a medias, un hipo de red—
      // el desplegable tiene que volver a lo que la pantalla está mostrando. Sin esto el
      // control decía "Tucumán" arriba de una tabla entera de Mendoza, con los sellos y
      // todo, y el único rastro era un error en la consola que nadie mira.
      (e: unknown) => {
        // El que falló se nombra: "ese índice" obligaba a adivinar cuál, y el único otro
        // nombre de la oración es el que **sí** está en pantalla, o sea el equivocado.
        const pedido = buscarIndice(catalogo, slug).nombre;
        el<HTMLSelectElement>("indice").value = indiceActivo.slug;
        const error = el("error");
        error.textContent =
          `No se pudo cargar ${pedido} (${(e as Error).message}). Se sigue mostrando ` +
          `${indiceActivo.nombre}.`;
        error.hidden = false;
      },
    );
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
