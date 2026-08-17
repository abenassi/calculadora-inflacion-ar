# Actualizar series (MVP oculto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una página sin link desde ningún lado del sitio (`/actualizar.html`) que reindexa el dólar blue (promedio mensual) contra el IPC y lo grafica, para poder ver la serie completa en los pesos de cualquier mes elegido.

**Architecture:** El pipeline diario (`scripts/fetch-snapshot.ts`) gana una llamada más al MCP, con su propio tool (`dolar_historico`) y su propio archivo de snapshot. El motor gana una función que reindexa punto a punto reusando `adjust()` — cero aritmética nueva. La página es un entry point de Vite más, con su propio script y su propio gráfico de línea.

**Tech Stack:** TypeScript, Vite, Chart.js, vitest. Sin frameworks de UI — mismo patrón que el resto del sitio (DOM directo, sin JSX ni reactividad).

**Spec:** `docs/superpowers/specs/2026-08-17-actualizar-series-design.md`

**Nota de orden:** las tareas van de forma que `vite.config.ts` sólo se toca (Task 6) una vez que `actualizar.html` ya existe (Task 5) — así ningún commit intermedio deja `npm run build` apuntando a un entry point que no está, y el deploy automático a `main` (`.github/workflows/deploy.yml`, que corre en cada push) no se rompe entre tareas.

## Global Constraints

- **Nada llama al MCP en runtime.** Los datos nuevos se bajan en `scripts/fetch-snapshot.ts` (corre en GitHub Actions) y se leen del snapshot estático `public/data/series/dolar-blue.json`.
- **Ningún punto se estima en silencio.** `actualizarSerie` descarta los puntos que `adjust()` sólo podría resolver proyectando (`motivoParaEstimar(...) !== null`), en vez de graficar un número inventado mezclado con los reales.
- **Un criterio se escribe una sola vez.** Toda la aritmética de inflación vive en `adjust()`; el código nuevo lo llama, no lo reimplementa.
- **Nada de esto se linkea** desde `index.html`, el `<nav>` que no existe todavía, ni el sitemap (`scripts/generar-paginas.ts` no lo toca).
- **Sin analytics en esta página** — no hay tráfico real todavía.
- Todo texto visible, comentario y mensaje de commit va en **castellano rioplatense, con vos**.
- `npm run verificar` (typecheck + tests + build) tiene que seguir pasando al final de cada tarea que toque código compilado.

---

## Task 1: Tipo compartido `SerieValores`

**Files:**
- Modify: `src/engine/types.ts`

**Interfaces:**
- Produces: `PuntoValor = { mes: Mes; valor: number }`, `SerieValores = { serie: string; unidad: string; fuentes: { id: string; organismo: string; rango: string }[]; actualizado: string; datos: PuntoValor[] }` — los usan la Task 2 (pipeline) y la Task 5 (página).

- [ ] **Step 1: Agregar los tipos al final de `src/engine/types.ts`**

```ts
/**
 * Una serie de valores crudos (no un índice): dólar, UVA, y lo que se sume después.
 *
 * Es la forma que ya escriben `dolar.json`/`uva.json` en el pipeline, ahora con
 * nombre propio porque el frontend empieza a leerla (antes sólo se guardaba, sin
 * consumidor).
 */
export type PuntoValor = {
  mes: Mes;
  valor: number;
};

export type SerieValores = {
  serie: string;
  unidad: string;
  fuentes: { id: string; organismo: string; rango: string }[];
  actualizado: string;
  datos: PuntoValor[];
};
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/engine/types.ts
git commit -m "feat(tipos): agregar SerieValores para series de valores crudos"
```

---

## Task 2: Pipeline — bajar y guardar el dólar blue

**Files:**
- Modify: `scripts/mcp-client.ts`
- Modify: `scripts/fetch-snapshot.ts`
- Create (generado por el script, no a mano): `public/data/series/dolar-blue.json`

