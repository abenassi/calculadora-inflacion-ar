/**
 * Orquestación de `/actualizar.html`: lee el mes objetivo, reindexa el dólar blue
 * contra el IPC y lo grafica. Ninguna cuenta de inflación se hace acá — vive en
 * `actualizarSerie`/`actualizarSerieDoble`, que a su vez reusan `adjust()` tal cual.
 *
 * Con un índice secundario elegido (hoy sólo el CPI de Estados Unidos), el mismo
 * flujo pasa de "pesos constantes" a "tipo de cambio real bilateral": se compone
 * `actualizarSerieDoble` en vez de `actualizarSerie`, y el gráfico agrega la curva
 * "sólo pesos" (`valorSoloBase`) y, si hay cross-check declarado, la del BCRA.
 */
import { actualizarSerie, actualizarSerieDoble, reescalarCrossCheck } from "../engine/actualizar.js";
import type { PuntoActualizado, PuntoActualizadoDoble } from "../engine/actualizar.js";
import { indiceSecundarioDisponible } from "../engine/indices-secundarios.js";
import type { CatalogoIndicesSecundarios, EntradaCatalogoSecundario } from "../engine/indices-secundarios.js";
import { SLUG_NACIONAL } from "../engine/indices.js";
import { abreviarMes, esMesValido, nombrarMes } from "../engine/mes.js";
import type { Mes, SerieIndice, SerieValores } from "../engine/types.js";
import { dibujarSerieActualizada } from "./chart-serie.js";
import type { OverlaySerieDoble } from "./chart-serie.js";
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
let catalogoSecundarios: CatalogoIndicesSecundarios = { indices: [], actualizado: "" };

/** El índice secundario elegido en el desplegable, o `null` para "(ninguno)". */
let indiceSecundarioActivo: EntradaCatalogoSecundario | null = null;
let serieSecundaria: SerieIndice | null = null;
/** El cross-check oficial (hoy, BCRA), sin reescalar todavía — eso lo hace `redibujar`. */
let crossCheckDatos: SerieValores | null = null;

const cacheSecundarias = new Map<string, SerieIndice>();
const cacheCrossCheck = new Map<string, SerieValores>();

/** Los puntos ya reindexados al mes objetivo, sin recortar por el slider. */
let puntosCompletos: PuntoActualizado[] = [];
/**
 * `valorSoloBase` de cada punto de `puntosCompletos`, mismo largo y orden — sólo
 * cuando hay índice secundario activo. Separado de `puntosCompletos` en vez de un
 * tipo unión `PuntoActualizado[] | PuntoActualizadoDoble[]` porque así el resto del
 * archivo (slider, URL) no necesita distinguir de cuál de los dos se trata.
 */
let valoresSoloBaseCompletos: number[] | null = null;
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
 *
 * Antes de este chequeo, un `puntosCompletos` vacío —el mes objetivo elegido cae
 * fuera de lo que cubre el índice secundario activo, ver `fueraDeCobertura` en
 * `engine/actualizar.ts`— hacía explotar `puntosCompletos[desdeIdx]!.mes` con
 * `undefined` sin capturar (hallazgo de la vuelta 1 del review), alcanzable con sólo
 * cambiar el mes objetivo a un año anterior a 2002 con el CPI de EE.UU. elegido. Y un
 * rango con un solo punto en vista (las dos puntas del slider en el mismo mes, sin
 * llegar a vaciarse del todo) no crashea pero dibuja un gráfico en blanco sin decir
 * por qué — mismo tipo de falla, más chico.
 */
function redibujar(): void {
  const canvas = el<HTMLCanvasElement>("grafico");
  const aviso = el("aviso-grafico");
  const rangoEl = el("rango");

  if (puntosCompletos.length === 0) {
    canvas.hidden = true;
    rangoEl.hidden = true;
    aviso.hidden = false;
    aviso.textContent = indiceSecundarioActivo
      ? `No hay datos para ${mesObjetivoTexto} ajustando por ${indiceSecundarioActivo.nombre}: ese mes ` +
        `queda fuera de lo que cubre esa serie. Elegí otro mes objetivo, o volvé a "(ninguno)".`
      : `No hay datos para ${mesObjetivoTexto}.`;
    actualizarTextosDeCabecera(false);
    el("nota-cross-check").hidden = true;
    sincronizarUrl();
    return;
  }

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
  rangoEl.hidden = false;

  if (puntos.length < 2) {
    canvas.hidden = true;
    aviso.hidden = false;
    aviso.textContent = "Elegí un rango más largo: con un solo mes no hay nada que graficar.";
    actualizarTextosDeCabecera(false);
    el("nota-cross-check").hidden = true;
    sincronizarUrl();
    return;
  }

  canvas.hidden = false;
  aviso.hidden = true;

  const { overlay, notaCrossCheck } = armarOverlay(puntos, desdeIdx, hastaIdx);

  actualizarTextosDeCabecera(overlay !== undefined);
  const nota = el("nota-cross-check");
  nota.textContent = notaCrossCheck ?? "";
  nota.hidden = notaCrossCheck === null;

  dibujarSerieActualizada(canvas, puntos, mesObjetivoTexto, overlay);

  sincronizarUrl();
}

