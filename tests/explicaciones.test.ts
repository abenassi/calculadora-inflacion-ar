import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { adjust, sumaDeVariaciones } from "../src/engine/adjust.js";
import { deOrdinal, aOrdinal, diffMeses, sumarMeses } from "../src/engine/mes.js";
import {
  avisarTramoAjeno,
  avisoDeMoneda,
  efectoEnElMonto,
  explicarMoneda,
  esAproximado,
  esDeflacion,
  explicarCompuesto,
  explicarMetodo,
  explicarTabla,
  fuenteDelTexto,
  hayAlgoEstimado,
  hayMesPublicado,
  resumir,
  rotuloDeAnclaje,
} from "../src/ui/explicaciones.js";
import { abreviarMes, mesDe, nombrarMes } from "../src/engine/mes.js";
import { mesDelTramo, rotularFila, selloDeFila } from "../src/ui/etiquetas.js";
import { porcentaje } from "../src/ui/format.js";
import type { Mes, Metodologia, Punto, Resultado, SerieIndice } from "../src/engine/types.js";

const serie = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../public/data/ipc.json"), "utf8"),
) as SerieIndice;

const ultimo = serie.ultimo_oficial;
const mas = (meses: number): Punto => deOrdinal(aOrdinal(ultimo) + meses);
const menos = (meses: number): Punto => deOrdinal(aOrdinal(ultimo) - meses);

/**
 * `ipc.json` recortado en julio de 2026, para los casos que tienen que quedar fijos.
 *
 * `ipc.json` está vivo. Un caso escrito sobre un mes fijo cambia de tipo el día que el INDEC
 * publica ese mes, y uno escrito relativo al último dato cambia con lo que se publique: un mes
 * de inflación muy alta dispara el guard de sesgo y pasa a `proyeccion`. En los dos casos el
 * test queda en rojo contra el snapshot recién bajado y frena la actualización del sitio (pasó
 * el 2026-09-10 con agosto). Recortada, la serie tiene los números reales y no se mueve.
 */
const HASTA_JULIO = "2026-07";
const julio: SerieIndice = {
  ...serie,
  ultimo_oficial: HASTA_JULIO,
  datos: serie.datos.filter((p) => p.mes <= HASTA_JULIO),
};

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
  { que: "por día, arrancando dentro del último mes publicado", desde: `${ultimo}-17`, hasta: `${mas(1)}-15`, metodologia: "repite_ultimo" },
  { que: "por día, arrancando dentro del último mes publicado, con REM", desde: `${ultimo}-17`, hasta: `${mas(1)}-15`, metodologia: "rem" },
  { que: "por día, entero adentro de un mes publicado", desde: `${menos(1)}-10`, hasta: `${menos(1)}-20`, metodologia: "sin_proyectar" },
  { que: "por día, terminando sin publicar", desde: "2026-01-10", hasta: `${mas(3)}-20`, metodologia: "repite_ultimo" },
  { que: "hacia atrás", desde: "2024-12", hasta: "2024-01", metodologia: "sin_proyectar" },
  // Los tres casos donde la fila de partida lleva sello y ningún porcentaje lo lleva. El
  // pie los daba por oficiales porque preguntaba por la tabla entera, y la fila de partida
  // no muestra ningún porcentaje: "Todas las filas salen de datos oficiales" arriba de una
  // única fila que dice `prorrateado`, y "El resto son datos oficiales" sin resto.
  { que: "por día, del 1 al 20 de un mes publicado", desde: `${menos(1)}-01`, hasta: `${menos(1)}-20`, metodologia: "sin_proyectar" },
  { que: "del último mes publicado al siguiente", desde: ultimo, hasta: mas(1), metodologia: "repite_ultimo" },
  { que: "del último mes publicado al siguiente, con REM", desde: ultimo, hasta: mas(1), metodologia: "rem" },
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

/**
 * El espejo: las frases que niegan que haya algo publicado.
 *
 * La regla 2 se lee siempre en un solo sentido —no prometas dato oficial donde no lo hay—
 * y la mitad simétrica es la que se olvida. Un período por día que arranca dentro del
 * último mes publicado no tiene **ninguna** fila sellada, porque las dos puntas son
 * prorrateos; preguntando sólo por el sello, el pie decía "el INDEC todavía no publicó
 * ninguno de estos meses" dos renglones abajo de citar la inflación de julio, y el texto
 * que se copia cerraba con "son todas estimaciones" sobre un cálculo cuya mitad es dato
 * publicado.
 *
 * El test viejo era `expect(hayDatoOficial(r)).toBe(<la definición de hayDatoOficial>)`:
 * no podía fallar nunca, y no lo cachó.
 */
