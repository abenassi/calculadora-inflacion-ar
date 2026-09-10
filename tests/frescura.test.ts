import { describe, expect, it } from "vitest";

import { ipcAtrasado } from "../scripts/frescura.js";

describe("ipcAtrasado", () => {
  it("dos meses de atraso es lo normal: el INDEC publica agosto a mediados de septiembre", () => {
    expect(ipcAtrasado("2026-07", "2026-09")).toBe(false);
    expect(ipcAtrasado("2026-08", "2026-09")).toBe(false);
  });

  it("tres meses quiere decir que se perdió una publicación entera", () => {
    expect(ipcAtrasado("2026-07", "2026-10")).toBe(true);
  });

  it("cruza el cambio de año sin confundirse", () => {
    expect(ipcAtrasado("2026-11", "2027-01")).toBe(false);
    expect(ipcAtrasado("2026-11", "2027-02")).toBe(true);
  });
});
