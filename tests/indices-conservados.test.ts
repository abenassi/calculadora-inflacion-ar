import { describe, expect, it } from "vitest";

import type { EntradaCatalogo } from "../src/engine/indices.js";
import { entradaDeCatalogo, INDICES } from "../scripts/indices-declarados.js";
import { ARCHIVO_CONSERVADOS, avisosDeConservados } from "../scripts/indices-conservados.js";

describe("avisosDeConservados", () => {
  it("sin índices conservados no hay aviso", () => {
    expect(avisosDeConservados("[]")).toEqual([]);
  });

  it("nombra el índice y el motivo, con la marca que GitHub pinta de rojo", () => {
    const lista = JSON.stringify([
      { slug: "cordoba", nombre: "Córdoba", motivo: "indices/cordoba.json: el snapshot nuevo tiene 438 entradas y el vigente 704." },
    ]);
    // "Quedó con los datos de la corrida anterior", no "quedó publicado": este paso corre también
    // cuando fallaron los tests y no se publicó nada.
    expect(avisosDeConservados(lista)).toEqual([
      "::error::Córdoba (cordoba) no se actualizó y quedó con los datos de la corrida anterior. " +
        "Motivo: indices/cordoba.json: el snapshot nuevo tiene 438 entradas y el vigente 704.",
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
    expect(avisosDeConservados(lista)[0]).toContain("no se actualizó y quedó fuera del catálogo.");
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

describe("entradaDeCatalogo", () => {
  /**
   * Un índice conservado el mismo día que cambia su `cubre` declarado dejaba en el catálogo el
   * texto viejo, el test que ata el catálogo a la declaración frenaba todo el snapshot —también el
   * IPC nacional— y el rojo que se veía era un `toEqual` sobre un texto. De la corrida anterior sólo
   * sirve lo que sale de los datos.
   */
  it("de la entrada anterior toma sólo el rango de los datos; los textos salen de la declaración", () => {
    const decl = INDICES.find((i) => i.slug === "cordoba")!;
    const previa: EntradaCatalogo = {
      slug: "cordoba",
      nombre: "Córdoba (viejo)",
      tipo: "region",
      enElSelector: "texto viejo",
      cubre: "Índice provincial de Córdoba, con datos desde 1990.",
      organismos: ["OTRO"],
      primerMes: "1990-01",
      ultimoOficial: "2026-07",
    };
    expect(entradaDeCatalogo(decl, previa)).toEqual({
      slug: "cordoba",
      nombre: decl.nombre,
      tipo: decl.tipo,
      cubre: decl.cubre,
      organismos: [decl.organismoCorto],
      primerMes: "1990-01",
      ultimoOficial: "2026-07",
    });
  });

  it("lleva enElSelector sólo si la declaración lo tiene", () => {
    const region = INDICES.find((i) => i.enElSelector)!;
    const entrada = entradaDeCatalogo(region, { primerMes: "2016-12", ultimoOficial: "2026-07" });
    expect(entrada.enElSelector).toBe(region.enElSelector);
  });
});