**Interfaces:**
- Consumes: `SerieValores`, `PuntoValor` (Task 1); `llamarTool`, `McpError` (ya existen en `mcp-client.ts`); `aMes` (ya existe en `../src/engine/mes.js`); `escribirSiMejora` (ya existe en el propio archivo).
- Produces: `traerDolarHistorico(tipo, extra)` en `mcp-client.ts`, para que cualquier script futuro pueda pedir otro tipo de dólar sin reinventar el cliente. `public/data/series/dolar-blue.json` con la forma `SerieValores`, que consume la Task 5.

- [ ] **Step 1: Agregar `traerDolarHistorico` a `scripts/mcp-client.ts`**

Al final del archivo:

```ts
export type RespuestaDolarHistorico = {
  tipo: string;
  fuente: string;
  datos: {
    fecha: string;
    compra: number | null;
    venta: number;
    periodo_incompleto?: boolean;
  }[];
};

/**
 * Trae la serie histórica de un tipo de dólar. Es un tool aparte de `series`
 * (`dolar_historico`), así que `traerSerie` no sirve para esto.
 */
export async function traerDolarHistorico(
  tipo: string,
  extra: Record<string, unknown> = {},
): Promise<RespuestaDolarHistorico> {
  const r = await llamarTool<RespuestaDolarHistorico>("dolar_historico", { tipo, ...extra });
  if (!r.datos?.length) throw new McpError(`dolar_historico(${tipo}) vino sin datos`);
  return r;
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Agregar `construirSerieDolarBlue` a `scripts/fetch-snapshot.ts`**

Ampliar los imports existentes (líneas 16-21) — agregar `traerDolarHistorico` al import de `./mcp-client.js` y `SerieValores` al import de `../src/engine/types.js`:

```ts
import type { ExpectativaRem, SerieIndice, SerieValores } from "../src/engine/types.js";
import { INDICES, type IndiceDeclarado } from "./indices-declarados.js";
import { traerDolarHistorico, traerSerie } from "./mcp-client.js";
```

Agregar la función, después de `construirAuxiliar` y antes de `construirCatalogo`:

```ts
/**
 * El dólar blue, promedio mensual, para la sección `/actualizar.html` — todavía sin
 * link desde ningún lado del sitio. Va en su propio `try/catch` en `main()`: si el
 * tool falla un día, el resto del pipeline se escribe igual y esto se queda con el
 * snapshot de ayer, el mismo trato que ya reciben los índices jurisdiccionales.
 */
