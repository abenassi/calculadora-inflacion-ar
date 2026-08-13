import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { adjust, sumaDeVariaciones } from "../src/engine/adjust.js";
import { fuenteDe } from "../src/ui/etiquetas.js";
import { comoSeMuestra, porcentaje, seVenDistintos } from "../src/ui/format.js";
import type { Punto, SerieIndice } from "../src/engine/types.js";

const serie = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../public/data/ipc.json"), "utf8"),
) as SerieIndice;

/**
 * El sitio afirmaba "todos los meses son datos publicados por el INDEC" sobre tablas cuyas
 * filas decían `BCRA ✓`. Estos tests atan las dos puntas: lo que dice el texto y lo que
 * dice el sello de cada fila salen del mismo `origen`, así que no pueden separarse.
 */
describe("la fuente que se nombra es la de las filas que se muestran", () => {
  const casos: { que: string; desde: Punto; hasta: Punto; indec: boolean; bcra: boolean }[] = [
    { que: "un tramo enteramente del INDEC", desde: "2017-01", hasta: "2024-12", indec: true, bcra: false },
    { que: "un tramo enteramente del BCRA", desde: "1999-01", hasta: "2001-12", indec: false, bcra: true },
    { que: "un tramo que cruza el empalme", desde: "2011-01", hasta: "2024-12", indec: true, bcra: true },
  ];

  for (const c of casos) {
    it(`${c.que} se atribuye a quien publicó sus filas`, () => {
      const r = adjust(1000, c.desde, c.hasta, serie, { metodologia: "sin_proyectar" });
      const f = fuenteDe(r.desglose, r);
      expect(f.presentes.some((p) => p.organismoCorto === "INDEC")).toBe(c.indec);
      expect(f.presentes.some((p) => p.organismoCorto === "BCRA")).toBe(c.bcra);

      /*
       * La etiqueta de atribución —la que va en un título o un pie— nombra exactamente a
       * los organismos cuyas filas están en la tabla. `larga` y `publicadosPor` sí pueden
       * mencionar al INDEC en un tramo del BCRA, y lo hacen a propósito: la serie del
       * BCRA republica el IPC del INDEC, y sin decirlo el lector no puede conectar la
       * atribución con el aviso del INDEC intervenido.
       */
      expect(f.corta.includes("INDEC")).toBe(c.indec);
      expect(f.corta.includes("BCRA")).toBe(c.bcra);
    });
  }

  it("nunca nombra al BCRA en un tramo sin ninguna fila del BCRA", () => {
    const r = adjust(1000, "2017-01", "2024-12", serie, { metodologia: "sin_proyectar" });
    expect(r.desglose.some((f) => f.origen === "bcra")).toBe(false);
    expect(fuenteDe(r.desglose, r).corta).not.toContain("BCRA");
  });

  it("con todas las filas estimadas declara que no hay nada publicado", () => {
    // Un período enteramente futuro: no hay dato de nadie todavía.
    const r = adjust(1000, "2026-12", "2027-05", serie, { metodologia: "repite_ultimo" });
    expect(r.desglose.every((f) => f.origen === "proyeccion")).toBe(true);
    const f = fuenteDe(r.desglose, r);
    expect(f.presentes).toHaveLength(0);
    // Y contesta igual quién lo va a publicar, que es la fuente del tramo más reciente.
    expect(f.publicadosPor).toBe("el INDEC");
  });
});

describe("la suma de la columna Subió", () => {
  it("no es el acumulado, y puede quedar por debajo cuando hay meses negativos", () => {
    // El caso que volvía falsa la frase "el acumulado siempre da un poco más que la suma".
    const r = adjust(1000, "1999-01", "2001-12", serie, { metodologia: "sin_proyectar" });
    expect(sumaDeVariaciones(r.desglose)).toBeLessThan(r.variacionPct);
  });

  it("y muy por encima de lo que la palabra «un poco» sugiere cuando la inflación es alta", () => {
    const r = adjust(1000, "2023-12", "2024-12", serie, { metodologia: "sin_proyectar" });
    expect(r.variacionPct - sumaDeVariaciones(r.desglose)).toBeGreaterThan(30);
  });

  it("no se contrapone al acumulado cuando los dos se imprimen igual", () => {
    // De enero a marzo de 1996 la nota decía "te va a dar -0,80%, no -0,80%".
    const r = adjust(1000, "1996-01", "1996-03", serie, { metodologia: "sin_proyectar" });
    expect(seVenDistintos(sumaDeVariaciones(r.desglose), r.variacionPct)).toBe(false);
  });

  it("sí se contrapone cuando la diferencia se ve", () => {
    const r = adjust(1000, "2023-12", "2024-12", serie, { metodologia: "sin_proyectar" });
    expect(seVenDistintos(sumaDeVariaciones(r.desglose), r.variacionPct)).toBe(true);
  });

  it("ignora las filas sin variación propia en vez de contarlas como cero", () => {
    const r = adjust(1000, "2024-01", "2024-03", serie, { metodologia: "sin_proyectar" });
    // La fila de partida no tiene variación; la suma es la de las otras dos.
    expect(r.desglose[0]!.varMensualPct).toBeNull();
    const aMano = r.desglose.slice(1).reduce((s, f) => s + comoSeMuestra(f.varMensualPct!), 0);
    expect(sumaDeVariaciones(r.desglose)).toBeCloseTo(aMano, 9);
  });

  it("es la que da sumar la columna a mano, no la del flotante", () => {
    /*
     * 2017: los doce redondeos de la pantalla suman 22,37% y los flotantes 22,38%. La
     * frase promete una cuenta que la persona puede rehacer, así que tiene que dar la de
     * la pantalla.
     */
    const r = adjust(1000, "2016-12", "2017-12", serie, { metodologia: "sin_proyectar" });
    const sumandoLaPantalla = r.desglose
      .filter((f) => f.varMensualPct !== null)
      .reduce((s, f) => s + Math.round(f.varMensualPct! * 100) / 100, 0);
    expect(porcentaje(sumaDeVariaciones(r.desglose), false)).toBe(
      porcentaje(sumandoLaPantalla, false),
    );
  });
});
