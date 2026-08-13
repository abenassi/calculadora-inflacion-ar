# Colectores de IPC jurisdiccional (CABA, Río Negro, Córdoba) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar en el MCP tres series de IPC de nivel general —`ipc:caba`, `ipc:rio_negro` y `ipc:cordoba`— que hoy sólo existen en datos.gob.ar congeladas.

**Architecture:** Tres colectores con el patrón de `collect_rem.ts`: bajar un archivo de una URL estable, parsearlo validando el layout, y escribir `series_catalog` + `series_data`. A diferencia del REM no hace falta tabla cruda: acá el archivo ya es la serie. Lo común a los tres (upsert del catálogo, verificación de continuidad) vive en un módulo nuevo, `lib/ipc-jurisdiccional.ts`.

**Tech Stack:** TypeScript, `xlsx` (SheetJS, ya es dependencia), `pg`, vitest.

**Spec:** `docs/superpowers/specs/2026-08-13-indices-provinciales-design.md` — vive en este repo junto al plan; **el código va en `~/repos/argentina-data-mcp`**, que quedó sin tocar a propósito porque su checkout está compartido con otras ramas.

## Global Constraints

- **Castellano rioplatense** en todo lo visible y en los comentarios y mensajes de commit. Los comentarios explican **por qué**, no qué.
- **Las tres series son nivel general y nada más.** El spec descarta explícitamente núcleo, estacionales, regulados y divisiones. No agregarlas aunque los archivos las traigan.
- **`fecha_fin` es real, no futura.** A diferencia de `rem:ipc_mensual`, acá `dato_atrasado` sí sirve y tiene que quedar funcionando.
- **UPSERT, nunca TRUNCATE.** Regla del repo para todos los colectores.
- **El parseo valida el layout y muere ruidosamente si cambió.** Igual que `HEADER_ESPERADO` en `collect_rem.ts`: un archivo reordenado en silencio guarda la columna equivocada.
- **`fuente_url` es la publicación citable, no el xlsx.** `series_metadata` le devuelve ese campo al usuario.
- **Verificar con:** `npm run typecheck && npx vitest run src/collectors/<archivo>.test.ts`

## Datos verificados a mano el 2026-08-13

No hace falta volver a averiguar nada de esto; está todo confirmado descargando los archivos.

| | CABA | Río Negro | Córdoba |
|---|---|---|---|
| Cobertura | 2012-07 → 2026-07 | 1973-01 → 2026-07 | 1968-01 → 2026-07 |
| Empalme | ya viene hecho de origen | serie única | ya viene hecho de origen |
| Hoja | `Nivel_general_empalme` | `Índices` | `IPC Empalme desde 1968` |
| Layout | dos columnas, mes e índice | matriz meses × años | dos columnas, mes e índice |
| Base | 2021 = 100 | sin declarar | jun-nov 2025 = 100 |
| Organismo | IDECBA | DEyC Río Negro | DGEyC Córdoba |

**Ninguno de los tres necesita que empalmemos nosotros.** Es el hallazgo que más trabajo ahorra respecto de lo que decía el spec sobre Córdoba: la hoja `IPC Empalme desde 1968` ya trae la serie entera en la base nueva.

**Los índices viejos son números extremos y está bien.** Córdoba arranca en `4.33e-13` porque encadena hacia atrás cuatro cambios de moneda. Es correcto para un cociente y `float64` lo banca sin perder precisión. No "arreglarlo" reescalando.

---

### Task 1: Módulo común `lib/ipc-jurisdiccional.ts`

Lo que los tres colectores comparten. Se hace primero porque las tres tareas siguientes lo consumen.

**Files:**
- Create: `src/collectors/lib/ipc-jurisdiccional.ts`
- Test: `src/collectors/lib/ipc-jurisdiccional.test.ts`

**Interfaces:**
- Consumes: `upsertSeriesData`, `refrescarStatsCatalogo` de `./series-data-writer.js`; `pool` de `../../db/pool.js`.
- Produces:
  - `interface PuntoMensual { mes: string; valor: number }` — `mes` es ISO del primer día (`"2026-07-01"`).
  - `interface SerieJurisdiccionalDef { serie_id, aliases, nombre, descripcion, fuente, organismo, unidad, fuente_url }` (todos `string`, `aliases: string[]`).
  - `function verificarContinuidadMensual(puntos: PuntoMensual[], nombre: string): PuntoMensual[]`
  - `function celdaFechaMes(v: unknown): string | null`
  - `async function publicarSerie(def: SerieJurisdiccionalDef, puntos: PuntoMensual[]): Promise<number>`

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/collectors/lib/ipc-jurisdiccional.test.ts
import { describe, it, expect } from "vitest";
import { verificarContinuidadMensual, celdaFechaMes } from "./ipc-jurisdiccional.js";

describe("celdaFechaMes", () => {
  it("normaliza un Date al primer día de su mes, con los getters locales", () => {
    // SheetJS con cellDates:true construye los Date en hora LOCAL y no siempre
    // clava la medianoche. Por eso NO se usa toISOString: ver collect_rem.ts.
    expect(celdaFechaMes(new Date(2026, 6, 1, 0, 0, 48))).toBe("2026-07-01");
    expect(celdaFechaMes(new Date(2012, 6, 15))).toBe("2012-07-01");
  });

  it("devuelve null para lo que no es una fecha", () => {
    expect(celdaFechaMes("Fuente: Dirección de Estadística")).toBeNull();
    expect(celdaFechaMes(null)).toBeNull();
    expect(celdaFechaMes(new Date("no es fecha"))).toBeNull();
  });
});

