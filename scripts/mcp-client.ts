/**
 * Cliente mínimo de Argentina Data MCP.
 *
 * El endpoint habla JSON-RPC 2.0 por HTTP POST, sin handshake de sesión: se puede
 * llamar `tools/call` directo. La respuesta viene enmarcada como Server-Sent Events
 * (`event: message\ndata: {...}`), y el payload útil está doblemente serializado:
 * el `result.content[0].text` es a su vez un JSON string.
 *
 * Se usa sólo desde el pipeline (GitHub Actions). Nunca desde el browser: la API key
 * no debe salir del entorno de CI.
 */

const ENDPOINT = process.env.ARGENTINA_DATA_URL ?? "https://argentinadata.mymcps.dev/mcp";

/**
 * Techo por intento. Sin esto, una conexión que se cuelga sin cerrar deja el job de
 * Actions esperando hasta el límite de seis horas por un pipeline que tarda medio minuto.
 */
const TIMEOUT_MS = 30_000;

/**
 * Esperas entre reintentos (tres intentos en total).
 *
 * El 2026-08-28 la corrida diaria se cayó entera con un `fetch failed` pelado a los
 * nueve segundos: una falla de red de un instante, sin nada roto de nuestro lado ni
 * del MCP —la misma bajada corrió bien a mano un rato después—. Como el pipeline no
 * reintentaba, el snapshot del día no se actualizó y llegó un mail de build roto por
 * algo que se arregla solo. Reintentar sale mucho más barato que perder el día.
 */
const ESPERAS_MS = [2_000, 6_000];

export class McpError extends Error {}

type RespuestaJsonRpc = {
  result?: { content?: { type: string; text: string }[]; isError?: boolean };
  error?: { code: number; message: string };
};

/** Extrae el primer payload `data:` de una respuesta enmarcada en SSE. */
function desenmarcarSse(cuerpo: string): string {
  for (const linea of cuerpo.split("\n")) {
    if (linea.startsWith("data:")) return linea.slice("data:".length).trim();
  }
  // Algunos despliegues responden JSON pelado; lo aceptamos sin ceremonia.
  const plano = cuerpo.trim();
  if (plano.startsWith("{")) return plano;
  throw new McpError(`Respuesta del MCP sin payload reconocible: ${cuerpo.slice(0, 200)}`);
}

/**
 * `fetch` de undici tira siempre el mismo "fetch failed" y guarda el motivo real
 * (ECONNRESET, DNS, timeout de conexión) en `cause`. Sin desenvolverlo, el log del
 * workflow no dice absolutamente nada sobre por qué se cayó la corrida.
 */
function describirFalla(e: unknown): string {
  const err = e as Error & { cause?: unknown };
  const causa = err?.cause instanceof Error ? `: ${err.cause.message}` : "";
  return `${err?.message ?? String(e)}${causa}`;
}

const dormir = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

/**
 * POST con reintentos ante fallas transitorias.
 *
 * Se reintenta lo que puede andar bien en el intento siguiente: errores de red y
 * respuestas 429 o 5xx. Un 401 (key mal) o un 400 (argumentos inválidos) no mejoran
 * esperando, así que vuelven en el acto para fallar ruidosamente.
 */
async function postear(nombre: string, cuerpo: string, apiKey: string): Promise<Response> {
  let motivo = "";

  for (let intento = 0; intento <= ESPERAS_MS.length; intento++) {
    if (intento > 0) {
      const espera = ESPERAS_MS[intento - 1]!;
      console.warn(
        `  ${nombre}: ${motivo} — reintento ${intento} de ${ESPERAS_MS.length} en ${espera / 1000}s`,
      );
      await dormir(espera);
    }

    let respuesta: Response;
    try {
      respuesta = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: cuerpo,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e: unknown) {
      motivo = describirFalla(e);
      continue;
    }

    if (respuesta.status !== 429 && respuesta.status < 500) return respuesta;
    // Leer el cuerpo también libera el socket, que si no queda tomado hasta el final.
    const detalle = (await respuesta.text().catch(() => "")).slice(0, 200).trim();
    motivo = `HTTP ${respuesta.status} ${respuesta.statusText}${detalle ? ` — ${detalle}` : ""}`;
  }

  throw new McpError(`${nombre}: ${motivo} (tras ${ESPERAS_MS.length + 1} intentos)`);
}

export async function llamarTool<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.ARGENTINA_DATA_API_KEY;
  if (!apiKey) {
    throw new McpError(
      "Falta ARGENTINA_DATA_API_KEY. En CI viene del secret; en local, de ~/.secrets/calculadora-inflacion.env",
    );
  }

  const respuesta = await postear(
    nombre,
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: nombre, arguments: args },
    }),
    apiKey,
  );

  if (!respuesta.ok) {
    throw new McpError(`${nombre}: HTTP ${respuesta.status} ${respuesta.statusText}`);
  }

  const sobre = JSON.parse(desenmarcarSse(await respuesta.text())) as RespuestaJsonRpc;
  if (sobre.error) throw new McpError(`${nombre}: ${sobre.error.message} (code ${sobre.error.code})`);

  const texto = sobre.result?.content?.[0]?.text;
  if (texto === undefined) throw new McpError(`${nombre}: la respuesta no trae contenido`);
  if (sobre.result?.isError) throw new McpError(`${nombre}: ${texto}`);

  return JSON.parse(texto) as T;
}

export type RespuestaSeries = {
  series: {
    serie_id: string;
    nombre: string;
    fuente: string;
    unidad: string;
    fecha_fin: string;
    datos: { fecha: string; valor: number }[];
  }[];
};

/** Trae una serie y devuelve sus puntos crudos, verificando que no venga vacía. */
export async function traerSerie(
  id: string,
  extra: Record<string, unknown> = {},
): Promise<RespuestaSeries["series"][number]> {
  const r = await llamarTool<RespuestaSeries>("series", { ids: [id], ...extra });
  const serie = r.series?.[0];
  if (!serie) throw new McpError(`La serie ${id} no vino en la respuesta`);
  if (!serie.datos?.length) throw new McpError(`La serie ${id} vino sin datos`);
  return serie;
}

export type RespuestaDolarHistorico = {
  tipo: string;
  fuente: string;
  datos: {
    fecha: string;
    compra: number | null;
    venta: number;
    periodo_incompleto?: boolean;
  }[];
};

/**
 * Trae la serie histórica de un tipo de dólar. Es un tool aparte de `series`
 * (`dolar_historico`), así que `traerSerie` no sirve para esto.
 */
export async function traerDolarHistorico(
  tipo: string,
  extra: Record<string, unknown> = {},
): Promise<RespuestaDolarHistorico> {
  const r = await llamarTool<RespuestaDolarHistorico>("dolar_historico", { tipo, ...extra });
  if (!r.datos?.length) throw new McpError(`dolar_historico(${tipo}) vino sin datos`);
  return r;
}
