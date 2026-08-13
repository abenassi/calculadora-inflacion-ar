import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { adjust, sumaDeVariaciones } from "../src/engine/adjust.js";
import { deOrdinal, aOrdinal } from "../src/engine/mes.js";
import {
  esAproximado,
  explicarCompuesto,
  explicarMetodo,
  explicarTabla,
  fuenteDelTexto,
  hayAlgoEstimado,
  hayDatoOficial,
} from "../src/ui/explicaciones.js";
import { porcentaje } from "../src/ui/format.js";
import type { Metodologia, Punto, Resultado, SerieIndice } from "../src/engine/types.js";

const serie = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../public/data/ipc.json"), "utf8"),
) as SerieIndice;

const ultimo = serie.ultimo_oficial;
const mas = (meses: number): Punto => deOrdinal(aOrdinal(ultimo) + meses);
const menos = (meses: number): Punto => deOrdinal(aOrdinal(ultimo) - meses);

/**
 * Una matriz de períodos, no un caso.
 *
 * El defecto que motivó este archivo aparecía sólo cuando el período empieza y termina
 * en el mismo mes sin publicar: no hay ningún tramo que proyectar, así que el texto
 * contaba cero estimaciones y anunciaba "todos son datos oficiales" sobre la única fila
 * de la tabla, sellada `estimado`. Ningún caso puntual lo habría encontrado; lo que lo
 * encuentra es recorrer los bordes.
 */
const CASOS: { que: string; desde: Punto; hasta: Punto; metodologia: Metodologia }[] = [
  { que: "publicado entero", desde: "2024-01", hasta: "2024-12", metodologia: "sin_proyectar" },
  { que: "publicado entero, pidiendo estimar", desde: "2024-01", hasta: "2024-12", metodologia: "repite_ultimo" },
  { que: "cruza el empalme", desde: "2011-01", hasta: "2024-12", metodologia: "sin_proyectar" },
  { que: "un solo mes publicado", desde: menos(3), hasta: menos(3), metodologia: "sin_proyectar" },
  { que: "un solo mes publicado, pidiendo estimar", desde: menos(3), hasta: menos(3), metodologia: "repite_ultimo" },
  { que: "el último mes publicado contra sí mismo", desde: ultimo, hasta: ultimo, metodologia: "repite_ultimo" },
  { que: "un solo mes sin publicar", desde: mas(2), hasta: mas(2), metodologia: "repite_ultimo" },
  { que: "un solo mes sin publicar, con REM", desde: mas(2), hasta: mas(2), metodologia: "rem" },
  { que: "arranca publicado y termina sin publicar", desde: menos(6), hasta: mas(3), metodologia: "repite_ultimo" },
  { que: "enteramente sin publicar", desde: mas(1), hasta: mas(8), metodologia: "repite_ultimo" },
  { que: "enteramente sin publicar, con REM", desde: mas(1), hasta: mas(8), metodologia: "rem" },
  { que: "sin proyectar sobre un período que no llegó", desde: menos(2), hasta: mas(4), metodologia: "sin_proyectar" },
  { que: "por día, dentro de meses publicados", desde: "2024-01-15", hasta: "2024-08-20", metodologia: "sin_proyectar" },
  { que: "por día, terminando sin publicar", desde: "2026-01-10", hasta: `${mas(3)}-20`, metodologia: "repite_ultimo" },
  { que: "hacia atrás", desde: "2024-12", hasta: "2024-01", metodologia: "sin_proyectar" },
];

const resultados: { que: string; r: Resultado }[] = CASOS.map((c) => ({
  que: `${c.que} (${c.desde} → ${c.hasta}, ${c.metodologia})`,
  r: adjust(520_000, c.desde, c.hasta, serie, { metodologia: c.metodologia }),
}));

/** Las frases que sólo pueden decirse si no hay ni una fila estimada. */
const PROMESAS_DE_DATO_OFICIAL = [
  "no hay nada estimado",
  "no hubo nada que estimar",
  "son datos oficiales ya publicados",
  "salen de datos oficiales publicados",
];

describe("los textos no prometen dato oficial donde hay estimación", () => {
  for (const { que, r } of resultados) {
    it(que, () => {
      const textos = [explicarMetodo(r), explicarTabla(r)];
      if (!hayAlgoEstimado(r)) return; // sin estimación, las frases son legítimas

      for (const texto of textos) {
        for (const promesa of PROMESAS_DE_DATO_OFICIAL) {
          expect(texto.toLowerCase()).not.toContain(promesa);
        }
      }
    });
  }
});

describe("los carteles y los textos contestan la misma pregunta", () => {
  for (const { que, r } of resultados) {
    it(que, () => {
      // El chip "≈ ESTIMADO", la leyenda del gráfico y el `~` del número salen de estos
      // predicados; los textos salen de las funciones de arriba. Si una tabla tiene una
      // fila estimada, las dos puntas tienen que reconocerla.
      expect(hayAlgoEstimado(r)).toBe(r.desglose.some((f) => f.esProyeccion));
      expect(hayDatoOficial(r)).toBe(r.desglose.some((f) => !f.esProyeccion));
      if (hayAlgoEstimado(r)) expect(esAproximado(r)).toBe(true);
    });
  }
});

describe("la aclaración de las filas prorrateadas", () => {
  it("aparece cuando hay filas que muestran ese sello", () => {
    const r = adjust(520_000, "2024-01-15", "2024-08-20", serie, { metodologia: "sin_proyectar" });
    expect(r.desglose.filter((f) => f.esParcial && !f.esProyeccion).length).toBe(2);
    expect(explicarTabla(r)).toContain("prorrateadas");
  });

  it("no manda a buscar un sello que la tabla no muestra", () => {
    // Las puntas son parciales, pero salen selladas `estimado`: el sello `prorrateado`
    // no aparece en ninguna fila, y el pie mandaba a buscarlo igual.
    const r = adjust(520_000, `${mas(2)}-15`, `${mas(8)}-20`, serie, { metodologia: "repite_ultimo" });
    expect(r.desglose.some((f) => f.esParcial && f.esProyeccion)).toBe(true);
    expect(explicarTabla(r)).not.toContain("prorrateada");
  });
});

describe("la fuente del texto que se copia", () => {
  it("con todo estimado por REM nombra al REM, no al INDEC", () => {
    const r = adjust(520_000, mas(1), mas(8), serie, { metodologia: "rem" });
    const fuente = fuenteDelTexto(r);
    expect(fuente).toContain("REM del BCRA");
    expect(fuente).toContain("Ningún mes de este cálculo está publicado");
  });

  it("con datos publicados nombra a quien los publicó", () => {
    const r = adjust(520_000, "2024-01", "2024-12", serie, { metodologia: "sin_proyectar" });
    expect(fuenteDelTexto(r)).toBe("el IPC Nivel General Nacional del INDEC");
  });
});

describe("la nota del interés compuesto", () => {
  for (const { que, r } of resultados) {
    it(`no se contradice a sí misma en ${que}`, () => {
      const suma = porcentaje(sumaDeVariaciones(r.desglose), false);
      const acumulado = porcentaje(r.variacionPct, false);
      // La nota sólo se muestra cuando los dos difieren (ver `pintarResultado`), pero si
      // se muestra, tiene que decir dos números distintos.
      if (suma === acumulado) return;
      const texto = explicarCompuesto(r);
      expect(texto).toContain(suma);
      expect(texto).toContain(acumulado);
    });
  }
});