describe("verificarContinuidadMensual", () => {
  const p = (mes: string, valor: number) => ({ mes, valor });

  it("devuelve la serie tal cual si es continua", () => {
    const serie = [p("2026-01-01", 100), p("2026-02-01", 102), p("2026-03-01", 105)];
    expect(verificarContinuidadMensual(serie, "test")).toEqual(serie);
  });

  it("ordena una serie que viene desordenada", () => {
    const serie = [p("2026-03-01", 105), p("2026-01-01", 100), p("2026-02-01", 102)];
    expect(verificarContinuidadMensual(serie, "test").map((x) => x.mes)).toEqual([
      "2026-01-01", "2026-02-01", "2026-03-01",
    ]);
  });

  it("ante un hueco se queda con la cola continua más reciente, no con la serie entera", () => {
    // Una serie con agujeros la lee el motor como si fueran meses contiguos y da
    // una variación mensual que nadie publicó. Preferimos menos historia y correcta.
    const serie = [
      p("1968-01-01", 1), p("1968-02-01", 2),
      p("2020-01-01", 90), p("2020-02-01", 95), p("2020-03-01", 99),
    ];
    const out = verificarContinuidadMensual(serie, "test");
    expect(out.map((x) => x.mes)).toEqual(["2020-01-01", "2020-02-01", "2020-03-01"]);
  });

  it("descarta duplicados quedándose con el último valor", () => {
    const serie = [p("2026-01-01", 100), p("2026-01-01", 101), p("2026-02-01", 102)];
    expect(verificarContinuidadMensual(serie, "test")).toEqual([
      p("2026-01-01", 101), p("2026-02-01", 102),
    ]);
  });

  it("explota si no queda ningún punto", () => {
    expect(() => verificarContinuidadMensual([], "test")).toThrow(/vino vacía/);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/collectors/lib/ipc-jurisdiccional.test.ts`
Expected: FAIL — `Failed to resolve import "./ipc-jurisdiccional.js"`

- [ ] **Step 3: Escribir el módulo**

```ts
// src/collectors/lib/ipc-jurisdiccional.ts
/**
 * Lo que comparten los colectores de IPC de una jurisdicción (CABA, Río Negro, Córdoba).
 *
 * Los tres bajan un archivo distinto con un layout distinto, pero terminan haciendo lo
 * mismo: una lista de (mes, índice) que se publica como serie del catálogo. El parseo es
 * de cada uno; de acá para adelante es común.
 *
 * Por qué existe como módulo y no copiado tres veces: el upsert del catálogo tiene dos
 * detalles que se olvidan y no fallan ruidosamente —refrescar `valores_cant` (sin eso la
 * serie queda invisible en `series_search`) y que el `DO UPDATE` toque TODAS las columnas
 * (si no, corregir la unidad en el código no llega nunca a una fila ya creada)—. Escrito
 * una vez, se arreglan una vez.
 */

import { pool } from "../../db/pool.js";
import { upsertSeriesData, refrescarStatsCatalogo, type FilaSerie } from "./series-data-writer.js";

/** Un punto mensual. `mes` es el ISO del primer día del mes: `"2026-07-01"`. */
export interface PuntoMensual {
  mes: string;
  valor: number;
}

export interface SerieJurisdiccionalDef {
  serie_id: string;
  aliases: string[];
  nombre: string;
  descripcion: string;
  /** Sigla corta del emisor, la que va en el campo `fuente`. Ej: "IDECBA". */
  fuente: string;
  /** Nombre completo del organismo. */
  organismo: string;
  unidad: string;
  /** La publicación citable, NO el xlsx: `series_metadata` le devuelve esto al usuario. */
  fuente_url: string;
}

/**
 * `YYYY-MM-01` de una celda de fecha, leída con los getters LOCALES.
 *
 * SheetJS con `cellDates: true` construye los Date en hora local y no siempre clava la
 * medianoche exacta, así que `toISOString()` puede correr el día —y con él el mes, si la
 * celda cae un día 1—. El porqué largo está en `celdaFecha` de `collect_rem.ts`.
 */
export function celdaFechaMes(v: unknown): string | null {
  if (!(v instanceof Date) || Number.isNaN(v.getTime())) return null;
  const mm = String(v.getMonth() + 1).padStart(2, "0");
  return `${v.getFullYear()}-${mm}-01`;
}

/** Meses de diferencia entre dos ISO de primer día de mes. */
function diffMeses(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

/**
 * Ordena, deduplica y **recorta la serie a su cola continua más reciente**.
 *
 * Un hueco no se puede dejar pasar: el consumidor lee los puntos como si fueran meses
 * contiguos, así que un salto de 1968 a 2020 le hace calcular una "variación mensual" de
 * cincuenta años. Y tampoco se puede rellenar, porque cualquier relleno es un número que
 * no publicó nadie. Queda recortar: menos historia, toda cierta.
 *
 * Que el recorte se vea es parte del contrato — el caller loguea cuánto se descartó.
 */
export function verificarContinuidadMensual(
  puntos: PuntoMensual[],
  nombre: string,
): PuntoMensual[] {
  if (puntos.length === 0) throw new Error(`La serie ${nombre} vino vacía`);

  const porMes = new Map<string, number>();
  for (const p of puntos) porMes.set(p.mes, p.valor);

  const ordenados = [...porMes.entries()]
    .map(([mes, valor]) => ({ mes, valor }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  // Se camina desde el final hacia atrás y se corta en el primer salto.
  let inicio = 0;
  for (let i = ordenados.length - 1; i > 0; i--) {
    if (diffMeses(ordenados[i - 1]!.mes, ordenados[i]!.mes) !== 1) {
      inicio = i;
      break;
    }
  }

  return ordenados.slice(inicio);
}

/**
 * Escribe la definición de la serie y sus puntos. Devuelve cuántos puntos se escribieron.
 */
export async function publicarSerie(
  def: SerieJurisdiccionalDef,
  puntos: PuntoMensual[],
): Promise<number> {
  await pool.query(
    `INSERT INTO series_catalog (
       serie_id, aliases, nombre, descripcion, fuente, organismo, tema, frecuencia, unidad,
       fuente_url, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'precios', 'mensual', $7, $8, $9)
     ON CONFLICT (serie_id) DO UPDATE SET
       aliases = EXCLUDED.aliases,
       nombre = EXCLUDED.nombre,
       descripcion = EXCLUDED.descripcion,
       fuente = EXCLUDED.fuente,
       organismo = EXCLUDED.organismo,
       tema = EXCLUDED.tema,
       frecuencia = EXCLUDED.frecuencia,
       unidad = EXCLUDED.unidad,
       fuente_url = EXCLUDED.fuente_url,
       metadata = EXCLUDED.metadata`,
    [
      def.serie_id,
      def.aliases,
      def.nombre,
      def.descripcion,
      def.fuente,
      def.organismo,
      def.unidad,
      def.fuente_url,
      JSON.stringify({ tipo: "indice_precios", cobertura: "nivel general" }),
    ],
  );

  const filas: FilaSerie[] = puntos.map((p) => ({
    serieId: def.serie_id,
    fecha: p.mes,
    valor: p.valor,
  }));
  await upsertSeriesData(filas);

  // Sin esto la serie queda cargada pero con `valores_cant` viejo, y `series_search` la
  // reporta como `sin_datos`. Es el defecto que documenta `collect_presupuesto.ts`.
  await refrescarStatsCatalogo([def.serie_id]);

  return filas.length;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/collectors/lib/ipc-jurisdiccional.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/collectors/lib/ipc-jurisdiccional.ts src/collectors/lib/ipc-jurisdiccional.test.ts
git commit -m "Una serie con huecos miente más que una serie corta

Los tres colectores de IPC jurisdiccional que vienen comparten el upsert del catálogo
y la verificación de continuidad. Lo segundo es lo que importa: el consumidor lee los
puntos como meses contiguos, así que un salto de 1968 a 2020 le hace calcular una
variación mensual de cincuenta años. Rellenar el hueco sería inventar un número que no
publicó nadie, así que se recorta a la cola continua más reciente."
```

---

### Task 2: Colector `ipc:caba`

**Files:**
- Create: `src/collectors/collect_ipc_caba.ts`
- Test: `src/collectors/collect_ipc_caba.test.ts`

**Interfaces:**
- Consumes: `PuntoMensual`, `celdaFechaMes`, `verificarContinuidadMensual`, `publicarSerie` de `./lib/ipc-jurisdiccional.js`; `recordFreshnessOutcome` de `./freshness.js`; `CollectorResult` de `../types/collector.js`.
- Produces: `export function parsearIpcba(buffer: Buffer): PuntoMensual[]`, `export async function collectIpcCaba(): Promise<CollectorResult>`.

**Contexto verificado.** El archivo vive en `/wp-content/uploads/YYYY/MM/`, o sea que **la URL se mueve**. Lo estable es el post 185751 del custom post type `banco_datos`; su página tiene exactamente un `.xlsx` y es el que buscamos. Confirmado el 2026-08-13:
`GET /eyc/wp-json/wp/v2/banco_datos/185751?_fields=link` → la página → un solo `.xlsx`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/collectors/collect_ipc_caba.test.ts
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parsearIpcba } from "./collect_ipc_caba.js";

/** Reproduce el layout real: título, fila en blanco, encabezado de dos filas, datos, notas. */
function armarLibro(filas: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ["IPCBA (base 2021 = 100). Nivel General."],
    [],
    ["Mes", "Índice1"],
    ["", "Nivel General"],
    ...filas,
    ["1 Base 2021 = 100."],
    ["Fuente: Instituto de Estadística y Censos (IDECBA)"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Nivel_general_empalme");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("parsearIpcba", () => {
  it("extrae los pares (mes, índice) y descarta las notas al pie", () => {
    const buf = armarLibro([
      [new Date(2012, 6, 1), 6.436387689880368],
      [new Date(2026, 5, 1), 2480.63],
      [new Date(2026, 6, 1), 2553.4],
    ]);
    expect(parsearIpcba(buf)).toEqual([
      { mes: "2012-07-01", valor: 6.436387689880368 },
      { mes: "2026-06-01", valor: 2480.63 },
      { mes: "2026-07-01", valor: 2553.4 },
    ]);
  });

  it("explota si IDECBA renombra la hoja", () => {
    const ws = XLSX.utils.aoa_to_sheet([["Mes", "Índice1"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Otra_hoja");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    expect(() => parsearIpcba(buf)).toThrow(/Nivel_general_empalme/);
  });

  it("explota si cambia el encabezado en vez de leer la columna equivocada", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["IPCBA"], [], ["Período", "Variación"], ["", "Nivel General"],
      [new Date(2026, 6, 1), 2553.4],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Nivel_general_empalme");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    expect(() => parsearIpcba(buf)).toThrow(/layout/i);
  });

  it("ignora filas sin valor numérico", () => {
    const buf = armarLibro([
      [new Date(2026, 5, 1), 2480.63],
      [new Date(2026, 6, 1), "s/d"],
    ]);
    expect(parsearIpcba(buf)).toEqual([{ mes: "2026-06-01", valor: 2480.63 }]);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/collectors/collect_ipc_caba.test.ts`
Expected: FAIL — no existe `./collect_ipc_caba.js`.

- [ ] **Step 3: Escribir el colector**

```ts
// src/collectors/collect_ipc_caba.ts
/**
 * IPCBA — Índice de Precios al Consumidor de la Ciudad de Buenos Aires (IDECBA).
 *
 * Existe porque la copia que republica datos.gob.ar (`indec:193.2_NIVEL_GENERAL_2021_...`)
 * quedó congelada en enero de 2026 mientras IDECBA sigue publicando todos los meses. No es
 * un bug del MCP: el republicador se quedó. Medido el 2026-08-13: acá llegamos a julio, la
 * copia de datos.gob.ar a enero.
 *
 * La serie viene **ya empalmada de origen** con la base anterior (julio 2011 - junio 2012 =
 * 100), así que no armamos ningún empalme propio. Es la razón para preferir este archivo
 * antes que reconstruirlo.
 *
 * ── POR QUÉ NO SE PIDE LA URL DEL XLSX DIRECTO ──
 * El archivo cuelga de `/wp-content/uploads/AAAA/MM/`, o sea que la URL cambia cada vez que
 * IDECBA lo vuelve a subir. Lo estable es la ficha del banco de datos (post 185751), que
 * tiene exactamente un `.xlsx`. Resolver por ahí es la diferencia entre un colector que
 * dura y uno que se rompe el mes que reemplacen el archivo.
 */

import * as XLSX from "xlsx";
import type { CollectorResult } from "../types/collector.js";
import { recordFreshnessOutcome } from "./freshness.js";
import {
  celdaFechaMes,
  publicarSerie,
  verificarContinuidadMensual,
  type PuntoMensual,
  type SerieJurisdiccionalDef,
} from "./lib/ipc-jurisdiccional.js";

const SOURCE = "ipc_caba";

/** Ficha del banco de datos de la serie de nivel general empalmada. */
const POST_ID = 185751;
const REST_POST_URL = `https://www.estadisticaciudad.gob.ar/eyc/wp-json/wp/v2/banco_datos/${POST_ID}?_fields=link`;
const LANDING_URL =
  "https://www.estadisticaciudad.gob.ar/eyc/category/banco-de-datos/indice-de-precios-al-consumidor-ipcba/";

const SHEET = "Nivel_general_empalme";
const TIMEOUT_MS = 60_000;

/** Fila 3 (índice 2): encabezado. Se valida para no leer una columna que cambió de sentido. */
const HEADER_ROW_INDEX = 2;
const HEADER_ESPERADO = ["Mes", "Índice1"] as const;

const SERIE: SerieJurisdiccionalDef = {
  serie_id: "ipc:caba",
  aliases: ["ipcba", "ipc_caba", "inflacion_caba"],
  nombre: "IPC Ciudad de Buenos Aires — nivel general (IDECBA)",
  descripcion:
    "Índice de Precios al Consumidor de la Ciudad Autónoma de Buenos Aires (IPCBA), nivel " +
    "general, base 2021 = 100, empalmado por IDECBA con la serie anterior (base julio 2011 - " +
    "junio 2012 = 100). Mide precios en la Ciudad de Buenos Aires, NO en el conurbano: para " +
    "el aglomerado completo está el IPC GBA del INDEC. Es un índice provincial, distinto del " +
    "IPC nacional de INDEC (alias 'inflacion')",
  fuente: "IDECBA",
  organismo: "Instituto de Estadística y Censos de la Ciudad Autónoma de Buenos Aires (IDECBA)",
  unidad: "Índice base 2021=100",
  fuente_url: LANDING_URL,
};

export function parsearIpcba(buffer: Buffer): PuntoMensual[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[SHEET];
  if (!ws) {
    throw new Error(
      `La hoja "${SHEET}" no existe en el xlsx del IPCBA (hojas: ${wb.SheetNames.join(", ")})`,
    );
  }

  const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    range: HEADER_ROW_INDEX,
    raw: true,
  });

  const header = (filas[0] ?? []).map((c) => String(c ?? "").trim());
  if (HEADER_ESPERADO.some((h, i) => header[i] !== h)) {
    throw new Error(
      `Cambió el layout de "${SHEET}". Esperado: [${HEADER_ESPERADO.join(" | ")}] — ` +
        `recibido: [${header.join(" | ")}]`,
    );
  }

  const out: PuntoMensual[] = [];
  // Se saltea el encabezado y la subfila "Nivel General". Las notas al pie caen solas:
  // su primera celda es texto y `celdaFechaMes` devuelve null.
  for (const r of filas.slice(1)) {
    const mes = celdaFechaMes(r[0]);
    const valor = r[1];
    if (!mes || typeof valor !== "number" || !Number.isFinite(valor)) continue;
    out.push({ mes, valor });
  }
  return out;
}

async function resolverUrlXlsx(): Promise<string> {
  const res = await fetch(REST_POST_URL, {
    headers: { "User-Agent": "argentina-data-mcp/collector" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} resolviendo la ficha ${POST_ID} de IDECBA`);
  const { link } = (await res.json()) as { link?: string };
  if (!link) throw new Error(`La ficha ${POST_ID} de IDECBA no trajo 'link'`);

  const pagina = await fetch(link, {
    headers: { "User-Agent": "argentina-data-mcp/collector" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!pagina.ok) throw new Error(`HTTP ${pagina.status} bajando ${link}`);
  const html = await pagina.text();

  const encontrados = [...new Set(html.match(/https:\/\/[^"'\s]+\.xlsx/g) ?? [])];
  if (encontrados.length !== 1) {
    // Cero significa que cambió la ficha; más de uno, que ya no se puede elegir sin
    // adivinar. Las dos son motivo para parar, no para agarrar el primero.
    throw new Error(
      `Se esperaba exactamente un .xlsx en la ficha ${POST_ID} de IDECBA y hay ` +
        `${encontrados.length}: [${encontrados.join(", ")}]`,
    );
  }
  return encontrados[0]!;
}

export async function collectIpcCaba(): Promise<CollectorResult> {
  const start = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  let count = 0;
  let ultimoMes: string | null = null;

  try {
    const url = await resolverUrlXlsx();
    console.log(`[${SOURCE}] Bajando ${url}`);
    const res = await fetch(url, {
      headers: { "User-Agent": "argentina-data-mcp/collector" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} bajando ${url}`);

    const crudos = parsearIpcba(Buffer.from(await res.arrayBuffer()));
    const puntos = verificarContinuidadMensual(crudos, SERIE.serie_id);
    if (puntos.length < crudos.length) {
      warnings.push(
        `${SERIE.serie_id}: la serie traía huecos; se descartaron ${crudos.length - puntos.length} ` +
          `punto(s) previos al último tramo continuo`,
      );
    }

    count = await publicarSerie(SERIE, puntos);
    ultimoMes = puntos.at(-1)!.mes;
    console.log(`[${SOURCE}] ${count} puntos, hasta ${ultimoMes}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    console.error(`[${SOURCE}] Falló: ${msg}`);
  }

  await recordFreshnessOutcome({
    source: SOURCE,
    healthy: errors.length === 0,
    errorMessage: errors.length > 0 ? errors.join("; ") : null,
    lastDataDate: errors.length === 0 ? ultimoMes : null,
  });

  return {
    source: SOURCE,
    recordsUpserted: count,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
    durationMs: Date.now() - start,
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/collectors/collect_ipc_caba.test.ts && npm run typecheck`
Expected: PASS — 4 tests, typecheck limpio.

- [ ] **Step 5: Correrlo de verdad contra la fuente**

Run: `npx tsx -e "import('./src/collectors/collect_ipc_caba.js').then(m => m.collectIpcCaba()).then(r => console.log(r))"`
Expected: `recordsUpserted` ≈ 169, sin errores. Verificar en la base:

```bash
cd /tmp && ~/bin/argdata-db "SELECT min(fecha), max(fecha), count(*) FROM series_data WHERE serie_id='ipc:caba'"
```
Expected: `2012-07-01 | 2026-07-01 | 169`

- [ ] **Step 6: Commit**

```bash
git add src/collectors/collect_ipc_caba.ts src/collectors/collect_ipc_caba.test.ts
git commit -m "El IPCBA llega a julio; la copia de datos.gob.ar se quedó en enero

IDECBA publica todos los meses y viene empalmado de origen con la base anterior, así
que no armamos empalme propio. La URL del xlsx cuelga de /uploads/AAAA/MM/ y se mueve
cada vez que lo vuelven a subir: lo estable es la ficha del banco de datos, que tiene
exactamente un .xlsx. Si aparece ninguno o más de uno el colector para, porque
cualquiera de los dos casos significa que la ficha cambió y agarrar el primero sería
adivinar."
```

---

### Task 3: Colector `ipc:rio_negro`

**Files:**
- Create: `src/collectors/collect_ipc_rio_negro.ts`
- Test: `src/collectors/collect_ipc_rio_negro.test.ts`

**Interfaces:**
- Consumes: lo mismo que Task 2.
- Produces: `export function parsearRioNegro(buffer: Buffer): PuntoMensual[]`, `export async function collectIpcRioNegro(): Promise<CollectorResult>`.

**Contexto verificado.** URL fija, sin fecha en el nombre. Hoja `Índices`. Fila 4 = encabezado con `"Mes / Año"` en A y los años en B en adelante. Filas 5 a 16 = `Enero`…`Diciembre`. **Viene como matriz, no como lista**: hay que transponer. Las celdas de meses futuros vienen vacías. Confirmado: 1973-01 → 2026-07.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/collectors/collect_ipc_rio_negro.test.ts
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parsearRioNegro } from "./collect_ipc_rio_negro.js";

/** Reproduce el layout real: tres filas en blanco, encabezado de años, 12 filas de meses. */
function armarLibro(anios: number[], porMes: (number | null)[][]): Buffer {
  const MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const ws = XLSX.utils.aoa_to_sheet([
    [], [], [],
    ["Mes / Año", ...anios],
    ...MESES.map((m, i) => [m, ...porMes[i]!]),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Índices");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("parsearRioNegro", () => {
  it("transpone la matriz meses × años a una lista cronológica", () => {
    const buf = armarLibro(
      [2025, 2026],
      [[10, 20], [11, 21], [12, null], [13, null], [14, null], [15, null],
       [16, null], [17, null], [18, null], [19, null], [null, null], [null, null]],
    );
    expect(parsearRioNegro(buf)).toEqual([
      { mes: "2025-01-01", valor: 10 }, { mes: "2025-02-01", valor: 11 },
      { mes: "2025-03-01", valor: 12 }, { mes: "2025-04-01", valor: 13 },
      { mes: "2025-05-01", valor: 14 }, { mes: "2025-06-01", valor: 15 },
      { mes: "2025-07-01", valor: 16 }, { mes: "2025-08-01", valor: 17 },
      { mes: "2025-09-01", valor: 18 }, { mes: "2025-10-01", valor: 19 },
      { mes: "2026-01-01", valor: 20 }, { mes: "2026-02-01", valor: 21 },
    ]);
  });

  it("ignora las columnas cuyo encabezado no es un año", () => {
    // El archivo real trae columnas sobrantes al final del rango declarado.
    const ws = XLSX.utils.aoa_to_sheet([
      [], [], [],
      ["Mes / Año", 2026, null, "Notas"],
      ["Enero", 20, null, "algo"],
      ...["Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto",
          "Septiembre","Octubre","Noviembre","Diciembre"].map((m) => [m, null, null, null]),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Índices");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    expect(parsearRioNegro(buf)).toEqual([{ mes: "2026-01-01", valor: 20 }]);
  });

  it("explota si cambia el rótulo de la esquina en vez de leer basura", () => {
    const ws = XLSX.utils.aoa_to_sheet([[], [], [], ["Período", 2026], ["Enero", 20]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Índices");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    expect(() => parsearRioNegro(buf)).toThrow(/layout/i);
  });

  it("explota si falta la hoja", () => {
    const ws = XLSX.utils.aoa_to_sheet([["x"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Variaciones");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    expect(() => parsearRioNegro(buf)).toThrow(/Índices/);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/collectors/collect_ipc_rio_negro.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Escribir el colector**

```ts
// src/collectors/collect_ipc_rio_negro.ts
/**
 * IPC de Viedma — Dirección de Estadística y Censos de Río Negro.
 *
 * Río Negro mide su propia inflación y **no está en el catálogo de datos.gob.ar**: es una
 * de las jurisdicciones que faltaban enteras. Al 2026-08-13 llega a julio, o sea un mes más
 * adelante que el IPC nacional del INDEC.
 *
 * El xlsx viene como MATRIZ (filas = meses, columnas = años), no como lista, así que hay
 * que transponer. Los meses que todavía no pasaron vienen con la celda vacía.
 */

import * as XLSX from "xlsx";
import type { CollectorResult } from "../types/collector.js";
import { recordFreshnessOutcome } from "./freshness.js";
import {
  publicarSerie,
  verificarContinuidadMensual,
  type PuntoMensual,
  type SerieJurisdiccionalDef,
} from "./lib/ipc-jurisdiccional.js";

const SOURCE = "ipc_rio_negro";

/** URL fija, sin fecha en el nombre: la provincia pisa el archivo con el acumulado entero. */
const XLSX_URL = "https://estadisticaycensos.rionegro.gov.ar/download/archivos/00008835.xlsx";
const LANDING_URL = "https://rionegro.gov.ar/?contID=40741";

const SHEET = "Índices";
const TIMEOUT_MS = 60_000;

/** Fila 4 (índice 3): `"Mes / Año"` y después los años. */
const HEADER_ROW_INDEX = 3;
const ESQUINA_ESPERADA = "Mes / Año";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const SERIE: SerieJurisdiccionalDef = {
  serie_id: "ipc:rio_negro",
  aliases: ["ipc_rio_negro", "ipc_viedma", "inflacion_rio_negro"],
  nombre: "IPC Río Negro (Viedma) — nivel general",
  descripcion:
    "Índice de Precios al Consumidor de Viedma, nivel general, que publica la Dirección de " +
    "Estadística y Censos de la Provincia de Río Negro. Se releva en Viedma y se usa como " +
    "referencia provincial. Es un índice provincial, distinto del IPC nacional de INDEC " +
    "(alias 'inflacion')",
  fuente: "DEyC Río Negro",
  organismo: "Dirección de Estadística y Censos de la Provincia de Río Negro",
  unidad: "Índice",
  fuente_url: LANDING_URL,
};

export function parsearRioNegro(buffer: Buffer): PuntoMensual[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[SHEET];
  if (!ws) {
    throw new Error(
      `La hoja "${SHEET}" no existe en el xlsx de Río Negro (hojas: ${wb.SheetNames.join(", ")})`,
    );
  }

  const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    range: HEADER_ROW_INDEX,
    raw: true,
  });

  const header = filas[0] ?? [];
  if (String(header[0] ?? "").trim() !== ESQUINA_ESPERADA) {
    throw new Error(
      `Cambió el layout de "${SHEET}". Se esperaba "${ESQUINA_ESPERADA}" en la esquina y ` +
        `hay "${String(header[0] ?? "")}"`,
    );
  }

  // Columna → año. Sólo las que tienen un año plausible de encabezado: el archivo trae
  // columnas sobrantes al final del rango declarado, y sumarlas correría todo un año.
  const anioPorColumna = new Map<number, number>();
  for (let c = 1; c < header.length; c++) {
    const v = header[c];
    const anio = typeof v === "number" ? v : Number(String(v ?? "").trim());
    if (Number.isInteger(anio) && anio >= 1900 && anio <= 2200) anioPorColumna.set(c, anio);
  }

  const out: PuntoMensual[] = [];
  for (const fila of filas.slice(1)) {
    const nombreMes = String(fila[0] ?? "").trim().toLowerCase();
    const mesIndex = MESES.indexOf(nombreMes);
    if (mesIndex === -1) continue; // filas de notas al pie

    for (const [columna, anio] of anioPorColumna) {
      const valor = fila[columna];
      if (typeof valor !== "number" || !Number.isFinite(valor)) continue;
      const mm = String(mesIndex + 1).padStart(2, "0");
      out.push({ mes: `${anio}-${mm}-01`, valor });
    }
  }

  return out.sort((a, b) => a.mes.localeCompare(b.mes));
}

export async function collectIpcRioNegro(): Promise<CollectorResult> {
  const start = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  let count = 0;
  let ultimoMes: string | null = null;

  try {
    console.log(`[${SOURCE}] Bajando ${XLSX_URL}`);
    const res = await fetch(XLSX_URL, {
      headers: { "User-Agent": "argentina-data-mcp/collector" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} bajando ${XLSX_URL}`);

    const crudos = parsearRioNegro(Buffer.from(await res.arrayBuffer()));
    const puntos = verificarContinuidadMensual(crudos, SERIE.serie_id);
    if (puntos.length < crudos.length) {
      warnings.push(
        `${SERIE.serie_id}: la serie traía huecos; se descartaron ${crudos.length - puntos.length} ` +
          `punto(s) previos al último tramo continuo`,
      );
    }

    count = await publicarSerie(SERIE, puntos);
    ultimoMes = puntos.at(-1)!.mes;
    console.log(`[${SOURCE}] ${count} puntos, hasta ${ultimoMes}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    console.error(`[${SOURCE}] Falló: ${msg}`);
  }

  await recordFreshnessOutcome({
    source: SOURCE,
    healthy: errors.length === 0,
    errorMessage: errors.length > 0 ? errors.join("; ") : null,
    lastDataDate: errors.length === 0 ? ultimoMes : null,
  });

  return {
    source: SOURCE,
    recordsUpserted: count,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
    durationMs: Date.now() - start,
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/collectors/collect_ipc_rio_negro.test.ts && npm run typecheck`
Expected: PASS — 4 tests.

- [ ] **Step 5: Correrlo de verdad y mirar el recorte por continuidad**

Run: `npx tsx -e "import('./src/collectors/collect_ipc_rio_negro.js').then(m => m.collectIpcRioNegro()).then(r => console.log(r))"`

Expected: sin errores. **Mirar el warning**: la serie arranca en 1973 y es plausible que tenga huecos viejos. Si el warning aparece, anotar desde qué mes queda la serie — ese es el `primerMes` que va a ver la calculadora.

```bash
cd /tmp && ~/bin/argdata-db "SELECT min(fecha), max(fecha), count(*) FROM series_data WHERE serie_id='ipc:rio_negro'"
```

- [ ] **Step 6: Commit**

```bash
git add src/collectors/collect_ipc_rio_negro.ts src/collectors/collect_ipc_rio_negro.test.ts
git commit -m "Río Negro mide su inflación y no estaba en el catálogo

Es una de las jurisdicciones que faltaban enteras, no una que estaba atrasada, y llega
un mes más adelante que el IPC nacional. El xlsx viene como matriz meses × años, así que
se transpone. Las columnas del encabezado se filtran a las que tienen un año plausible:
el archivo trae columnas sobrantes al final del rango y sumarlas correría todo un año."
```

---

### Task 4: Colector `ipc:cordoba`

**Files:**
- Create: `src/collectors/collect_ipc_cordoba.ts`
- Test: `src/collectors/collect_ipc_cordoba.test.ts`

**Interfaces:**
- Consumes: lo mismo que Task 2.
- Produces: `export function parsearCordoba(buffer: Buffer): PuntoMensual[]`, `export async function collectIpcCordoba(): Promise<CollectorResult>`.

**Contexto verificado.** El nombre del archivo lleva el mes adentro (`ipc-julio-2026.xlsx`), así que **la URL se mueve todos los meses**; lo estable es el UUID del recurso en CKAN. Se resuelve con `package_show?id=indic` y se busca el recurso `2b4a7c60-1c8a-45b1-be8f-2bd59bfe2364`.

La hoja **`IPC Empalme desde 1968`** trae la serie entera ya empalmada a la base nueva (1968-01 → 2026-07, ~700 puntos): **no hay que empalmar nada**. Esto corrige lo que decía el spec, que preveía unir dos bases a mano.

Los valores viejos son minúsculos (`4.33e-13` en 1968) porque la serie encadena hacia atrás cuatro cambios de moneda. Es correcto para un cociente y `float64` lo sostiene. **No reescalar.**

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/collectors/collect_ipc_cordoba.test.ts
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parsearCordoba } from "./collect_ipc_cordoba.js";

/** Reproduce el layout real: título, encabezado, datos, notas al pie. */
function armarLibro(filas: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Indice de precios al consumidor de la Provincia de Córdoba"],
    ["Período", "Numero Indice base jun-nov 2025=100", "Variación  mensual"],
    ...filas,
    ["Fuente: Dirección de Estadísticas y Censos"],
    ["Gobierno de la Provincia de Córdoba"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "IPC Empalme desde 1968");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("parsearCordoba", () => {
  it("extrae los pares (mes, índice) y descarta las notas al pie", () => {
    const buf = armarLibro([
      [new Date(1968, 0, 1), 4.332726297657377e-13, null],
      [new Date(2026, 6, 1), 128.39699237304217, 0.018008282907971962],
    ]);
    expect(parsearCordoba(buf)).toEqual([
      { mes: "1968-01-01", valor: 4.332726297657377e-13 },
      { mes: "2026-07-01", valor: 128.39699237304217 },
    ]);
  });

  it("conserva los índices minúsculos del arranque sin reescalar", () => {
    // Son chicos porque la serie encadena cuatro cambios de moneda. Para un cociente
    // da igual la escala, y float64 sostiene la precisión.
    const buf = armarLibro([[new Date(1968, 0, 1), 4.332726297657377e-13, null]]);
    expect(parsearCordoba(buf)[0]!.valor).toBe(4.332726297657377e-13);
  });

  it("explota si Córdoba renombra la hoja del empalme", () => {
    const ws = XLSX.utils.aoa_to_sheet([["Período", "Numero Indice base jun-nov 2025=100"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "IPC-Cba COICOP");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    expect(() => parsearCordoba(buf)).toThrow(/IPC Empalme desde 1968/);
  });

  it("explota si la primera columna deja de ser el período", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Indice"], ["Código", "Descripción"], [new Date(2026, 6, 1), 128.4],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "IPC Empalme desde 1968");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    expect(() => parsearCordoba(buf)).toThrow(/layout/i);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/collectors/collect_ipc_cordoba.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Escribir el colector**

```ts
// src/collectors/collect_ipc_cordoba.ts
/**
 * IPC de Córdoba — Dirección General de Estadística y Censos de la Provincia.
 *
 * Existe porque la copia de datos.gob.ar (`indec:194.1_NIVEL_GENERAL_2014_0_13`) se congeló
 * en agosto de 2025, justo cuando la provincia cambió de base. La provincia siguió
 * publicando: al 2026-08-13 llega a julio.
 *
 * ── DÓNDE ESTÁ LA SERIE, Y POR QUÉ NO HAY QUE EMPALMAR ──
 * El archivo mensual trae una hoja `IPC Empalme desde 1968` con la serie COMPLETA ya
 * expresada en la base nueva. No hace falta unir la base 2014 con la base jun-nov 2025:
 * Córdoba ya lo hizo. (El recurso "Empalme Serie Base 2014" existe aparte y sólo llega a
 * nov-2025; no se usa.)
 *
 * ── POR QUÉ SE RESUELVE POR CKAN ──
 * El nombre del archivo lleva el mes adentro (`ipc-julio-2026.xlsx`), así que la URL cambia
 * todos los meses. Lo estable es el UUID del recurso.
 *
 * ── LOS NÚMEROS VIEJOS SON MINÚSCULOS Y ESTÁ BIEN ──
 * 1968 arranca en 4,33e-13 porque la serie encadena hacia atrás cuatro cambios de moneda.
 * Para un cociente la escala es irrelevante y float64 sostiene la precisión. No reescalar.
 */

import * as XLSX from "xlsx";
import type { CollectorResult } from "../types/collector.js";
import { recordFreshnessOutcome } from "./freshness.js";
import {
  celdaFechaMes,
  publicarSerie,
  verificarContinuidadMensual,
  type PuntoMensual,
  type SerieJurisdiccionalDef,
} from "./lib/ipc-jurisdiccional.js";

const SOURCE = "ipc_cordoba";

const CKAN_PACKAGE_URL = "https://datosestadistica.cba.gov.ar/api/3/action/package_show?id=indic";
/** UUID del recurso XLSX mensual. Estable aunque el nombre del archivo cambie cada mes. */
const RESOURCE_ID = "2b4a7c60-1c8a-45b1-be8f-2bd59bfe2364";
const LANDING_URL = "https://datosestadistica.cba.gov.ar/dataset/indic";

const SHEET = "IPC Empalme desde 1968";
const TIMEOUT_MS = 60_000;
const ESQUINA_ESPERADA = "Período";

const SERIE: SerieJurisdiccionalDef = {
  serie_id: "ipc:cordoba",
  aliases: ["ipc_cordoba", "inflacion_cordoba"],
  nombre: "IPC Córdoba — nivel general",
  descripcion:
    "Índice de Precios al Consumidor de la Provincia de Córdoba, nivel general, base " +
    "jun-nov 2025 = 100, empalmado por la provincia desde 1968. Los valores previos a los " +
    "cambios de moneda son muy chicos por el encadenamiento: la escala es irrelevante para " +
    "calcular una variación entre dos meses. Es un índice provincial, distinto del IPC " +
    "nacional de INDEC (alias 'inflacion')",
  fuente: "DGEyC Córdoba",
  organismo: "Dirección General de Estadística y Censos de la Provincia de Córdoba",
  unidad: "Índice base jun-nov 2025=100",
  fuente_url: LANDING_URL,
};

export function parsearCordoba(buffer: Buffer): PuntoMensual[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[SHEET];
  if (!ws) {
    throw new Error(
      `La hoja "${SHEET}" no existe en el xlsx de Córdoba (hojas: ${wb.SheetNames.join(", ")})`,
    );
  }

  const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true });

  // El encabezado no está en una fila fija: arriba hay filas en blanco y un título cuya
  // altura cambió entre versiones del archivo. Se busca la fila que dice "Período".
  const iHeader = filas.findIndex((f) => String(f?.[0] ?? "").trim() === ESQUINA_ESPERADA);
  if (iHeader === -1) {
    throw new Error(
      `Cambió el layout de "${SHEET}": no se encontró ninguna fila que arranque con ` +
        `"${ESQUINA_ESPERADA}" en las primeras ${filas.length} filas`,
    );
  }

  const out: PuntoMensual[] = [];
  for (const r of filas.slice(iHeader + 1)) {
    const mes = celdaFechaMes(r?.[0]);
    const valor = r?.[1];
    if (!mes || typeof valor !== "number" || !Number.isFinite(valor)) continue;
    out.push({ mes, valor });
  }
  return out;
}

async function resolverUrlXlsx(): Promise<string> {
  const res = await fetch(CKAN_PACKAGE_URL, {
    headers: { "User-Agent": "argentina-data-mcp/collector" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} consultando CKAN de Córdoba`);

  const body = (await res.json()) as {
    success?: boolean;
    result?: { resources?: { id?: string; url?: string; name?: string }[] };
  };
  if (!body.success) throw new Error("CKAN de Córdoba devolvió success=false");

  const recurso = body.result?.resources?.find((r) => r.id === RESOURCE_ID);
  if (!recurso?.url) {
    // Que el UUID desaparezca significa que Córdoba rehizo el dataset: hay que mirarlo a
    // mano, no adivinar cuál de los recursos es el bueno.
    throw new Error(
      `El recurso ${RESOURCE_ID} ya no está en el dataset de Córdoba. Recursos: ` +
        `[${(body.result?.resources ?? []).map((r) => `${r.id}:${r.name}`).join(", ")}]`,
    );
  }
  return recurso.url;
}

export async function collectIpcCordoba(): Promise<CollectorResult> {
  const start = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  let count = 0;
  let ultimoMes: string | null = null;

  try {
    const url = await resolverUrlXlsx();
    console.log(`[${SOURCE}] Bajando ${url}`);
    const res = await fetch(url, {
      headers: { "User-Agent": "argentina-data-mcp/collector" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} bajando ${url}`);

    const crudos = parsearCordoba(Buffer.from(await res.arrayBuffer()));
    const puntos = verificarContinuidadMensual(crudos, SERIE.serie_id);
    if (puntos.length < crudos.length) {
      warnings.push(
        `${SERIE.serie_id}: la serie traía huecos; se descartaron ${crudos.length - puntos.length} ` +
          `punto(s) previos al último tramo continuo`,
      );
    }

    count = await publicarSerie(SERIE, puntos);
    ultimoMes = puntos.at(-1)!.mes;
    console.log(`[${SOURCE}] ${count} puntos, hasta ${ultimoMes}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    console.error(`[${SOURCE}] Falló: ${msg}`);
  }

  await recordFreshnessOutcome({
    source: SOURCE,
    healthy: errors.length === 0,
    errorMessage: errors.length > 0 ? errors.join("; ") : null,
    lastDataDate: errors.length === 0 ? ultimoMes : null,
  });

  return {
    source: SOURCE,
    recordsUpserted: count,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
    durationMs: Date.now() - start,
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/collectors/collect_ipc_cordoba.test.ts && npm run typecheck`
Expected: PASS — 4 tests.

- [ ] **Step 5: Correrlo de verdad**

Run: `npx tsx -e "import('./src/collectors/collect_ipc_cordoba.js').then(m => m.collectIpcCordoba()).then(r => console.log(r))"`

```bash
cd /tmp && ~/bin/argdata-db "SELECT min(fecha), max(fecha), count(*) FROM series_data WHERE serie_id='ipc:cordoba'"
```
Expected: hasta `2026-07-01`, ~700 puntos (menos si el recorte por continuidad actuó — anotar desde dónde queda).

- [ ] **Step 6: Commit**

```bash
git add src/collectors/collect_ipc_cordoba.ts src/collectors/collect_ipc_cordoba.test.ts
git commit -m "Córdoba ya empalmó su serie desde 1968; nosotros no tenemos que hacerlo

La copia de datos.gob.ar se congeló en agosto de 2025, justo cuando la provincia cambió
de base. El spec preveía unir las dos bases a mano, pero el archivo mensual trae una hoja
con la serie entera ya expresada en la base nueva, así que no hay empalme propio.

La URL lleva el mes en el nombre y cambia todos los meses: se resuelve por el UUID del
recurso en CKAN. Y los índices de los años viejos son minúsculos (4,33e-13 en 1968)
porque la serie encadena cuatro cambios de moneda: es correcto para un cociente y no hay
que reescalarlo."
```

---

### Task 5: Registro en el runner, la cadencia y el gate

Sin esto los tres colectores existen pero no corren solos, y `data_health` no sabe que existen.

**Files:**
- Modify: `src/collectors/collector-runner.ts` (imports ~línea 55, registro ~línea 497, cron ~línea 804)
- Modify: `src/config/data-cadence.ts`
- Modify: `src/tools/data_health.ts` (`STALENESS_HOURS`, ~línea 306)
- Modify: `agents/freshness-gate-check.sh` en el repo **privado** (`~/repos/argentina-data-mcp-private`) — el `DATA_CADENCE_JSON`

**Interfaces:**
- Consumes: `collectIpcCaba`, `collectIpcRioNegro`, `collectIpcCordoba` de las tareas 2-4.
- Produces: nada que consuma otra tarea de este plan. El plan de la calculadora depende de que estas tres series existan y estén frescas.

- [ ] **Step 1: Escribir el test que falla**

`tests/data_cadence.test.ts` ya falla solo si una fuente periódica queda sin registrar. Agregar el caso explícito:

```ts
// en tests/data_cadence.test.ts, dentro del describe existente
it("las tres series de IPC jurisdiccional están registradas con cadencia mensual", () => {
  for (const source of ["ipc_caba", "ipc_rio_negro", "ipc_cordoba"]) {
    const spec = DATA_CADENCE[source];
    expect(spec, `falta ${source} en DATA_CADENCE`).toBeDefined();
    expect(spec!.cadencia).toMatch(/mensual/i);
    // Un IPC provincial puede tardar hasta ~6 semanas en publicarse. Menos que eso
    // llenaría data_health de falsos positivos todos los meses.
    expect(spec!.dataMaxAgeHours).toBeGreaterThanOrEqual(45 * 24);
  }
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/data_cadence.test.ts`
Expected: FAIL — `falta ipc_caba en DATA_CADENCE`

- [ ] **Step 3: Registrar en `data-cadence.ts`**

```ts
// en el objeto DATA_CADENCE
ipc_caba: {
  cadencia: "mensual",
  maxDataDateSql: "SELECT MAX(fecha) AS max_data_date FROM series_data WHERE serie_id = 'ipc:caba'",
  // IDECBA publica alrededor del día 15 del mes siguiente. 50 días deja margen para
  // un feriado o un atraso de una semana sin gritar todos los meses.
  dataMaxAgeHours: 50 * 24,
  notaUpstream:
    "El IPCBA de IDECBA se publica alrededor del día 15 del mes siguiente; el último dato " +
    "disponible puede tener hasta seis semanas.",
},
ipc_rio_negro: {
  cadencia: "mensual",
  maxDataDateSql: "SELECT MAX(fecha) AS max_data_date FROM series_data WHERE serie_id = 'ipc:rio_negro'",
  dataMaxAgeHours: 50 * 24,
  notaUpstream:
    "El IPC de Viedma lo publica la Dirección de Estadística y Censos de Río Negro con " +
    "algunas semanas de rezago.",
},
ipc_cordoba: {
  cadencia: "mensual",
  maxDataDateSql: "SELECT MAX(fecha) AS max_data_date FROM series_data WHERE serie_id = 'ipc:cordoba'",
  dataMaxAgeHours: 50 * 24,
  notaUpstream:
    "El IPC de Córdoba lo publica la Dirección General de Estadística y Censos de la " +
    "provincia con algunas semanas de rezago.",
},
```

- [ ] **Step 4: Registrar en el runner**

```ts
// src/collectors/collector-runner.ts — junto a los otros imports (~línea 55)
import { collectIpcCaba } from "./collect_ipc_caba.js";
import { collectIpcCordoba } from "./collect_ipc_cordoba.js";
import { collectIpcRioNegro } from "./collect_ipc_rio_negro.js";
```

```ts
// en la lista de collectors (~línea 497), junto a { name: "rem", ... }
// maxAgeHours es del COLLECTOR (cada cuánto corre), no del dato: son diarios.
{ name: "ipc_caba", fn: collectIpcCaba, maxAgeHours: 25 },
{ name: "ipc_rio_negro", fn: collectIpcRioNegro, maxAgeHours: 25 },
{ name: "ipc_cordoba", fn: collectIpcCordoba, maxAgeHours: 25 },
```

```ts
// en los cron (~línea 804, junto al del rem que corre 05:45)
// Escalonados para no pegarle a tres organismos provinciales en el mismo minuto.
scheduleCron("50 5 * * *", () => runCollector("ipc_caba", collectIpcCaba));
scheduleCron("55 5 * * *", () => runCollector("ipc_rio_negro", collectIpcRioNegro));
scheduleCron("0 6 * * *", () => runCollector("ipc_cordoba", collectIpcCordoba));
```

- [ ] **Step 5: Registrar en `STALENESS_HOURS`**

```ts
// src/tools/data_health.ts, junto a `rem: 45 * 24` (~línea 306)
// Un IPC provincial mensual: el mismo criterio que la cadencia declarada arriba.
ipc_caba: 50 * 24,
ipc_rio_negro: 50 * 24,
ipc_cordoba: 50 * 24,
```

- [ ] **Step 6: Espejar en el gate del repo privado**

`tests/data_cadence.test.ts` falla si el `DATA_CADENCE_JSON` de `agents/freshness-gate-check.sh` diverge. Copiar las tres entradas con la misma `cadencia` y `dataMaxAgeHours`.

```bash
cd ~/repos/argentina-data-mcp-private && git pull
# editar agents/freshness-gate-check.sh: agregar ipc_caba, ipc_rio_negro, ipc_cordoba
# al DATA_CADENCE_JSON con cadencia "mensual" y 1200 horas
```

- [ ] **Step 7: Correr todo y verificar que pasa**

Run: `npm run typecheck && npx vitest run tests/data_cadence.test.ts tests/last_data_date.test.ts src/collectors/collect_ipc_*.test.ts src/collectors/lib/ipc-jurisdiccional.test.ts`
Expected: PASS, todo verde.

- [ ] **Step 8: Verificar las tres series en el MCP en vivo**

```bash
cd /tmp && ~/bin/argdata-db "
SELECT serie_id, min(fecha) desde, max(fecha) hasta, count(*) n
FROM series_data WHERE serie_id IN ('ipc:caba','ipc:rio_negro','ipc:cordoba')
GROUP BY 1 ORDER BY 1"
```
Expected: las tres presentes, las tres hasta `2026-07-01`.

Y que `series_search` las encuentre (es lo que valida que `refrescarStatsCatalogo` corrió):

```bash
cd /tmp && ~/bin/argdata-db "
SELECT serie_id, valores_cant FROM series_catalog
WHERE serie_id IN ('ipc:caba','ipc:rio_negro','ipc:cordoba')"
```
Expected: `valores_cant` > 0 en las tres. **Si alguna da 0 o NULL, la serie va a aparecer como `sin_datos` en `series_search` aunque tenga los puntos cargados.**

- [ ] **Step 9: Commit y deploy**

```bash
git add src/collectors/collector-runner.ts src/config/data-cadence.ts src/tools/data_health.ts tests/data_cadence.test.ts
git commit -m "Los tres IPC jurisdiccionales, corriendo solos y vigilados

Sin el registro los colectores existen pero nadie los llama y data_health no sabe que
faltan. La cadencia declarada es 50 días y no 48 horas como el default: un IPC provincial
sale a mitad del mes siguiente, así que el umbral corto llenaría data_health de falsos
positivos todos los meses. Los cron van escalonados para no pegarle a tres organismos
provinciales en el mismo minuto."
git push
```

---

## Self-Review

**Cobertura del spec.** El spec pide tres colectores (`ipc:caba`, `ipc:rio_negro`, `ipc:cordoba`) con el patrón del REM, `fecha_fin` real y `dato_atrasado` funcionando: Tasks 2, 3, 4 los construyen y Task 5 los registra y les da umbral de frescura. El spec dice que Córdoba requiere empalmar dos bases; **la verificación mostró que no**, y el plan lo corrige explícitamente en Task 4 en vez de arrastrar el error. El spec dice que Neuquén no lleva colector: este plan no lo incluye, correcto.

**Placeholders.** Ninguno: todos los pasos traen el código o el comando exacto. Los tres parsers tienen su test con fixture inline. Las URLs, los UUID y el post ID están verificados, no supuestos.

**Consistencia de tipos.** `PuntoMensual` se define en Task 1 y lo consumen las tres siguientes con el mismo nombre y forma. `publicarSerie(def, puntos)`, `verificarContinuidadMensual(puntos, nombre)` y `celdaFechaMes(v)` se usan en Tasks 2-4 con la firma que Task 1 declara. `SerieJurisdiccionalDef` tiene los ocho campos que las tres constantes `SERIE` completan. Río Negro no importa `celdaFechaMes` porque arma la fecha desde el nombre del mes — correcto, y por eso no está en su lista de imports.

**Riesgo que queda abierto y no se puede cerrar desde acá.** Los tres parsers dependen de layouts que los organismos pueden cambiar sin avisar. Está mitigado con validación de encabezado que muere ruidosamente, que es la decisión del repo, pero significa que estos colectores van a romperse alguna vez de forma visible. Es el trade-off elegido: preferimos una corrida roja a una columna leída de más.
