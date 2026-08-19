/**
 * Orquestación de `/tcr.html`: lee el mes objetivo, calcula el tipo de cambio real
 * bilateral (vs. Estados Unidos) del dólar blue y del dólar oficial, y los grafica
 * junto a la serie oficial del BCRA. Ninguna cuenta de inflación se hace acá — vive
 * en `calcularTcrBilateral` (motor) y en `armarEjeYSeries`/`alinearPorMes`
 * (alineación de series para el gráfico, en `tcr-eje.ts`).
 *
 * A diferencia de `/actualizar.html`, acá no hay nada para elegir salvo el mes
 * objetivo: las tres series (TCR-blue, TCR-oficial, BCRA) están fijas — ver
 * `docs/superpowers/specs/2026-08-19-tcr-page-design.md`.
 */
import { calcularTcrBilateral, reescalarCrossCheck } from "../engine/actualizar.js";
import type { PuntoActualizadoDoble } from "../engine/actualizar.js";
import { abreviarMes, esMesValido, nombrarMes } from "../engine/mes.js";
import type { Mes, PuntoValor, SerieIndice, SerieValores } from "../engine/types.js";
import { dibujarComparacionTcr } from "./chart-tcr.js";
import { fechaLarga } from "./format.js";
import { moverSlider, rangoDesdeIndices, rangoInicial, reajustarRango } from "./rango-slider.js";
import type { EstadoRango } from "./rango-slider.js";
import { alinearPorMes, armarEjeYSeries } from "./tcr-eje.js";

const NOMBRES_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Antes de 1992 Argentina tenía el austral, no el peso. Mismo valor y mismo motivo
 * que `PRIMER_ANIO_EN_PESOS` de `actualizar-main.ts`; copiado y no importado porque
 * esta página es su propio entry point de Vite, no un módulo compartido — ver el
 * spec, sección "Formulario y estado".
 */
const PRIMER_ANIO_EN_PESOS = 1992;

const el = <T extends HTMLElement>(id: string): T => {
  const nodo = document.getElementById(id);
  if (!nodo) throw new Error(`Falta el elemento #${id}`);
  return nodo as T;
};

let ipc: SerieIndice;
let cpiUs: SerieIndice;
let dolarBlue: SerieValores;
let dolarOficial: SerieValores;
let crossCheckDatos: SerieValores | null = null;

/** El eje temporal completo (unión de meses de blue y oficial), sin recortar por el slider. */
let meses: Mes[] = [];
let valoresBlue: (number | null)[] = [];
let valoresOficial: (number | null)[] = [];
let mesObjetivoTexto = "";
let rango: EstadoRango | null = null;

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

/**
 * `true` si ninguno de los puntos visibles (entre `desdeIdx` y `hastaIdx`) tiene dato
 * de TCR-oficial — el dólar oficial recién arranca en junio de 2010, así que esto
 * pasa siempre que el rango visible quede antes de esa fecha, sin importar el mes
 * objetivo elegido. Ver el spec, sección "Casos límite", segundo punto.
 */
function faltaOficialEnRango(desdeIdx: number, hastaIdx: number): boolean {
  return valoresOficial.slice(desdeIdx, hastaIdx + 1).every((v) => v === null);
}

type ResultadoCrossCheck = {
  /**
   * `undefined` cuando el rango visible no se superpone con la cobertura del
   * cross-check: no hay nada que graficar, y una serie toda en `null` igual haría
   * que `chart-tcr.ts` sume una entrada de leyenda que no dibuja nada y un eje `y1`
   * completo con el rango 0–1 por default de Chart.js — visualmente roto. Mismo
   * criterio que `armarOverlay` en `actualizar-main.ts`.
   */
  serie?: { label: string; valores: (number | null)[] };
  /** `undefined` = no mostrar ninguna nota. */
  nota?: string;
};

