import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { adjust } from "../src/engine/adjust.js";
import { AnioSinDatos, aniosDisponibles, resumenAnual } from "../src/engine/anual.js";
import type { SerieIndice } from "../src/engine/types.js";

const serie = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../public/data/ipc.json"), "utf8"),
) as SerieIndice;

/**
 * Dos años completos al 10% mensual clavado, más un tercero que arranca.
 * Índices: dic-2019 = 100 · dic-2020 = 100 · 1,1^12 · ene-2021 y feb-2021 siguen.
 */
function sintetica(): SerieIndice {
  const datos: SerieIndice["datos"] = [];
  let indice = 100;
  datos.push({ mes: "2019-12", indice, origen: "indec" });
  for (const mes of [
    ...Array.from({ length: 12 }, (_, i) => `2020-${String(i + 1).padStart(2, "0")}`),
    "2021-01",
    "2021-02",
  ]) {
    indice *= 1.1;
    datos.push({ mes, indice, origen: "indec" });
  }
  return {
    serie: "test",
    base: "2019-12=100",
    fuentes: [],
    ultimo_oficial: "2021-02",
    actualizado: "2021-03-15T00:00:00Z",
    datos,
  };
}

describe("aniosDisponibles", () => {
  it("deja afuera el año cuyo único mes es el ancla del siguiente", () => {
    // dic-2019 es el primer punto de la serie: no tiene variación propia, así que
    // 2019 no es un año que se pueda contar.
    expect(aniosDisponibles(sintetica())).toEqual([2020, 2021]);
  });

  it("todo lo que devuelve se puede resumir sin excepciones", () => {
    for (const anio of aniosDisponibles(serie)) {
      expect(() => resumenAnual(serie, anio)).not.toThrow();
    }
  });

  it("con la serie real arranca en 1990 y llega al año del último dato oficial", () => {
    const anios = aniosDisponibles(serie);
    expect(anios[0]).toBe(1990);
    expect(anios[anios.length - 1]).toBe(Number(serie.ultimo_oficial.slice(0, 4)));
  });
});

describe("resumenAnual — un año completo", () => {
  it("mide diciembre contra diciembre y no incluye el diciembre anterior en la tabla", () => {
    const r = resumenAnual(sintetica(), 2020);
    expect(r.dicADic).toBe(true);
    expect(r.completo).toBe(true);
    expect(r.desde).toBe("2019-12");
    expect(r.hasta).toBe("2020-12");
    expect(r.filas).toHaveLength(12);
    expect(r.filas[0]!.punto).toBe("2020-01");
    expect(r.variacionPct).toBeCloseTo((Math.pow(1.1, 12) - 1) * 100, 6);
  });

  it("el promedio mensual es geométrico: repetido los meses del año reproduce el acumulado", () => {
    const r = resumenAnual(sintetica(), 2020);
    expect(r.promedioMensualPct).toBeCloseTo(10, 6);
    expect((Math.pow(1 + r.promedioMensualPct / 100, 12) - 1) * 100).toBeCloseTo(r.variacionPct, 6);
  });
});

describe("resumenAnual — los años que no se pueden llamar 'la inflación del año'", () => {
  it("el primer año de la serie arranca en su primer mes y avisa que no es dic/dic", () => {
    // 1990 es el caso real: la serie empieza en enero, así que diciembre de 1989 no
    // existe y el número no es la inflación anual de 1990 sino la de once meses.
    const r = resumenAnual(serie, 1990);
    expect(r.dicADic).toBe(false);
    expect(r.completo).toBe(false);
    expect(r.desde).toBe("1990-01");
    expect(r.hasta).toBe("1990-12");
    // La fila base pertenece al año, así que va incluida aunque no tenga variación.
    expect(r.filas[0]!.punto).toBe("1990-01");
    expect(r.filas[0]!.varMensualPct).toBeNull();
    expect(r.filas).toHaveLength(12);
  });

  it("un año sin ninguna variación propia se rechaza en vez de mostrarse vacío", () => {
    // dic-2019 es el único mes de 2019 en la serie sintética: es el ancla del año
    // siguiente, no un año que se pueda resumir.
    expect(() => resumenAnual(sintetica(), 2019)).toThrow(AnioSinDatos);
  });

  it("el año en curso llega hasta el último mes publicado y no está completo", () => {
    const r = resumenAnual(sintetica(), 2021);
    expect(r.dicADic).toBe(true);
    expect(r.completo).toBe(false);
    expect(r.hasta).toBe("2021-02");
    expect(r.conVariacion).toHaveLength(2);
  });

  it("rechaza un año sin ningún mes publicado en vez de inventarlo", () => {
    expect(() => resumenAnual(sintetica(), 2022)).toThrow(AnioSinDatos);
  });
});

