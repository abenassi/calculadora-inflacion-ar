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

export async function llamarTool<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.ARGENTINA_DATA_API_KEY;
  if (!apiKey) {
    throw new McpError(
      "Falta ARGENTINA_DATA_API_KEY. En CI viene del secret; en local, de ~/.secrets/calculadora-inflacion.env",
    );
  }

  const respuesta = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: nombre, arguments: args },
    }),
  });

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