/**
 * Arma la línea del BCRA alineada a `mesesVisibles`, o `undefined` si el snapshot no
 * trae cross-check. Mismo criterio que la decisión 0015: se reancla al último dato
 * del propio cross-check, no al mes objetivo, para que la línea no desaparezca por
 * default (el BCRA publica con meses de rezago).
 */
function armarCrossCheck(mesesVisibles: Mes[]): ResultadoCrossCheck | undefined {
  if (!crossCheckDatos) return undefined;

  const mesAncla = crossCheckDatos.datos.at(-1)!.mes;
  const reescalado = reescalarCrossCheck(crossCheckDatos.datos, mesAncla);
  const valores = alinearPorMes(reescalado, mesesVisibles);

  if (valores.some((v) => v !== null)) {
    return {
      serie: { label: "Tipo de cambio real vs. EE.UU. (BCRA, índice)", valores },
      nota:
        `La línea del BCRA es una comparación de forma, no de nivel: está reescalada a 100 en ` +
        `${nombrarMes(mesAncla)} (su último dato disponible), porque es un índice y no un monto ` +
        `en pesos. Que las curvas se muevan parecido no significa que valgan lo mismo.`,
    };
  }

  return {
    nota:
      `El BCRA no tiene dato de tipo de cambio real en el rango que se está mostrando ` +
      `(su serie llega hasta ${nombrarMes(mesAncla)}); el gráfico muestra igual las dos curvas propias.`,
  };
}

function redibujar(): void {
  const canvas = el<HTMLCanvasElement>("grafico");
  const aviso = el("aviso-grafico");
  const rangoEl = el("rango");
  const notaCobertura = el("nota-cobertura-oficial");
  const notaCrossCheck = el("nota-cross-check");

  if (meses.length === 0) {
    canvas.hidden = true;
    rangoEl.hidden = true;
    aviso.hidden = false;
    aviso.textContent =
      "El tipo de cambio real necesita inflación de Estados Unidos, que no tiene dato " +
      "antes de enero de 2002 — elegí un mes objetivo posterior.";
    notaCobertura.hidden = true;
    notaCrossCheck.hidden = true;
    sincronizarUrl();
    return;
  }

  const { desdeIdx, hastaIdx } = rango!;
  const maximo = meses.length - 1;

  const inputDesde = el<HTMLInputElement>("rango-desde");
  const inputHasta = el<HTMLInputElement>("rango-hasta");
  inputDesde.max = inputHasta.max = String(maximo);
  inputDesde.value = String(desdeIdx);
  inputHasta.value = String(hastaIdx);

  el("rango-desde-texto").textContent = abreviarMes(meses[desdeIdx]!);
  el("rango-hasta-texto").textContent = abreviarMes(meses[hastaIdx]!);
  rangoEl.hidden = false;

  const mesesVisibles = meses.slice(desdeIdx, hastaIdx + 1);
  if (mesesVisibles.length < 2) {
    canvas.hidden = true;
    aviso.hidden = false;
    aviso.textContent = "Elegí un rango más largo: con un solo mes no hay nada que graficar.";
    notaCobertura.hidden = true;
    notaCrossCheck.hidden = true;
    sincronizarUrl();
    return;
  }

  canvas.hidden = false;
  aviso.hidden = true;

  notaCobertura.hidden = !faltaOficialEnRango(desdeIdx, hastaIdx);
  if (!notaCobertura.hidden) {
    notaCobertura.textContent =
      "El dólar oficial minorista tiene serie desde junio de 2010; antes de esa fecha " +
      "el gráfico muestra sólo TCR-blue y BCRA.";
  }

  const crossCheck = armarCrossCheck(mesesVisibles);
  notaCrossCheck.hidden = crossCheck?.nota === undefined;
  notaCrossCheck.textContent = crossCheck?.nota ?? "";

  dibujarComparacionTcr(
    canvas,
    mesesVisibles,
    { label: `Dólar blue, TCR a ${mesObjetivoTexto}`, valores: valoresBlue.slice(desdeIdx, hastaIdx + 1) },
    {
      label: `Dólar oficial, TCR a ${mesObjetivoTexto}`,
      valores: valoresOficial.slice(desdeIdx, hastaIdx + 1),
    },
    crossCheck?.serie,
  );

  sincronizarUrl();
}

