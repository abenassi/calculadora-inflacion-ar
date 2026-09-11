import { describe, expect, it } from "vitest";

import { ARCHIVO_CONSERVADOS, avisosDeConservados } from "../scripts/indices-conservados.js";

describe("avisosDeConservados", () => {
  it("sin índices conservados no hay aviso", () => {
    expect(avisosDeConservados("[]")).toEqual([]);
  });

  it("nombra el índice y el motivo, con la marca que GitHub pinta de rojo", () => {
    const lista = JSON.stringify([
      { slug: "cordoba", nombre: "Córdoba", motivo: "indices/cordoba.json: el snapshot nuevo tiene 438 entradas y el vigente 704." },
    ]);
    expect(avisosDeConservados(lista)).toEqual([
      "::error::Córdoba (cordoba) no se actualizó en esta corrida y quedó publicado con los datos de la " +
        "anterior. Motivo: indices/cordoba.json: el snapshot nuevo tiene 438 entradas y el vigente 704.",
    ]);
  });

  it("un motivo con saltos de línea o porcentajes no rompe la anotación", () => {
    const lista = JSON.stringify([{ slug: "x", nombre: "X", motivo: "falló\nal 100%" }]);
    const [aviso] = avisosDeConservados(lista);
    expect(aviso).not.toContain("\n");
    expect(aviso).toContain("falló al 100%25");
  });

  it("si no había entrada anterior que conservar, dice que quedó fuera del catálogo", () => {
    const lista = JSON.stringify([{ slug: "chaco", nombre: "Chaco", motivo: "sin datos", fueraDelCatalogo: true }]);
    expect(avisosDeConservados(lista)[0]).toContain("no se actualizó en esta corrida y quedó fuera del catálogo.");
  });

  it("si la lista no está, avisa en vez de dar la corrida por buena", () => {
    const avisos = avisosDeConservados(null);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/^::error::/);
    expect(avisos[0]).toContain(ARCHIVO_CONSERVADOS);
  });

  it("la lista vive fuera de public/, para que nunca se commitee con los datos", () => {
    expect(ARCHIVO_CONSERVADOS.startsWith("public/")).toBe(false);
  });
});
