import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { adjust } from "../src/engine/adjust.js";
import { sumarMeses } from "../src/engine/mes.js";
import { mesDelTramo, selloDelTramo } from "../src/ui/etiquetas.js";
import type { Mes, SerieIndice } from "../src/engine/types.js";

const leer = (archivo: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, "../public/data", archivo), "utf8")) as SerieIndice;

const serie = leer("ipc.json");
const bcra = serie.fuentes.find((f) => f.id === "bcra")!;

/**
 * De noviembre de 2015 a abril de 2016 el INDEC no publicó IPC, y `bcra:27` trae para esos meses
 * el de la Ciudad y el de San Luis. El sitio decía que el BCRA "no declara de dónde los toma" y
 * los sellaba `BCRA ✓` debajo de "republica el IPC que publicaba el INDEC". Estos tests atan el
 * sello a lo que dicen los propios datos.
 */
describe("los meses en que el BCRA republica otro índice", () => {
  it("cubren exactamente el hueco del INDEC: noviembre de 2015 a abril de 2016", () => {
    expect(bcra.republica).toEqual([
      { desde: "2015-11", hasta: "2016-01", indice: "IPC CABA" },
      { desde: "2016-02", hasta: "2016-04", indice: "IPC San Luis" },
    ]);
  });

  /*
   * La atribución no es una afirmación nuestra sin respaldo: la variación del BCRA en cada mes
   * del tramo coincide, al decimal que publica, con la del índice que se le atribuye, sacada del
   * snapshot de ese mismo índice. Si el BCRA corrigiera esos meses o el tramo estuviera mal
   * cortado, esto rojea antes de publicar un sello falso.
   */
  const archivoDe: Record<string, string> = { "IPC CABA": "indices/caba.json", "IPC San Luis": "indices/san-luis.json" };
  const variacion = (s: SerieIndice, mes: Mes) => {
    const v = new Map(s.datos.map((p) => [p.mes, p.indice]));
    const ahora = v.get(mes);
    const antes = v.get(sumarMeses(mes, -1));
    if (ahora === undefined || antes === undefined) throw new Error(`${s.serie} no tiene ${mes}`);
    return Math.round((ahora / antes - 1) * 1000) / 10;
  };

  for (const tramo of bcra.republica ?? []) {
    it(`de ${tramo.desde} a ${tramo.hasta} el BCRA trae el ${tramo.indice}, mes a mes`, () => {
      const otro = leer(archivoDe[tramo.indice]!);
      for (let mes = tramo.desde; mes <= tramo.hasta; mes = sumarMeses(mes, 1)) {
        expect(variacion(serie, mes), mes).toBe(variacion(otro, mes));
      }
    });
  }

  const esperado: Record<Mes, string> = {
    "2015-10": "BCRA",
    "2015-11": "BCRA (IPC CABA)",
    "2015-12": "BCRA (IPC CABA)",
    "2016-01": "BCRA (IPC CABA)",
    "2016-02": "BCRA (IPC San Luis)",
    "2016-03": "BCRA (IPC San Luis)",
    "2016-04": "BCRA (IPC San Luis)",
    "2016-05": "BCRA",
    "2016-06": "BCRA",
  };

  for (const [desde, hasta] of [
    ["2015-09", "2016-06"],
    ["2016-06", "2015-09"],
  ] as const) {
    it(`la tabla sella cada mes con su índice (${desde} → ${hasta})`, () => {
      const r = adjust(1000, desde, hasta, serie, { metodologia: "sin_proyectar" });
      const sellos = Object.fromEntries(
        r.desglose.slice(1).map((_, k) => [mesDelTramo(r.desglose, k + 1), selloDelTramo(r.desglose, k + 1, r)]),
      );
      expect(sellos).toEqual(esperado);
    });
  }

  it("la fila de partida no muestra la inflación de ningún mes y lleva el sello a secas", () => {
    const r = adjust(1000, "2016-01", "2016-06", serie, { metodologia: "sin_proyectar" });
    expect(selloDelTramo(r.desglose, 0, r)).toBe("BCRA");
  });
});