function manejarInputRango(origen: "desde" | "hasta"): void {
  const desdeIdx = Number(el<HTMLInputElement>("rango-desde").value);
  const hastaIdx = Number(el<HTMLInputElement>("rango-hasta").value);
  rango = moverSlider(origen, desdeIdx, hastaIdx, meses.length);
  redibujar();
}

function indiceDeMes(mes: string | null): number {
  if (mes === null || !esMesValido(mes)) return -1;
  return meses.findIndex((m) => m === mes);
}

/**
 * Descarta los puntos de un mes todavía no publicado por IPC o CPI de EE.UU.
 *
 * `dolar.json` (oficial) y `dolar-blue.json` se cachean con `funcion_colapso: "last"`/
 * `"avg"` sobre el mes en curso, sin filtrar `periodo_incompleto` en el caso del
 * oficial (ver `construirAuxiliar` en `scripts/fetch-snapshot.ts`) — así que pueden
 * traer un mes corriente, sin cerrar, que nadie publicó todavía. Pasarlo tal cual a
 * `calcularTcrBilateral` hace que el motor complete ese mes con `ventana_reciente`
 * (la tasa del mes anterior, prestada) sin ninguna marca visual de que ese punto es
 * distinto al resto — mezclando dato y estimación sin decirlo. Recortar acá, contra
 * el último mes oficial de las dos series de inflación que entran en la cuenta, es
 * más barato que tocar el pipeline (que es un cambio más grande, fuera de alcance).
 */
function sinMesesIncompletos(datos: PuntoValor[]): PuntoValor[] {
  const tope = ipc.ultimo_oficial < cpiUs.ultimo_oficial ? ipc.ultimo_oficial : cpiUs.ultimo_oficial;
  return datos.filter((p) => p.mes <= tope);
}

function calcular(rangoUrl?: { desde: string | null; hasta: string | null }): void {
  const mesObjetivo = leerObjetivo();
  mesObjetivoTexto = nombrarMes(mesObjetivo);

  const blue: PuntoActualizadoDoble[] = calcularTcrBilateral(
    sinMesesIncompletos(dolarBlue.datos),
    mesObjetivo,
    ipc,
    cpiUs,
  );
  const oficial: PuntoActualizadoDoble[] = calcularTcrBilateral(
    sinMesesIncompletos(dolarOficial.datos),
    mesObjetivo,
    ipc,
    cpiUs,
  );

  const eje = armarEjeYSeries(blue, oficial);
  meses = eje.meses;
  valoresBlue = eje.blue;
  valoresOficial = eje.oficial;

  if (rango === null) {
    rango = rangoUrl
      ? rangoDesdeIndices(indiceDeMes(rangoUrl.desde), indiceDeMes(rangoUrl.hasta), meses.length)
      : rangoInicial(meses.length);
  } else {
    rango = reajustarRango(rango, meses.length);
  }
  redibujar();
}

function sincronizarUrl(): void {
  const p = new URLSearchParams();

  const mesObjetivo = leerObjetivo();
  const { ultimo } = limiteObjetivo();
  if (mesObjetivo !== ultimo) p.set("mes", mesObjetivo);

  if (rango && !rango.desdeEnElPiso) p.set("desde", meses[rango.desdeIdx]!);
  if (rango && !rango.hastaEnElTope) p.set("hasta", meses[rango.hastaIdx]!);

  history.replaceState(null, "", p.size > 0 ? `?${p}` : location.pathname);
}

