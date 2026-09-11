import { describe, expect, it } from "vitest";

import { ultimoCambio } from "../scripts/ultimo-cambio.js";

describe("ultimoCambio", () => {
  it("es el `actualizado` más reciente de todas las series, no el del IPC nacional", () => {
    const archivos = [
      { actualizado: "2026-08-15T12:17:36.512Z", ultimo_oficial: "2026-07" }, // IPC nacional
      { actualizado: "2026-09-10T13:06:51.510Z" }, // dólar
      { actualizado: "2026-09-09T15:33:13.591Z" }, // CABA
    ];
    expect(ultimoCambio(archivos)).toBe("2026-09-10T13:06:51.510Z");
  });

  it("ignora los archivos sin `actualizado`", () => {
    expect(ultimoCambio([{ indices: [] }, { actualizado: "2026-09-01T00:00:00.000Z" }])).toBe(
      "2026-09-01T00:00:00.000Z",
    );
  });

  it("falla si ninguna serie trae fecha: mejor sin snapshot que con una fecha inventada", () => {
    expect(() => ultimoCambio([{ indices: [] }])).toThrow();
  });
});
