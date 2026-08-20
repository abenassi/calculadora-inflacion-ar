/**
 * Reindexa una serie de valores contra el IPC: cada punto queda expresado en los
 * pesos de un único mes objetivo, en vez de en los pesos del mes en que se publicó.
 *
 * No hace ninguna cuenta propia: por cada punto llama al `adjust()` que ya existe.
 * Los puntos que `adjust()` sólo podría resolver estimando —lo contesta
 * `motivoParaEstimar`— se marcan con `valorActualizado: null` y el motivo, en vez
 * de descartarse en silencio. Regla 3 de AGENTS.md aplicada a una fila de tabla.
 */
import { adjust, motivoParaEstimar } from "./adjust.js";
import type { OpcionesAjuste } from "./adjust.js";
import { compararMeses } from "./mes.js";
import type { PuntoSerieUsuario } from "./parse-serie.js";
import type { Mes, Punto, PuntoValor, SerieIndice } from "./types.js";

export type PuntoSerieActualizado = {
  punto: Punto;
  valorOriginal: number;
  /** `null` cuando `metodologia` es `sin_proyectar` y este punto necesitaría estimar. */
  valorActualizado: number | null;
  /** El valor salió de una tasa estimada (metodología repite_ultimo o rem), no de un dato directo o de la ventana de referencia. */
  esProyeccion: boolean;
  /** Por qué `valorActualizado` es `null`. `null` cuando sí se pudo resolver. */
  motivo: "futuro" | "ventana_no_cabe" | "ventana_sesgada" | null;
};

export type PuntoActualizado = {
  mes: Mes;
  valorOriginal: number;
  valorActualizado: number;
};

/**
 * Reindexa cada punto de una serie propia contra el IPC.
 *
 * A diferencia de la versión que reemplaza, no descarta en silencio los puntos que
 * necesitarían estimar bajo `sin_proyectar`: los marca con `valorActualizado: null`
 * y el `motivo` (misma respuesta que ya usa el selector de metodología de la
 * calculadora principal, `motivoParaEstimar`) — regla 3 de `AGENTS.md` aplicada a
 * una fila de tabla, no sólo a un control.
 */
export function actualizarSerie(
  datos: PuntoSerieUsuario[],
  mesObjetivo: Mes,
  ipc: SerieIndice,
  opciones: OpcionesAjuste = {},
): PuntoSerieActualizado[] {
  const metodologia = opciones.metodologia ?? "sin_proyectar";

  return datos.map((dato) => {
    const motivo = motivoParaEstimar(dato.punto, mesObjetivo, ipc, opciones.hoy);

    if (metodologia === "sin_proyectar" && motivo !== null) {
      return {
        punto: dato.punto,
        valorOriginal: dato.valor,
        valorActualizado: null,
        esProyeccion: false,
        motivo,
      };
    }

    const resultado = adjust(dato.valor, dato.punto, mesObjetivo, ipc, opciones);
    return {
      punto: dato.punto,
      valorOriginal: dato.valor,
      valorActualizado: resultado.montoAjustado,
      esProyeccion: resultado.metodo.tipo === "proyeccion",
      motivo: null,
    };
  });
}

/**
 * Con qué signo se compone el índice secundario sobre el ajuste del índice base.
 *
 * Fijada por el catálogo del índice secundario (`scripts/indices-secundarios-declarados.ts`),
 * nunca expuesta como control suelto: quien usa el sitio elige un índice por nombre, no una
 * dirección aritmética. Ver `docs/superpowers/specs/2026-08-17-tipo-cambio-real-design.md`,
 * sección "La cuenta", para la derivación completa de por qué el CPI de EE.UU. es
 * `"multiplicar"` y no `"dividir"`.
 */
export type DireccionSecundaria = "multiplicar" | "dividir";

export type PuntoActualizadoDoble = PuntoActualizado & {
  /** Sólo el ajuste por el índice base, sin el secundario — para overlay/comparación. */
  valorSoloBase: number;
};

/**
 * Como `actualizarSerie`, pero compone un segundo índice encima del ajuste del IPC —
 * hoy, el CPI de Estados Unidos, para pasar de "pesos constantes" a "tipo de cambio
 * real bilateral".
 *
 * La cuenta completa (ver el spec, sección "La cuenta"):
 *
 * ```
 * dolarBlue_real(t) = dolarBlue(t) × [IPC_AR(t0)/IPC_AR(t)] × [CPI_US(t)/CPI_US(t0)]
 * ```
 *
 * El primer factor es `adjust()` de siempre (`soloBase`, mismo cálculo que
 * `actualizarSerie`). El segundo se obtiene con la MISMA función `adjust()` pero
 * llamada con `desde`/`hasta` invertidos respecto de cómo se llama para el índice
 * base (`desde=mesObjetivo, hasta=punto.mes` en vez de al revés): así
 * `factorSecundario` da directamente `CPI_US(t)/CPI_US(t0)`, sin escribir a mano un
 * cociente que ya resuelve `adjust()` —empalmes, proyección y `metodologia`
 * incluidos— para el índice secundario.
 */
