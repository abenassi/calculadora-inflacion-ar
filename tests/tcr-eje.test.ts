import { describe, expect, it } from "vitest";

import type { PuntoActualizadoDoble } from "../src/engine/actualizar.js";
import type { SerieValores } from "../src/engine/types.js";
import { alinearPorMes, armarEjeYSeries, armarLineaBcra } from "../src/ui/tcr-eje.js";

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

describe("armarLineaBcra", () => {
  const serie = (datos: { mes: string; valor: number }[]): SerieValores => ({
    serie: "test",
    unidad: "Índice 17-Dic-2015=100",
    fuentes: [{ id: "bcra", organismo: "BCRA", rango: "2020-01/2020-03" }],
    actualizado: "2026-01-01T00:00:00.000Z",
    datos,
  });

  it("sin datos (archivo ausente del snapshot), no hay serie ni nota", () => {
    const r = armarLineaBcra(null, ["2020-01", "2020-02"], "Test (BCRA, índice)", "bilateral");
    expect(r).toEqual({});
  });

  it("con datos que cubren el rango visible, reescala a 100 en el último dato propio", () => {
    const datos = serie([
      { mes: "2020-01", valor: 50 },
      { mes: "2020-02", valor: 100 },
    ]);
    const r = armarLineaBcra(datos, ["2020-01", "2020-02"], "Test (BCRA, índice)", "bilateral");
    expect(r.serie).toEqual({ label: "Test (BCRA, índice)", valores: [50, 100] });
    expect(r.nota).toMatch(/comparación de forma, no de nivel/);
  });

  it("con datos que no cubren el rango visible, no hay serie y avisa por qué", () => {
    const datos = serie([{ mes: "2019-06", valor: 80 }]);
    const r = armarLineaBcra(datos, ["2020-01", "2020-02"], "Test (BCRA, índice)", "bilateral");
    expect(r.serie).toBeUndefined();
    expect(r.nota).toMatch(/no tiene dato de tipo de cambio real/);
  });

  it("la nota identifica a cuál línea se refiere, para no repetir el mismo texto en las dos", () => {
    const datos = serie([
      { mes: "2020-01", valor: 50 },
      { mes: "2020-02", valor: 100 },
    ]);
    const bilateral = armarLineaBcra(datos, ["2020-01", "2020-02"], "Bilateral (BCRA, índice)", "bilateral");
    const multilateral = armarLineaBcra(datos, ["2020-01", "2020-02"], "Multilateral (BCRA, índice)", "multilateral");
    expect(bilateral.nota).toMatch(/\(bilateral\)/);
    expect(multilateral.nota).toMatch(/\(multilateral\)/);
    expect(bilateral.nota).not.toEqual(multilateral.nota);
  });

  it("cuando no cubre el rango, la nota reporta las dos puntas de cobertura, no sólo dónde termina", () => {
    const datos = serie([{ mes: "2012-05", valor: 80 }]);
    const r = armarLineaBcra(datos, ["2005-01", "2005-02"], "Test (BCRA, índice)", "multilateral");
    expect(r.nota).toMatch(/cubre mayo 2012–mayo 2012/);
  });
});