/** Lo que devuelve `armarOverlay`: el overlay para el gráfico y qué nota mostrar debajo. */
type ResultadoOverlay = {
  overlay: OverlaySerieDoble | undefined;
  /** `null` = no mostrar ninguna nota (sin índice secundario, o sin cross-check declarado). */
  notaCrossCheck: string | null;
};

/**
 * Arma lo que necesita `dibujarSerieActualizada` para el overlay de tipo de cambio
 * real, o `undefined` si no hay índice secundario activo — en cuyo caso el gráfico
 * queda exactamente como antes de este cambio.
 *
 * Ninguna cuenta de inflación se hace acá: `valorSoloBase` ya viene calculado de
 * `actualizarSerieDoble`, y `reescalarCrossCheck` es la única función que toca el
 * cross-check, la misma que testea `tests/actualizar.test.ts`.
 */
function armarOverlay(puntos: PuntoActualizado[], desdeIdx: number, hastaIdx: number): ResultadoOverlay {
  if (!indiceSecundarioActivo || valoresSoloBaseCompletos === null) {
    return { overlay: undefined, notaCrossCheck: null };
  }

  const overlay: OverlaySerieDoble = {
    valoresSoloBase: valoresSoloBaseCompletos.slice(desdeIdx, hastaIdx + 1),
    labelSoloBase: `Dólar blue, a pesos de ${mesObjetivoTexto} (sin ${indiceSecundarioActivo.nombre})`,
  };

  if (!crossCheckDatos) return { overlay, notaCrossCheck: null };

  /*
   * Se reescala a 100 en el ÚLTIMO dato del propio cross-check, NO en el mes
   * objetivo elegido — a diferencia de lo que hacía la primera versión de este
   * cambio, y es una corrección, no el diseño original. La serie del BCRA es diaria
   * pero en la práctica llega atrasada meses respecto del IPC (medido: hasta enero
   * de 2026 el día de hoy, 2026-08-17, siete meses), y el mes objetivo por default
   * es el último mes del IPC —casi siempre más nuevo—. Anclar al mes objetivo dejaba
   * el overlay invisible en el estado por default, que es el que ve casi todo el
   * mundo: la comparación que esta sección existe para mostrar nunca se veía.
   * El ancla es arbitraria de todos modos (es "comparación de forma, no de nivel",
   * no una igualdad de niveles) así que anclar al último dato disponible no cambia
   * lo que se puede leer del gráfico, y sí lo hace visible por default. Hallazgo de
   * `revisor-economista` en la vuelta 1 del review de este cambio.
   */
  const mesAncla = crossCheckDatos.datos.at(-1)!.mes;
  const reescalado = reescalarCrossCheck(crossCheckDatos.datos, mesAncla);
  const porMes = new Map(reescalado.map((p) => [p.mes, p.valor]));
  const serieAlineada = puntos.map((p) => porMes.get(p.mes) ?? null);

  if (serieAlineada.some((v) => v !== null)) {
    overlay.crossCheck = serieAlineada;
    overlay.labelCrossCheck = "Tipo de cambio real vs. EE.UU. (BCRA, índice)";
    return {
      overlay,
      notaCrossCheck:
        `La línea del BCRA es una comparación de forma, no de nivel: está reescalada a 100 en ` +
        `${nombrarMes(mesAncla)} (su último dato disponible), porque es un índice y no un monto ` +
        `en pesos. Que las dos curvas se muevan parecido no significa que valgan lo mismo.`,
    };
  }

  // El rango visible del slider no llega a superponerse con la cobertura del
  // cross-check (por ejemplo, si se lo corre a meses todos posteriores a `mesAncla`).
  // No debería pasar casi nunca con datos reales —el cross-check cubre desde 2002—
  // pero es la misma regla 3 igual: si no hay nada que mostrar, se explica por qué.
  return {
    overlay,
    notaCrossCheck:
      `El BCRA no tiene dato de tipo de cambio real en el rango que se está mostrando ` +
      `(su serie llega hasta ${nombrarMes(mesAncla)}); el gráfico muestra igual las dos curvas propias.`,
  };
}

