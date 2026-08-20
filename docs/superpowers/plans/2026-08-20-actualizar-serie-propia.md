# Actualizar: serie propia del usuario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repurposear `/actualizar.html` para que una persona pegue o suba su propia
serie de valores nominales en pesos (fechas + montos) y la vea reexpresada en los
pesos de un único mes, con gráfico y tabla — reemplazando el MVP hardcodeado de
dólar blue que hoy vive ahí.

**Architecture:** Parser nuevo y puro en `src/engine/`. `actualizarSerie` se
extiende para aceptar `Punto` (mes o fecha exacta) en vez de sólo `Mes`, y para
marcar en vez de descartar los puntos que necesitarían estimar. El selector de
metodología se extrae a un módulo compartido para no duplicarlo entre `main.ts` y
la página nueva. Todo el cálculo sigue viviendo en `src/engine/`; `actualizar-main.ts`
sólo orquesta DOM. Sin llamadas al MCP en runtime: el IPC ya está en
`public/data/ipc.json` como en el resto del sitio.

**Tech Stack:** TypeScript sin framework, Vite, Chart.js, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-20-actualizar-serie-propia-design.md`

## Global Constraints

- El sitio no llama al MCP en runtime (regla 1 de `AGENTS.md`).
- Dato y estimación nunca se mezclan sin decirlo; una fila que no se pudo
  actualizar sin estimar se marca, nunca desaparece en silencio (regla 2/3).
- Un criterio se escribe una sola vez: la extensión a `Punto`, el parseo de fecha y
  valor, y el selector de metodología no pueden tener una segunda copia (regla 4).
- Castellano rioplatense, con vos, en todo lo visible.
- `npm run verificar` (`tsc --noEmit && vitest run && npm run build`) tiene que
  pasar después de cada tarea.
- No tocar: `actualizarSerieDoble`, `reescalarCrossCheck`, `calcularTcrBilateral`,
  `PuntoActualizado`, `PuntoActualizadoDoble`, `dolar-blue.json`, el loop de
  `INDICES_SECUNDARIOS` en `scripts/fetch-snapshot.ts` que escribe
  `series/secundario-*.json` y `series/crosscheck-*.json` — todo eso lo sigue
  usando `/tcr.html` (`tcr-main.ts`/`tcr-eje.ts`), verificado antes de este plan
  (ver spec, sección "El dato que sigue vivo en otro lado").

---

## Task 1: Parser de series pegadas/subidas

**Files:**
- Create: `src/engine/parse-serie.ts`
- Test: `tests/parse-serie.test.ts`

**Interfaces:**
- Consumes: `esMesValido`, `esFechaValida`, `diasEnMes` de `src/engine/mes.ts`
  (ya existen); `Punto` de `src/engine/types.ts` (ya existe).
- Produces: `parsearSerie(texto: string): ResultadoParseo`, con
  `type PuntoSerieUsuario = { punto: Punto; valor: number }`,
  `type FilaInvalida = { linea: number; motivo: string }`,
  `type ResultadoParseo = { puntos: PuntoSerieUsuario[]; errores: FilaInvalida[] }`.
  Task 2 y Task 6 importan estos tres tipos y `parsearSerie` de acá.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// tests/parse-serie.test.ts
import { describe, expect, it } from "vitest";
import { parsearSerie } from "../src/engine/parse-serie.js";

describe("parsearSerie: fechas", () => {
  it("acepta mes ISO (YYYY-MM)", () => {
    const r = parsearSerie("2024-01\t100\n2024-02\t110");
    expect(r.puntos).toEqual([
      { punto: "2024-01", valor: 100 },
      { punto: "2024-02", valor: 110 },
    ]);
    expect(r.errores).toEqual([]);
  });

  it("acepta fecha ISO completa (YYYY-MM-DD)", () => {
    const r = parsearSerie("2024-01-15\t100");
    expect(r.puntos).toEqual([{ punto: "2024-01-15", valor: 100 }]);
  });

  it("acepta DD/MM/YYYY, nunca MM/DD", () => {
    // 03/04/2024 es el 3 de abril, no el 4 de marzo.
    const r = parsearSerie("03/04/2024\t100");
    expect(r.puntos).toEqual([{ punto: "2024-04-03", valor: 100 }]);
  });

  it("acepta MM/YYYY", () => {
    const r = parsearSerie("04/2024\t100");
    expect(r.puntos).toEqual([{ punto: "2024-04", valor: 100 }]);
  });

  it("rechaza una fecha con mes o día imposible en cualquier lectura", () => {
    const r = parsearSerie("2024-01\t100\n32/13/2024\t100");
    expect(r.puntos).toHaveLength(1);
    expect(r.errores).toEqual([{ linea: 2, motivo: 'fecha no reconocida: "32/13/2024"' }]);
  });

  it("rechaza el 31 de abril (día que no existe en ese mes)", () => {
    const r = parsearSerie("31/04/2024\t100");
    expect(r.puntos).toEqual([]);
    expect(r.errores).toHaveLength(1);
  });
});

describe("parsearSerie: valores", () => {
  it("acepta decimal con punto", () => {
    expect(parsearSerie("2024-01\t1234.56").puntos[0]!.valor).toBeCloseTo(1234.56, 6);
  });

  it("acepta decimal con coma", () => {
    expect(parsearSerie("2024-01\t1234,56").puntos[0]!.valor).toBeCloseTo(1234.56, 6);
  });

  it("acepta miles con punto y decimal con coma", () => {
    expect(parsearSerie("2024-01\t1.234,56").puntos[0]!.valor).toBeCloseTo(1234.56, 6);
  });

  it("acepta miles con coma y decimal con punto", () => {
    expect(parsearSerie("2024-01\t1,234.56").puntos[0]!.valor).toBeCloseTo(1234.56, 6);
  });

  it("un solo punto con 3 dígitos después es separador de miles, no decimal", () => {
    expect(parsearSerie("2024-01\t1.234").puntos[0]!.valor).toBe(1234);
  });

  it("una sola coma con 3 dígitos después es separador de miles, no decimal", () => {
    expect(parsearSerie("2024-01\t1,234").puntos[0]!.valor).toBe(1234);
  });

  it("un solo punto con 1 o 2 dígitos después es decimal", () => {
    expect(parsearSerie("2024-01\t1234.5").puntos[0]!.valor).toBeCloseTo(1234.5, 6);
  });

  it("varios puntos repetidos son siempre separador de miles (un decimal no se repite)", () => {
    expect(parsearSerie("2024-01\t1.234.567").puntos[0]!.valor).toBe(1234567);
  });

  it("miles y decimales combinados con dos grupos de miles", () => {
    expect(parsearSerie("2024-01\t1.234.567,89").puntos[0]!.valor).toBeCloseTo(1234567.89, 6);
  });

  it("rechaza un valor con 4+ dígitos después de un único separador", () => {
    const r = parsearSerie("2024-01\t1.23456");
    expect(r.puntos).toEqual([]);
    expect(r.errores[0]!.motivo).toMatch(/valor no reconocido/);
  });

  it("rechaza texto que no es un número", () => {
    const r = parsearSerie("2024-01\tabc");
    expect(r.errores[0]!.motivo).toMatch(/valor no reconocido/);
  });
});

describe("parsearSerie: separadores de campo", () => {
  it("detecta tab", () => {
    expect(parsearSerie("2024-01\t100").puntos).toHaveLength(1);
  });

  it("detecta coma cuando no hay tab", () => {
    expect(parsearSerie("2024-01,100").puntos).toHaveLength(1);
  });

  it("detecta punto y coma cuando no hay tab ni coma", () => {
    expect(parsearSerie("2024-01;100").puntos).toHaveLength(1);
  });

  it("con separador coma, un valor con coma decimal se resuelve por el PRIMER corte", () => {
    // "2024-01,1.234,56": el primer "," separa fecha de valor; el resto ("1.234,56")
    // es el valor completo, no un tercer campo.
    const r = parsearSerie("2024-01,1.234,56");
    expect(r.puntos).toEqual([{ punto: "2024-01", valor: 1234.56 }]);
  });

  it("una línea sin ningún separador reconocible es inválida", () => {
    const r = parsearSerie("2024-01 100");
    expect(r.puntos).toEqual([]);
    expect(r.errores).toHaveLength(1);
  });
});

describe("parsearSerie: encabezado, duplicados, líneas vacías", () => {
  it("descarta un encabezado en la primera línea sin marcarlo como error", () => {
    const r = parsearSerie("fecha\tvalor\n2024-01\t100");
    expect(r.puntos).toEqual([{ punto: "2024-01", valor: 100 }]);
    expect(r.errores).toEqual([]);
  });

  it("un error genuino en la primera línea SÍ se reporta si la fecha parsea pero el valor no", () => {
    const r = parsearSerie("2024-01\tabc\n2024-02\t100");
    expect(r.puntos).toEqual([{ punto: "2024-02", valor: 100 }]);
    expect(r.errores).toEqual([{ linea: 1, motivo: 'valor no reconocido: "abc"' }]);
  });

  it("ignora líneas vacías sin reportarlas como error", () => {
    const r = parsearSerie("2024-01\t100\n\n2024-02\t110\n");
    expect(r.puntos).toHaveLength(2);
    expect(r.errores).toEqual([]);
  });

  it("una fecha repetida se descarta y se avisa, se queda con la primera", () => {
    const r = parsearSerie("2024-01\t100\n2024-01\t200");
    expect(r.puntos).toEqual([{ punto: "2024-01", valor: 100 }]);
    expect(r.errores).toEqual([{ linea: 2, motivo: "fecha repetida: 2024-01" }]);
  });

  it("conserva el orden de aparición, sin ordenar", () => {
    const r = parsearSerie("2024-03\t100\n2024-01\t80");
    expect(r.puntos.map((p) => p.punto)).toEqual(["2024-03", "2024-01"]);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run tests/parse-serie.test.ts`
