import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * El `FAQPage` del `<head>` y las preguntas visibles son el mismo contenido escrito dos
 * veces, y ese es exactamente el arreglo que se pudre solo.
 *
 * Si el JSON-LD promete una respuesta que en la página no está, no es sólo una
 * inconsistencia interna: Google la puede mostrar como respuesta destacada, la persona
 * hace clic, no la encuentra, y además es motivo de penalización por datos estructurados
 * que no reflejan la página.
 *
 * Este test es la única razón por la que se puede tener las dos copias sin miedo. Si
 * alguna vez se vuelve molesto de mantener, la salida no es borrarlo: es generar el
 * JSON-LD desde el HTML.
 */

const html = readFileSync(resolve(import.meta.dirname, "../index.html"), "utf8");

type Faq = { name: string; acceptedAnswer: { text: string } };

function jsonLd(): { "@graph": { "@type": string; mainEntity?: Faq[] }[] } {
  const bloque = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if (!bloque) throw new Error("index.html no tiene JSON-LD");
  return JSON.parse(bloque[1]!);
}

/** El texto que se lee en pantalla, sin markup y con la puntuación normalizada. */
function textoVisible(): string {
  const seccion = /<section class="preguntas"[\s\S]*?<\/section>/.exec(html);
  if (!seccion) throw new Error("index.html no tiene el bloque de preguntas frecuentes");
  return seccion[0]
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.:;%])/g, "$1")
    .trim();
}

const preguntas = jsonLd()["@graph"].find((n) => n["@type"] === "FAQPage")?.mainEntity ?? [];
const visible = textoVisible();

describe("el FAQPage del JSON-LD dice lo mismo que la página", () => {
  it("hay preguntas declaradas", () => {
    expect(preguntas.length).toBeGreaterThan(0);
  });

  it("cada pregunta del JSON-LD está escrita en la página", () => {
    for (const q of preguntas) expect(visible).toContain(q.name);
  });

  it("cada oración de cada respuesta está escrita en la página", () => {
    for (const q of preguntas) {
      const oraciones = q.acceptedAnswer.text
        .split(". ")
        .map((o) => o.trim().replace(/\.$/, ""))
        // Las oraciones muy cortas dan falsos positivos por coincidencia.
        .filter((o) => o.length > 25);
      for (const oracion of oraciones) {
        expect(visible, `falta en la página: "${oracion}"`).toContain(oracion);
      }
    }
  });

  it("cada `<summary>` visible tiene su pregunta en el JSON-LD", () => {
    const summaries = [...html.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) =>
      m[1]!.replace(/\s+/g, " ").trim(),
    );
    expect(summaries.length).toBe(preguntas.length);
    const declaradas = new Set(preguntas.map((q) => q.name));
    for (const s of summaries) expect(declaradas).toContain(s);
  });
});