const NEGACIONES_DE_DATO_PUBLICADO = [
  "no hay ningún dato oficial",
  "todavía no publicó ninguno de estos meses",
  "ningún mes de este cálculo está publicado",
  "son todas estimaciones",
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

/**
 * Las frases que prometen que se puede **señalar** un porcentaje publicado en la tabla.
 *
 * Distintas de `PROMESAS_DE_DATO_OFICIAL`, que habla de los meses: "Todos los meses del
 * cálculo son datos oficiales ya publicados" es cierta sin ninguna fila sellada, porque un
 * tramo prorrateado sale de un mes publicado. Éstas hablan de las filas, y sólo valen si
 * hay una fila con sello y con porcentaje.
 */
const PROMESAS_SOBRE_LAS_FILAS = [
  "salen de datos oficiales publicados",
  "el resto son datos oficiales",
];

describe("los carteles y los textos contestan la misma pregunta", () => {
  for (const { que, r } of resultados) {
    it(que, () => {
      // El chip "≈ ESTIMADO", la leyenda del gráfico y el `~` del número salen de estos
      // predicados; los textos salen de las funciones de arriba. Si una tabla tiene una
      // fila estimada, las dos puntas tienen que reconocerla.
      expect(hayAlgoEstimado(r)).toBe(r.desglose.some((f) => f.esProyeccion));
      if (hayAlgoEstimado(r)) expect(esAproximado(r)).toBe(true);
      // Y las promesas sobre las filas se atan a lo que la tabla **imprime**, no a la
      // definición del predicado. La versión anterior era `if (hayDatoOficial(r))
      // expect(<la definición de hayDatoOficial>)`: no podía fallar, y de hecho no falló
      // cuando el revisor de código devolvió `hayDatoOficial` a su versión equivocada.
      // Acá el lado izquierdo pasa por `selloDeFila`, que es lo que se dibuja en la
      // columna Origen, y el derecho por el texto renderizado.
      if (r.desglose.slice(1).every((f) => selloDeFila(f, r) === null)) {
        const textos = [explicarMetodo(r), explicarTabla(r)];
        for (const texto of textos) {
          for (const promesa of PROMESAS_SOBRE_LAS_FILAS) {
            expect(texto.toLowerCase()).not.toContain(promesa);
          }
        }
      }
    });
  }
});

describe("los textos no niegan lo publicado cuando hay un mes publicado", () => {
  for (const { que, r } of resultados) {
    it(que, () => {
      // `hayMesPublicado` es el predicado honesto acá: una fila prorrateada no muestra un
      // número del organismo, pero el mes del que sale sí está publicado.
      if (!hayMesPublicado(r)) return;
      const textos = [explicarMetodo(r), explicarTabla(r), fuenteDelTexto(r)];
      for (const texto of textos) {
        for (const negacion of NEGACIONES_DE_DATO_PUBLICADO) {
          expect(texto.toLowerCase()).not.toContain(negacion);
        }
      }
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
    // Ni "pediste" como verbo suelto ni "abajo". El aviso encabeza el texto que se copia y
    // se manda: quien lo recibe no pidió nada, y abajo de un mensaje no hay una tabla.
    expect(aviso).not.toMatch(/^Pediste/);
    expect(aviso.toLowerCase()).not.toContain("abajo");
  });

  /**
   * El aviso decía "Abajo no vas a encontrar esos meses" y era **falso** apenas los dos
   * períodos se pisan. Pidiendo de mayo a agosto con junio publicado, la ventana son los
   * últimos 3 meses publicados —abril, mayo y junio— y mayo está abajo, con su porcentaje.
   * La revisora usuaria lo leyó y buscó el mes que le acababan de decir que no iba a estar.
   */
  it("no promete que los meses pedidos no están cuando la ventana se pisa con el pedido", () => {
    const r = adjust(1_000_000, "2026-05", "2026-08", congelada, { hoy: "2026-08" });
    expect(r.metodo.tipo).toBe("ventana_reciente");
    const aviso = avisarTramoAjeno(r);
    expect(aviso).toContain("de mayo 2026 a agosto 2026");
    expect(aviso).toContain("abril, mayo y junio de 2026");
    expect(aviso).not.toContain("no vas a encontrar");
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
      // Contra `inflacionPct`: la columna suma inflación mensual, así que el número con el
      // que se contrapone es la inflación acumulada. Deflactando eran de signo distinto —"te
      // va a dar 61,33%, no −44,61%"— y la nota se leía como si uno fuera la versión mal
      // hecha del otro, cuando son dos cosas.
      const acumulado = porcentaje(r.inflacionPct, false);
      // La nota sólo se muestra cuando los dos difieren (ver `pintarResultado`), pero si
      // se muestra, tiene que decir dos números distintos.
      if (suma === acumulado) return;
      const texto = explicarCompuesto(r);
      expect(texto).toContain(suma);
      expect(texto).toContain(acumulado);
      // Y los dos tienen que ser del mismo signo: sumar inflación no puede dar lo contrario
      // de acumularla.
      expect(Math.sign(sumaDeVariaciones(r.desglose))).toBe(Math.sign(r.inflacionPct));
    });
  }
});

/**
 * Los rótulos de la tabla yendo para atrás.
 *
 * El rótulo nombraba el punto de **llegada** y el porcentaje pertenecía al mes que se estaba
 * deshaciendo. Yendo para adelante los dos coinciden, así que nadie lo vio; deflactando se
 * separan y la fila "jun 2026" mostraba el +2,11% de julio invertido, con `INDEC ✓` al lado.
 */
describe("los rótulos no dependen de la dirección de la pregunta", () => {
  const ida = adjust(1_000_000, "2026-02", "2026-07", serie, { hoy: "2026-08" });
  const vuelta = adjust(1_000_000, "2026-07", "2026-02", serie, { hoy: "2026-08" });

  it("cada fila se llama como el mes de su porcentaje, en las dos direcciones", () => {
    expect(ida.desglose.slice(1).map((_, i) => rotularFila(ida.desglose, i + 1))).toEqual([
      "mar 2026",
      "abr 2026",
      "may 2026",
      "jun 2026",
      "jul 2026",
    ]);
    // Y deflactando son exactamente los mismos rótulos: la tabla es la misma tabla.
    expect(vuelta.desglose.map((_, i) => rotularFila(vuelta.desglose, i))).toEqual(
      ida.desglose.map((_, i) => rotularFila(ida.desglose, i)),
    );
  });

  it("ninguna fila repite el rótulo de la de arriba, ni el mes", () => {
    for (const r of [ida, vuelta]) {
      const rotulos = r.desglose.map((_, i) => rotularFila(r.desglose, i));
      expect(new Set(rotulos).size).toBe(rotulos.length);
      // Y el mes tampoco aparece en dos renglones seguidos. La versión anterior comparaba
      // strings completos, así que dejaba pasar "jun 2026 → jul 2026" arriba de "jun 2026":
      // dos renglones que empiezan igual y dicen meses distintos.
      const meses = r.desglose.slice(1).map((_, i) => mesDelTramo(r.desglose, i + 1));
      expect(new Set(meses).size).toBe(meses.length);
    }
  });

  it("las flechas van del punto viejo al nuevo, aunque el recorrido vaya al revés", () => {
    const r = adjust(1_000_000, "2026-07-15", "2026-02-15", serie, { hoy: "2026-08" });
    const rotulos = r.desglose.map((_, i) => rotularFila(r.desglose, i));
    // Decía "15 jul 2026 → 1 jul 2026": la flecha se lee "de acá hasta acá" y apuntaba para
    // atrás en el tiempo. Con el desglose cronológico esto ya no se puede escribir mal, pero
    // el test se queda: es la promesa, no la implementación.
    expect(rotulos).toContain("1 jul 2026 → 15 jul 2026");
    expect(rotulos).toContain("15 feb 2026 → 1 mar 2026");
    expect(rotulos.filter((x) => x.includes("→")).length).toBe(2);
  });

  /**
   * El sello promete que el número de la fila lo publicó el organismo. Con el recíproco eso
   * era falso en toda deflación, y es el caso que la revisora usuaria dijo que no le mandaba
   * a una clienta: "junio bajó 1,85% según el INDEC" por escrito.
   */
  /**
   * Contra la **serie**, no contra `mesDelTramo`.
   *
   * La versión anterior era `expect(rotularFila(d, i)).toContain(abreviarMes(mesDelTramo(d, i)))`
   * y para una fila no parcial `rotularFila` devuelve exactamente eso: `expect(X).toContain(X)`.
   *
   * Y la primera versión de este reemplazo tampoco mordía, por una razón más fina: en modo
   * mensual la regla vieja —"el mes del punto de llegada"— **coincide** con la nueva, porque el
   * recorrido es cronológico. La que no coincide es la de días: el tramo `1 jun → 1 jul` cubre
   * junio y su punto de llegada cae en julio. Sin un caso por día, `mesDelTramo` no estaba
   * atado por nadie.
   */
  for (const [que, desde, hasta] of [
    ["por meses", "2026-07", "2026-02"],
    ["por día", "2026-07-15", "2026-02-15"],
    ["por día, al derecho", "2026-02-15", "2026-07-15"],
  ] as const) {
    it(`una fila sellada nombra el mes cuya inflación muestra — ${que}`, () => {
      const r = adjust(1_000_000, desde, hasta, serie, { metodologia: "sin_proyectar" });
      const indices = new Map(serie.datos.map((d) => [d.mes, d.indice]));
      const variacionDe = (mes: Mes) => {
        const previo = deOrdinal(aOrdinal(mes) - 1);
        return (indices.get(mes)! / indices.get(previo)! - 1) * 100;
      };
      // El mes que la serie dice que tuvo esta variación, buscado sin preguntarle a la UI.
      const mesQueVarioAsi = (pct: number) =>
        [...indices.keys()].find(
          (m) =>
            indices.has(deOrdinal(aOrdinal(m) - 1)) && Math.abs(variacionDe(m) - pct) < 1e-9,
        );

      let selladas = 0;
      for (const [i, f] of r.desglose.entries()) {
        if (i === 0 || selloDeFila(f, r) === null) continue;
        selladas += 1;
        expect(f.varMensualPct).toBeGreaterThan(0);
        const mes = mesQueVarioAsi(f.varMensualPct!);
        expect(mes, `ninguna variación de la serie da ${f.varMensualPct}`).toBeDefined();
        expect(rotularFila(r.desglose, i)).toBe(abreviarMes(mes!));
      }
      // Que haya filas selladas de las que hablar: sin esto el `for` vacío pasa solo.
      expect(selladas).toBeGreaterThanOrEqual(4);
    });
  }
});

describe("el renglón del acumulado deflactando", () => {
  const vuelta = adjust(1_000_000, "2026-07", "2026-02", serie, { hoy: "2026-08" });

  it("la nota del compuesto contrapone dos números del mismo signo", () => {
    const texto = explicarCompuesto(vuelta);
    expect(texto).toContain(porcentaje(vuelta.inflacionPct, false));
    // Decía "te va a dar 12,11%, no −11,28%".
    expect(texto).not.toContain(porcentaje(vuelta.variacionPct, false));
  });

  it("el pie avisa dónde quedó el monto que la persona escribió", () => {
    expect(explicarTabla(vuelta)).toContain("está en la última fila y el resultado, en la primera");
    // Yendo para adelante no hay nada que aclarar.
    const ida = adjust(1_000_000, "2026-02", "2026-07", serie, { hoy: "2026-08" });
    expect(explicarTabla(ida)).not.toContain("la última fila");
  });

  /**
   * Y se calla cuando las filas no son el período pedido.
   *
   * Es la misma afirmación que las marcas `← tu monto` / `← el resultado`, así que tiene que
   * callarse en los mismos casos: con la ventana de referencia la última fila dice "jul 2026" y
   * la persona preguntó por agosto. Las marcas se arreglaron y el párrafo de abajo lo seguía
   * diciendo con palabras. Sale del mismo criterio, no de uno propio (regla 4).
   */
  it("no dice dónde quedó el monto cuando las filas no son las pedidas", () => {
    // Sobre la serie recortada en julio: ver `julio` arriba.
    const r = adjust(1_000_000, "2026-08", "2026-03", julio, { hoy: "2026-08" });
    expect(r.metodo.tipo).toBe("ventana_reciente");
    expect(esDeflacion(r)).toBe(true);
    expect(rotuloDeAnclaje(r, r.desglose.length - 1)).toBeNull();
    expect(explicarTabla(r)).not.toContain("la última fila");
  });
});

/**
 * Los meses que la frase nombra tienen que ser los que la tabla muestra (regla 2).
 *
 * Deflactando salían corridos un mes para los dos lados: "los 5 meses que van de junio 2026 a
 * febrero 2026" arriba de una tabla con julio, junio, mayo, abril y marzo. La revisora usuaria
 * fue a buscar febrero y no lo encontró. Salía de `mesDe(f.punto)`, que coincide con el mes
 * del porcentaje sólo yendo para adelante.
 */
describe("los meses que se nombran son los que se pueden contar en la tabla", () => {
  for (const [desde, hasta] of [
    ["2026-08", "2026-03"],
    ["2026-03", "2026-08"],
    ["2026-09", "2026-04"],
    ["2026-04", "2026-09"],
  ] as const) {
    it(`${desde} → ${hasta}`, () => {
      const r = adjust(1_000_000, desde, hasta, serie, { metodologia: "sin_proyectar" });
      const enLaTabla = r.desglose.slice(1).map((_, i) => mesDelTramo(r.desglose, i + 1));
      const textos = [explicarMetodo(r), explicarTabla(r), avisarTramoAjeno(r)].join(" ");
      // Sólo `ventana_reciente` enumera los meses que se usaron; `proyeccion` nombra los que
      // estimó, que son otros, y `directo` no nombra ninguno.
      if (r.metodo.tipo === "ventana_reciente") {
        // Las dos puntas de la enumeración, que es lo que la frase nombra cuando son muchos.
        for (const mes of [enLaTabla[0]!, enLaTabla.at(-1)!]) {
          expect(textos).toContain(nombrarMes(mes));
        }
      }
      // Y ningún mes de más: el que quedó afuera de la tabla no puede aparecer nombrado.
      const afuera = mesDe(r.desglose[0]!.punto);
      if (!enLaTabla.includes(afuera)) expect(textos).not.toContain(nombrarMes(afuera));
    });
  }
});

/**
 * El pie que explica la deflación no puede prometer dato oficial donde no hay ninguno.
 *
 * La frase era incondicional y con un período enteramente estimado quedaba pegada a la
 * anterior contradiciéndola: "Ningún porcentaje de esta tabla es un dato publicado: son todos
 * estimaciones. Vas para atrás en el tiempo, así que los porcentajes son la inflación que hubo
 * —la que publicó el INDEC—". Y en pasado, sobre meses que todavía no llegaron.
 */
describe("la aclaración de la deflación no atribuye nada", () => {
  /**
   * La frase llegó a decir "los porcentajes son la inflación que hubo —la que publicó el
   * INDEC—" de forma incondicional, así que con un período enteramente estimado quedaba pegada
   * a la anterior contradiciéndola: "son todos estimaciones. Vas para atrás en el tiempo, así
   * que los porcentajes son la inflación que hubo —la que publicó el INDEC—". En pasado, sobre
   * meses de 2027. Con el desglose cronológico la frase pasó a hablar sólo de dónde quedó el
   * monto, que es cierto sin importar de dónde salgan los números; el test se queda para que
   * no vuelva a crecerle una atribución.
   */
  for (const [que, desde, hasta, metodologia] of [
    ["todo publicado", "2026-07", "2026-02", "sin_proyectar"],
    ["todo estimado", mas(9), mas(2), "repite_ultimo"],
    ["todo prorrateado", `${menos(1)}-20`, `${menos(1)}-10`, "sin_proyectar"],
  ] as const) {
    it(`no nombra a ningún organismo — ${que}`, () => {
      const r = adjust(1_000_000, desde, hasta, serie, { metodologia });
      const pie = explicarTabla(r);
      expect(pie).toContain("va del mes más viejo al más nuevo");
      const frase = pie.slice(pie.indexOf("La tabla va del mes"));
      for (const sigla of ["INDEC", "BCRA", "publicó"]) {
        expect(frase).not.toContain(sigla);
      }
    });
  }
});

/**
 * Las marcas `← tu monto` y `← el resultado` de la tabla deflactando.
 *
 * Sólo pueden aparecer sobre la fila que **es** el punto que la persona pidió. Con
 * `ventana_reciente` las filas son el tramo de referencia: pidiendo de agosto a marzo, la
 * última dice "jul 2026" y la marca la firmaba como el monto de la persona, con `INDEC ✓` al
 * lado. Antes de la marca la tabla mostraba otros meses y se quedaba callada; señalar uno y
 * llamarlo tuyo es peor que no mostrarlo.
 */
describe("las marcas de la tabla no señalan un mes que no es el pedido", () => {
  it("deflactando sobre el período pedido, marcan las dos puntas", () => {
    const r = adjust(1_000_000, "2026-07", "2026-02", serie, { metodologia: "sin_proyectar" });
    expect(r.metodo.tipo).toBe("directo");
    const marcas = r.desglose.map((_, i) => rotuloDeAnclaje(r, i));
    expect(marcas).toEqual(["el resultado", null, null, null, null, "tu monto"]);
    // Y señalan lo que dicen señalar.
    expect(r.desglose.at(-1)!.monto).toBeCloseTo(r.monto, 6);
    expect(r.desglose[0]!.monto).toBeCloseTo(r.montoAjustado, 6);
  });

  it("con el tramo de referencia no marcan nada, porque ninguna fila es la pedida", () => {
    // Sobre la serie recortada en julio: ver `julio` arriba.
    const r = adjust(1_000_000, "2026-08", "2026-03", julio, { metodologia: "sin_proyectar", hoy: "2026-08" });
    expect(r.metodo.tipo).toBe("ventana_reciente");
    expect(r.desglose.map((_, i) => rotuloDeAnclaje(r, i))).toEqual(r.desglose.map(() => null));
  });

  it("yendo para adelante no marcan nada: están donde cualquiera las busca", () => {
    const r = adjust(1_000_000, "2026-02", "2026-07", serie, { metodologia: "sin_proyectar" });
    expect(r.desglose.map((_, i) => rotuloDeAnclaje(r, i))).toEqual(r.desglose.map(() => null));
  });

  /**
   * El barrido: en ninguna consulta puede quedar una marca sobre una fila cuyo punto no sea
   * exactamente el que se pidió. Es la aserción que no depende de acordarse de los casos.
   */
  it("nunca marcan una fila cuyo punto no es el pedido", () => {
    // `mas(1) → menos(4)` es el cuadrante que motivó el arreglo y que faltaba: deflactar
    // hacia un destino sin publicar, que es lo que entra por `ventana_reciente`. Sin él, la
    // mutación que saca la condición sólo ponía en rojo el test nombrado, no este barrido.
    for (const desde of [ultimo, menos(3), mas(1), mas(2), `${ultimo}-15` as Punto]) {
      for (const hasta of [menos(6), menos(4), menos(1), mas(1), `${menos(2)}-10` as Punto]) {
        for (const metodologia of ["sin_proyectar", "repite_ultimo"] as const) {
          let r: Resultado;
          try {
            r = adjust(520_000, desde, hasta, serie, { metodologia });
          } catch {
            continue;
          }
          for (const [i, f] of r.desglose.entries()) {
            const marca = rotuloDeAnclaje(r, i);
            if (marca === "tu monto") expect(f.punto).toBe(r.desde);
            if (marca === "el resultado") expect(f.punto).toBe(r.hasta);
          }
        }
      }
    }
  });
});

/**
 * El renglón del efecto sobre el monto, que es el que se manda por mensaje.
 *
 * Tenía el verbo cableado en "baja" y un `Math.abs()`, así que sobre un período de deflación
 * leído para atrás afirmaba lo contrario de lo que el renglón de arriba acababa de decir:
 * "$1.000.000 equivalen a $1.007.643" y dos renglones después "lo baja 0,76%". Alcanza al
 * 2,39% de las consultas hacia atrás del índice nacional.
 *
 * Y vivía en `main.ts`, donde ningún test la podía tocar. Que esté acá es lo que le da forma
 * de poder fallar en rojo.
 */
/**
 * Una serie geométrica entre dos meses, con los extremos exactos. Para las frases que sólo
 * dependen del resultado: no leen un archivo vivo, así que un dato nuevo no las cambia.
 */
function serieEntre(desde: Mes, hasta: Mes, indiceDesde: number, indiceHasta: number): SerieIndice {
  const n = diffMeses(desde, hasta);
  const datos = Array.from({ length: n + 1 }, (_, i) => ({
    mes: sumarMeses(desde, i),
    indice: i === 0 ? indiceDesde : i === n ? indiceHasta : indiceDesde * Math.pow(indiceHasta / indiceDesde, i / n),
    origen: "prueba",
  }));
  return {
    serie: "prueba",
    base: "",
    fuentes: [],
    ultimo_oficial: hasta,
    actualizado: "2026-09-11T00:00:00Z",
    datos,
  } as unknown as SerieIndice;
}

/** Los espacios que mete Intl (NBSP) como espacios comunes, para poder escribir la frase. */
const llano = (s: string) => s.replace(/\s/g, " ");

describe("el aviso de moneda", () => {
  const HOY = { metodologia: "sin_proyectar" as const, hoy: "2026-09" };
  /** El aviso como se ve en pantalla, con lo destacado entre asteriscos. */
  const aviso = (r: Resultado) => {
    const partes = avisoDeMoneda(r);
    return partes && llano(partes.map((p) => (p.destacado ? `**${p.texto}**` : p.texto)).join(""));
  };

  /**
   * Arranca con la conversión: es lo que la persona vino a buscar. La primera versión la dejaba
   * en la tercera frase, en letra chica, detrás de "Esta cuenta no le saca los ceros: si tu monto
   * está en pesos ley, el resultado también", que hubo que leer dos veces ("¿también qué?").
   */
  it("1970 → 2026: arranca con cuánto es en pesos, y después explica por qué", () => {
    const s = serieEntre("1970-01", "2026-08", 1, 2.553232137365184e14);
    const r = adjust(1000, "1970-01", "2026-08", s, HOY);
    expect(aviso(r)).toBe(
      "**En pesos de agosto 2026 son $ 2.553.232.** En enero 1970 la moneda era el peso ley 18.188 y esta " +
        "cuenta no le saca los ceros: el número de arriba está en pesos ley, igual que tu monto " +
        "(1 peso = 100.000.000.000 pesos ley).",
    );
    // El texto que se copia dice lo mismo, en el mismo orden y sin formato.
    expect(llano(explicarMoneda(r))).toBe(aviso(r)!.replace(/\*\*/g, ""));
  });

  it("2026 → 1975: no pregunta en qué moneda está un monto de hoy, que sólo puede estar en pesos", () => {
    const s = serieEntre("1975-01", "2026-08", 2.967e-12, 130.7);
    const r = adjust(1_000_000, "2026-08", "1975-01", s, HOY);
    expect(aviso(r)).toBe(
      "**En la moneda de enero 1975 son 2.270 pesos ley.** El número de arriba está en pesos, igual que " +
        "tu monto: esta cuenta no le agrega los ceros (1 peso = 100.000.000.000 pesos ley).",
    );
  });

  it("1990 → 1991, las dos en australes: sólo dice en qué moneda está", () => {
    const s = serieEntre("1990-01", "1991-06", 1, 100);
    const r = adjust(1000, "1990-01", "1991-06", s, HOY);
    expect(aviso(r)).toBe(
      "En enero 1990 y en junio 1991 la moneda era el austral: si tu monto está en australes, el resultado también.",
    );
    expect(llano(explicarMoneda(r))).toBe(aviso(r));
  });

  it("el nacional desde 1990 también lleva el aviso: es el caso más creíble", () => {
    const s = serieEntre("1990-01", "2026-08", 1, 16101.5752);
    const r = adjust(1000, "1990-01", "2026-08", s, HOY);
    expect(aviso(r)).toMatch(/^\*\*En pesos de agosto 2026 son \$ 1\.610\.\*\* /);
    expect(aviso(r)).toContain("(1 peso = 10.000 australes).");
  });

  it("entre dos monedas viejas distintas", () => {
    const s = serieEntre("1983-05", "1985-07", 1, 230);
    const r = adjust(1000, "1983-05", "1985-07", s, HOY);
    expect(aviso(r)).toBe(
      "**En la moneda de julio 1985 son 0,023 australes.** En mayo 1983 la moneda era el peso ley 18.188 y " +
        "esta cuenta no le saca los ceros: el número de arriba está en pesos ley, igual que tu monto " +
        "(1 austral = 10.000.000 pesos ley).",
    );
  });

  it("si lo que se imprime es 1, va en singular", () => {
    const s = serieEntre("1985-05", "1985-07", 1, 1);
    const r = adjust(1000, "1985-05", "1985-07", s, HOY);
    expect(aviso(r)).toMatch(/^\*\*En la moneda de julio 1985 es 1 austral\.\*\* /);
  });

  /**
   * Arriba dice "$ 63.415.892.293" y no es ninguna de las dos cuentas: la primera versión corta
   * destacaba sólo "En junio 1985 cambió la moneda." y ya no decía en qué moneda está ese número.
   */
  it("junio de 1985 como origen: dice en qué moneda está el número de arriba y destaca las dos cuentas", () => {
    const s = serieEntre("1985-06", "2026-08", 1, 1000);
    const r = adjust(1000, "1985-06", "2026-08", s, HOY);
    expect(aviso(r)).toBe(
      "**En junio 1985 cambió la moneda**, y el número de arriba está en la moneda de tu monto. " +
        "Si era en pesos argentinos (hasta el 14): **$ 0,10** de agosto 2026. " +
        "Si era en australes (desde el 15): **$ 100** de agosto 2026.",
    );
    expect(llano(explicarMoneda(r))).toBe(aviso(r)!.replace(/\*\*/g, ""));
  });

  it("una conversión chica no se redondea a entero: 1,081 australes y no 1", () => {
    // Con $1.000 de junio a julio de 1985 decía "son 1 australes": eran 1,081.
    const s = serieEntre("1985-06", "1985-07", 1, 1.0809);
    const r = adjust(1000, "1985-06", "1985-07", s, HOY);
    expect(aviso(r)).toBe(
      "**En junio 1985 cambió la moneda**, y el número de arriba está en la moneda de tu monto. " +
        "Si era en pesos argentinos (hasta el 14): **1,081 australes** de julio 1985. " +
        "Si era en australes (desde el 15): es el número de arriba.",
    );
  });

  it("junio de 1985 como destino: cada cuenta con su moneda después del número, destacada", () => {
    // Decía "son 157,7; en australes (desde el 15), 0,1577", sin decir de qué.
    const s = serieEntre("1985-06", "2026-08", 1, 63415892.293);
    const r = adjust(1000, "2026-08", "1985-06", s, HOY);
    expect(aviso(r)).toBe(
      "**En junio 1985 cambió la moneda**, y el número de arriba está en pesos, igual que tu monto. " +
        "Hasta el 14 son **157,7 pesos argentinos**; desde el 15, **0,1577 australes**.",
    );
  });

  it("mayo → junio de 1985: la moneda va después del número, para no leer 1,321 como el $ 1.321 de arriba", () => {
    const s = serieEntre("1985-05", "1985-06", 1, 1.3213);
    const r = adjust(1000, "1985-05", "1985-06", s, HOY);
    expect(aviso(r)).toBe(
      "**En junio 1985 cambió la moneda**, y el número de arriba está en pesos argentinos, igual que tu monto. " +
        "Hasta el 14 es el número de arriba; desde el 15, **1,321 australes**.",
    );
  });

  /**
   * Con las dos puntas en junio de 1985 armaba "Si tu monto era en pesos argentinos (hasta el 14):
   * en pesos argentinos (hasta el 14) es el número de arriba; en australes (desde el 15), 1. Si era
   * en australes…". El monto y el resultado están en la misma moneda, sea cual sea.
   */
  it("junio → junio de 1985: misma moneda, sin conversión, en una frase", () => {
    const s = serieEntre("1985-05", "1985-07", 1, 1.6);
    const r = adjust(1000, "1985-06", "1985-06", s, HOY);
    expect(aviso(r)).toBe(
      "En junio 1985 cambió la moneda (hasta el 14, el peso argentino; desde el 15, el austral): " +
        "el resultado queda en la misma moneda que tu monto.",
    );
  });

  it("dos días de junio de 1985: el mismo día es una sola moneda, y de un lado al otro del 15 hay conversión", () => {
    const s = serieEntre("1985-05", "1985-07", 1, 1.6);
    const mismoDia = adjust(1000, "1985-06-10", "1985-06-10", s, HOY);
    expect(aviso(mismoDia)).toBe(
      "El 10 de junio de 1985 la moneda era el peso argentino: si tu monto está en pesos argentinos, el resultado también.",
    );
    const cruzaElCambio = adjust(1000, "1985-06-10", "1985-06-20", s, HOY);
    expect(aviso(cruzaElCambio)).toMatch(/^\*\*En la moneda del 20 de junio de 1985 son 1,\d+ australes\.\*\* /);
    expect(aviso(cruzaElCambio)).toContain("El 10 de junio de 1985 la moneda era el peso argentino y esta cuenta no le saca los ceros");
  });

  it("si el resultado se muestra con cifras significativas, la conversión no muestra más", () => {
    // $ 0,01194 por 10.000.000 son 119.400 con la calculadora; decía 119.359 y no cerraba.
    const s = serieEntre("1985-05", "2026-08", 1.56e-6, 130.7);
    const r = adjust(1_000_000, "2026-08", "1985-05", s, HOY);
    expect(aviso(r)).toMatch(/^\*\*En la moneda de mayo 1985 son 119\.400 pesos argentinos\.\*\* /);
  });

  it("con el resultado entre 1 y 999 tampoco: sale de la cifra redondeada que se ve arriba", () => {
    // Arriba "$ 921": decía 9.209.100 australes.
    const nacional = adjust(1_000_000, "2026-08", "1991-12", serieEntre("1991-12", "2026-08", 1, 1085.9), HOY);
    expect(aviso(nacional)).toMatch(/^\*\*En la moneda de diciembre 1991 son 9\.210\.000 australes\.\*\* /);
    // Arriba "$ 40": decía 404.165.
    const cordoba = adjust(1_000_000, "2026-08", "1990-01", serieEntre("1990-01", "2026-08", 1, 24742.6), HOY);
    expect(aviso(cordoba)).toMatch(/^\*\*En la moneda de enero 1990 son 400\.000 australes\.\*\* /);
    // Arriba "$ 925": decía 924.854.
    const julio = adjust(1000, "1985-07", "1985-06", serieEntre("1985-06", "1985-07", 1, 1.0812483), HOY);
    expect(aviso(julio)).toBe(
      "**En junio 1985 cambió la moneda**, y el número de arriba está en australes, igual que tu monto. " +
        "Hasta el 14 son **925.000 pesos argentinos**; desde el 15, el número de arriba.",
    );
  });

  it("en el modo por día nombra el día", () => {
    const s = serieEntre("1969-12", "2026-08", 1, 2.553232137365184e14);
    const r = adjust(1000, "1970-01-15", "2026-08-10", s, HOY);
    expect(aviso(r)).toMatch(/^\*\*En pesos del 10 de agosto de 2026 son \$ [^*]+\*\* /);
    expect(aviso(r)).toContain("** El 15 de enero de 1970 la moneda era el peso ley 18.188 y esta cuenta");
  });

  it("si el resultado va con ~, la conversión también", () => {
    const s = serieEntre("1970-01", "2026-08", 1, 2.553232137365184e14);
    const r = adjust(1000, "1970-01", "2026-10", s, { metodologia: "repite_ultimo", hoy: "2026-10" });
    expect(aviso(r)).toContain("son unos $ ");
  });

  it("con las dos puntas en pesos no dice nada", () => {
    const s = serieEntre("2024-01", "2025-01", 100, 200);
    const r = adjust(1000, "2024-01", "2025-01", s, HOY);
    expect(avisoDeMoneda(r)).toBeNull();
    expect(explicarMoneda(r)).toBe("");
  });
});

describe("el efecto sobre el monto dice para qué lado se movió", () => {
  it("con inflación en el medio, el monto baja al ir para atrás", () => {
    const r = adjust(1_000_000, "2026-07", "2026-02", serie, { metodologia: "sin_proyectar" });
    expect(r.montoAjustado).toBeLessThan(r.monto);
    expect(efectoEnElMonto(r)).toContain("lo baja");
  });

  it("no dice que lo baja 100% cuando no llega a 100", () => {
    // Con Córdoba desde 1968, $1.000.000 de agosto 2026 llevados a enero de 1975 quedan en
    // $0,0000000227: bajan 99,99999999999773%. Redondeado a dos decimales el texto que se copia
    // decía "lo baja 100,00%", que es afirmar que ese millón no valía nada.
    // Con dos meses armados acá y no con `cordoba.json`: este test corre contra el snapshot
    // recién bajado, y una regla de texto no puede frenar la publicación por un dato nuevo.
    const r = adjust(1_000_000, "2026-08", "2026-07", serieEntre("2026-07", "2026-08", 2.967e-12, 130.7), {
      metodologia: "sin_proyectar",
      hoy: "2026-09",
    });
    expect(r.variacionPct).toBeGreaterThan(-100);
    expect(efectoEnElMonto(r)).not.toContain("100,00%");
    expect(efectoEnElMonto(r)).toContain(`lo baja más de ${porcentaje(99.99, false)}`);
  });

  it("con deflación en el medio, el monto sube al ir para atrás", () => {
    // 1999–2001: el único tramo largo de deflación de la serie.
    const r = adjust(1_000_000, "2001-12", "1999-01", serie, { metodologia: "sin_proyectar" });
    expect(r.inflacionPct).toBeLessThan(0);
    expect(r.montoAjustado).toBeGreaterThan(r.monto);
    expect(efectoEnElMonto(r)).toContain("lo sube");
    expect(efectoEnElMonto(r)).not.toContain("lo baja");
  });

  it("yendo para adelante no dice nada, porque los dos números son el mismo", () => {
    const r = adjust(1_000_000, "2026-02", "2026-07", serie, { metodologia: "sin_proyectar" });
    expect(efectoEnElMonto(r)).toBe("");
  });

  /**
   * El barrido: el verbo tiene que coincidir con lo que hace el monto, siempre. Es la aserción
   * que no depende de acordarse de que existió un tramo de deflación en la serie.
   */
  it("el verbo nunca contradice al monto", () => {
    for (const desde of ["2026-07", "2016-08", "2001-12", "2002-06"] as const) {
      for (const hasta of ["2026-02", "2016-07", "1999-01", "2001-03"] as const) {
        let r: Resultado;
        try {
          r = adjust(1_000_000, desde, hasta, serie, { metodologia: "sin_proyectar" });
        } catch {
          continue;
        }
        const frase = efectoEnElMonto(r);
        if (frase === "") continue;
        expect(frase).toContain(r.montoAjustado < r.monto ? "lo baja" : "lo sube");
      }
    }
  });
});


/**
 * `esDeflacion` decide por el **instante**, igual que el motor.
 *
 * Con una comparación de strings o con `compararPuntos`, un mes contra un día de ese mismo mes
 * contesta al revés: `2026-07` termina el 31 y `2026-07-01` es el cierre de junio, así que
 * pedir "de julio al 1 de julio" **es** ir para atrás. Nada ataba esto: cambiarlo al criterio
 * de día 1 dejaba la suite entera en verde.
 */
describe("esDeflacion usa el mismo criterio que el motor", () => {
  for (const [que, desde, hasta, esperado] of [
    ["mes contra el día 1 de ese mes", "2026-07", "2026-07-01", true],
    ["el día 1 contra su mes", "2026-07-01", "2026-07", false],
    ["dos meses, para atrás", "2026-07", "2026-05", true],
    ["dos meses, para adelante", "2026-05", "2026-07", false],
    ["dos días, para atrás", "2026-07-15", "2026-05-10", true],
  ] as const) {
    it(que, () => {
      const r = adjust(1_000_000, desde, hasta, serie, { metodologia: "sin_proyectar" });
      expect(esDeflacion(r)).toBe(esperado);
      // Y coincide con lo que el motor efectivamente hizo: deflactar es que el monto pedido
      // haya quedado en la última fila del recorrido.
      if (r.desglose.length > 1) {
        expect(r.desglose.at(-1)!.punto === r.desde).toBe(esperado);
      }
    });
  }
});
