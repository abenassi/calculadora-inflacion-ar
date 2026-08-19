import { describe, expect, it } from "vitest";

import type { PuntoActualizadoDoble } from "../src/engine/actualizar.js";
import { alinearPorMes, armarEjeYSeries } from "../src/ui/tcr-eje.js";

describe("alinearPorMes", () => {
  it("devuelve el valor de cada mes del eje cuando está presente", () => {
    const r = alinearPorMes(
      [
        { mes: "2020-01", valor: 10 },
        { mes: "2020-02", valor: 20 },
      ],
      ["2020-01", "2020-02"],
    );
    expect(r).toEqual([10, 20]);
  });

  it("devuelve null para un mes del eje que la serie no tiene", () => {
    const r = alinearPorMes([{ mes: "2020-02", valor: 20 }], ["2020-01", "2020-02", "2020-03"]);
    expect(r).toEqual([null, 20, null]);
  });

  it("con una lista vacía de puntos, devuelve todo null", () => {
    expect(alinearPorMes([], ["2020-01", "2020-02"])).toEqual([null, null]);
  });
});

describe("armarEjeYSeries", () => {
  const doble = (mes: string, valorActualizado: number): PuntoActualizadoDoble => ({
    mes,
    valorOriginal: valorActualizado,
    valorSoloBase: valorActualizado,
    valorActualizado,
  });

  it("el eje es la unión de los meses de las dos series, ordenada", () => {
    const blue = [doble("2002-01", 1), doble("2005-06", 2)];
    const oficial = [doble("2010-06", 3)];
    const r = armarEjeYSeries(blue, oficial);
    expect(r.meses).toEqual(["2002-01", "2005-06", "2010-06"]);
  });

  it("la serie más corta lleva null en los meses que no cubre", () => {
    const blue = [doble("2002-01", 100), doble("2010-06", 200)];
    const oficial = [doble("2010-06", 1500)];
    const r = armarEjeYSeries(blue, oficial);
    expect(r.blue).toEqual([100, 200]);
    expect(r.oficial).toEqual([null, 1500]);
  });

  it("con las dos series vacías, el eje queda vacío", () => {
    const r = armarEjeYSeries([], []);
    expect(r.meses).toEqual([]);
    expect(r.blue).toEqual([]);
    expect(r.oficial).toEqual([]);
  });

  it("un mes presente en las dos series toma el valor de cada una, sin pisarse", () => {
    const blue = [doble("2020-01", 111)];
    const oficial = [doble("2020-01", 222)];
    const r = armarEjeYSeries(blue, oficial);
    expect(r.meses).toEqual(["2020-01"]);
    expect(r.blue).toEqual([111]);
    expect(r.oficial).toEqual([222]);
  });
});