/**
 * Si `mes` cae antes de donde arranca `serie` — el borde que `motivoParaEstimar` NO
 * cubre.
 *
 * `motivoParaEstimar`/`evaluarPeriodo` (en `adjust.ts`) sólo miden el borde "todavía
 * no se publicó" (hacia adelante, contra `ultimoOficial`); nunca el de "la serie no
 * llega tan atrás". Eso nunca importó para el IPC nacional —arranca en 1990, antes
 * que cualquier otra serie del sitio— pero un índice secundario puede tener un piso
 * más tarde (el CPI de EE.UU. de hoy arranca en 2002, igual que el dólar blue, por
 * pura coincidencia de fechas de corte del pipeline, no por diseño) o, más
 * directamente alcanzable desde la interfaz, la persona puede elegir un mes
 * objetivo anterior a ese piso (el selector de mes objetivo llega hasta 1992). Sin
 * este chequeo, `adjust()` revienta con una `RangoError` sin capturar en vez de
 * simplemente descartar el punto.
 */
function fueraDeCobertura(mes: Mes, serie: SerieIndice): boolean {
  return compararMeses(mes, serie.datos[0]!.mes) < 0;
}

export function actualizarSerieDoble(
  datos: PuntoValor[],
  mesObjetivo: Mes,
  indiceBase: SerieIndice,
  indiceSecundario: SerieIndice,
  direccion: DireccionSecundaria,
): PuntoActualizadoDoble[] {
  // El mes objetivo es el mismo para todos los puntos: si él solo ya cae antes de
  // donde arranca el índice secundario, `adjust()` va a fallar en CUALQUIER punto
  // (el factor secundario siempre lo necesita), así que no tiene sentido evaluar
  // punto por punto — se descartan todos de una.
  if (fueraDeCobertura(mesObjetivo, indiceBase) || fueraDeCobertura(mesObjetivo, indiceSecundario)) {
    return [];
  }

  const salida: PuntoActualizadoDoble[] = [];

  for (const punto of datos) {
    // Ver `fueraDeCobertura`: el borde "la serie no llega tan atrás", que
    // `motivoParaEstimar` no mide.
    if (fueraDeCobertura(punto.mes, indiceBase) || fueraDeCobertura(punto.mes, indiceSecundario)) {
      continue;
    }

    // Si cualquiera de los dos índices necesitaría estimar para este punto, se
    // descarta entero — misma regla que `actualizarSerie` (nunca estimar en
    // silencio), aplicada a los dos índices por igual.
    if (motivoParaEstimar(punto.mes, mesObjetivo, indiceBase) !== null) continue;
    if (motivoParaEstimar(mesObjetivo, punto.mes, indiceSecundario) !== null) continue;

    const soloBase = adjust(punto.valor, punto.mes, mesObjetivo, indiceBase).montoAjustado;
    // Invertido a propósito: ver el comentario de la función.
    const factorSecundario = adjust(1, mesObjetivo, punto.mes, indiceSecundario).montoAjustado;
    const valorActualizado =
      direccion === "multiplicar" ? soloBase * factorSecundario : soloBase / factorSecundario;

    salida.push({
      mes: punto.mes,
      valorOriginal: punto.valor,
      valorSoloBase: soloBase,
      valorActualizado,
    });
  }

  return salida;
}

/**
 * `actualizarSerieDoble` con la dirección fija en `"multiplicar"` — la única que
 * tiene sentido económico para un tipo de cambio real (ver
 * `docs/superpowers/specs/2026-08-17-tipo-cambio-real-design.md`, sección "La
 * cuenta": la primera versión de ese spec tuvo el signo invertido dos veces antes de
 * llegar a código). `/tcr.html` nunca necesita elegir dirección porque sólo compone
 * un índice de precios de otro país sobre una cotización — no hay un segundo caso.
 */
export function calcularTcrBilateral(
  datos: PuntoValor[],
  mesObjetivo: Mes,
  ipc: SerieIndice,
  cpiUs: SerieIndice,
): PuntoActualizadoDoble[] {
  return actualizarSerieDoble(datos, mesObjetivo, ipc, cpiUs, "multiplicar");
}

/**
 * Reescala una serie de valores para que el punto de `mesObjetivo` valga exactamente
 * 100 — usado para superponer el cross-check del BCRA (que es un índice en su propia
 * base) sobre el gráfico de `valorActualizado` (que está en pesos), en un eje
 * secundario. Ver el spec, sección "Overlay de comparación".
 *
 * Si `mesObjetivo` no tiene dato en `datos` (el cross-check no cubre ese mes), se
 * devuelve `[]`: el overlay es un adicional y no un bloqueante, así que la ausencia de
 * ese mes puntual no debería tirar una excepción que le cueste el gráfico entero a
 * `valorActualizado` y `valorSoloBase`.
 */
export function reescalarCrossCheck(datos: PuntoValor[], mesObjetivo: Mes): PuntoValor[] {
  const base = datos.find((p) => p.mes === mesObjetivo)?.valor;
  if (base === undefined || base === 0) return [];
  return datos.map((p) => ({ mes: p.mes, valor: (p.valor / base) * 100 }));
}