describe("resumenAnual — no inventa un criterio propio", () => {
  /*
   * La razón de ser de este archivo: las páginas por año y la calculadora tienen que
   * dar el mismo número. Si alguien lee "la inflación de 2024 fue 117,8%" y va a
   * comprobarlo al formulario, tiene que ver 117,8%. El test ata las dos puntas
   * contra el motor, no contra una constante escrita a mano.
   */
  it("la variación de cada año coincide con pedirle ese período a la calculadora", () => {
    for (const anio of aniosDisponibles(serie)) {
      const r = resumenAnual(serie, anio);
      const directo = adjust(1000, r.desde, r.hasta, serie, { metodologia: "sin_proyectar" });
      expect(directo.metodo.tipo).toBe("directo");
      expect(r.variacionPct).toBeCloseTo(directo.variacionPct, 9);
    }
  });

  it("ningún año publicado se resuelve estimando: todas las filas son datos oficiales", () => {
    for (const anio of aniosDisponibles(serie)) {
      const r = resumenAnual(serie, anio);
      expect(r.filas.every((f) => !f.esProyeccion)).toBe(true);
      expect(r.filas.every((f) => !f.esParcial)).toBe(true);
    }
  });

  it("el mes más alto y el más bajo salen de las filas del año, no de la fila base", () => {
    for (const anio of aniosDisponibles(serie)) {
      const r = resumenAnual(serie, anio);
      const puntos = r.filas.map((f) => f.punto);
      for (const f of [...r.mesesMasAltos, ...r.mesesMasBajos]) {
        expect(puntos).toContain(f.punto);
        expect(f.varMensualPct).not.toBeNull();
      }
      expect(r.mesesMasAltos[0]!.varMensualPct!).toBeGreaterThanOrEqual(
        r.mesesMasBajos[0]!.varMensualPct!,
      );
    }
  });

  it("los meses más altos traen todos los empates, no uno arbitrario", () => {
    // 2011 tiene seis meses en 0,80%. Mostrar sólo diciembre —el último que quedaba
    // después de ordenar— hacía preguntarse por qué justo ése.
    const r = resumenAnual(serie, 2011);
    expect(r.mesesMasAltos.length).toBeGreaterThan(1);
    const valores = new Set(r.mesesMasAltos.map((f) => Math.round(f.varMensualPct! * 100) / 100));
    expect(valores.size).toBe(1);
    // Y vienen en orden cronológico, que es el de la tabla.
    const puntos = r.mesesMasAltos.map((f) => String(f.punto));
    expect(puntos).toEqual([...puntos].sort());
  });

  it("nunca devuelve las listas de extremos vacías", () => {
    for (const anio of aniosDisponibles(serie)) {
      const r = resumenAnual(serie, anio);
      expect(r.mesesMasAltos.length).toBeGreaterThan(0);
      expect(r.mesesMasBajos.length).toBeGreaterThan(0);
    }
  });

  it("`conVariacion` es lo que se puede contar en la columna Subió", () => {
    for (const anio of aniosDisponibles(serie)) {
      const r = resumenAnual(serie, anio);
      expect(r.conVariacion).toEqual(r.filas.filter((f) => f.varMensualPct !== null));
    }
  });

  it("la suma de las variaciones no es el acumulado, y puede ser mayor", () => {
    // El caso que rompe la intuición de "el acumulado siempre da un poco más":
    // 1996 tiene meses negativos y ahí el acumulado queda por DEBAJO de la suma.
    const r96 = resumenAnual(serie, 1996);
    expect(r96.variacionPct).toBeLessThan(r96.sumaDeVariacionesPct);

    // Y el caso normal, donde la brecha es enorme y no "un poco":
    const r24 = resumenAnual(serie, 2024);
    expect(r24.sumaDeVariacionesPct).toBeCloseTo(81.94, 1);
    expect(r24.variacionPct - r24.sumaDeVariacionesPct).toBeGreaterThan(30);
  });

  it("los años completos tienen exactamente doce filas y todas caen dentro del año", () => {
    for (const anio of aniosDisponibles(serie)) {
      const r = resumenAnual(serie, anio);
      if (r.completo) expect(r.filas).toHaveLength(12);
      expect(r.filas.every((f) => String(f.punto).startsWith(String(anio)))).toBe(true);
    }
  });
});