function leerUrl(): { desde: string | null; hasta: string | null } {
  const p = new URLSearchParams(location.search);

  const mes = p.get("mes");
  if (mes !== null && esMesValido(mes)) {
    const { primero, ultimo } = limiteObjetivo();
    if (mes >= primero && mes <= ultimo) {
      el<HTMLSelectElement>("objetivo-anio").value = mes.slice(0, 4);
      el<HTMLSelectElement>("objetivo-mes").value = mes.slice(5, 7);
    }
  }

  return { desde: p.get("desde"), hasta: p.get("hasta") };
}

function actualizarBadge(): void {
  const badge = el("badge-serie");
  badge.replaceChildren(
    document.createTextNode(
      "Dólar blue (Ámbito Financiero) y dólar oficial (BCRA), a tipo de cambio real según el IPC " +
        "del INDEC y la inflación de Estados Unidos (BLS/FRED) · datos vía ",
    ),
    (() => {
      const a = document.createElement("a");
      a.href = "https://argentinadata.mymcps.dev";
      a.rel = "noopener";
      a.textContent = "Argentina Data MCP";
      return a;
    })(),
    document.createTextNode(" · actualizado "),
    (() => {
      const span = document.createElement("span");
      span.id = "actualizado";
      span.textContent = fechaLarga(ipc.actualizado);
      return span;
    })(),
  );
}

async function iniciar(): Promise<void> {
  const [rIpc, rCpiUs, rBlue, rOficial, rCrossCheck] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}data/ipc.json`),
    fetch(`${import.meta.env.BASE_URL}data/series/secundario-cpi-eeuu.json`),
    fetch(`${import.meta.env.BASE_URL}data/series/dolar-blue.json`),
    fetch(`${import.meta.env.BASE_URL}data/dolar.json`),
    fetch(`${import.meta.env.BASE_URL}data/series/crosscheck-cpi-eeuu.json`),
  ]);
  if (!rIpc.ok) throw new Error(`No se pudo cargar el IPC (HTTP ${rIpc.status})`);
  if (!rCpiUs.ok) throw new Error(`No se pudo cargar la inflación de EE.UU. (HTTP ${rCpiUs.status})`);
  if (!rBlue.ok) throw new Error(`No se pudo cargar el dólar blue (HTTP ${rBlue.status})`);
  if (!rOficial.ok) throw new Error(`No se pudo cargar el dólar oficial (HTTP ${rOficial.status})`);

  ipc = (await rIpc.json()) as SerieIndice;
  cpiUs = (await rCpiUs.json()) as SerieIndice;
  dolarBlue = (await rBlue.json()) as SerieValores;
  dolarOficial = (await rOficial.json()) as SerieValores;
  // El cross-check es un adicional, nunca bloqueante: si el snapshot no lo trae (FRED
  // o BCRA caídos el día del pipeline), la página funciona igual con las dos curvas
  // propias — mismo criterio que ya usa `/actualizar.html`.
  crossCheckDatos = rCrossCheck.ok ? ((await rCrossCheck.json()) as SerieValores) : null;

  poblarSelectorObjetivo();
  const { ultimo } = limiteObjetivo();
  el<HTMLSelectElement>("objetivo-anio").value = ultimo.slice(0, 4);
  el<HTMLSelectElement>("objetivo-mes").value = ultimo.slice(5, 7);
  const rangoUrl = leerUrl();
  acotarMesesObjetivo();
  actualizarBadge();

  el("formulario").addEventListener("input", (ev) => {
    const objetivo = ev.target as HTMLElement;
    if (objetivo.id === "objetivo-anio") acotarMesesObjetivo();
    rango = null;
    calcular();
  });
  el<HTMLInputElement>("rango-desde").addEventListener("input", () => manejarInputRango("desde"));
  el<HTMLInputElement>("rango-hasta").addEventListener("input", () => manejarInputRango("hasta"));

  calcular(rangoUrl);
}

iniciar().catch((e: unknown) => {
  const error = el("error");
  error.textContent = `No se pudieron cargar los datos: ${(e as Error).message}`;
  error.hidden = false;
});
