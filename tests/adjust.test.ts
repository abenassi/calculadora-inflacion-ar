import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { adjust, MESES_PROMEDIO_PROYECCION, RangoError } from "../src/engine/adjust.js";
import type { SerieIndice } from "../src/engine/types.js";

const serie = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../data/ipc.json"), "utf8"),
) as SerieIndice;

/** Serie sintética chica: 100 → 110 → 121 → 133.1 (10% mensual clavado). */
const sintetica: SerieIndice = {
  serie: "test",
  base: "2020-01=100",
  fuentes: [],
  ultimo_oficial: "2020-04",
  actualizado: "2020-05-01T00:00:00Z",
  datos: [
    { mes: "2020-01", indice: 100, origen: "indec" },
    { mes: "2020-02", indice: 110, origen: "indec" },
    { mes: "2020-03", indice: 121, origen: "indec" },
    { mes: "2020-04", indice: 133.1, origen: "indec" },
  ],
};

describe("adjust — comportamiento básico", () => {
  it("mes de origen igual al de destino devuelve el monto intacto", () => {
    const r = adjust(1000, "2020-02", "2020-02", sintetica);
    expect(r.oficial.monto).toBe(1000);
    expect(r.oficial.variacionPct).toBe(0);
    expect(r.desglose).toHaveLength(1);
    expect(r.desglose[0]!.varMensualPct).toBeNull();
    expect(r.desglose[0]!.acumuladoPct).toBeNull();
    expect(r.estimado).toBeUndefined();
  });

  it("ajusta hacia adelante componiendo las variaciones", () => {
    const r = adjust(1000, "2020-01", "2020-03", sintetica);
    expect(r.oficial.monto).toBeCloseTo(1210, 6);
    expect(r.oficial.variacionPct).toBeCloseTo(21, 6);
  });

  it("ajusta hacia atrás deflactando, y el acumulado siempre se mide contra el origen", () => {
    const r = adjust(1210, "2020-03", "2020-01", sintetica);
    expect(r.oficial.monto).toBeCloseTo(1000, 6);
    expect(r.oficial.variacionPct).toBeCloseTo(-17.3553719, 6);
    expect(r.desglose.map((f) => f.mes)).toEqual(["2020-03", "2020-02", "2020-01"]);
    expect(r.desglose.at(-1)!.acumuladoPct).toBeCloseTo(-17.3553719, 6);
    expect(r.estimado).toBeUndefined();
  });

  it("la primera fila del desglose es el punto de partida, sin variación", () => {
    const r = adjust(1000, "2020-01", "2020-03", sintetica);
    expect(r.desglose[0]).toMatchObject({
      mes: "2020-01",
      monto: 1000,
      varMensualPct: null,
      acumuladoPct: null,
      esProyeccion: false,
    });
  });

  it("cada fila lleva su variación mensual y su acumulado contra el origen", () => {
    const r = adjust(1000, "2020-01", "2020-03", sintetica);
    expect(r.desglose[1]!.varMensualPct).toBeCloseTo(10, 6);
    expect(r.desglose[1]!.acumuladoPct).toBeCloseTo(10, 6);
    expect(r.desglose[2]!.varMensualPct).toBeCloseTo(10, 6);
    expect(r.desglose[2]!.acumuladoPct).toBeCloseTo(21, 6);
  });
});

describe("adjust — separación de dato oficial y proyección", () => {
  it("no proyecta nada si el destino está dentro del rango publicado", () => {
    const r = adjust(1000, "2020-01", "2020-04", sintetica);
    expect(r.estimado).toBeUndefined();
    expect(r.desglose.every((f) => !f.esProyeccion)).toBe(true);
  });

  it("corta el tramo oficial en el último mes publicado y estima el resto aparte", () => {
    const r = adjust(1000, "2020-01", "2020-06", sintetica);

    expect(r.oficial.hasta).toBe("2020-04");
    expect(r.oficial.monto).toBeCloseTo(1331, 6);

    expect(r.estimado).toBeDefined();
    expect(r.estimado!.hasta).toBe("2020-06");
    expect(r.estimado!.mesesProyectados).toBe(2);
    expect(r.estimado!.tasaMensualPct).toBeCloseTo(10, 6);
    expect(r.estimado!.monto).toBeCloseTo(1331 * 1.1 * 1.1, 6);
  });

  it("marca como proyección sólo las filas posteriores al último dato oficial", () => {
    const r = adjust(1000, "2020-01", "2020-06", sintetica);
    expect(r.desglose.map((f) => f.esProyeccion)).toEqual([false, false, false, false, true, true]);
    expect(r.desglose.filter((f) => f.esProyeccion).map((f) => f.origen)).toEqual([
      "proyeccion",
      "proyeccion",
    ]);
  });

  it("proyecta con el promedio de las últimas variaciones mensuales", () => {
    const irregular: SerieIndice = {
      ...sintetica,
      ultimo_oficial: "2020-04",
      datos: [
        { mes: "2020-01", indice: 100, origen: "indec" },
        { mes: "2020-02", indice: 200, origen: "indec" }, // +100%, queda fuera de la ventana
        { mes: "2020-03", indice: 202, origen: "indec" }, // +1%
        { mes: "2020-04", indice: 208.06, origen: "indec" }, // +3%
      ],
    };
    // Ventana de 3: +100%, +1%, +3% → promedio 34.6667%. Con sólo 3 puntos previos
    // hay 3 variaciones, así que entra la de +100%.
    const r = adjust(100, "2020-04", "2020-05", irregular);
    expect(MESES_PROMEDIO_PROYECCION).toBe(3);
    expect(r.estimado!.tasaMensualPct).toBeCloseTo((100 + 1 + 3) / 3, 6);
  });

  it("si el mes de origen tampoco tiene dato oficial, el tramo oficial queda en el origen", () => {
    const r = adjust(1000, "2020-05", "2020-07", sintetica);
    expect(r.oficial.hasta).toBe("2020-05");
    expect(r.oficial.monto).toBe(1000);
    expect(r.estimado).toBeDefined();
    expect(r.estimado!.hasta).toBe("2020-07");
  });
});