Expected: FAIL — `Cannot find module '../src/engine/parse-serie.js'`

- [ ] **Step 3: Implementar el parser**

```ts
// src/engine/parse-serie.ts
/**
 * Parsea una serie de valores pegada o subida como CSV: cada línea es
 * `<fecha><separador><valor>`. No hace ninguna cuenta de inflación — sólo
 * convierte texto suelto en `{ punto, valor }[]`, listo para `actualizarSerie`.
 *
 * Vive separado de `actualizarSerie` porque parsear texto y ajustar por inflación
 * son dos responsabilidades sin nada en común: ésta no sabe qué es el IPC, y
 * `actualizarSerie` no sabe qué es un CSV.
 */
import { diasEnMes, esFechaValida, esMesValido } from "./mes.js";
import type { Punto } from "./types.js";

export type PuntoSerieUsuario = { punto: Punto; valor: number };
export type FilaInvalida = { linea: number; motivo: string };
export type ResultadoParseo = { puntos: PuntoSerieUsuario[]; errores: FilaInvalida[] };

const SEPARADORES = ["\t", ",", ";"] as const;

/**
 * Corta en el PRIMER separador encontrado, no en todos: el valor puede repetir el
 * mismo carácter (`1.234,56` con separador de campo `,`), y la fecha nunca lo
 * contiene en ninguno de los cuatro formatos que se aceptan.
 */
function separarLinea(linea: string): { fecha: string; valor: string } | null {
  for (const sep of SEPARADORES) {
    const idx = linea.indexOf(sep);
    if (idx === -1) continue;
    return { fecha: linea.slice(0, idx).trim(), valor: linea.slice(idx + 1).trim() };
  }
  return null;
}

function parsearFecha(crudo: string): Punto | null {
  const texto = crudo.trim();
  if (esMesValido(texto)) return texto;
  if (esFechaValida(texto)) return texto;

  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    const candidato = `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    return esFechaValida(candidato) ? candidato : null;
  }

  const mmyyyy = /^(\d{1,2})\/(\d{4})$/.exec(texto);
  if (mmyyyy) {
    const [, m, y] = mmyyyy;
    const candidato = `${y}-${m!.padStart(2, "0")}`;
    return esMesValido(candidato) ? candidato : null;
  }

  return null;
}

/**
 * Ver la regla completa en el spec ("Formato de entrada"). Resumen: con los dos
 * símbolos presentes, el último en la posición es el decimal. Con uno solo repetido,
 * es separador de miles (un decimal nunca se repite). Con uno solo una vez, 1-2
 * dígitos después es decimal, 3 es separador de miles, cualquier otro largo no
 * tiene lectura razonable.
 */
function parsearValor(crudo: string): number | null {
  const texto = crudo.trim();
  if (!/^-?[\d.,]+$/.test(texto) || !/\d/.test(texto)) return null;

  const negativo = texto.startsWith("-");
  const cuerpo = negativo ? texto.slice(1) : texto;

  const puntos = [...cuerpo.matchAll(/\./g)].map((m) => m.index!);
  const comas = [...cuerpo.matchAll(/,/g)].map((m) => m.index!);

  let normalizado: string;

  if (puntos.length > 0 && comas.length > 0) {
    const decimalEsPunto = puntos.at(-1)! > comas.at(-1)!;
    const separadorMiles = decimalEsPunto ? "," : ".";
    const separadorDecimal = decimalEsPunto ? "." : ",";
    normalizado = cuerpo.split(separadorMiles).join("").replace(separadorDecimal, ".");
  } else if (puntos.length > 1 || comas.length > 1) {
    normalizado = cuerpo.replace(/[.,]/g, "");
  } else if (puntos.length === 1 || comas.length === 1) {
    const simbolo = puntos.length === 1 ? "." : ",";
    const idx = cuerpo.indexOf(simbolo);
    const digitosDespues = cuerpo.length - idx - 1;
    if (digitosDespues === 1 || digitosDespues === 2) {
      normalizado = cuerpo.replace(simbolo, ".");
    } else if (digitosDespues === 3) {
      normalizado = cuerpo.replace(simbolo, "");
    } else {
      return null;
    }
  } else {
    normalizado = cuerpo;
  }

  const valor = Number(normalizado);
  if (!Number.isFinite(valor)) return null;
  return negativo ? -valor : valor;
}