async function construirSerieDolarBlue(): Promise<SerieValores> {
  console.log("Dólar blue: bajando dolar_historico…");
  const r = await traerDolarHistorico("blue", {
    fecha_desde: "2002-01-01",
    frecuencia: "mensual",
    funcion_colapso: "avg",
  });

  // El mes en curso viene con `periodo_incompleto` mientras no terminó: promediarlo
  // ya es engañoso (es el promedio de un puñado de días, no del mes), así que se
  // descarta — el mismo criterio que ya sigue el IPC, que nunca muestra el mes que
  // el INDEC no cerró.
  const datos = r.datos
    .filter((d) => !d.periodo_incompleto)
    .map((d) => ({ mes: aMes(d.fecha), valor: d.venta }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  return {
    serie: "dolar_blue",
    unidad: "pesos_por_usd",
    fuentes: [
      { id: "ambito", organismo: r.fuente, rango: `${datos[0]!.mes}/${datos.at(-1)!.mes}` },
    ],
    actualizado: new Date().toISOString(),
    datos,
  };
}
```

- [ ] **Step 4: Llamarla desde `main()`, sin que pueda voltear al resto del pipeline**

En `main()`, después de `await escribirSiMejora("dolar.json", dolar, 100);` y antes de `await construirCatalogo(ipc);`:

```ts
  try {
    await mkdir(resolve(DIR_DATOS, "series"), { recursive: true });
    const dolarBlue = await construirSerieDolarBlue();
    await escribirSiMejora("series/dolar-blue.json", dolarBlue, 100);
  } catch (e: unknown) {
    console.warn(
      `  dólar blue: NO se pudo actualizar (${(e as Error).message}) — se sigue con el resto del pipeline`,
    );
  }
```

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Correr el pipeline de verdad y generar el snapshot**

Requiere `ARGENTINA_DATA_API_KEY` en el entorno (ya configurada en `~/.secrets/calculadora-inflacion.env`, la misma que usa el resto de `npm run snapshot`).

Run: `npm run snapshot`
Expected: entre la salida, una línea `Dólar blue: bajando dolar_historico…` seguida de `series/dolar-blue.json: escrito (N puntos)`, con `N` cerca de 290 (dólar blue mensual desde 2002-01, menos el mes en curso incompleto). El resto del log (IPC, UVA, dólar oficial, índices) tiene que salir igual que antes.

- [ ] **Step 7: Confirmar el archivo generado**

Run: `cat public/data/series/dolar-blue.json | head -20`
Expected: JSON con `"serie": "dolar_blue"`, `"unidad": "pesos_por_usd"`, `"fuentes"` con `"organismo"` conteniendo "Ámbito", y `"datos"` arrancando en `"mes": "2002-01"`.

- [ ] **Step 8: Commit**

```bash
git add scripts/mcp-client.ts scripts/fetch-snapshot.ts public/data/series/dolar-blue.json
git commit -m "feat(pipeline): bajar el dólar blue promedio mensual para /actualizar.html"
```

---

## Task 3: Motor — reindexar una serie contra el IPC

**Files:**
- Create: `src/engine/actualizar.ts`
- Test: `tests/actualizar.test.ts`

**Interfaces:**
- Consumes: `adjust`, `motivoParaEstimar` (ya existen en `../src/engine/adjust.js`); `Mes`, `SerieIndice` (ya existen en `../src/engine/types.js`).
- Produces: `actualizarSerie(datos: { mes: Mes; valor: number }[], mesObjetivo: Mes, ipc: SerieIndice): PuntoActualizado[]`, `type PuntoActualizado = { mes: Mes; valorOriginal: number; valorActualizado: number }` — los consumen la Task 4 (gráfico) y la Task 5 (página).

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/actualizar.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { actualizarSerie } from "../src/engine/actualizar.js";
import type { SerieIndice } from "../src/engine/types.js";

/**
 * 10% mensual clavado, publicada hasta abril. Índices: ene 100 · feb 110 · mar 121
 * · abr 133,1. Mismo fixture que usa `tests/adjust.test.ts`, reescrito acá para no
 * acoplar los dos archivos de test entre sí.
 */
const ipc: SerieIndice = {
  serie: "test",
  base: "2020-01=100",
  fuentes: [],
  ultimo_oficial: "2020-04",
  actualizado: "2020-06-01T00:00:00Z",
  datos: [
    { mes: "2020-01", indice: 100, origen: "indec" },
    { mes: "2020-02", indice: 110, origen: "indec" },
    { mes: "2020-03", indice: 121, origen: "indec" },
    { mes: "2020-04", indice: 133.1, origen: "indec" },
  ],
};

describe("actualizarSerie", () => {
  it("no cambia el valor de un punto que ya está en el mes objetivo", () => {
    const r = actualizarSerie([{ mes: "2020-04", valor: 133.1 }], "2020-04", ipc);
    expect(r).toHaveLength(1);
    expect(r[0]!.valorActualizado).toBeCloseTo(133.1, 6);
  });

  it("actualiza un punto viejo a un mes más nuevo (dato directo)", () => {
    // 100 de enero, llevado a abril: 100 * (133,1 / 100) = 133,1
    const r = actualizarSerie([{ mes: "2020-01", valor: 100 }], "2020-04", ipc);
    expect(r).toHaveLength(1);
    expect(r[0]!.valorOriginal).toBe(100);
    expect(r[0]!.valorActualizado).toBeCloseTo(133.1, 6);
  });

  it("deflacta cuando el objetivo es anterior al punto", () => {
    // 133,1 de abril, llevado a enero: 133,1 * (100 / 133,1) = 100
    const r = actualizarSerie([{ mes: "2020-04", valor: 133.1 }], "2020-01", ipc);
    expect(r).toHaveLength(1);
    expect(r[0]!.valorActualizado).toBeCloseTo(100, 6);
  });

  it("descarta un punto cuyo objetivo sólo se puede resolver estimando", () => {
    // El objetivo cae 3 meses después del último dato publicado (abr 2020). Para el
    // punto de enero, la ventana de referencia necesitaría retroceder hasta oct
    // 2019, antes de donde arranca la serie: no cabe, y no hay ningún tramo
    // publicado que sirva de referencia sin inventar nada.
    const r = actualizarSerie(
      [
        { mes: "2020-01", valor: 100 },
        { mes: "2020-04", valor: 133.1 },
      ],
      "2020-07",
      ipc,
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.mes).toBe("2020-04");
  });

  it("conserva el orden de los puntos de entrada", () => {
    const r = actualizarSerie(
      [
        { mes: "2020-02", valor: 110 },
        { mes: "2020-01", valor: 100 },
      ],
      "2020-04",
      ipc,
    );
    expect(r.map((p) => p.mes)).toEqual(["2020-02", "2020-01"]);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run tests/actualizar.test.ts`
Expected: FAIL — `Cannot find module '../src/engine/actualizar.js'` (el archivo todavía no existe).

- [ ] **Step 3: Escribir la implementación**

Crear `src/engine/actualizar.ts`:

```ts
/**
 * Reindexa una serie de valores contra el IPC: cada punto queda expresado en los
 * pesos de un único mes objetivo, en vez de en los pesos del mes en que se publicó.
 *
 * No hace ninguna cuenta propia: por cada punto llama al `adjust()` que ya existe.
 * Los puntos que `adjust()` sólo podría resolver estimando —lo contesta
 * `motivoParaEstimar`— se descartan en vez de graficarse con una tasa inventada
 * mezclada en silencio entre los que sí son cálculo directo.
 */
import { adjust, motivoParaEstimar } from "./adjust.js";
import type { Mes, SerieIndice } from "./types.js";

export type PuntoActualizado = {
  mes: Mes;
  valorOriginal: number;
  valorActualizado: number;
};

export function actualizarSerie(
  datos: { mes: Mes; valor: number }[],
  mesObjetivo: Mes,
  ipc: SerieIndice,
): PuntoActualizado[] {
  const salida: PuntoActualizado[] = [];

  for (const punto of datos) {
    if (motivoParaEstimar(punto.mes, mesObjetivo, ipc) !== null) continue;

    const resultado = adjust(punto.valor, punto.mes, mesObjetivo, ipc);
    salida.push({
      mes: punto.mes,
      valorOriginal: punto.valor,
      valorActualizado: resultado.montoAjustado,
    });
  }

  return salida;
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run tests/actualizar.test.ts`
Expected: PASS, los 5 tests en verde.

- [ ] **Step 5: Correr toda la suite, para no haber roto nada**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/actualizar.ts tests/actualizar.test.ts
git commit -m "feat(motor): reindexar una serie de valores contra el IPC"
```

---

## Task 4: Gráfico de línea reusable

**Files:**
- Modify: `src/ui/chart.ts`
- Create: `src/ui/chart-serie.ts`

**Interfaces:**
- Consumes: `PuntoActualizado` (Task 3); `abreviarMes` (ya existe en `../engine/mes.js`); `pesosRedondo` (ya existe en `./format.js`); `tokens()` (se exporta en esta tarea desde `chart.ts`).
- Produces: `dibujarSerieActualizada(canvas: HTMLCanvasElement, puntos: PuntoActualizado[], mesObjetivoTexto: string): void`, que consume la Task 5.

- [ ] **Step 1: Exportar `tokens()` desde `src/ui/chart.ts`**

Cambiar (línea 43):

```ts
function tokens(): Tokens {
```

por:

```ts
export function tokens(): Tokens {
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Crear `src/ui/chart-serie.ts`**

```ts
/**
 * Gráfico de línea de una serie ya reindexada: un solo trazo, sin la distinción
 * oficial/estimado que sí necesita el gráfico de barras — `actualizarSerie` ya
 * descarta los puntos que necesitarían estimar, así que todo lo que llega acá es
 * cálculo directo o ventana de referencia, nunca una tasa inventada.
 */
import {
  CategoryScale,
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";

import type { PuntoActualizado } from "../engine/actualizar.js";
import { abreviarMes } from "../engine/mes.js";
import { tokens } from "./chart.js";
import { pesosRedondo } from "./format.js";

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip);

let grafico: Chart | null = null;

export function dibujarSerieActualizada(
  canvas: HTMLCanvasElement,
  puntos: PuntoActualizado[],
  mesObjetivoTexto: string,
): void {
  const t = tokens();

  grafico?.destroy();
  grafico = new Chart(canvas, {
    type: "line",
    data: {
      labels: puntos.map((p) => abreviarMes(p.mes)),
      datasets: [
        {
          label: `Dólar blue, a pesos de ${mesObjetivoTexto}`,
          data: puntos.map((p) => p.valorActualizado),
          borderColor: t.serie,
          backgroundColor: t.serie,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        tooltip: {
          backgroundColor: t.texto,
          padding: 10,
          callbacks: {
            label: (item) => pesosRedondo(Number(item.raw)),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: t.grilla },
          ticks: {
            color: t.eje,
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 12,
            font: { size: 11 },
          },
        },
        y: {
          grid: { color: t.grilla },
          border: { display: false },
          ticks: {
            color: t.eje,
            font: { size: 11 },
            callback: (v) => pesosRedondo(Number(v)),
          },
        },
      },
    },
  });
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/ui/chart.ts src/ui/chart-serie.ts
git commit -m "feat(ui): gráfico de línea reusable para series reindexadas"
```

---

## Task 5: Página y orquestación de `/actualizar.html`

**Files:**
- Create: `actualizar.html`
- Create: `src/ui/actualizar-main.ts`

**Interfaces:**
- Consumes: `actualizarSerie`, `PuntoActualizado` (Task 3); `dibujarSerieActualizada` (Task 4); `mesActual` (ya existe en `../engine/adjust.js`); `nombrarMes` (ya existe en `../engine/mes.js`); `fechaLarga` (ya existe en `./format.js`); `SerieIndice`, `SerieValores` (Task 1); `public/data/ipc.json` y `public/data/series/dolar-blue.json` (Task 2).
- Nota: en este punto `actualizar.html` no está listado todavía en `vite.config.ts` (eso lo hace la Task 6), así que `npm run build` no lo empaqueta en `dist/` — pero `npm run dev` sí lo sirve (Vite sirve cualquier `.html` de la raíz por pedido directo, sin que haga falta declararlo como entry), así que se puede verificar en el browser igual antes de la Task 6.

- [ ] **Step 1: Crear `actualizar.html`**

```html
<!doctype html>
<html lang="es-AR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Actualizar una serie — Calculadora de inflación</title>
    <!-- Página de prueba: no se linkea desde ningún lado del sitio ni del sitemap,
         y esto es una capa extra para que tampoco la indexe un buscador que la
         encuentre igual. -->
    <meta name="robots" content="noindex, nofollow" />
    <link rel="icon" href="./favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="./src/styles.css" />
  </head>
  <body>
    <header class="cabecera">
      <div class="contenido">
        <h1>Actualizar una serie</h1>
        <p class="bajada">
          En vez de un monto entre dos fechas, una serie entera —por ahora, el dólar
          blue— reexpresada en los pesos de un único mes. Cada punto se ajusta con
          el mismo motor que usa la calculadora principal.
        </p>
      </div>
    </header>

    <main class="contenido">
      <form class="tarjeta formulario" id="formulario">
        <div class="campo">
          <label for="objetivo-mes">Expresar en pesos de</label>
          <div class="entrada-fecha">
            <select id="objetivo-mes" aria-label="Mes objetivo"></select>
            <select id="objetivo-anio" aria-label="Año objetivo"></select>
          </div>
        </div>
      </form>

      <p class="error" id="error" hidden></p>

      <section class="tarjeta panel">
        <div class="panel__cabecera">
          <h2 id="titulo-grafico">Dólar blue</h2>
        </div>
        <div class="grafico">
          <canvas
            id="grafico"
            role="img"
            aria-label="Dólar blue promedio mensual, reexpresado en los pesos del mes elegido"
          ></canvas>
        </div>
        <p class="badge">
          Dólar blue promedio mensual, fuente Ámbito Financiero · actualizado a
          pesos de cada mes según el IPC del INDEC y el BCRA · datos vía
          <a href="https://argentinadata.mymcps.dev" rel="noopener">Argentina Data MCP</a>
          · actualizado <span id="actualizado">—</span>
        </p>
      </section>
    </main>

    <footer class="pie">
      <div class="contenido">
        <p>
          Página de prueba, sin terminar. <a href="./">Volver a la calculadora</a> ·
          <a href="https://github.com/abenassi/calculadora-inflacion-ar" rel="noopener"
            >Código en GitHub</a
          >
        </p>
      </div>
    </footer>

    <script type="module" src="./src/ui/actualizar-main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Crear `src/ui/actualizar-main.ts`**

```ts
/**
 * Orquestación de `/actualizar.html`: lee el mes objetivo, reindexa el dólar blue
 * contra el IPC y lo grafica. Ninguna cuenta de inflación se hace acá — vive en
 * `actualizarSerie`, que a su vez reusa `adjust()` tal cual.
 */
import { mesActual } from "../engine/adjust.js";
import { actualizarSerie } from "../engine/actualizar.js";
import { nombrarMes } from "../engine/mes.js";
import type { SerieIndice, SerieValores } from "../engine/types.js";
import { dibujarSerieActualizada } from "./chart-serie.js";
import { fechaLarga } from "./format.js";

const NOMBRES_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const el = <T extends HTMLElement>(id: string): T => {
  const nodo = document.getElementById(id);
  if (!nodo) throw new Error(`Falta el elemento #${id}`);
  return nodo as T;
};

let ipc: SerieIndice;
let dolarBlue: SerieValores;

function poblarSelectorObjetivo(): void {
  const primero = ipc.datos[0]!.mes;
  const ultimo = mesActual();

  const opcion = (valor: string, texto: string) => {
    const o = document.createElement("option");
    o.value = valor;
    o.textContent = texto;
    return o;
  };

  el<HTMLSelectElement>("objetivo-mes").replaceChildren(
    ...NOMBRES_MES.map((n, i) => opcion(String(i + 1).padStart(2, "0"), n)),
  );

  const anioMin = Number(primero.slice(0, 4));
  const anioMax = Number(ultimo.slice(0, 4));
  const anios = Array.from({ length: anioMax - anioMin + 1 }, (_, i) => anioMin + i);
  el<HTMLSelectElement>("objetivo-anio").replaceChildren(
    ...anios.map((a) => opcion(String(a), String(a))),
  );
}

function leerObjetivo(): string {
  const mes = el<HTMLSelectElement>("objetivo-mes").value;
  const anio = el<HTMLSelectElement>("objetivo-anio").value;
  return `${anio}-${mes}`;
}

function actualizar(): void {
  const mesObjetivo = leerObjetivo();
  const puntos = actualizarSerie(dolarBlue.datos, mesObjetivo, ipc);
  dibujarSerieActualizada(el<HTMLCanvasElement>("grafico"), puntos, nombrarMes(mesObjetivo));
}

async function iniciar(): Promise<void> {
  const [rIpc, rDolar] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}data/ipc.json`),
    fetch(`${import.meta.env.BASE_URL}data/series/dolar-blue.json`),
  ]);
  if (!rIpc.ok) throw new Error(`No se pudo cargar el IPC (HTTP ${rIpc.status})`);
  if (!rDolar.ok) throw new Error(`No se pudo cargar el dólar blue (HTTP ${rDolar.status})`);

  ipc = (await rIpc.json()) as SerieIndice;
  dolarBlue = (await rDolar.json()) as SerieValores;

  poblarSelectorObjetivo();
  const hoy = mesActual();
  el<HTMLSelectElement>("objetivo-mes").value = hoy.slice(5, 7);
  el<HTMLSelectElement>("objetivo-anio").value = hoy.slice(0, 4);

  el("actualizado").textContent = fechaLarga(dolarBlue.actualizado);
  el("formulario").addEventListener("input", actualizar);
  actualizar();
}

iniciar().catch((e: unknown) => {
  const error = el("error");
  error.textContent = `No se pudieron cargar los datos: ${(e as Error).message}`;
  error.hidden = false;
});
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add actualizar.html src/ui/actualizar-main.ts
git commit -m "feat(ui): página /actualizar.html, sin link desde el resto del sitio"
```

---

## Task 6: Vite — entry point para `/actualizar.html`

**Files:**
- Modify: `vite.config.ts`

**Interfaces:**
- Ninguna — es configuración de build. `actualizar.html` ya existe (Task 5), así que agregar esta entrada no rompe `npm run build`.

- [ ] **Step 1: Agregar la entrada en `rollupOptions.input`**

En `vite.config.ts`, dentro de `rollupOptions.input`:

```ts
    rollupOptions: {
      input: {
        main: resolve(raiz, "index.html"),
        datos: resolve(raiz, "datos.html"),
        actualizar: resolve(raiz, "actualizar.html"),
        // Entry propio de las páginas por año: sólo analytics, sin motor ni gráfico.
        paginas: resolve(raiz, "src/ui/paginas.ts"),
      },
    },
```

- [ ] **Step 2: Verificar que el build lo incluye**

Run: `npm run build`
Expected: build exitoso, y entre los archivos generados aparece `dist/actualizar.html`.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "build: agregar entry point de /actualizar.html a Vite"
```

---

## Task 7: Verificación

**Files:** ninguno nuevo — corre lo que ya existe.

- [ ] **Step 1: Levantar el servidor local**

Run: `npm run dev`

- [ ] **Step 2: Abrir la página en un browser real**

Abrir `http://localhost:5173/actualizar.html` (con `mcp__playwright__*` si está disponible, o cualquier browser a mano — AGENTS.md es explícito: "el gráfico estuvo roto en producción pasando todos los tests, porque nadie lo había abierto").

Expected:
- El selector de mes/año arranca en el mes actual.
- El gráfico muestra una línea del dólar blue, con forma reconocible (sube fuerte a partir de 2018-2019, salto grande en 2023).
- Cambiar el mes/año objetivo redibuja el gráfico sin recargar la página.
- Elegir un mes/año viejo (por ejemplo 2005) también funciona: la línea cambia de escala porque ahora todo está en pesos de esa época.
- La consola del browser no tiene errores.
- `index.html` no tiene ningún link hacia `actualizar.html` (confirmar con `grep -rn "actualizar" index.html datos.html` → sin resultados).

- [ ] **Step 3: Correr la verificación completa**

Run: `npm run verificar`
Expected: PASS — typecheck, toda la suite de tests, y el build (que ahora incluye `dist/actualizar.html`).

- [ ] **Step 4: Confirmar que el build generó la página**

Run: `ls dist/actualizar.html`
Expected: el archivo existe.

- [ ] **Step 5: Commit final si algo quedó pendiente de las tareas anteriores**

```bash
git status --short
```

Si no hay cambios sin commitear, no hace falta ningún commit acá — esta tarea es sólo de verificación.
