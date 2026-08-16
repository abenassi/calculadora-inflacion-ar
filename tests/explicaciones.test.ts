import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { adjust, sumaDeVariaciones } from "../src/engine/adjust.js";
import { deOrdinal, aOrdinal } from "../src/engine/mes.js";
import {
  avisarTramoAjeno,
  esAproximado,
  explicarCompuesto,
  explicarMetodo,
  explicarTabla,
  fuenteDelTexto,
  hayAlgoEstimado,
  hayDatoOficial,
  resumir,
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
  { que: "por día, con ventana reciente", desde: `${ultimo}-17`, hasta: `${mas(1)}-15`, metodologia: "sin_proyectar" },
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
      // "Dato oficial" es lo que lleva sello: ni estimado ni prorrateado. Preguntando
      // sólo por la proyección, una tabla enteramente prorrateada contestaba que sí.
      expect(hayDatoOficial(r)).toBe(
        r.desglose.some((f) => !f.esProyeccion && !f.esParcial),
      );
      if (hayAlgoEstimado(r)) expect(esAproximado(r)).toBe(true);
    });
  }
});

describe("la aclaración de las filas prorrateadas", () => {
  it("aparece cuando hay filas que muestran ese sello", () => {
    const r = adjust(520_000, "2024-01-15", "2024-08-20", serie, { metodologia: "sin_proyectar" });
    // Tres: las dos puntas del tramo más la fila de partida, cuyo índice también es
    // una interpolación nuestra.
    expect(r.desglose.filter((f) => f.esParcial && !f.esProyeccion).length).toBe(3);
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

/**
 * El caso que motivó la ventana anclada al último mes publicado: $1.000.000 del 17 de
 * julio al 15 de agosto de 2026, con el INDEC publicado hasta junio.
 *
 * Son 29 días. Antes se contestaba con el tramo 17 de mayo → 15 de junio, que mezclaba dos
 * meses y dejaba junio a medio usar teniéndolo publicado entero. Ahora se contesta con los
 * últimos 29 días publicados, que caen enteros adentro de junio.
 *
 * La serie va congelada en junio de 2026 a propósito: `ipc.json` está vivo y el día que el
 * INDEC publique un mes más, un test escrito sobre el último dato cambiaría de caso solo.
 */
describe("la ventana de referencia en modo por día", () => {
  const CONGELADO = "2026-06";
  const congelada: SerieIndice = {
    ...serie,
    ultimo_oficial: CONGELADO,
    datos: serie.datos.filter((p) => p.mes <= CONGELADO),
  };
  const r = adjust(1_000_000, "2026-07-17", "2026-08-15", congelada, {
    metodologia: "sin_proyectar",
    hoy: "2026-08",
  });

  it("el recorte de la serie llega hasta el mes congelado", () => {
    expect(congelada.datos.at(-1)!.mes).toBe(CONGELADO);
  });

  it("usa el último mes publicado, prorrateado a los días del período", () => {
    const texto = explicarMetodo(r);
    expect(texto).toContain("pasaron 29 días");
    expect(texto).toContain("el tramo de 29 días más reciente que cae adentro de lo publicado");
    expect(texto).toContain("la inflación de junio de 2026, el último mes con dato");
    expect(texto).toContain("prorrateada a 29 de sus 30 días");
    // Y no nombra ningún mes anterior al último publicado: es la mitad que se ganó.
    expect(texto).not.toContain("mayo");
  });

  /**
   * La salvedad va antes que la atribución, y no al revés.
   *
   * Con un período que arranca en el último mes publicado, la metodología que **sí** estima
   * puede dar exactamente el mismo número que ésta —repite la tasa de ese mes y prorratear
   * es geométrico—. La revisora usuaria se encontró con $1.019.760,62 en las dos, una vez
   * bajo "son todos datos publicados por el INDEC" y otra bajo "OJO: esto es una
   * estimación", y no supo cuál creer. Si la misma cifra puede aparecer de los dos lados,
   * la que no estima no puede abrir prometiendo dato oficial.
   */
  it("dice primero que el período no es el tuyo, y después de dónde salen los números", () => {
    const texto = explicarMetodo(r);
    expect(texto).toContain("no es la inflación de tu período");
    expect(texto.indexOf("no es la inflación de tu período")).toBeLessThan(
      texto.indexOf("ya los publicó"),
    );
    expect(texto).not.toContain("Son todos datos publicados por");
  });

  it("el aviso de arriba de la tabla nombra el período pedido y el que se usó", () => {
    const aviso = avisarTramoAjeno(r);
    expect(aviso).toContain("del 17 de julio de 2026");
    expect(aviso).toContain("al 15 de agosto de 2026");
    expect(aviso).toContain("del 1 de junio de 2026");
    expect(aviso).toContain("al 30 de junio de 2026");
    expect(aviso).toContain("esas fechas");
  });

  it("sin ventana corrida no hay aviso, para que el aviso no deje de leerse", () => {
    const directo = adjust(1_000_000, "2026-01-10", "2026-03-20", congelada, { hoy: "2026-08" });
    expect(directo.metodo.tipo).toBe("directo");
    expect(avisarTramoAjeno(directo)).toBe("");
  });

  it("los días llevan artículo y las contracciones armadas", () => {
    const texto = `${resumir(r)} ${explicarMetodo(r)}`;
    expect(texto).toContain("del 17 de julio de 2026");
    expect(texto).toContain("al 15 de agosto de 2026");
    // Las formas sin artículo, que es como salían antes de `conPreposicion`.
    expect(texto).not.toContain("de 17 de julio");
    expect(texto).not.toContain("a 15 de agosto");
    expect(texto).not.toContain("de el ");
  });

  it("con un período de un solo mes la contracción también sale armada", () => {
    // El modo mensual tenía la misma falla: "usamos la inflación de el último mes".
    const mensual = adjust(1_000_000, "2026-07", "2026-08", congelada, {
      metodologia: "sin_proyectar",
      hoy: "2026-08",
    });
    expect(explicarMetodo(mensual)).toContain("la inflación del último mes publicado");
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