describe("adjust — bordes y errores", () => {
  it("rechaza meses anteriores al inicio de la serie con un mensaje entendible", () => {
    expect(() => adjust(1000, "1989-12", "2020-01", sintetica)).toThrow(RangoError);
    expect(() => adjust(1000, "1989-12", "2020-01", sintetica)).toThrow(/No hay datos de inflación/);
  });

  it("rechaza un monto no numérico en vez de devolver NaN", () => {
    expect(() => adjust(Number.NaN, "2020-01", "2020-02", sintetica)).toThrow(RangoError);
  });

  it("rechaza un mes con formato inválido", () => {
    expect(() => adjust(1000, "2020-13", "2020-01", sintetica)).toThrow(RangeError);
  });
});

describe("adjust — contra la serie real", () => {
  it("atraviesa la hiperinflación de 1990 sin perder precisión", () => {
    // ene→abr 1990: +61,6%, +95,5%, +11,4% acumulan un factor de 3,5157.
    const r = adjust(1, "1990-01", "1990-04", serie);
    expect(r.oficial.monto).toBeCloseTo(1.616 * 1.955 * 1.114, 6);
    expect(r.desglose[1]!.varMensualPct).toBeCloseTo(61.6, 6);
    expect(r.desglose[2]!.varMensualPct).toBeCloseTo(95.5, 6);
  });

  it("el empalme no deja escalón en el borde dic-2016", () => {
    // La variación nov→dic 2016 tiene que ser del mismo orden que sus vecinas,
    // no un salto artificial producto de pegar dos series con bases distintas.
    const r = adjust(100, "2016-09", "2017-03", serie);
    const variaciones = r.desglose.slice(1).map((f) => f.varMensualPct!);
    for (const v of variaciones) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(10);
    }
  });

  it("todos los puntos del índice son finitos y positivos", () => {
    for (const p of serie.datos) {
      expect(Number.isFinite(p.indice)).toBe(true);
      expect(p.indice).toBeGreaterThan(0);
    }
  });

  it("preserva los meses de deflación de la convertibilidad", () => {
    // La serie NO es monótona: entre 1993 y 2001 hubo 45 meses de variación
    // negativa y 18 de 0,0%. Si el empalme los aplanara, estaría mintiendo.
    const r = adjust(1000, "1996-01", "1996-12", serie);
    const negativos = r.desglose.slice(1).filter((f) => f.varMensualPct! < 0);
    expect(negativos.length).toBeGreaterThan(0);
    // En 1996 el nivel de precios terminó por debajo del de enero.
    expect(r.oficial.variacionPct).toBeLessThan(0);
    expect(r.oficial.monto).toBeLessThan(1000);
  });

  it("la serie no tiene huecos", () => {
    const meses = serie.datos.map((p) => p.mes);
    expect(new Set(meses).size).toBe(meses.length);
    expect(meses).toEqual([...meses].sort());
  });

  it("el último punto de la serie coincide con ultimo_oficial", () => {
    expect(serie.datos.at(-1)!.mes).toBe(serie.ultimo_oficial);
  });
});

describe("adjust — coherencia con Argentina Data MCP", () => {
  /**
   * El caso testigo que originó el proyecto: $520.000 de mayo 2026 a agosto 2026,
   * con el INDEC publicado hasta junio.
   *
   * `ajuste_por_inflacion` devuelve 6,43% / $553.448,55. Tenemos que coincidir: si
   * alguien pregunta lo mismo desde su agente de IA y le da distinto que en el
   * sitio, perdemos credibilidad justo donde queremos ganarla.
   */
  it("reproduce el caso testigo", () => {
    const r = adjust(520000, "2026-05", "2026-08", serie);

    expect(r.oficial.hasta).toBe("2026-06");
    expect(r.oficial.variacionPct).toBeCloseTo(1.8869, 3);

    expect(r.estimado).toBeDefined();
    expect(r.estimado!.mesesProyectados).toBe(2);
    expect(r.estimado!.tasaMensualPct).toBeCloseTo(2.2, 1);
    expect(r.estimado!.variacionPct).toBeCloseTo(6.43, 2);
    expect(r.estimado!.monto).toBeCloseTo(553448.55, 0);
  });

  /**
   * Sobre períodos largos divergimos del MCP en fracciones de punto porcentual, y
   * es a propósito: el MCP compone variaciones mensuales redondeadas a 4 decimales,
   * mientras que acá tomamos el cociente de los índices de nivel, que es el método
   * exacto. Componer porcentajes redondeados acumula deriva.
   *
   * Este test fija esa tolerancia. Si algún día se dispara, es que el empalme se
   * rompió de verdad — no que el redondeo se movió.
   */
  it("coincide con el MCP dentro de la tolerancia por redondeo en períodos largos", () => {
    const casos = [
      { desde: "2017-01", hasta: "2026-06", factorMcp: 116.3491, toleranciaPct: 0.1 },
      { desde: "1995-01", hasta: "2026-06", factorMcp: 787.0331, toleranciaPct: 0.5 },
    ] as const;

    for (const c of casos) {
      const r = adjust(1000, c.desde, c.hasta, serie);
      const factorPropio = r.oficial.monto / 1000;
      const desvioPct = Math.abs(factorPropio / c.factorMcp - 1) * 100;
      expect(desvioPct, `${c.desde} → ${c.hasta}`).toBeLessThan(c.toleranciaPct);
    }
  });
});
