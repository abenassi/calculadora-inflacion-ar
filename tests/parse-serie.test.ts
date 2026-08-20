import { describe, expect, it } from "vitest";
import { parsearSerie } from "../src/engine/parse-serie.js";

describe("parsearSerie: fechas", () => {
  it("acepta mes ISO (YYYY-MM)", () => {
    const r = parsearSerie("2024-01\t100\n2024-02\t110");
    expect(r.puntos).toEqual([
      { punto: "2024-01", valor: 100 },
      { punto: "2024-02", valor: 110 },
    ]);
    expect(r.errores).toEqual([]);
  });

  it("acepta fecha ISO completa (YYYY-MM-DD)", () => {
    const r = parsearSerie("2024-01-15\t100");
    expect(r.puntos).toEqual([{ punto: "2024-01-15", valor: 100 }]);
  });

  it("acepta DD/MM/YYYY, nunca MM/DD", () => {
    // 03/04/2024 es el 3 de abril, no el 4 de marzo.
    const r = parsearSerie("03/04/2024\t100");
    expect(r.puntos).toEqual([{ punto: "2024-04-03", valor: 100 }]);
  });

  it("acepta MM/YYYY", () => {
    const r = parsearSerie("04/2024\t100");
    expect(r.puntos).toEqual([{ punto: "2024-04", valor: 100 }]);
  });

  it("rechaza una fecha con mes o día imposible en cualquier lectura", () => {
    const r = parsearSerie("2024-01\t100\n32/13/2024\t100");
    expect(r.puntos).toHaveLength(1);
    expect(r.errores).toEqual([{ linea: 2, motivo: 'fecha no reconocida: "32/13/2024"' }]);
  });

  it("rechaza el 31 de abril (día que no existe en ese mes)", () => {
    const r = parsearSerie("31/04/2024\t100");
    expect(r.puntos).toEqual([]);
    expect(r.errores).toHaveLength(1);
  });

  it("rechaza un año claramente implausible, aunque el formato sea válido", () => {
    const r = parsearSerie("2024-01\t100\n9999-12\t100");
    expect(r.puntos).toHaveLength(1);
    expect(r.errores).toEqual([{ linea: 2, motivo: 'fecha no reconocida: "9999-12"' }]);
  });
});

describe("parsearSerie: valores", () => {
  it("acepta decimal con punto", () => {
    expect(parsearSerie("2024-01\t1234.56").puntos[0]!.valor).toBeCloseTo(1234.56, 6);
  });

  it("acepta decimal con coma", () => {
    expect(parsearSerie("2024-01\t1234,56").puntos[0]!.valor).toBeCloseTo(1234.56, 6);
  });

  it("acepta miles con punto y decimal con coma", () => {
    expect(parsearSerie("2024-01\t1.234,56").puntos[0]!.valor).toBeCloseTo(1234.56, 6);
  });

  it("acepta miles con coma y decimal con punto", () => {
    expect(parsearSerie("2024-01\t1,234.56").puntos[0]!.valor).toBeCloseTo(1234.56, 6);
  });

  it("un solo punto con 3 dígitos después es separador de miles, no decimal", () => {
    expect(parsearSerie("2024-01\t1.234").puntos[0]!.valor).toBe(1234);
  });

  it("una sola coma con 3 dígitos después es separador de miles, no decimal", () => {
    expect(parsearSerie("2024-01\t1,234").puntos[0]!.valor).toBe(1234);
  });

  it("un solo punto con 1 o 2 dígitos después es decimal", () => {
    expect(parsearSerie("2024-01\t1234.5").puntos[0]!.valor).toBeCloseTo(1234.5, 6);
  });

  it("varios puntos repetidos son siempre separador de miles (un decimal no se repite)", () => {
    expect(parsearSerie("2024-01\t1.234.567").puntos[0]!.valor).toBe(1234567);
  });

  it("miles y decimales combinados con dos grupos de miles", () => {
    expect(parsearSerie("2024-01\t1.234.567,89").puntos[0]!.valor).toBeCloseTo(1234567.89, 6);
  });

  it("rechaza un valor con 4+ dígitos después de un único separador", () => {
    const r = parsearSerie("2024-01\t1.23456");
    expect(r.puntos).toEqual([]);
    expect(r.errores[0]!.motivo).toMatch(/valor no reconocido/);
  });

  it("rechaza texto que no es un número", () => {
    const r = parsearSerie("2024-01\tabc");
    expect(r.errores[0]!.motivo).toMatch(/valor no reconocido/);
  });
});

