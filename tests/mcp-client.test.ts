import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { llamarTool, McpError } from "../scripts/mcp-client.js";

/** Una respuesta del MCP como la sirve de verdad: SSE con el payload doblemente serializado. */
function respuestaOk(payload: unknown): Response {
  const sobre = {
    jsonrpc: "2.0",
    id: 1,
    result: { content: [{ type: "text", text: JSON.stringify(payload) }] },
  };
  return new Response(`event: message\ndata: ${JSON.stringify(sobre)}\n\n`, { status: 200 });
}

/** El `fetch failed` de undici: el motivo real vive en `cause`, no en el mensaje. */
function fallaDeRed(motivo: string): TypeError {
  return Object.assign(new TypeError("fetch failed"), { cause: new Error(motivo) });
}

/** Corre la llamada dejando que los timers de las esperas entre reintentos pasen solos. */
async function correr<T>(promesa: Promise<T>): Promise<T> {
  const resuelta = promesa.then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, e }),
  );
  await vi.advanceTimersByTimeAsync(60_000);
  const r = await resuelta;
  if (!r.ok) throw r.e;
  return r.v;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("ARGENTINA_DATA_API_KEY", "key-de-test");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("llamarTool: reintentos", () => {
  it("reintenta una falla de red y devuelve lo que trae el intento siguiente", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(fallaDeRed("ECONNRESET"))
      .mockResolvedValueOnce(respuestaOk({ series: [{ serie_id: "bcra:27" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await correr(llamarTool<{ series: unknown[] }>("series", { ids: ["bcra:27"] }));

    expect(r.series).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reintenta los 5xx y los 429, que son transitorios", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("upstream caído", { status: 502 }))
      .mockResolvedValueOnce(new Response("frená", { status: 429 }))
      .mockResolvedValueOnce(respuestaOk({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await correr(llamarTool("series", {}));

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // Los dos comparten rama hoy (`status < 500`), pero el comentario de `postear()`
  // promete los dos casos por separado: si alguien los separa para loguearlos distinto,
  // que no se le escape uno reintentando.
  it.each([
    [401, "la key mal"],
    [400, "los argumentos inválidos"],
  ])("no reintenta un %i: %s no se arregla esperando", async (status) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("nope", { status }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(correr(llamarTool("series", {}))).rejects.toThrow(McpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tras agotar los intentos falla contando el motivo real, no un 'fetch failed' pelado", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(fallaDeRed("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(correr(llamarTool("series", {}))).rejects.toThrow(/ECONNRESET/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  /**
   * No verifica que el corte sea a los 30 segundos: `AbortSignal.timeout` corre sobre los
   * timers internos de Node, que los fake timers de vitest no manejan (comprobado), y con
   * timers de verdad el test tardaría medio minuto. Lo que ata es que cada intento salga
   * con su propio techo: el modo de falla real no es que el número esté mal, es que un
   * refactor se lleve puesto el `signal` y nadie se entere hasta que un `fetch` colgado se
   * coma un job entero.
   */
  it("le pone a cada intento su propio techo de tiempo", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(fallaDeRed("ECONNRESET"))
      .mockResolvedValueOnce(respuestaOk({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await correr(llamarTool("series", {}));

    const señales = fetchMock.mock.calls.map(([, init]) => init?.signal);
    expect(señales).toHaveLength(2);
    for (const señal of señales) {
      expect(señal).toBeInstanceOf(AbortSignal);
      // Fresca, no la del intento anterior: reusarla haría que el segundo intento naciera
      // ya abortado en cuanto el primero se hubiera comido el techo.
      expect(señal!.aborted).toBe(false);
    }
    expect(señales[0]).not.toBe(señales[1]);
  });
});