/**
 * El título del panel, el texto alternativo del gráfico y el badge describen un
 * comportamiento que cambia con el índice secundario — regla 2 bis: cambiar el
 * comportamiento sin barrer estos textos es el modo de falla más repetido del repo.
 */
function actualizarTextosDeCabecera(hayOverlay: boolean): void {
  const nombreSecundario = indiceSecundarioActivo?.nombre ?? "";

  el("titulo-grafico").textContent = hayOverlay
    ? `Dólar blue, tipo de cambio real (vs. ${nombreSecundario})`
    : "Dólar blue";

  const canvas = el<HTMLCanvasElement>("grafico");
  canvas.setAttribute(
    "aria-label",
    hayOverlay
      ? `Dólar blue promedio mensual, en tipo de cambio real bilateral contra ${nombreSecundario}, ` +
          `con la curva de sólo pesos y, si está disponible, el cross-check del BCRA como referencia`
      : "Dólar blue promedio mensual, reexpresado en los pesos del mes elegido",
  );

  const badge = el("badge-serie");
  // La versión con índice secundario nombra qué hace cada fuente por separado —el
  // "y...y" que las juntaba a las tres sin decir qué aportaba cada una era el
  // hallazgo de `revisora-usuaria` en la vuelta 1: la frase sonaba a una sola cuenta
  // hecha por tres organismos juntos, cuando son dos ajustes distintos en cadena.
  // Sólo la primera letra en minúscula ("inflación de Estados Unidos"): `nombre` es
  // un rótulo (va con mayúscula en el título y el selector) y acá entra a mitad de
  // oración después de "la", pero "Estados Unidos" tiene que seguir siendo nombre
  // propio.
  const nombreSecundarioEnOracion = nombreSecundario
    ? nombreSecundario.charAt(0).toLowerCase() + nombreSecundario.slice(1)
    : "";
  const textoBadge = hayOverlay
    ? `Dólar blue promedio mensual, fuente Ámbito Financiero · a pesos de cada mes ` +
      `según el IPC del INDEC y el BCRA, y en tipo de cambio real también según la ` +
      `${nombreSecundarioEnOracion}`
    : "Dólar blue promedio mensual, fuente Ámbito Financiero · actualizado a pesos de " +
      "cada mes según el IPC del INDEC y el BCRA";
  badge.replaceChildren(
    document.createTextNode(`${textoBadge} · datos vía `),
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
      span.textContent = fechaLarga(dolarBlue.actualizado);
      return span;
    })(),
  );
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
 * Los meses `desde`/`hasta` del rango actual, en la forma que espera `actualizar()`
 * para re-resolverlos por mes contra un `puntosCompletos` nuevo — el mismo mecanismo
 * que ya usa un link compartido (`rangoDesdeIndices` + `indiceDeMes`).
 *
 * Hace falta al cambiar de índice secundario porque ahí `puntosCompletos` puede
 * cambiar de largo por ABAJO o por el MEDIO, no sólo por arriba: `actualizarSerie` y
 * `actualizarSerieDoble` pueden descartar conjuntos de puntos distintos (cada índice
 * secundario tiene su propio piso — ver `fueraDeCobertura` en `engine/actualizar.ts`,
 * el hallazgo de la vuelta 1 de este mismo cambio). `reajustarRango` sólo sabe
 * clampear índices al nuevo largo, que es correcto cuando lo único que cambia es
 * cuántos meses recientes hay (el caso de cambiar el mes objetivo) pero no cuando el
 * conjunto de meses cambia desde otro lado: un índice de posición fijo puede pasar a
 * apuntar a un mes distinto sin que nada avise.
 */
function capturarMesesDeRango(): { desde: string | null; hasta: string | null } {
  if (!rango) return { desde: null, hasta: null };
  return {
    desde: rango.desdeEnElPiso ? null : (puntosCompletos[rango.desdeIdx]?.mes ?? null),
    hasta: rango.hastaEnElTope ? null : (puntosCompletos[rango.hastaIdx]?.mes ?? null),
  };
}

