import { describe, expect, it } from "vitest";
import { empalmar, EmpalmeError, type PuntoCrudo } from "../src/engine/splice.js";

/** Variación mensual del 10% clavada, de `desde` a `hasta` inclusive. */
function varConstante(desde: string, hasta: string, pct: number): PuntoCrudo[] {
  const puntos: PuntoCrudo[] = [];
  const [a0, m0] = desde.split("-").map(Number) as [number, number];
  const [a1, m1] = hasta.split("-").map(Number) as [number, number];
  for (let o = a0 * 12 + m0 - 1; o <= a1 * 12 + m1 - 1; o++) {
    puntos.push({
      mes: `${String(Math.floor(o / 12)).padStart(4, "0")}-${String((o % 12) + 1).padStart(2, "0")}`,
      valor: pct,
    });
  }
  return puntos;
}

describe("empalmar", () => {
  const indec: PuntoCrudo[] = [
    { mes: "2016-12", valor: 100 },
    { mes: "2017-01", valor: 102 },
    { mes: "2017-02", valor: 104 },
  ];

  it("ancla el índice en 100 en el primer mes del INDEC", () => {
    const r = empalmar(varConstante("1990-01", "2017-02", 1), indec);
    expect(r.find((p) => p.mes === "2016-12")!.indice).toBeCloseTo(100, 10);
  });

  it("retropola hacia atrás dividiendo por la variación del mes siguiente", () => {
    // Con 10% mensual, noviembre 2016 tiene que valer 100 / 1,1.
    const r = empalmar(varConstante("2016-01", "2017-02", 10), indec);
    expect(r.find((p) => p.mes === "2016-11")!.indice).toBeCloseTo(100 / 1.1, 10);
    expect(r.find((p) => p.mes === "2016-10")!.indice).toBeCloseTo(100 / 1.1 / 1.1, 10);
  });

  it("marca el origen de cada punto", () => {
    const r = empalmar(varConstante("2016-01", "2017-02", 5), indec);
    expect(r.find((p) => p.mes === "2016-11")!.origen).toBe("bcra");
    expect(r.find((p) => p.mes === "2016-12")!.origen).toBe("indec");
    expect(r.find((p) => p.mes === "2017-01")!.origen).toBe("indec");
  });

  it("devuelve una serie continua, ordenada y sin duplicados", () => {
    const r = empalmar(varConstante("2010-01", "2017-02", 2), indec);
    const meses = r.map((p) => p.mes);
    expect(meses).toEqual([...meses].sort());
    expect(new Set(meses).size).toBe(meses.length);
    expect(meses[0]).toBe("2010-01");
    expect(meses.at(-1)).toBe("2017-02");
  });

  it("reescala si el INDEC cambiara de base", () => {
    const otraBase: PuntoCrudo[] = [
      { mes: "2016-12", valor: 50 },
      { mes: "2017-01", valor: 51 },
    ];
    const r = empalmar(varConstante("2016-10", "2017-01", 1), otraBase);
    expect(r.find((p) => p.mes === "2016-12")!.indice).toBeCloseTo(100, 10);
    // El cociente entre meses tiene que sobrevivir al reescalado.
    const ene = r.find((p) => p.mes === "2017-01")!.indice;
    expect(ene / 100).toBeCloseTo(51 / 50, 10);
  });

  it("preserva variaciones negativas en vez de aplanarlas", () => {
    const r = empalmar(varConstante("2016-06", "2017-02", -0.5), indec);
    const nov = r.find((p) => p.mes === "2016-11")!.indice;
    expect(nov).toBeGreaterThan(100); // deflación hacia adelante ⇒ el pasado valía más
  });

  it("no tiende puentes: si al BCRA le falta el mes del ancla, no retropola nada", () => {
    // El BCRA termina en 2016-06 y el ancla es dic-2016. Para caminar hacia atrás
    // hacen falta variaciones contiguas desde el ancla, así que no hay forma de
    // llegar a 2016-06 sin inventar los meses del medio. Preferimos una serie
    // corta y verdadera antes que una larga y estimada en silencio.
    const r = empalmar(varConstante("1990-01", "2016-06", 1), indec);
    expect(r[0]!.mes).toBe("2016-12");
    expect(r.every((p) => p.origen === "indec")).toBe(true);
    expect(r.every((p) => Number.isFinite(p.indice))).toBe(true);
  });

  it("rechaza una serie del BCRA con huecos", () => {
    const conHueco: PuntoCrudo[] = [
      { mes: "2016-10", valor: 1 },
      { mes: "2016-12", valor: 1 },
    ];
    expect(() => empalmar(conHueco, indec)).toThrow(EmpalmeError);
    expect(() => empalmar(conHueco, indec)).toThrow(/hueco/);
  });

  it("rechaza una serie vacía", () => {
    expect(() => empalmar([], indec)).toThrow(EmpalmeError);
    expect(() => empalmar(varConstante("2016-01", "2017-02", 1), [])).toThrow(EmpalmeError);
  });

  it("rechaza una variación de -100% o peor, que implicaría precios nulos", () => {
    const imposible = varConstante("2016-10", "2017-02", -100);
    expect(() => empalmar(imposible, indec)).toThrow(/imposible/);
  });
});
