import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MONEDAS, PESO, monedaEn, monedasDe, monedasDelPeriodo } from "../src/engine/moneda.js";

const nombres = (ms: readonly { nombre: string }[]) => ms.map((m) => m.nombre);

describe("la tabla de monedas", () => {
  it("son las cinco, en orden, con la unidad medida en pesos moneda nacional", () => {
    expect(nombres(MONEDAS)).toEqual([
      "peso moneda nacional",
      "peso ley 18.188",
      "peso argentino",
      "austral",
      "peso",
    ]);
    expect(MONEDAS.map((m) => m.unidad)).toEqual([1, 100, 1e6, 1e9, 1e13]);
  });

  it("cada cambio le saca a la anterior los ceros que fija su norma", () => {
    // Ley 18.188: 1 peso ley = 100 m$n. Ley 22.707: 1 peso argentino = 10.000 pesos ley.
    // Decreto 1096/85: 1 austral = 1.000 pesos argentinos. Decreto 2128/91: 1 peso = 10.000 australes.
    const saltos = MONEDAS.slice(1).map((m, i) => m.unidad / MONEDAS[i]!.unidad);
    expect(saltos).toEqual([100, 10_000, 1_000, 10_000]);
    expect(MONEDAS.map((m) => m.desde)).toEqual([null, "1970-01-01", "1983-06-01", "1985-06-15", "1992-01-01"]);
  });

  it("el peso es la última", () => {
    expect(PESO.nombre).toBe("peso");
  });
});

describe("monedaEn: por día, no por mes", () => {
  it("cae del lado correcto de cada cambio", () => {
    const casos: [string, string][] = [
      ["1968-01-01", "peso moneda nacional"],
      ["1969-12-31", "peso moneda nacional"],
      ["1970-01-01", "peso ley 18.188"],
      ["1983-05-31", "peso ley 18.188"],
      ["1983-06-01", "peso argentino"],
      ["1985-06-14", "peso argentino"],
      ["1985-06-15", "austral"],
      ["1991-12-31", "austral"],
      ["1992-01-01", "peso"],
      ["2026-08-10", "peso"],
    ];
    expect(casos.map(([f]) => [f, monedaEn(f).nombre])).toEqual(casos);
  });
});

describe("monedasDe un punto", () => {
  it("un mes con un cambio a mitad de mes tiene las dos monedas", () => {
    // El austral arranca el 15 de junio de 1985: "un monto de junio 1985" pudo ser cualquiera.
    expect(nombres(monedasDe("1985-06"))).toEqual(["peso argentino", "austral"]);
  });

  it("un cambio el día 1 no parte el mes", () => {
    expect(nombres(monedasDe("1970-01"))).toEqual(["peso ley 18.188"]);
    expect(nombres(monedasDe("1983-06"))).toEqual(["peso argentino"]);
    expect(nombres(monedasDe("1992-01"))).toEqual(["peso"]);
    expect(nombres(monedasDe("1969-12"))).toEqual(["peso moneda nacional"]);
  });

  it("un día tiene una sola", () => {
    expect(nombres(monedasDe("1985-06-14"))).toEqual(["peso argentino"]);
    expect(nombres(monedasDe("1985-06-15"))).toEqual(["austral"]);
  });
});

describe("monedasDelPeriodo", () => {
  it("con las dos puntas en pesos no hay nada que decir", () => {
    expect(monedasDelPeriodo("2024-01", "2025-01", 1234)).toBeNull();
    expect(monedasDelPeriodo("1992-01", "2026-08", 1234)).toBeNull();
  });

  it("1970 → 2026: el resultado en pesos ley, pasado a pesos divide por 10^11", () => {
    const m = monedasDelPeriodo("1970-01", "2026-08", 255323213736518400)!;
    expect(nombres(m.origen)).toEqual(["peso ley 18.188"]);
    expect(nombres(m.destino)).toEqual(["peso"]);
    expect(m.equivalencias).toHaveLength(1);
    expect(m.equivalencias[0]!.a.nombre).toBe("peso");
    expect(m.equivalencias[0]!.monto).toBeCloseTo(2553232.137, 2);
  });

  it("2026 → 1975: el resultado en pesos, pasado a pesos ley multiplica por 10^11", () => {
    const m = monedasDelPeriodo("2026-08", "1975-01", 2.27e-8)!;
    expect(nombres(m.origen)).toEqual(["peso"]);
    expect(nombres(m.destino)).toEqual(["peso ley 18.188"]);
    expect(m.equivalencias[0]!.monto).toBeCloseTo(2270, 6);
  });

  it("1983-05 → 1985-07: de pesos ley a australes divide por 10^7", () => {
    const m = monedasDelPeriodo("1983-05", "1985-07", 230_000)!;
    expect(m.equivalencias.map((e) => [e.de.nombre, e.a.nombre])).toEqual([["peso ley 18.188", "austral"]]);
    expect(m.equivalencias[0]!.monto).toBeCloseTo(0.023, 12);
  });

  it("con las dos puntas en la misma moneda vieja no hay conversión", () => {
    const m = monedasDelPeriodo("1990-01", "1991-06", 16_101)!;
    expect(nombres(m.origen)).toEqual(["austral"]);
    expect(nombres(m.destino)).toEqual(["austral"]);
    expect(m.equivalencias).toEqual([]);
  });

  it("con una punta en junio de 1985 da las dos conversiones", () => {
    const m = monedasDelPeriodo("1985-06", "2026-08", 1e12)!;
    expect(m.equivalencias.map((e) => [e.de.nombre, e.a.nombre, e.monto])).toEqual([
      ["peso argentino", "peso", 1e5],
      ["austral", "peso", 1e8],
    ]);
  });
});

describe("PRIMER_ANIO_EN_PESOS", () => {
  // Está copiado en tres archivos a propósito —dos son entry points de Vite que no comparten
  // módulo, y el generador de páginas corre aparte—, así que no se importa de acá. Lo que no
  // puede pasar es que alguno diga un año distinto del que dice la tabla.
  const archivos = ["scripts/generar-paginas.ts", "src/ui/tcr-main.ts", "src/ui/actualizar-main.ts"];

  it("coincide en los tres archivos con el año en que arranca el peso", () => {
    expect(PESO.desde).toMatch(/-01-01$/);
    const anioDelPeso = Number(PESO.desde!.slice(0, 4));
    for (const archivo of archivos) {
      const texto = readFileSync(resolve(import.meta.dirname, "..", archivo), "utf8");
      const valor = /const PRIMER_ANIO_EN_PESOS = (\d+);/.exec(texto)?.[1];
      expect(Number(valor), archivo).toBe(anioDelPeso);
    }
  });
});
