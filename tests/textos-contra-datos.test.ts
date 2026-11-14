import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sumarMeses } from "../src/engine/mes.js";
import { SLUG_NACIONAL, type CatalogoIndices } from "../src/engine/indices.js";
import type { SerieIndice } from "../src/engine/types.js";
import { INDICES } from "../scripts/indices-declarados.js";

/*
 * Textos escritos a mano contra los datos recién bajados.
 *
 * Cada test de este archivo ata algo que la página afirma con palabras (una fecha de
 * arranque en el FAQ, un número en la salvedad de Chaco) al snapshot. Cuando se pone rojo
 * no es que los datos estén mal: la fuente cambió algo que el texto nombraba, y hay que
 * reescribir el texto.
 *
 * Por eso viven aparte. El snapshot (`npm run test:datos`) los excluye de su gate y
 * commitea los datos igual; los corre después (`npm run test:textos`) para que el job quede
 * en rojo y se vea. El que frenan es el deploy, que corre `npm test` entero: el sitio se
 * queda con los datos de ayer hasta que se arregla el texto, pero ningún índice deja de
 * juntar sus meses en `main` por un texto que habla de otro. Antes frenaban el commit del
 * snapshot, y el 2026-10-02 Chaco paró cinco semanas la publicación de todos los índices,
 * CABA incluido. Decisión de Agustín, 2026-11-10 (card fVUCUrIy); `tests/pipeline.test.ts`
 * ata los dos workflows a esto.
 *
 * Un test nuevo que compare un texto a mano con el snapshot va acá, no en `indices.test.ts`.
 */

const DATOS = resolve(import.meta.dirname, "../public/data");
const leer = <T>(ruta: string): T => JSON.parse(readFileSync(resolve(DATOS, ruta), "utf8")) as T;

const catalogo = leer<CatalogoIndices>("indices.json");
const serieDe = (slug: string): SerieIndice =>
  slug === SLUG_NACIONAL ? leer<SerieIndice>("ipc.json") : leer<SerieIndice>(`indices/${slug}.json`);

describe("las fechas que las preguntas frecuentes dicen a mano", () => {
  // El FAQ de `index.html` —y su copia en el JSON-LD, y dos párrafos de `datos.html`—
  // nombra fechas de arranque: "Chaco en 1960, Santa Fe en diciembre de 2013, las seis
  // regiones en diciembre de 2016". Son texto estático, así que si el arranque de una
  // serie cambia, la página sigue afirmando lo viejo y nadie se entera. Ya pasó adentro de
  // este mismo cambio: el recorte por huecos movió a Mendoza de 1968 a 2016.
  //
  // Este test SÍ frena el deploy si se pone rojo, al revés que los de la ventana corrida.
  // Que un índice publique un mes nuevo es lo normal y no puede bloquear nada; que
  // **cambie dónde arranca** es raro, y mientras no se arregle el texto la página estaría
  // afirmando algo falso. El commit del snapshot no lo frena (ver arriba).
  const arranque = (slug: string) =>
    catalogo.indices.find((i) => i.slug === slug)?.primerMes ?? "(no está en el catálogo)";
  const anioDe = (slug: string) => arranque(slug).slice(0, 4);

  it("siguen siendo verdad", () => {
    // El nacional y Santa Fe llevan mes en la página ("desde enero de 1990", "Santa Fe en
    // diciembre de 2013") y se comparan al mes. Chaco y Córdoba sólo llevan el año ("Chaco
    // en 1960", "Córdoba en 1968") y se comparan sólo al año. Chaco arrancaba en 1988 hasta
    // que el MCP reescribió sus filas viejas con el float completo (2026-10-02): ahí pasó a
    // 1960, y este test, que entonces frenaba el commit del snapshot, paró cinco semanas a
    // todos los índices, CABA incluido. Cuando se ponga rojo, se arregla el texto el mismo día.
    expect({
      nacional: arranque(SLUG_NACIONAL),
      santaFe: arranque("santa-fe"),
    }).toEqual({
      nacional: "1990-01",
      santaFe: "2013-12",
    });
    expect({ chaco: anioDe("chaco"), cordoba: anioDe("cordoba") }).toEqual({
      chaco: "1960",
      cordoba: "1968",
    });
  });

  it("y las seis regiones siguen arrancando todas en el mismo mes", () => {
    const regiones = catalogo.indices.filter((i) => i.tipo === "region");
    expect([...new Set(regiones.map((i) => i.primerMes))]).toEqual(["2016-12"]);
  });
});

describe("la salvedad de Chaco dice números que salen de chaco.json", () => {
  // La salvedad (en `indices-declarados.ts`, y su párrafo en `datos.html`) cita a mano tres
  // cosas de la serie histórica: junio de 1965 da −10,51%, julio +19,70%, y julio de 1976 vale
  // la décima parte que sus vecinos. Igual que las fechas del FAQ, este test TIENE que frenar
  // el deploy si se pone rojo: quiere decir que la provincia (o datos.gob.ar) corrigió la
  // serie y la página estaría avisando de un defecto que ya no está. Ese día se reescribe la
  // salvedad, o se saca si ya no hace falta.
  const datos = serieDe("chaco").datos;
  const valor = (mes: string) => datos.find((p) => p.mes === mes)?.indice ?? Number.NaN;
  const variacion = (mes: string) => {
    const anterior = sumarMeses(mes, -1);
    return ((valor(mes) / valor(anterior) - 1) * 100).toFixed(2).replace(".", ",").replace("-", "−");
  };
  const declarada = INDICES.find((i) => i.slug === "chaco")?.salvedad?.texto ?? "";
  const pagina = readFileSync(resolve(import.meta.dirname, "../datos.html"), "utf8");
  const parrafo = /<p id="salvedad-chaco">([\s\S]*?)<\/p>/.exec(pagina)?.[1] ?? "";

  it("junio de 1973", () => {
    expect(variacion("1973-06")).toBe("−10,43");
    for (const texto of [declarada, parrafo]) expect(texto).toContain("−10,43%");
  });

  it("junio y julio de 1965", () => {
    expect([variacion("1965-06"), variacion("1965-07")]).toEqual(["−10,51", "19,70"]);
    for (const texto of [declarada, parrafo]) {
      expect(texto).toContain("−10,51%");
      expect(texto).toContain("+19,70%");
    }
  });

  it("julio de 1976 vale alrededor de la décima parte de junio y de agosto", () => {
    for (const vecino of ["1976-06", "1976-08"]) {
      const razon = valor(vecino) / valor("1976-07");
      expect(razon).toBeGreaterThan(8);
      expect(razon).toBeLessThan(12);
    }
    for (const texto of [declarada, parrafo]) {
      expect(texto).toMatch(/julio\s+de\s+1976\s+vale\s+la\s+décima\s+parte/);
      // Y para qué lado: el índice de julio es bajo, así que empezar ahí da de más.
      expect(texto).toMatch(/empieza\s+en\s+julio\s+de\s+1976\s+da\s+unas\s+diez\s+veces\s+de\s+más/);
      expect(texto).toMatch(/del\s+2\s+de\s+julio\s+al\s+31\s+de\s+agosto/);
    }
  });

  it("el tramo que cubre es el que dice la página", () => {
    expect(INDICES.find((i) => i.slug === "chaco")?.salvedad?.hasta).toBe("1988-12");
    expect(parrafo).toContain("de 1960 a 1988");
  });
});