export function parsearSerie(texto: string): ResultadoParseo {
  const lineas = texto.split(/\r\n|\r|\n/);
  const puntos: PuntoSerieUsuario[] = [];
  const errores: FilaInvalida[] = [];
  const vistos = new Set<Punto>();

  lineas.forEach((lineaCruda, i) => {
    const linea = lineaCruda.trim();
    if (linea === "") return;

    const numeroDeLinea = i + 1;
    const partida = separarLinea(linea);
    if (!partida) {
      // A diferencia del caso de abajo (fecha y valor parsean el campo pero ninguno
      // de los dos da una fecha/número válido, ahí sí se perdona en la línea 1): acá
      // no hay ni separador reconocible, así que no hay ninguna lectura razonable
      // de "esto es un encabezado" — siempre es un error, sea cual sea la línea.
      errores.push({ linea: numeroDeLinea, motivo: "no se reconoce fecha y valor separados" });
      return;
    }

    const punto = parsearFecha(partida.fecha);
    const valor = parsearValor(partida.valor);

    // Encabezado: ni la fecha ni el valor parsean, y es la primera línea. Un error
    // genuino en la línea 1 (una de las dos SÍ parsea) se reporta igual que en
    // cualquier otra línea, más abajo.
    if (punto === null && valor === null && numeroDeLinea === 1) return;

    if (punto === null) {
      errores.push({ linea: numeroDeLinea, motivo: `fecha no reconocida: "${partida.fecha}"` });
      return;
    }
    if (valor === null) {
      errores.push({ linea: numeroDeLinea, motivo: `valor no reconocido: "${partida.valor}"` });
      return;
    }
    if (vistos.has(punto)) {
      errores.push({ linea: numeroDeLinea, motivo: `fecha repetida: ${punto}` });
      return;
    }

    vistos.add(punto);
    puntos.push({ punto, valor });
  });

  return { puntos, errores };
}
```

`diasEnMes` queda importado pero sin uso directo: `esFechaValida` ya lo usa
internamente para rechazar el 31 de abril. Sacar el import no usado antes de
commitear (el paso de typecheck lo va a marcar si queda).

- [ ] **Step 4: Sacar el import sin uso y correr los tests**

Editar el import: sacar `diasEnMes` de la lista (no se llama directo en este
archivo, `esFechaValida` ya hace esa cuenta).

```ts
import { esFechaValida, esMesValido } from "./mes.js";
```

Run: `npx vitest run tests/parse-serie.test.ts`
Expected: PASS, los 24 tests en verde.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/engine/parse-serie.ts tests/parse-serie.test.ts
git commit -m "feat(engine): parsear series pegadas o subidas por el usuario"
```

---

## Task 2: Extender `actualizarSerie` a `Punto` y metodología

**Files:**
- Modify: `src/engine/actualizar.ts`
- Modify: `tests/actualizar.test.ts`

**Interfaces:**
- Consumes: `PuntoSerieUsuario` de Task 1 (`src/engine/parse-serie.ts`);
  `adjust`, `motivoParaEstimar`, `OpcionesAjuste` de `adjust.ts` (ya existen).
- Produces: `type PuntoSerieActualizado = { punto: Punto; valorOriginal: number;
  valorActualizado: number | null; esProyeccion: boolean; motivo:
  "futuro" | "ventana_no_cabe" | "ventana_sesgada" | null }` y
  `actualizarSerie(datos: PuntoSerieUsuario[], mesObjetivo: Mes, ipc: SerieIndice,
  opciones?: OpcionesAjuste): PuntoSerieActualizado[]`. Task 6 (`actualizar-main.ts`)
  y Task 6 los tests de la tabla consumen este tipo y esta función.
- **No toca** `actualizarSerieDoble`, `PuntoActualizado`, `PuntoActualizadoDoble`,
  `reescalarCrossCheck`, `calcularTcrBilateral`: siguen con `PuntoValor`/`Mes` tal
  cual, porque `/tcr.html` los sigue usando así.

- [ ] **Step 1: Escribir los tests que fallan (reemplazan el describe `actualizarSerie` actual)**

Reemplazar por completo el bloque `describe("actualizarSerie", ...)` de
`tests/actualizar.test.ts` (líneas 31-100 de la versión actual) por éste — el resto
del archivo (`actualizarSerieDoble`, `reescalarCrossCheck`, `calcularTcrBilateral`)
queda intacto:

```ts
describe("actualizarSerie", () => {
  it("no cambia el valor de un punto que ya está en el mes objetivo", () => {
    const r = actualizarSerie([{ punto: "2020-04", valor: 133.1 }], "2020-04", ipc);
    expect(r).toHaveLength(1);
    expect(r[0]!.valorActualizado).toBeCloseTo(133.1, 6);
    expect(r[0]!.motivo).toBeNull();
  });

  it("actualiza un punto viejo a un mes más nuevo (dato directo)", () => {
    const r = actualizarSerie([{ punto: "2020-01", valor: 100 }], "2020-04", ipc);
    expect(r[0]!.valorOriginal).toBe(100);
    expect(r[0]!.valorActualizado).toBeCloseTo(133.1, 6);
    expect(r[0]!.esProyeccion).toBe(false);
  });

  it("deflacta cuando el objetivo es anterior al punto", () => {
    const r = actualizarSerie([{ punto: "2020-04", valor: 133.1 }], "2020-01", ipc);
    expect(r[0]!.valorActualizado).toBeCloseTo(100, 6);
  });

  it("acepta una fecha exacta (Punto = día), no sólo un mes", () => {
    // El motor de fechas ya está probado en adjust.test.ts; acá sólo se confirma
    // que actualizarSerie lo deja pasar sin convertirlo a mes primero.
    const conDia = actualizarSerie([{ punto: "2020-02-15", valor: 100 }], "2020-04", ipc);
    const conMes = actualizarSerie([{ punto: "2020-02", valor: 100 }], "2020-04", ipc);
    expect(conDia[0]!.valorActualizado).not.toBeCloseTo(conMes[0]!.valorActualizado!, 2);
    expect(conDia[0]!.valorActualizado).not.toBeNull();
  });

  it("con metodología sin_proyectar (default), marca en vez de descartar un punto que necesitaría estimar", () => {
    const r = actualizarSerie(
      [
        { punto: "2020-01", valor: 100 },
        { punto: "2020-04", valor: 133.1 },
      ],
      "2020-07",
      ipc,
    );
    expect(r).toHaveLength(2); // las dos filas están, ninguna desaparece
    expect(r[0]!.valorActualizado).toBeNull();
    expect(r[0]!.motivo).toBe("ventana_no_cabe");
    expect(r[1]!.valorActualizado).toBeNull();
  });

  it("con metodología repite_ultimo, ese mismo punto SÍ se resuelve, marcado como proyección", () => {
    const r = actualizarSerie(
      [{ punto: "2020-01", valor: 100 }],
      "2020-07",
      ipc,
      { metodologia: "repite_ultimo" },
    );
    expect(r[0]!.valorActualizado).not.toBeNull();
    expect(r[0]!.esProyeccion).toBe(true);
    expect(r[0]!.motivo).toBeNull();
  });

  it("conserva el orden de los puntos de entrada", () => {
    const r = actualizarSerie(
      [
        { punto: "2020-02", valor: 110 },
        { punto: "2020-01", valor: 100 },
      ],
      "2020-04",
      ipc,
    );
    expect(r.map((p) => p.punto)).toEqual(["2020-02", "2020-01"]);
  });

  it("con el objetivo en ultimo_oficial, todos los puntos resuelven directo", () => {
    const puntos = ipc.datos.map((p) => ({ punto: p.mes, valor: p.indice }));
    const r = actualizarSerie(puntos, ipc.ultimo_oficial, ipc);
    expect(r.every((p) => p.valorActualizado !== null && !p.esProyeccion)).toBe(true);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run tests/actualizar.test.ts`
Expected: FAIL — el `actualizarSerie` actual usa `{ mes, valor }` y descarta en vez
de marcar, así que varias aserciones de arriba no matchean (`r[0]!.punto` es
`undefined`, `r` tiene largo 1 en vez de 2, etc.).

- [ ] **Step 3: Reescribir `actualizarSerie`**

En `src/engine/actualizar.ts`, cambiar el import y agregar el tipo nuevo antes de
la función (dejar el resto del archivo — `DireccionSecundaria`,
`PuntoActualizadoDoble`, `actualizarSerieDoble`, `calcularTcrBilateral`,
`fueraDeCobertura`, `reescalarCrossCheck` — intacto):