describe("parsearSerie: separadores de campo", () => {
  it("detecta tab", () => {
    expect(parsearSerie("2024-01\t100").puntos).toHaveLength(1);
  });

  it("detecta coma cuando no hay tab", () => {
    expect(parsearSerie("2024-01,100").puntos).toHaveLength(1);
  });

  it("detecta punto y coma cuando no hay tab ni coma", () => {
    expect(parsearSerie("2024-01;100").puntos).toHaveLength(1);
  });

  it("con separador coma, un valor con coma decimal se resuelve por el PRIMER corte", () => {
    // "2024-01,1.234,56": el primer "," separa fecha de valor; el resto ("1.234,56")
    // es el valor completo, no un tercer campo.
    const r = parsearSerie("2024-01,1.234,56");
    expect(r.puntos).toEqual([{ punto: "2024-01", valor: 1234.56 }]);
  });

  it("una línea sin ningún separador reconocible es inválida", () => {
    const r = parsearSerie("2024-01 100");
    expect(r.puntos).toEqual([]);
    expect(r.errores).toHaveLength(1);
  });

  it("con separador punto y coma y valor con coma decimal, no confunde la coma con el separador de campo", () => {
    // El CSV que exporta Excel/Sheets en configuración Argentina/España.
    const r = parsearSerie("15/01/2024;1234,56");
    expect(r.puntos).toEqual([{ punto: "2024-01-15", valor: 1234.56 }]);
    expect(r.errores).toEqual([]);
  });

  it("con separador punto y coma y valor con miles y decimal (Excel AR completo)", () => {
    const r = parsearSerie("2024-01;1.234,56");
    expect(r.puntos).toEqual([{ punto: "2024-01", valor: 1234.56 }]);
  });
});

describe("parsearSerie: encabezado, duplicados, líneas vacías", () => {
  it("descarta un encabezado en la primera línea sin marcarlo como error", () => {
    const r = parsearSerie("fecha\tvalor\n2024-01\t100");
    expect(r.puntos).toEqual([{ punto: "2024-01", valor: 100 }]);
    expect(r.errores).toEqual([]);
  });

  it("un error genuino en la primera línea SÍ se reporta si la fecha parsea pero el valor no", () => {
    const r = parsearSerie("2024-01\tabc\n2024-02\t100");
    expect(r.puntos).toEqual([{ punto: "2024-02", valor: 100 }]);
    expect(r.errores).toEqual([{ linea: 1, motivo: 'valor no reconocido: "abc"' }]);
  });

  it("ignora líneas vacías sin reportarlas como error", () => {
    const r = parsearSerie("2024-01\t100\n\n2024-02\t110\n");
    expect(r.puntos).toHaveLength(2);
    expect(r.errores).toEqual([]);
  });

  it("una fecha repetida se descarta y se avisa, se queda con la primera", () => {
    const r = parsearSerie("2024-01\t100\n2024-01\t200");
    expect(r.puntos).toEqual([{ punto: "2024-01", valor: 100 }]);
    expect(r.errores).toEqual([{ linea: 2, motivo: "fecha repetida: 2024-01" }]);
  });

  it("conserva el orden de aparición, sin ordenar", () => {
    const r = parsearSerie("2024-03\t100\n2024-01\t80");
    expect(r.puntos.map((p) => p.punto)).toEqual(["2024-03", "2024-01"]);
  });
});