/**
 * Recibe `{ desde, hasta }` crudos de la URL (`leerUrl`) o de `capturarMesesDeRango`, y
 * arma `rango` resolviendo esos meses contra el `puntosCompletos` recién calculado.
 * Sólo pasa cuando `rango` es `null` — lo fuerza quien llama (`iniciar` en la primera
 * carga, `cambiarIndiceSecundario`/`quitarIndiceSecundario` al cambiar de índice). El
 * resto de las llamadas (cambiar el mes objetivo, mover el slider) dejan `rango` como
 * está y el largo se ajusta con `reajustarRango`.
 */
function actualizar(rangoUrl?: { desde: string | null; hasta: string | null }): void {
  const mesObjetivo = leerObjetivo();
  mesObjetivoTexto = nombrarMes(mesObjetivo);

  if (indiceSecundarioActivo && serieSecundaria) {
    const dobles = actualizarSerieDoble(
      dolarBlue.datos,
      mesObjetivo,
      ipc,
      serieSecundaria,
      indiceSecundarioActivo.direccion,
    );
    puntosCompletos = dobles;
    valoresSoloBaseCompletos = dobles.map((p: PuntoActualizadoDoble) => p.valorSoloBase);
  } else {
    puntosCompletos = actualizarSerie(dolarBlue.datos, mesObjetivo, ipc);
    valoresSoloBaseCompletos = null;
  }

  if (rango === null) {
    rango = rangoUrl
      ? rangoDesdeIndices(indiceDeMes(rangoUrl.desde), indiceDeMes(rangoUrl.hasta), puntosCompletos.length)
      : rangoInicial(puntosCompletos.length);
  } else {
    rango = reajustarRango(rango, puntosCompletos.length);
  }
  redibujar();
}

/* ------------------------------------------------------------ índice secundario */

function poblarSelectorIndiceSecundario(): void {
  const campo = el("campo-indice-secundario");
  const select = el<HTMLSelectElement>("indice-secundario");

  // Sin ningún índice secundario en el catálogo —el snapshot todavía no lo trae, o el
  // pipeline no pudo bajarlo hoy y tampoco quedó uno de una corrida anterior— el campo
  // entero queda oculto: un desplegable con una sola opción fija ("ninguno") no ofrece
  // nada y sólo estorba. Es la regla 3 aplicada al control completo, no a una opción.
  campo.hidden = catalogoSecundarios.indices.length === 0;
  if (campo.hidden) return;

  const opcionNinguno = document.createElement("option");
  opcionNinguno.value = "";
  opcionNinguno.textContent = "(ninguno)";

  const opciones = catalogoSecundarios.indices.map((entrada) => {
    const o = document.createElement("option");
    o.value = entrada.slug;
    // Hoy `requiereIndiceBase` siempre coincide (esta página no tiene selector de
    // índice primario, siempre nacional), así que esta rama no se puede disparar
    // desde la interfaz — pero el criterio es el mismo que va a usar el día que haya
    // un selector de índice primario acá, y por eso vive en una función del motor
    // (`indiceSecundarioDisponible`) y no en un `if` suelto de este archivo.
    const disponible = indiceSecundarioDisponible(entrada, SLUG_NACIONAL);
    o.disabled = !disponible;
    o.textContent = disponible ? entrada.nombre : `${entrada.nombre} (no disponible con este índice)`;
    return o;
  });

  select.replaceChildren(opcionNinguno, ...opciones);
}

/**
 * Cambia el índice secundario activo: baja (lazy, y sólo una vez por slug — mismo
 * criterio que `cargarIndice` en `main.ts`) el archivo de la serie y, si el catálogo
 * dice que existe, el del cross-check. Los dos van en su propio `try/catch`: si el
 * de la serie falla, se avisa y se vuelve a "(ninguno)"; si falla el del cross-check,
 * el ajuste sigue igual y sólo se pierde la tercera línea — el overlay nunca es
 * bloqueante, ver el spec.
 */