```ts
import { adjust, motivoParaEstimar } from "./adjust.js";
import type { OpcionesAjuste } from "./adjust.js";
import { compararMeses } from "./mes.js";
import type { PuntoSerieUsuario } from "./parse-serie.js";
import type { Mes, Punto, PuntoValor, SerieIndice } from "./types.js";

export type PuntoSerieActualizado = {
  punto: Punto;
  valorOriginal: number;
  /** `null` cuando `metodologia` es `sin_proyectar` y este punto necesitaría estimar. */
  valorActualizado: number | null;
  /** El valor salió de una tasa estimada (metodología repite_ultimo o rem), no de un dato directo o de la ventana de referencia. */
  esProyeccion: boolean;
  /** Por qué `valorActualizado` es `null`. `null` cuando sí se pudo resolver. */
  motivo: "futuro" | "ventana_no_cabe" | "ventana_sesgada" | null;
};

/**
 * Reindexa cada punto de una serie propia contra el IPC.
 *
 * A diferencia de la versión que reemplaza, no descarta en silencio los puntos que
 * necesitarían estimar bajo `sin_proyectar`: los marca con `valorActualizado: null`
 * y el `motivo` (misma respuesta que ya usa el selector de metodología de la
 * calculadora principal, `motivoParaEstimar`) — regla 3 de `AGENTS.md` aplicada a
 * una fila de tabla, no sólo a un control.
 */
export function actualizarSerie(
  datos: PuntoSerieUsuario[],
  mesObjetivo: Mes,
  ipc: SerieIndice,
  opciones: OpcionesAjuste = {},
): PuntoSerieActualizado[] {
  const metodologia = opciones.metodologia ?? "sin_proyectar";

  return datos.map((dato) => {
    const motivo = motivoParaEstimar(dato.punto, mesObjetivo, ipc, opciones.hoy);

    if (metodologia === "sin_proyectar" && motivo !== null) {
      return {
        punto: dato.punto,
        valorOriginal: dato.valor,
        valorActualizado: null,
        esProyeccion: false,
        motivo,
      };
    }

    const resultado = adjust(dato.valor, dato.punto, mesObjetivo, ipc, opciones);
    return {
      punto: dato.punto,
      valorOriginal: dato.valor,
      valorActualizado: resultado.montoAjustado,
      esProyeccion: resultado.metodo.tipo === "proyeccion",
      motivo: null,
    };
  });
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run tests/actualizar.test.ts`
Expected: PASS — el describe `actualizarSerie` nuevo en verde, y los describes de
`actualizarSerieDoble`/`reescalarCrossCheck`/`calcularTcrBilateral` (sin tocar)
siguen en verde también.

- [ ] **Step 5: Typecheck y suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores. `src/ui/actualizar-main.ts` va a tirar un error de tipos acá
porque todavía llama a `actualizarSerie(dolarBlue.datos, ...)` con la firma vieja —
eso se resuelve recién en Task 6, cuando se reescribe ese archivo entero. Anotar el
error y seguir: es esperado hasta esa tarea.

- [ ] **Step 6: Commit**

```bash
git add src/engine/actualizar.ts tests/actualizar.test.ts
git commit -m "feat(engine): actualizarSerie acepta fecha exacta y metodología, marca en vez de descartar"
```

---

## Task 3: Extraer el selector de metodología a un módulo compartido

**Files:**
- Create: `src/ui/metodologia.ts`
- Modify: `src/ui/main.ts`

**Interfaces:**
- Produces: `METODOLOGIAS: Metodologia[]`, `esMetodologia(v: string | null): v is
  Metodologia`, `MOTIVOS: Record<"futuro" | "ventana_no_cabe" | "ventana_sesgada",
  string>`. Task 6 (`actualizar-main.ts`) importa `esMetodologia` y `MOTIVOS`
  (el select de metodología de esa página es estático en el HTML, no se puebla
  desde `METODOLOGIAS` — ver Task 5); `METODOLOGIAS` queda exportado porque
  `main.ts` lo sigue usando.

No lleva tests propios: es una extracción mecánica (mismas strings, mismo tipo),
verificada por los tests existentes de `main.ts` (no hay `main.test.ts` — se
verifica con `tsc --noEmit`, la suite completa, y el paso 4 de este task).

- [ ] **Step 1: Crear el módulo compartido**

```ts
// src/ui/metodologia.ts
/**
 * El selector "qué hacer con los meses que el INDEC no publicó", compartido entre
 * `main.ts` (un solo período) y `actualizar-main.ts` (una serie de puntos). Antes
 * vivía sólo en `main.ts`; se extrae para que las dos páginas ofrezcan las mismas
 * tres opciones con el mismo texto — regla 4 de `AGENTS.md`.
 */
import type { Metodologia } from "../engine/types.js";
import type { motivoParaEstimar } from "../engine/adjust.js";

export const METODOLOGIAS: Metodologia[] = ["sin_proyectar", "repite_ultimo", "rem"];

export function esMetodologia(v: string | null): v is Metodologia {
  return v !== null && (METODOLOGIAS as string[]).includes(v);
}

/**
 * Por qué «no estimar ninguno» no da un resultado para un período dado, en las
 * palabras de cada caso — mismo texto para las dos páginas.
 */
export const MOTIVOS: Record<NonNullable<ReturnType<typeof motivoParaEstimar>>, string> = {
  futuro:
    "«No estimar ninguno» no está disponible para este período: el mes de destino todavía " +
    "no llegó, así que no existe ningún tramo ya publicado que sirva de referencia. " +
    "Cualquier respuesta va a ser una estimación.",
  ventana_no_cabe:
    "«No estimar ninguno» no está disponible para este período: para tomar como referencia " +
    "un tramo publicado del mismo largo habría que ir más atrás de donde arranca esta " +
    "serie. Cualquier respuesta va a ser una estimación.",
  ventana_sesgada:
    "«No estimar ninguno» no está disponible para este período: este índice viene atrasado, " +
    "y esa opción daría un número bastante distinto de la inflación real del período. " +
    "Preferimos estimar y decirlo.",
};
```

- [ ] **Step 2: Reemplazar las definiciones locales en `main.ts`**

Sacar de `src/ui/main.ts` las líneas 126-135 (`METODOLOGIAS`, `esMetodologia`) y el
bloque `MOTIVOS` (líneas ~612-630), y agregar el import. `leerMetodologia` y
`sincronizarOpcionesDeMetodologia` quedan tal cual donde están — son específicas
del DOM de `index.html`.

```ts
import { esMetodologia, METODOLOGIAS, MOTIVOS } from "./metodologia.js";
```

Confirmar que no queda ninguna definición duplicada: `grep -n "^const METODOLOGIAS\|^function esMetodologia\|^const MOTIVOS" src/ui/main.ts` no debe devolver nada.

