/**
 * Orquestación de `/actualizar.html`: lee el mes objetivo, reindexa el dólar blue
 * contra el IPC y lo grafica. Ninguna cuenta de inflación se hace acá — vive en
 * `actualizarSerie`, que a su vez reusa `adjust()` tal cual.
 */
import { actualizarSerie } from "../engine/actualizar.js";
import type { PuntoActualizado } from "../engine/actualizar.js";
import { abreviarMes, esMesValido, nombrarMes } from "../engine/mes.js";
import type { Mes, SerieIndice, SerieValores } from "../engine/types.js";
import { dibujarSerieActualizada } from "./chart-serie.js";
import { fechaLarga } from "./format.js";
import { moverSlider, rangoDesdeIndices, rangoInicial, reajustarRango } from "./rango-slider.js";
import type { EstadoRango } from "./rango-slider.js";

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

/** Los puntos ya reindexados al mes objetivo, sin recortar por el slider. */
let puntosCompletos: PuntoActualizado[] = [];
let mesObjetivoTexto = "";
let rango: EstadoRango | null = null;

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

/**
 * Refleja `rango` en los dos `<input type="range">` (topes y valores) y recorta
 * `puntosCompletos` para redibujar.
 */
function redibujar(): void {
  const { desdeIdx, hastaIdx } = rango!;
  const maximo = puntosCompletos.length - 1;

  const inputDesde = el<HTMLInputElement>("rango-desde");
  const inputHasta = el<HTMLInputElement>("rango-hasta");
  inputDesde.max = inputHasta.max = String(maximo);
  inputDesde.value = String(desdeIdx);
  inputHasta.value = String(hastaIdx);

  el("rango-desde-texto").textContent = abreviarMes(puntosCompletos[desdeIdx]!.mes);
  el("rango-hasta-texto").textContent = abreviarMes(puntosCompletos[hastaIdx]!.mes);

  const puntos = puntosCompletos.slice(desdeIdx, hastaIdx + 1);
  dibujarSerieActualizada(el<HTMLCanvasElement>("grafico"), puntos, mesObjetivoTexto);

  sincronizarUrl();
}

function manejarInputRango(origen: "desde" | "hasta"): void {
  const desdeIdx = Number(el<HTMLInputElement>("rango-desde").value);
  const hastaIdx = Number(el<HTMLInputElement>("rango-hasta").value);
  rango = moverSlider(origen, desdeIdx, hastaIdx, puntosCompletos.length);
  redibujar();
}

/**
 * El índice en `puntosCompletos` del mes `desde`/`hasta` que trajo la URL, o `-1` si
 * no está: mal formado, ausente, o un mes que la serie actual no tiene (cambió el mes
 * objetivo, o el link es viejo). `rangoDesdeIndices` cae al default ante un `-1`, así
 * que acá no hace falta distinguir el motivo.
 */
function indiceDeMes(mes: string | null): number {
  if (mes === null || !esMesValido(mes)) return -1;
  return puntosCompletos.findIndex((punto) => punto.mes === mes);
}

/**
 * Recibe `{ desde, hasta }` crudos de la URL (`leerUrl`) y arma el primer `rango`. Sólo
 * se usa en la primera llamada a `actualizar()` — de ahí en más `rango` no es `null` y
 * el largo cambia por `reajustarRango`, no por un link.
 */
function actualizar(rangoUrl?: { desde: string | null; hasta: string | null }): void {
  const mesObjetivo = leerObjetivo();
  mesObjetivoTexto = nombrarMes(mesObjetivo);
  puntosCompletos = actualizarSerie(dolarBlue.datos, mesObjetivo, ipc);
  if (rango === null) {
    rango = rangoUrl
      ? rangoDesdeIndices(indiceDeMes(rangoUrl.desde), indiceDeMes(rangoUrl.hasta), puntosCompletos.length)
      : rangoInicial(puntosCompletos.length);
  } else {
    rango = reajustarRango(rango, puntosCompletos.length);
  }
  redibujar();
}

/* ------------------------------------------------------------ URL compartible */

/**
 * Refleja el mes objetivo y el rango del slider en la URL, llamada desde `redibujar`
 * —o sea, después de cualquier cambio de estado, sin un paso de "copiar link" aparte—
 * así lo que está en la barra de direcciones en cualquier momento ya es el link que
 * reproduce esa vista. Mismo criterio que `sincronizarUrl` en `main.ts`: el link más
 * compartido —el que se ve al entrar sin parámetros— tiene que ser el más corto, así
 * que sólo viaja lo que la persona cambió del default.
 */
function sincronizarUrl(): void {
  const p = new URLSearchParams();

  const mesObjetivo = leerObjetivo();
  const { ultimo } = limiteObjetivo();
  if (mesObjetivo !== ultimo) p.set("mes", mesObjetivo);

  // El default del rango es la serie completa, con las dos puntas pegadas: sólo viaja
  // la punta que la persona corrió del piso o del tope.
  if (rango && !rango.desdeEnElPiso) p.set("desde", puntosCompletos[rango.desdeIdx]!.mes);
  if (rango && !rango.hastaEnElTope) p.set("hasta", puntosCompletos[rango.hastaIdx]!.mes);

  // Sin parámetros, ni el `?` queda: el link del caso común —entrar sin tocar nada—
  // tiene que ser exactamente `/actualizar.html`, no `/actualizar.html?`.
  history.replaceState(null, "", p.size > 0 ? `?${p}` : location.pathname);
}

/**
 * Lee `mes`/`desde`/`hasta` de un link compartido. Sólo desde un link explícito:
 * nunca se recuerda entre visitas, mismo principio que `leerUrl` en `main.ts`. Un
 * `mes` que el motor no puede resolver (fuera de `limiteObjetivo`) o mal formado
 * deja el selector en el default que ya tenía. `desde`/`hasta` se devuelven crudos
 * porque recién se pueden resolver a índices después de calcular `puntosCompletos`
 * en `actualizar()`.
 */
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
  // Puede pisar objetivo-anio/objetivo-mes si la URL trae un `mes` válido; se lee acá,
  // antes de acotar, para que el acotado corra sobre el valor que terminó eligiendo.
  const rangoUrl = leerUrl();
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
  el<HTMLInputElement>("rango-desde").addEventListener("input", () => manejarInputRango("desde"));
  el<HTMLInputElement>("rango-hasta").addEventListener("input", () => manejarInputRango("hasta"));
  actualizar(rangoUrl);
}

iniciar().catch((e: unknown) => {
  const error = el("error");
  error.textContent = `No se pudieron cargar los datos: ${(e as Error).message}`;
  error.hidden = false;
});
