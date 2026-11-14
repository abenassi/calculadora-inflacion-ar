import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * Qué rojo frena qué. Un test que ata un texto escrito a mano (el FAQ, la salvedad de
 * Chaco) a los datos se pone rojo cuando la fuente cambia algo que la página nombraba, y
 * eso no es un defecto de los datos: el 2026-10-02 Chaco pasó de arrancar en 1988 a 1960,
 * ese test frenaba el commit del snapshot y la publicación de **todos** los índices quedó
 * parada cinco semanas, CABA incluido.
 *
 * Decisión de Agustín (2026-11-10, card fVUCUrIy): el snapshot commitea los datos igual y
 * esos tests frenan sólo el deploy. El sitio se queda con los datos de ayer hasta que se
 * arregla el texto, pero `main` sigue juntando los datos de todos los índices y el día que
 * se arregla se publica todo junto.
 */
const raiz = resolve(import.meta.dirname, "..");
const leer = (ruta: string) => readFileSync(resolve(raiz, ruta), "utf8");
const scripts = (JSON.parse(leer("package.json")) as { scripts: Record<string, string> }).scripts;
const snapshot = leer(".github/workflows/snapshot.yml");
const deploy = leer(".github/workflows/deploy.yml");

const TEXTOS = "tests/textos-contra-datos.test.ts";

/**
 * Los `run:` de un workflow, en orden. Uno de bloque (`run: |`) junta sus líneas; los
 * comentarios que encabezan el paso siguiente caen en el trozo de éste y se descartan.
 */
const pasos = (yml: string): string[] =>
  yml
    .split(/\n\s*- /)
    .map((paso) => /run: ([\s\S]*)/.exec(paso)?.[1] ?? "")
    .map((run) =>
      run
        .split("\n")
        .filter((linea) => !linea.trim().startsWith("#"))
        .join("\n")
        .replace(/^\|/, "")
        .trim(),
    )
    .filter(Boolean);

describe("los tests de texto contra datos frenan el deploy, no el snapshot", () => {
  it("viven en un archivo propio, y los de antes ya no están mezclados con el resto", () => {
    expect(existsSync(resolve(raiz, TEXTOS))).toBe(true);
    const textos = leer(TEXTOS);
    expect(textos).toContain("las fechas que las preguntas frecuentes dicen a mano");
    expect(textos).toContain("la salvedad de Chaco dice números que salen de chaco.json");
    const indices = leer("tests/indices.test.ts");
    expect(indices).not.toContain("las fechas que las preguntas frecuentes dicen a mano");
    expect(indices).not.toContain("la salvedad de Chaco dice números que salen de chaco.json");
  });

  it("el gate del snapshot corre todo menos ese archivo", () => {
    expect(scripts["test:datos"]).toBe(`vitest run --exclude ${TEXTOS}`);
    expect(scripts["test:textos"]).toBe(`vitest run ${TEXTOS}`);
    const run = pasos(snapshot);
    const gate = run.indexOf("npm run test:datos");
    const commit = run.findIndex((r) => r.includes("git commit"));
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(commit).toBeGreaterThan(gate);
    // Ningún `npm test` pelado antes del commit: ése frenaba los datos por un texto.
    expect(run.slice(0, commit)).not.toContain("npm test");
  });

  it("y los corre después de commitear, para que el job quede en rojo y se vea", () => {
    const run = pasos(snapshot);
    const commit = run.findIndex((r) => r.includes("git commit"));
    const textos = run.indexOf("npm run test:textos");
    expect(textos).toBeGreaterThan(commit);
    // Después de la frescura, que no lleva `if`: detrás de un rojo de textos (que puede durar
    // semanas) se saltearía, y un IPC atrasado pasaría callado.
    expect(textos).toBeGreaterThan(run.indexOf("npx tsx scripts/verificar-frescura.ts"));
    // Y corre aunque haya fallado el dispatch o la frescura.
    const paso = snapshot.split(/\n\s*- /).find((p) => p.includes("run: npm run test:textos")) ?? "";
    expect(paso).toContain("if: ${{ !cancelled() && steps.snapshot.outcome == 'success' }}");
  });

  it("el deploy corre la suite entera antes del build, textos incluidos", () => {
    // `npm test` tiene que seguir siendo la suite entera: si algún día excluye los textos,
    // el deploy deja de frenar y nada se pone rojo.
    expect(scripts.test).toBe("vitest run");
    const run = pasos(deploy);
    expect(run.indexOf("npm test")).toBeGreaterThanOrEqual(0);
    expect(run.indexOf("npm test")).toBeLessThan(run.indexOf("npm run build"));
  });
});