- [ ] **Step 3: Typecheck y suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores nuevos (el error ya anotado en Task 2 sobre
`actualizar-main.ts` sigue ahí, esperado hasta Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/ui/metodologia.ts src/ui/main.ts
git commit -m "refactor(ui): extraer el selector de metodología a un módulo compartido"
```

---

## Task 4: Gráfico de dos líneas (nominal + actualizada)

**Files:**
- Modify: `src/ui/chart-serie.ts`

**Interfaces:**
- Consumes: `PuntoSerieActualizado[]` de Task 2 (`src/engine/actualizar.ts`).
- Produces: `dibujarSerieActualizada(canvas, puntos: PuntoSerieActualizado[],
  mesObjetivoTexto: string): void`. Task 6 la llama.
- Este archivo hoy sólo lo consume `actualizar-main.ts` (confirmado antes de este
  plan: `/tcr.html` usa `chart-tcr.ts`, no éste) — se puede reescribir entero sin
  tocar TCR.

No lleva tests propios: dibuja en un `<canvas>` con Chart.js, igual que
`chart.ts`/`chart-tcr.ts`, que tampoco tienen test unitario — se verifica con
`tsc --noEmit` y browser real en Task 6.

- [ ] **Step 1: Reescribir el archivo**

Reemplaza el `OverlaySerieDoble`/cross-check (era específico del índice secundario
que se saca de esta página, Task 9) por una segunda serie fija: la nominal, siempre
visible junto a la actualizada. Puntos con `valorActualizado: null` cortan la línea
(Chart.js con `null` corta la línea en vez de interpolar o caer a cero).

```ts
// src/ui/chart-serie.ts
/**
 * Gráfico de línea de una serie propia ya reindexada: la curva nominal (tal cual
 * la pegó la persona) y la actualizada, una al lado de la otra — es lo que hace
 * que el resultado se pueda defender, no sólo mostrar un número final.
 *
 * Puntos con `valorActualizado: null` (no se pudieron actualizar sin estimar, ver
 * `actualizarSerie`) cortan la línea actualizada en ese tramo — Chart.js interpreta
 * `null` como corte, no como cero ni como interpolación.
 */
import {
  CategoryScale,
  Chart,
  type ChartDataset,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";

import type { PuntoSerieActualizado } from "../engine/actualizar.js";
import { abreviarPunto } from "../engine/mes.js";
import { conAlfa, tokens } from "./chart.js";
import { pesosRedondo } from "./format.js";

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip, Legend);

let grafico: Chart | null = null;

export function dibujarSerieActualizada(
  canvas: HTMLCanvasElement,
  puntos: PuntoSerieActualizado[],
  mesObjetivoTexto: string,
): void {
  const t = tokens();

  const datasets: ChartDataset<"line", (number | null)[]>[] = [
    {
      label: "Serie original",
      data: puntos.map((p) => p.valorOriginal),
      borderColor: conAlfa(t.serie, 0.45),
      backgroundColor: conAlfa(t.serie, 0.45),
      borderDash: [6, 4],
      pointRadius: 0,
      borderWidth: 2,
    },
    {
      label: `A pesos de ${mesObjetivoTexto}`,
      data: puntos.map((p) => p.valorActualizado),
      borderColor: t.serie,
      backgroundColor: t.serie,
      pointRadius: 0,
      borderWidth: 2,
    },
  ];

  grafico?.destroy();
  grafico = new Chart(canvas, {
    type: "line",
    data: {
      labels: puntos.map((p) => abreviarPunto(p.punto)),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, labels: { color: t.eje, font: { size: 11 } } },
        tooltip: {
          backgroundColor: t.texto,
          titleColor: t.superficie,
          bodyColor: t.superficie,
          padding: 10,
          callbacks: {
            label: (item) =>
              item.raw === null
                ? `${item.dataset.label}: no se pudo actualizar sin estimar`
                : `${item.dataset.label}: ${pesosRedondo(Number(item.raw))}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: t.grilla },
          ticks: { color: t.eje, maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 11 } },
        },
        y: {
          grid: { color: t.grilla },
          border: { display: false },
          ticks: { color: t.eje, font: { size: 11 }, callback: (v) => pesosRedondo(Number(v)) },
        },
      },
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: los únicos errores restantes son en `actualizar-main.ts` (ya anotado,
pendiente hasta Task 6) — ninguno en `chart-serie.ts` ni en `tcr-main.ts`/`chart-tcr.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/ui/chart-serie.ts
git commit -m "feat(ui): gráfico de dos líneas (nominal y actualizada) para series propias"
```

---

## Task 5: Markup de `actualizar.html`

**Files:**
- Modify: `actualizar.html`

Reemplazo completo del `<body>`: se saca el selector de índice secundario, el
badge de dólar blue, el slider de rango (fuera de alcance, ver spec); entran el
textarea, el input de archivo, el selector de metodología, y la tabla de
resultado. `noindex, nofollow` se mantiene por ahora — se saca en Task 10, cuando
el resto del plan ya pasó la verificación.

- [ ] **Step 1: Reescribir el archivo**

```html
<!doctype html>
<html lang="es-AR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Actualizar una serie — Calculadora de inflación</title>
    <meta name="robots" content="noindex, nofollow" />
    <link rel="icon" href="./favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="./src/styles.css" />
  </head>
  <body>
    <header class="cabecera">
      <div class="contenido">
        <h1>Actualizar una serie</h1>
        <p class="bajada">
          En vez de un monto entre dos fechas, una serie entera —un alquiler mes a
          mes, un sueldo, lo que sea— reexpresada en los pesos de un único mes.
          Pegá o subí tu serie, cada punto se ajusta con el mismo motor que usa la
          calculadora principal.
        </p>
      </div>
    </header>

    <main class="contenido">
      <form class="tarjeta formulario" id="formulario">
        <div class="campo campo--ancho">
          <label for="entrada-serie">
            Pegá tu serie: una fila por línea, fecha y valor separados por tab,
            coma o punto y coma
          </label>
          <textarea
            id="entrada-serie"
            rows="8"
            placeholder="2024-01&#9;150000&#10;2024-02&#9;155000&#10;2024-03&#9;162000"
          ></textarea>
          <p class="ayuda-formato">
            Fechas: <code>2024-01</code>, <code>2024-01-15</code>,
            <code>15/01/2024</code> o <code>01/2024</code>. En
            <code>DD/MM/AAAA</code> el día va primero, nunca el mes. Montos con
            coma o punto decimal, con o sin separador de miles.
          </p>
          <label for="entrada-archivo" class="etiqueta-archivo">
            o subí un archivo .csv con el mismo formato
          </label>
          <input type="file" id="entrada-archivo" accept=".csv,text/csv,text/plain" />
        </div>

        <div class="campo">
          <label for="objetivo-mes">Expresar en pesos de</label>
          <div class="entrada-fecha">
            <select id="objetivo-mes" aria-label="Mes objetivo"></select>
            <select id="objetivo-anio" aria-label="Año objetivo"></select>
          </div>
        </div>

        <p class="metodologia">
          <label for="metodologia" id="rotulo-metodologia">Meses que el INDEC no publicó:</label>
          <select id="metodologia">
            <option value="sin_proyectar">no estimar ninguno</option>
            <option value="repite_ultimo">estimarlos con la inflación del último mes</option>
            <option value="rem" id="opcion-rem">estimarlos con el REM del BCRA</option>
          </select>
          <a href="./datos.html#metodologias">¿cuál me conviene?</a>
        </p>
      </form>

      <p class="error" id="error" hidden></p>
      <ul class="errores-parseo" id="errores-parseo" hidden></ul>
      <p class="error" id="aviso-serie" hidden></p>

      <section class="tarjeta panel">
        <div class="panel__cabecera">
          <h2>Tu serie, actualizada</h2>
        </div>
        <div class="grafico">
          <canvas
            id="grafico"
            role="img"
            aria-label="La serie que pegaste, original y reexpresada en los pesos del mes elegido"
          ></canvas>
        </div>

        <div class="tabla-scroll">
          <table class="desglose" id="tabla-resultado" hidden>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Valor original</th>
                <th scope="col">Valor actualizado</th>
              </tr>
            </thead>
            <tbody id="cuerpo-resultado"></tbody>
          </table>
        </div>

        <p class="badge">
          Serie propia, pegada o subida por vos · actualizada a pesos de cada mes
          según el IPC del INDEC y el BCRA · datos de inflación vía
          <a href="https://argentinadata.mymcps.dev" rel="noopener">Argentina Data MCP</a>
        </p>
      </section>
    </main>

    <footer class="pie">
      <div class="contenido">
        <p>
          <a href="./">Volver a la calculadora</a> ·
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

- [ ] **Step 2: Commit**

```bash
git add actualizar.html
git commit -m "feat(ui): markup de Actualizar para series propias del usuario"
```

(El build todavía no compila — `actualizar-main.ts` no tiene los elementos nuevos
cableados. Se resuelve en Task 6, próxima. Commitear igual, en pasos chicos, es
consistente con el resto del plan: cada task es un commit, y `npm run verificar`
recién tiene que estar en verde al final de Task 6.)

---

## Task 6: Orquestación de `actualizar-main.ts`

**Files:**
- Modify: `src/ui/actualizar-main.ts` (reescritura completa)

**Interfaces:**
- Consumes: `parsearSerie`, `PuntoSerieUsuario`, `FilaInvalida` de Task 1;
  `actualizarSerie`, `PuntoSerieActualizado` de Task 2; `esMetodologia`,
  `MOTIVOS` de Task 3; `dibujarSerieActualizada` de Task 4; el markup de Task 5.
- Simplificación deliberada respecto de la versión vieja: **sin slider de rango ni
  URL compartible** — no estaban en el spec aprobado, y una URL no puede reproducir
  un texto pegado de todos modos. Si en algún momento hace falta zoom sobre una
  serie muy larga, es una extensión futura, no parte de este cambio.

- [ ] **Step 1: Reescribir el archivo**

```ts
// src/ui/actualizar-main.ts
/**
 * Orquestación de `/actualizar.html`: lee la serie que la persona pegó o subió,
 * la reindexa contra el IPC y la grafica. Ninguna cuenta de inflación se hace acá
 * — vive en `parsearSerie` (texto → puntos) y `actualizarSerie` (puntos → serie
 * actualizada), que a su vez reusa `adjust()` tal cual.
 */
import { actualizarSerie } from "../engine/actualizar.js";
import type { PuntoSerieActualizado } from "../engine/actualizar.js";
import { esMesValido, nombrarMes, nombrarPunto } from "../engine/mes.js";
import { parsearSerie } from "../engine/parse-serie.js";
import type { FilaInvalida } from "../engine/parse-serie.js";
import type { Mes, Metodologia, SerieIndice } from "../engine/types.js";
import { dibujarSerieActualizada } from "./chart-serie.js";
import { esMetodologia, MOTIVOS } from "./metodologia.js";
import { pesos } from "./format.js";

/**
 * Antes de 1992 Argentina tenía el austral, no el peso — mismo valor y motivo que
 * `PRIMER_ANIO_EN_PESOS` de `scripts/generar-paginas.ts` y de la versión anterior
 * de este archivo.
 */
const PRIMER_ANIO_EN_PESOS = 1992;

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

function limiteObjetivo(): { primero: Mes; ultimo: Mes } {
  const desdeSerie = ipc.datos[0]!.mes;
  const primero = desdeSerie > `${PRIMER_ANIO_EN_PESOS}-01` ? desdeSerie : `${PRIMER_ANIO_EN_PESOS}-01`;
  return { primero, ultimo: ipc.ultimo_oficial };
}

function poblarSelectorObjetivo(): void {
  const { primero, ultimo } = limiteObjetivo();

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
  el<HTMLSelectElement>("objetivo-anio").replaceChildren(...anios.map((a) => opcion(String(a), String(a))));
}

function acotarMesesObjetivo(): void {
  const { primero, ultimo } = limiteObjetivo();
  const anio = el<HTMLSelectElement>("objetivo-anio").value;
  const selectMes = el<HTMLSelectElement>("objetivo-mes");

  const minimo = anio === primero.slice(0, 4) ? primero.slice(5, 7) : "01";
  const maximo = anio === ultimo.slice(0, 4) ? ultimo.slice(5, 7) : "12";

  for (const opcion of selectMes.options) {
    opcion.disabled = opcion.value < minimo || opcion.value > maximo;
  }
  if (selectMes.value < minimo) selectMes.value = minimo;
  if (selectMes.value > maximo) selectMes.value = maximo;
}

function leerObjetivo(): Mes {
  const mes = el<HTMLSelectElement>("objetivo-mes").value;
  const anio = el<HTMLSelectElement>("objetivo-anio").value;
  return `${anio}-${mes}`;
}

function leerMetodologia(): Metodologia {
  const v = el<HTMLSelectElement>("metodologia").value;
  return esMetodologia(v) ? v : "sin_proyectar";
}

function poblarSelectorMetodologia(): void {
  const hayRem = ipc.rem !== undefined;
  el<HTMLOptionElement>("opcion-rem").hidden = !hayRem;
  if (!hayRem && leerMetodologia() === "rem") {
    el<HTMLSelectElement>("metodologia").value = "sin_proyectar";
  }
}

/* ------------------------------------------------------------- errores de parseo */

function pintarErrores(errores: FilaInvalida[]): void {
  const lista = el<HTMLUListElement>("errores-parseo");
  lista.replaceChildren(
    ...errores.map((e) => {
      const li = document.createElement("li");
      li.textContent = `Línea ${e.linea}: ${e.motivo}`;
      return li;
    }),
  );
  lista.hidden = errores.length === 0;
}

/* ---------------------------------------------------------------------- tabla */

function pintarTabla(resultado: PuntoSerieActualizado[]): void {
  const tabla = el<HTMLTableElement>("tabla-resultado");
  const cuerpo = el<HTMLTableSectionElement>("cuerpo-resultado");

  if (resultado.length === 0) {
    tabla.hidden = true;
    cuerpo.replaceChildren();
    return;
  }

  tabla.hidden = false;
  cuerpo.replaceChildren(
    ...resultado.map((p) => {
      const fila = document.createElement("tr");

      const celdaFecha = document.createElement("td");
      celdaFecha.textContent = nombrarPunto(p.punto);
      fila.append(celdaFecha);

      const celdaOriginal = document.createElement("td");
      celdaOriginal.textContent = pesos(p.valorOriginal);
      fila.append(celdaOriginal);

      const celdaActualizada = document.createElement("td");
      if (p.valorActualizado === null) {
        celdaActualizada.textContent = "no se pudo actualizar sin estimar";
        celdaActualizada.title = MOTIVOS[p.motivo!];
        fila.classList.add("fila-sin-actualizar");
      } else {
        celdaActualizada.textContent = pesos(p.valorActualizado);
        if (p.esProyeccion) {
          celdaActualizada.textContent += " (estimado)";
          fila.classList.add("fila-estimada");
        }
      }
      fila.append(celdaActualizada);

      return fila;
    }),
  );
}

/* ------------------------------------------------------------------- cálculo */

function recalcular(): void {
  const texto = el<HTMLTextAreaElement>("entrada-serie").value;
  const { puntos, errores } = parsearSerie(texto);
  pintarErrores(errores);

  const aviso = el("aviso-serie");
  const canvas = el<HTMLCanvasElement>("grafico");

  if (puntos.length < 2) {
    canvas.hidden = true;
    el<HTMLTableElement>("tabla-resultado").hidden = true;
    aviso.hidden = false;
    aviso.textContent =
      puntos.length === 0
        ? "Pegá o subí tu serie para ver el gráfico."
        : "Hace falta al menos 2 puntos válidos para poder graficar.";
    return;
  }

  const mesObjetivo = leerObjetivo();
  const metodologia = leerMetodologia();
  const resultado = actualizarSerie(puntos, mesObjetivo, ipc, { metodologia });

  const todoSinResolver = resultado.every((p) => p.valorActualizado === null);
  if (todoSinResolver) {
    canvas.hidden = true;
    el<HTMLTableElement>("tabla-resultado").hidden = true;
    aviso.hidden = false;
    aviso.textContent =
      "Ningún punto se pudo actualizar sin estimar para el mes elegido. Probá otra " +
      "metodología, o un mes objetivo más cercano a tu serie.";
    return;
  }

  aviso.hidden = true;
  canvas.hidden = false;
  dibujarSerieActualizada(canvas, resultado, nombrarMes(mesObjetivo));
  pintarTabla(resultado);
}

/* ------------------------------------------------------------------- archivo */

function leerArchivoComoTexto(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result ?? ""));
    lector.onerror = () => reject(new Error("No se pudo leer el archivo"));
    lector.readAsText(archivo, "utf-8");
  });
}

/* ----------------------------------------------------------------------- URL */

function leerUrl(): { mes: string | null } {
  const p = new URLSearchParams(location.search);
  return { mes: p.get("mes") };
}

async function iniciar(): Promise<void> {
  const rIpc = await fetch(`${import.meta.env.BASE_URL}data/ipc.json`);
  if (!rIpc.ok) throw new Error(`No se pudo cargar el IPC (HTTP ${rIpc.status})`);
  ipc = (await rIpc.json()) as SerieIndice;

  poblarSelectorObjetivo();
  poblarSelectorMetodologia();

  const { ultimo } = limiteObjetivo();
  el<HTMLSelectElement>("objetivo-anio").value = ultimo.slice(0, 4);
  el<HTMLSelectElement>("objetivo-mes").value = ultimo.slice(5, 7);

  const { mes } = leerUrl();
  if (mes !== null && esMesValido(mes)) {
    const { primero } = limiteObjetivo();
    if (mes >= primero && mes <= ultimo) {
      el<HTMLSelectElement>("objetivo-anio").value = mes.slice(0, 4);
      el<HTMLSelectElement>("objetivo-mes").value = mes.slice(5, 7);
    }
  }
  acotarMesesObjetivo();

  el<HTMLTextAreaElement>("entrada-serie").addEventListener("input", recalcular);

  el<HTMLInputElement>("entrada-archivo").addEventListener("change", (ev) => {
    const archivo = (ev.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    void leerArchivoComoTexto(archivo).then((texto) => {
      el<HTMLTextAreaElement>("entrada-serie").value = texto;
      recalcular();
    });
  });

  el("formulario").addEventListener("input", (ev) => {
    const objetivo = ev.target as HTMLElement;
    if (objetivo.id === "objetivo-anio") acotarMesesObjetivo();
    if (objetivo.id === "entrada-serie" || objetivo.id === "entrada-archivo") return; // ya tienen su propio listener
    recalcular();
  });

  recalcular();
}

iniciar().catch((e: unknown) => {
  const error = el("error");
  error.textContent = `No se pudieron cargar los datos: ${(e as Error).message}`;
  error.hidden = false;
});
```

Falta un helper: `nombrarPunto` y `pesos` vienen de `format.ts`/`mes.ts` — confirmar
que `format.ts` exporta `pesos` (sí, ya existe, ver Task de referencia arriba) y
que `mes.ts` exporta `nombrarPunto` (sí, ya existe). No hace falta agregar nada en
esos archivos.

`leerUrl`/`?mes=` se deja como el único parámetro de URL que sobrevive (permite
linkear "esta página con tal mes objetivo por default", sin pretender reproducir
el texto pegado) — coherente con la simplificación del resto de la URL.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores en todo el proyecto — el error pendiente desde Task 2 se
resuelve acá.

- [ ] **Step 3: Suite completa**

Run: `npx vitest run`
Expected: todos los tests en verde, incluidos los de `tcr-eje.test.ts` y
`indices-secundarios.test.ts` (Task 9 recién los borra).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build sin errores. `actualizar.html` compila con el entry point nuevo.

- [ ] **Step 5: Commit**

```bash
git add src/ui/actualizar-main.ts
git commit -m "feat(ui): orquestar Actualizar para series propias, sin slider ni URL compartible"
```

---

## Task 7: CSS para textarea, archivo, tabla y errores

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Agregar los estilos nuevos**

Agregar cerca de las reglas de `.campo`/`select` (después de la regla `select` que
ya existe, línea ~284 de `src/styles.css`):

```css
.campo--ancho {
  grid-column: 1 / -1;
}

.campo textarea {
  width: 100%;
  min-height: 10rem;
  border: 1px solid var(--baseline);
  border-radius: 8px;
  background: var(--plane);
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  padding: 0.55rem 0.6rem;
  resize: vertical;
}

.ayuda-formato {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.ayuda-formato code {
  background: var(--wash-hover);
  border-radius: 4px;
  padding: 0.05rem 0.3rem;
}

.etiqueta-archivo {
  display: block;
  margin-top: 0.75rem;
}

.errores-parseo {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  color: var(--danger, #b3372c);
  font-size: 0.85rem;
}

.errores-parseo li {
  padding: 0.15rem 0;
}

.fila-sin-actualizar td {
  color: var(--text-secondary);
  font-style: italic;
}

.fila-estimada td {
  color: var(--text-secondary);
}
```

Antes de usar `var(--danger, #b3372c)`, chequear si el archivo ya define un token
`--danger` o equivalente (`grep -n "\-\-danger\|\-\-rojo\|\-\-error" src/styles.css`)
y usar el que exista — el fallback `#b3372c` sólo aplica si no hay ninguno.

- [ ] **Step 2: Verificar en browser**

Correr `npm run dev`, abrir `/actualizar.html`, confirmar que el textarea, el link
de subir archivo, y los estilos de error no se ven rotos (chequeo visual rápido,
el chequeo funcional completo es la Task 11).

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style: textarea, input de archivo y tabla de resultado para Actualizar"
```

---

## Task 8: Link discreto desde la landing

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Agregar el link al pie**

En `index.html`, dentro de `<footer class="pie">`, en el párrafo que ya lista
"Fuentes y metodología" / "Inflación año por año" / "Código en GitHub" (línea
~521-526), agregar un ítem más:

```html
        <p>
          Datos vía <a href="https://argentinadata.mymcps.dev" rel="noopener">Argentina Data MCP</a>
          · <a href="./datos.html">Fuentes y metodología</a> ·
          <a href="./inflacion-por-anio/">Inflación año por año</a> ·
          <a href="./actualizar.html">Actualizar una serie completa</a> ·
          <a href="https://github.com/abenassi/calculadora-inflacion-ar" rel="noopener">Código en GitHub</a>
        </p>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat(ui): linkear Actualizar desde el pie de la landing"
```

---

## Task 9: Borrar el código muerto de índices secundarios genéricos

**Files:**
- Delete: `src/engine/indices-secundarios.ts`
- Delete: `tests/indices-secundarios.test.ts`
- Modify: `scripts/fetch-snapshot.ts`

**Por qué es seguro:** confirmado antes de este plan que `indiceSecundarioDisponible`,
`EntradaCatalogoSecundario` y `CatalogoIndicesSecundarios` sólo los usaba la versión
vieja de `actualizar-main.ts` (ya reescrita en Task 6) y `construirCatalogoSecundarios()`
en el pipeline. `/tcr.html` (`tcr-main.ts`) fetchea `secundario-cpi-eeuu.json`
directo — ese archivo lo sigue escribiendo el loop de `INDICES_SECUNDARIOS` en
`fetch-snapshot.ts`, que **no se toca**. Sólo se borra `construirCatalogoSecundarios()`,
que arma el catálogo genérico (`indices-secundarios.json`) que ya no lee nadie.

- [ ] **Step 1: Confirmar que no queda ningún otro consumidor**

Run: `grep -rln "indices-secundarios\.js\|EntradaCatalogoSecundario\|CatalogoIndicesSecundarios\|indiceSecundarioDisponible" --include="*.ts" src scripts tests`

Expected: sólo `src/engine/indices-secundarios.ts` (se borra),
`tests/indices-secundarios.test.ts` (se borra), y `scripts/fetch-snapshot.ts`
(se edita, no se borra). Si aparece cualquier otro archivo, PARAR y revisar antes
de seguir — sería una señal de que algo más depende de este módulo y el plan
subestimó el impacto.

- [ ] **Step 2: Borrar los dos archivos**

```bash
git rm src/engine/indices-secundarios.ts tests/indices-secundarios.test.ts
```

- [ ] **Step 3: Sacar `construirCatalogoSecundarios` de `fetch-snapshot.ts`**

Sacar la función completa (la que arma y escribe `indices-secundarios.json`, ver
spec de este plan más arriba) y su import de `EntradaCatalogoSecundario`. Sacar
también la llamada `await construirCatalogoSecundarios();` cerca del final de
`main()`. El loop que sigue arriba (`for (const declarada of INDICES_SECUNDARIOS)
{ ... }`, que escribe `series/secundario-*.json` y `series/crosscheck-*.json`) **no
se toca**.

Actualizar el comentario que queda huérfano (el que dice "el selector 'Ajustar
también por' de `/actualizar.html` simplemente no ofrece la opción"), porque ya no
hay tal selector:

```ts
  // Cada índice secundario (y su cross-check, si declara uno) en su propio try/catch:
  // si FRED o el BCRA fallan un día, el resto del pipeline no se cae con ellos, y
  // `/tcr.html` simplemente no tiene esa línea hasta que el snapshot tenga el archivo.
  for (const declarada of INDICES_SECUNDARIOS) {
```

- [ ] **Step 4: Typecheck y suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores, sin el describe de `indices-secundarios.test.ts` (borrado).

`tsconfig.json` ya incluye `scripts` en su `include` (junto con `src` y `tests`),
así que el `tsc --noEmit` del Step 4 typechequea `fetch-snapshot.ts` completo —no
hace falta un chequeo aparte para confirmar que el archivo sigue siendo válido
después de sacar la función y el import.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-snapshot.ts
git commit -m "chore: borrar el catálogo genérico de índices secundarios, sin consumidores desde Task 6"
```

---

## Task 10: Decisión, README de decisiones, y sacar `noindex`

**Files:**
- Create: `docs/decisiones/0018-actualizar-serie-propia.md`
- Modify: `docs/decisiones/README.md`
- Modify: `actualizar.html`

- [ ] **Step 1: Escribir la decisión**

```markdown
# 0018 · Actualizar pasa a ser series propias del usuario

## Contexto

`/actualizar.html` era un MVP de prueba con una sola serie hardcodeada —dólar
blue— sin link desde ningún lado. La 0016 había separado de ahí el caso de tipo de
cambio real hacia `/tcr.html`, y dejó anotado que "serie propia por CSV" era la
generalización futura de Actualizar. Este cambio es esa generalización: la página
entera pasa a aceptar una serie que la persona pega o sube, y deja de depender del
dólar blue — ver el spec
([2026-08-20-actualizar-serie-propia-design.md](../superpowers/specs/2026-08-20-actualizar-serie-propia-design.md)).

## Por qué no un toggle en la landing

Ver el spec, sección "Por qué no un toggle en la landing": ramificar el resultado
de `index.html` en dos experiencias (un monto vs. una serie) atrás de un checkbox
repite el problema que la 0002 ya cortó con los presets.

## Qué sigue vivo, qué se borró

`dolar-blue.json`, `actualizarSerieDoble`, `reescalarCrossCheck`,
`calcularTcrBilateral` y el loop de índices secundarios declarados en
`fetch-snapshot.ts` siguen exactamente igual — los sigue usando `/tcr.html`. Se
borró el catálogo GENÉRICO de índices secundarios (`src/engine/indices-secundarios.ts`,
`indices-secundarios.json`, `construirCatalogoSecundarios()`), que sólo alimentaba
el desplegable "ajustar también por" que esta página ya no tiene.

## El loop de revisión

_A completar durante la revisión (paso 4 de la skill `cambiar-la-calculadora`)._
```

- [ ] **Step 2: Agregar la fila al README de decisiones**

En `docs/decisiones/README.md`, agregar a la tabla:

```markdown
| [0018](0018-actualizar-serie-propia.md) | Actualizar pasa a ser series propias del usuario | Reemplaza el MVP de dólar blue por la generalización que la 0016 dejó pendiente |
```

- [ ] **Step 3: Sacar `noindex` de `actualizar.html`**

Sólo si Tasks 1-9 ya pasaron `npm run verificar` y el loop de revisión de Task 11
— no antes. Cambiar:

```html
    <meta name="robots" content="noindex, nofollow" />
```

por sacar la línea entera (sin ese meta tag, la página es indexable por default).

- [ ] **Step 4: Commit**

```bash
git add docs/decisiones/0018-actualizar-serie-propia.md docs/decisiones/README.md actualizar.html
git commit -m "docs: decisión 0018, Actualizar deja de ser noindex"
```

---

## Task 11: Verificación final

No es código nuevo — es el gate que pide `AGENTS.md` antes de dar por terminado
cualquier cambio con tráfico real (que éste va a tener, por el link de Task 8).

- [ ] **Step 1: Verificación automática completa**

Run: `npm run verificar`
Expected: `tsc --noEmit`, `vitest run`, y `npm run build` los tres en verde.

- [ ] **Step 2: Browser real**

Con `npm run dev` corriendo, en `/actualizar.html`:
- Pegar una serie de ejemplo (mínimo 6-8 puntos, mezclando formato de fecha ISO y
  argentino, y montos con coma y con punto).
- Confirmar que el gráfico dibuja las dos líneas y la tabla muestra las tres
  columnas con los valores esperados.
- Subir el mismo contenido como archivo `.csv` y confirmar que da exactamente lo
  mismo que pegarlo.
- Cambiar el mes objetivo y la metodología, confirmar que el gráfico y la tabla se
  redibujan.
- Forzar filas inválidas (una fecha rota, un valor roto, una fecha repetida) y
  confirmar que se listan con su motivo sin romper el resto de la serie.
- Pegar una serie con puntos en el mes en curso (no publicado) con metodología
  `sin_proyectar`, confirmar que esas filas se marcan "no se pudo actualizar sin
  estimar" en vez de desaparecer, y que cambiar a `repite_ultimo` las resuelve.
- Desde `index.html`, confirmar que el link nuevo del pie lleva a `/actualizar.html`.

- [ ] **Step 3: Loop de los tres revisores**

Como pide `AGENTS.md`: despachar `revisor-economista`, `revisora-usuaria` y
`revisor-codigo` en paralelo, sin que se vean entre sí, sobre el diff completo de
este plan. Registrar cada hallazgo (arreglado o rechazado con motivo), pasarle los
rechazados a la vuelta siguiente si hace falta una segunda vuelta, techo de tres
vueltas.

- [ ] **Step 4: Commit final si el loop dejó cambios**

```bash
git add -A
git commit -m "fix: hallazgos del loop de revisión sobre Actualizar con series propias"
```

- [ ] **Step 5: Push**

```bash
git push
```