async function cambiarIndiceSecundario(
  slug: string,
  rangoUrl?: { desde: string | null; hasta: string | null },
): Promise<void> {
  const errorEl = el("error-indice-secundario");
  errorEl.hidden = true;
  // Capturado ANTES de tocar nada: son los meses del rango visible en el modo
  // anterior (o `{null, null}` en la primera carga), para re-resolverlos por mes
  // contra el `puntosCompletos` nuevo en vez de heredar índices de posición que
  // pueden pasar a apuntar a otro mes — ver `capturarMesesDeRango`.
  const mesesPrevios = rangoUrl ?? capturarMesesDeRango();

  const entrada = catalogoSecundarios.indices.find((i) => i.slug === slug);
  if (!entrada) {
    // No debería pasar desde el desplegable (sólo ofrece slugs del catálogo), pero un
    // `?ajuste=` de un link viejo o retocado a mano sí puede traer un slug que ya no
    // está: se ignora, como el resto de los parámetros de un link viejo.
    actualizar(rangoUrl);
    return;
  }

  try {
    let serie = cacheSecundarias.get(slug);
    if (!serie) {
      const r = await fetch(`${import.meta.env.BASE_URL}data/series/secundario-${slug}.json`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      serie = (await r.json()) as SerieIndice;
      cacheSecundarias.set(slug, serie);
    }
    indiceSecundarioActivo = entrada;
    serieSecundaria = serie;
    el<HTMLSelectElement>("indice-secundario").value = slug;
  } catch (e: unknown) {
    errorEl.textContent = `No se pudo cargar ${entrada.nombre}: ${(e as Error).message}`;
    errorEl.hidden = false;
    indiceSecundarioActivo = null;
    serieSecundaria = null;
    el<HTMLSelectElement>("indice-secundario").value = "";
    actualizar(rangoUrl);
    return;
  }

  crossCheckDatos = null;
  if (entrada.tieneCrossCheck) {
    try {
      let cc = cacheCrossCheck.get(slug);
      if (!cc) {
        const r = await fetch(`${import.meta.env.BASE_URL}data/series/crosscheck-${slug}.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        cc = (await r.json()) as SerieValores;
        cacheCrossCheck.set(slug, cc);
      }
      crossCheckDatos = cc;
    } catch (e: unknown) {
      // No bloquea nada: el ajuste por el índice secundario sigue andando, sólo se
      // pierde la tercera línea de comparación.
      console.warn(`No se pudo cargar el cross-check de ${entrada.nombre}: ${(e as Error).message}`);
    }
  }

  // `rango = null` fuerza a `actualizar()` a re-resolver `mesesPrevios` por mes
  // contra el `puntosCompletos` del modo nuevo, en vez de clampear los índices del
  // modo anterior con `reajustarRango` (que asume que sólo se achica por arriba).
  rango = null;
  actualizar(mesesPrevios);
}

function quitarIndiceSecundario(): void {
  const mesesPrevios = capturarMesesDeRango();
  indiceSecundarioActivo = null;
  serieSecundaria = null;
  crossCheckDatos = null;
  el("error-indice-secundario").hidden = true;
  rango = null;
  actualizar(mesesPrevios);
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

  // El default es "(ninguno)": sólo viaja cuando se eligió un índice secundario.
  if (indiceSecundarioActivo) p.set("ajuste", indiceSecundarioActivo.slug);

  // El default del rango es la serie completa, con las dos puntas pegadas: sólo viaja
  // la punta que la persona corrió del piso o del tope.
  if (rango && !rango.desdeEnElPiso) p.set("desde", puntosCompletos[rango.desdeIdx]!.mes);
  if (rango && !rango.hastaEnElTope) p.set("hasta", puntosCompletos[rango.hastaIdx]!.mes);

  // Sin parámetros, ni el `?` queda: el link del caso común —entrar sin tocar nada—
  // tiene que ser exactamente `/actualizar.html`, no `/actualizar.html?`.
  history.replaceState(null, "", p.size > 0 ? `?${p}` : location.pathname);
}

/**
 * Lee `mes`/`ajuste`/`desde`/`hasta` de un link compartido. Sólo desde un link
 * explícito: nunca se recuerda entre visitas, mismo principio que `leerUrl` en
 * `main.ts`. Un `mes` que el motor no puede resolver (fuera de `limiteObjetivo`) o
 * mal formado deja el selector en el default que ya tenía; un `ajuste` que no está
 * en el catálogo se resuelve más tarde, en `cambiarIndiceSecundario` (que ya sabe
 * ignorar un slug inexistente). `desde`/`hasta` se devuelven crudos porque recién se
 * pueden resolver a índices después de calcular `puntosCompletos` en `actualizar()`.
 */
function leerUrl(): { desde: string | null; hasta: string | null; ajuste: string | null } {
  const p = new URLSearchParams(location.search);

  const mes = p.get("mes");
  if (mes !== null && esMesValido(mes)) {
    const { primero, ultimo } = limiteObjetivo();
    if (mes >= primero && mes <= ultimo) {
      el<HTMLSelectElement>("objetivo-anio").value = mes.slice(0, 4);
      el<HTMLSelectElement>("objetivo-mes").value = mes.slice(5, 7);
    }
  }

  return { desde: p.get("desde"), hasta: p.get("hasta"), ajuste: p.get("ajuste") };
}

async function iniciar(): Promise<void> {
  const [rIpc, rDolar, rCatalogoSecundarios] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}data/ipc.json`),
    fetch(`${import.meta.env.BASE_URL}data/series/dolar-blue.json`),
    fetch(`${import.meta.env.BASE_URL}data/indices-secundarios.json`),
  ]);
  if (!rIpc.ok) throw new Error(`No se pudo cargar el IPC (HTTP ${rIpc.status})`);
  if (!rDolar.ok) throw new Error(`No se pudo cargar el dólar blue (HTTP ${rDolar.status})`);

  ipc = (await rIpc.json()) as SerieIndice;
  dolarBlue = (await rDolar.json()) as SerieValores;
  // El catálogo de índices secundarios es opcional: un snapshot viejo (de antes de
  // este cambio) no lo trae, y eso no puede tirar abajo el resto de la página — el
  // desplegable "Ajustar también por" simplemente no aparece (`poblarSelectorIndiceSecundario`).
  catalogoSecundarios = rCatalogoSecundarios.ok
    ? ((await rCatalogoSecundarios.json()) as CatalogoIndicesSecundarios)
    : { indices: [], actualizado: "" };

  poblarSelectorObjetivo();
  poblarSelectorIndiceSecundario();
  // El default es el último mes que el motor puede resolver sin estimar nada
  // (`ipc.ultimo_oficial`), no el mes calendario en curso: éste último puede estar un
  // mes por delante de la última publicación, y arrancar ahí hacía que todos los
  // puntos resolvieran por `ventana_reciente` en vez de `directo`.
  const { ultimo } = limiteObjetivo();
  el<HTMLSelectElement>("objetivo-anio").value = ultimo.slice(0, 4);
  el<HTMLSelectElement>("objetivo-mes").value = ultimo.slice(5, 7);
  // Puede pisar objetivo-anio/objetivo-mes si la URL trae un `mes` válido; se lee acá,
  // antes de acotar, para que el acotado corra sobre el valor que terminó eligiendo.
  const { ajuste: ajusteUrl, ...rangoUrl } = leerUrl();
  acotarMesesObjetivo();

  el("formulario").addEventListener("input", (ev) => {
    const objetivo = ev.target as HTMLElement;
    // El primer y el último año del rango no tienen los doce meses habilitados: hay
    // que reacotar el selector de mes cada vez que cambia el año, igual que hace
    // `acotarMesesDelAnio` en `src/ui/main.ts` para sus selectores de desde/hasta.
    if (objetivo.id === "objetivo-anio") acotarMesesObjetivo();
    if (objetivo.id === "indice-secundario") {
      const slug = (objetivo as HTMLSelectElement).value;
      if (slug === "") quitarIndiceSecundario();
      else void cambiarIndiceSecundario(slug);
      return;
    }
    actualizar();
  });
  el<HTMLInputElement>("rango-desde").addEventListener("input", () => manejarInputRango("desde"));
  el<HTMLInputElement>("rango-hasta").addEventListener("input", () => manejarInputRango("hasta"));

  // `ajuste` en la URL sólo se puede aplicar si el catálogo lo ofrece de verdad —un
  // link viejo con un slug que ya no existe, o un `?ajuste=` copiado a mano, no puede
  // romper la carga: `cambiarIndiceSecundario` ya sabe ignorarlo y cae al default.
  const entradaValida =
    ajusteUrl && catalogoSecundarios.indices.some((i) => i.slug === ajusteUrl);
  if (entradaValida) {
    await cambiarIndiceSecundario(ajusteUrl, rangoUrl);
  } else {
    actualizar(rangoUrl);
  }
}

iniciar().catch((e: unknown) => {
  const error = el("error");
  error.textContent = `No se pudieron cargar los datos: ${(e as Error).message}`;
  error.hidden = false;
});
