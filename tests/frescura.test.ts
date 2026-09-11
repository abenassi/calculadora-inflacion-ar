import { describe, expect, it } from "vitest";

import { datoAtrasado } from "../scripts/frescura.js";

describe("datoAtrasado", () => {
  it("dos meses de atraso es lo normal: el INDEC publica agosto a mediados de septiembre", () => {
    expect(datoAtrasado("2026-07", "2026-09")).toBe(false);
    expect(datoAtrasado("2026-08", "2026-09")).toBe(false);
  });

  it("tres meses quiere decir que se perdió una publicación entera", () => {
    expect(datoAtrasado("2026-07", "2026-10")).toBe(true);
  });

  it("cruza el cambio de año sin confundirse", () => {
    expect(datoAtrasado("2026-11", "2027-01")).toBe(false);
    expect(datoAtrasado("2026-11", "2027-02")).toBe(true);
  });

  it("vale también para la encuesta del REM, que sale a principios del mes siguiente", () => {
    // La encuesta de agosto se publica a principios de septiembre: a principios de octubre
    // todavía puede faltar la de septiembre, y en noviembre quiere decir que se perdió al
    // menos una.
    expect(datoAtrasado("2026-08", "2026-10")).toBe(false);
    expect(datoAtrasado("2026-08", "2026-11")).toBe(true);
  });
});
