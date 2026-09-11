import { describe, expect, it } from "vitest";

import {
  CIFRAS_MINIMAS,
  cifrasQueTrae,
  esRepresentable,
  recortarRepresentable,
} from "../scripts/recorte-representable.js";
import { INDICES } from "../scripts/indices-declarados.js";

const p = (mes: string, valor: number) => ({ mes, valor });

describe("cifrasQueTrae", () => {
  it("cuenta las cifras de un float completo, como el que sirve Córdoba desde 1968", () => {
    // `4.332726297657377e-13` trae 16 cifras: no le falta nada para un cociente.
    expect(cifrasQueTrae(4.332726297657377e-13)).toBe(16);
  });

  it("cuenta las de un valor redondeado a ocho decimales (Córdoba 1989-07 a 1990-02)", () => {
    expect(cifrasQueTrae(0.00126139)).toBe(6);
  });

  it("a un valor con seis decimales o menos le cuenta seis: el MCP tiraba los ceros finales", () => {
    // `0.01064` se guardó como `0.010640`: son cinco cifras, no cuatro.
    expect(cifrasQueTrae(0.01064)).toBe(5);
    // Las filas viejas de Chaco, Mendoza y Tucumán: `0.000001` es una sola cifra.
    expect(cifrasQueTrae(0.000001)).toBe(1);
    expect(cifrasQueTrae(0.001234)).toBe(4);
  });

  it("un valor grande tiene cifras de sobra", () => {
    expect(cifrasQueTrae(16746051448071.4)).toBeGreaterThanOrEqual(CIFRAS_MINIMAS);
    expect(cifrasQueTrae(1e21)).toBeGreaterThanOrEqual(CIFRAS_MINIMAS);
  });

  it("un cero, un negativo o algo que no es un número no traen ninguna cifra que sirva", () => {
    expect(cifrasQueTrae(0)).toBe(0);
    expect(cifrasQueTrae(-0.5)).toBe(0);
    expect(cifrasQueTrae(Number.NaN)).toBe(0);
    expect(cifrasQueTrae(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("los decimales con los que publica la fuente", () => {
  /**
   * Córdoba publica 1989-07 a 1990-02 redondeado a ocho decimales. Si la provincia revisa uno
   * y termina en "00", `0.00126100` llega como `0.001261`: con el piso de seis cuenta cuatro
   * cifras y el corte se lleva 1968-1989 entero. El snapshot no puede encoger, así que Córdoba
   * se quedaba congelada con los datos de ayer.
   */
  it("un cero final de una serie a ocho decimales no es una cifra perdida", () => {
    expect(cifrasQueTrae(0.001261)).toBe(4);
    expect(cifrasQueTrae(0.001261, 8)).toBe(6);
    expect(esRepresentable(0.001261, 8)).toBe(true);
  });

  it("el piso nunca baja de seis, aunque se declaren menos", () => {
    expect(cifrasQueTrae(0.01064, 2)).toBe(5);
  });

  it("el recorte usa ese piso", () => {
    const s = [p("1968-01", 4.332726297657377e-13), p("1989-07", 0.001261), p("1990-03", 0.01661473)];
    expect(recortarRepresentable(s, "cordoba", 8)).toEqual(s);
    expect(recortarRepresentable(s, "cordoba").map((x) => x.mes)).toEqual(["1990-03"]);
  });

  it("Córdoba declara sus ocho decimales", () => {
    expect(INDICES.find((i) => i.slug === "cordoba")?.decimalesDeLaFuente).toBe(8);
  });
});

describe("esRepresentable", () => {
  it("el borde exacto: cinco cifras pasa, cuatro no", () => {
    expect(CIFRAS_MINIMAS).toBe(5);
    // Con seis decimales, 0,01 es exactamente el borde: el mismo corte que había por valor.
    expect(esRepresentable(0.01)).toBe(true);
    expect(esRepresentable(0.009999)).toBe(false);
    // Con más decimales el borde se corre: 0,00012345 trae cinco cifras y alcanza.
    expect(esRepresentable(0.00012345)).toBe(true);
    expect(esRepresentable(0.0001234)).toBe(false);
  });

  it("cero, negativo y no finito nunca: son una división por cero o un signo imposible", () => {
    expect(esRepresentable(0)).toBe(false);
    expect(esRepresentable(-0.0166)).toBe(false);
    expect(esRepresentable(Number.NaN)).toBe(false);
    expect(esRepresentable(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("recortarRepresentable", () => {
  it("conserva entera una serie con el float completo, aunque arranque en 1e-13", () => {
    const s = [p("1968-01", 4.332726297657377e-13), p("1989-07", 0.00126139), p("2026-08", 130.69720219)];
    expect(recortarRepresentable(s, "cordoba")).toEqual(s);
  });

  it("corta la de seis decimales donde tenía que cortar antes", () => {
    const s = [p("1988-06", 0.000812), p("1988-07", 0.009843), p("1988-08", 0.01064), p("2026-06", 900)];
    expect(recortarRepresentable(s, "chaco").map((x) => x.mes)).toEqual(["1988-08", "2026-06"]);
  });

  it("corta desde el ÚLTIMO punto sin cifras, no desde el primero con cifras", () => {
    // Si detrás de un punto bueno aparece uno malo, lo anterior queda bajo sospecha.
    // Floats completos, como los sirve Córdoba: un `4.37e-13` escrito así trae tres cifras y
    // se cortaría con razón.
    const s = [
      p("1968-01", 4.332726297657377e-13),
      p("1968-02", 0),
      p("1968-03", 4.371505784454961e-13),
      p("1968-04", 4.3679803765642715e-13),
    ];
    expect(recortarRepresentable(s, "test").map((x) => x.mes)).toEqual(["1968-03", "1968-04"]);
  });

  it("corta en un negativo o un no finito", () => {
    const s = [p("2000-01", 10), p("2000-02", -1), p("2000-03", 11), p("2000-04", Number.NaN), p("2000-05", 12)];
    expect(recortarRepresentable(s, "test").map((x) => x.mes)).toEqual(["2000-05"]);
  });

  it("explota si no queda nada", () => {
    expect(() => recortarRepresentable([p("1968-01", 0.000001)], "test")).toThrow(/cifras/);
  });
});
