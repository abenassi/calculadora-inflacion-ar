# Índices jurisdiccionales en la calculadora — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que se pueda calcular con el IPC de la propia provincia o región en lugar del nacional, sin que quien no lo necesita note que existe.

**Architecture:** El snapshot pasa de una serie a N, con un archivo por índice cargado sólo cuando se elige. El motor casi no cambia porque ya recibe una `SerieIndice` opaca; lo que sí cambia es que el organismo deja de estar escrito a mano en la interfaz.

**Tech Stack:** TypeScript sin framework, Vite, vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-13-indices-provinciales-design.md`

**Plan hermano:** `docs/superpowers/plans/2026-08-13-colectores-ipc-jurisdiccionales.md` — ya ejecutado. Publicó `ipc:caba`, `ipc:rio_negro` e `ipc:cordoba` en el MCP.

## Global Constraints

- **Castellano rioplatense con vos**, en la interfaz, los comentarios y los mensajes de commit. Los comentarios explican **por qué**.
- **El sitio no llama al MCP en runtime.** Todo sale del snapshot que commitea el Action. La API key nunca puede llegar al browser: ojo con `VITE_*`.
- **Dato y estimación nunca se mezclan sin decirlo**, y su simétrica: **no prometas dato oficial donde no lo hay.**
- **Un control no ofrece lo que no puede cumplir.**
- **Un criterio se escribe una sola vez**, con un test que ate las dos puntas.
- **Con el nacional elegido la pantalla queda idéntica a la de hoy.** Es el criterio de aceptación de toda la parte visual.
- **Verificar con:** `npm run verificar` (typecheck + tests + build). Y mirarlo en un browser.

## Los datos, ya medidos contra el MCP en vivo (2026-08-13)

No hace falta averiguar esto de nuevo. Los rangos ya tienen aplicado el criterio de precisión que se explica abajo.

| Índice | serie | Desde | Hasta |
|---|---|---|---|
| Nacional | `bcra:27` + `indec:148.3_INIVELNAL_DICI_M_26` | 1990-01 | 2026-06 |
| CABA | `ipc:caba` | 2012-07 | **2026-07** |
| Chaco | `indec:464.1_IPC_CHACO_NG_0_0_22_93` | 1988-08 | 2026-06 |
| Córdoba | `ipc:cordoba` | 1990-03 | **2026-07** |
| Mendoza | `indec:195.1_NIVEL_GENERAL_0_0_13` | 1988-06 | 2026-06 |
| Neuquén | `indec:196.1_NIVEL_GENERAL_2014_0_13` | 2001-11 | **2026-01** |
| Río Negro | `ipc:rio_negro` | 1989-09 | **2026-07** |
| San Luis | `indec:197.1_NIVEL_GENERAL_2014_0_13` | 2005-10 | 2026-06 |
| Santa Fe | `indec:198.1_NIVEL_GENERAL_2014_0_13` | 2013-12 | 2026-06 |
| Tucumán | `indec:199.1_NIVEL_GENERAL_2014_0_13` | 1989-03 | 2026-06 |
| GBA | `indec:148.3_INIVELGBA_DICI_M_21` | 2016-12 | 2026-06 |
| Pampeana | `indec:148.3_INIVELANA_DICI_M_26` | 2016-12 | 2026-06 |
| Noroeste | `indec:148.3_INIVELNOA_DICI_M_21` | 2016-12 | 2026-06 |
| Noreste | `indec:148.3_INIVELNEA_DICI_M_21` | 2016-12 | 2026-06 |
| Cuyo | `indec:148.3_INIVELUYO_DICI_M_22` | 2016-12 | 2026-06 |
| Patagonia | `indec:148.3_INIVELNIA_DICI_M_27` | 2016-12 | 2026-06 |

**Tres índices están más adelante que el nacional** (CABA, Córdoba y Río Negro llegan a julio; el INDEC a junio) y **uno está cinco meses atrás** (Neuquén). Las dos cosas son casos normales que la interfaz tiene que saber decir.

### 🚨 Hay ceros en el MCP y el pipeline tiene que defenderse

`series_data.valor` es `numeric(20,6)`. Un índice encadenado hacia atrás a través de los cambios de moneda cae por debajo de una millonésima y **queda guardado como cero**. Medido en prod el 2026-08-13: **Chaco 256 puntos en cero, Tucumán 167, Mendoza 148**, más otros ~90 cada uno con dos o tres cifras significativas.

Un índice en cero no es un número impreciso: **hace explotar el cociente, que es todo el cálculo**. Por eso los rangos de la tabla arrancan en 1988-1990 y no en 1960/1968 como anuncia el catálogo.

Esto es preexistente y del lado del MCP (82 series de nivel de índice, 1.888 puntos, la peor es el IPC histórico del propio INDEC). Arreglarlo allá es otro trabajo. **Acá el pipeline se defiende solo**, con el mismo criterio que ya usan los colectores nuevos: descartar el arranque no representable y quedarse después con la cola continua.

---

### Task 1: El catálogo de índices y los tipos

**Files:**
- Modify: `src/engine/types.ts`
- Create: `src/engine/indices.ts`
- Test: `tests/indices.test.ts`

**Interfaces:**
- Produces:
  - `type TipoIndice = "nacional" | "provincia" | "region"`
  - `type EntradaCatalogo = { slug: string; nombre: string; tipo: TipoIndice; organismo: string; organismoCorto: string; cubre: string; primerMes: Mes; ultimoOficial: Mes }`
  - `type CatalogoIndices = { indices: EntradaCatalogo[]; actualizado: string }`
  - `const SLUG_NACIONAL = "nacional"`
  - `function buscarIndice(catalogo: CatalogoIndices, slug: string | null): EntradaCatalogo`
  - `function agruparParaSelector(catalogo: CatalogoIndices): { provincias: EntradaCatalogo[]; regiones: EntradaCatalogo[]; nacional: EntradaCatalogo }`
  - En `types.ts`: `FuenteSerie` gana `organismoCorto: string`, y `PuntoIndice.origen` pasa de `"indec" | "bcra"` a `string` (el `id` de la fuente que lo aportó).

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/indices.test.ts
import { describe, it, expect } from "vitest";
import { buscarIndice, agruparParaSelector, SLUG_NACIONAL } from "../src/engine/indices.js";
import type { CatalogoIndices, EntradaCatalogo } from "../src/engine/indices.js";

const entrada = (slug: string, tipo: EntradaCatalogo["tipo"], nombre = slug): EntradaCatalogo => ({
  slug, nombre, tipo,
  organismo: "Organismo", organismoCorto: "ORG", cubre: "algo",
  primerMes: "2016-12", ultimoOficial: "2026-06",
});

const catalogo: CatalogoIndices = {
  actualizado: "2026-08-13T00:00:00.000Z",
  indices: [
    entrada(SLUG_NACIONAL, "nacional", "Nacional (INDEC)"),
    entrada("tucuman", "provincia", "Tucumán"),
    entrada("caba", "provincia", "Ciudad de Buenos Aires"),
    entrada("nea", "region", "Noreste"),
  ],
};

describe("buscarIndice", () => {
  it("encuentra un índice por su slug", () => {
    expect(buscarIndice(catalogo, "tucuman").nombre).toBe("Tucumán");
  });

  it("cae al nacional cuando el slug no existe", () => {
    // Un ?indice= viejo o mal tipeado no puede romper la página: se calcula el
    // nacional, que es lo que la persona habría visto sin el parámetro.
    expect(buscarIndice(catalogo, "atlantida").slug).toBe(SLUG_NACIONAL);
  });

  it("cae al nacional cuando no se pidió ninguno", () => {
    expect(buscarIndice(catalogo, null).slug).toBe(SLUG_NACIONAL);
  });
});

describe("agruparParaSelector", () => {
  it("separa provincias de regiones y saca el nacional del grupo", () => {
    const g = agruparParaSelector(catalogo);
    expect(g.nacional.slug).toBe(SLUG_NACIONAL);
    expect(g.provincias.map((x) => x.slug)).toEqual(["caba", "tucuman"]);
    expect(g.regiones.map((x) => x.slug)).toEqual(["nea"]);
  });

  it("ordena las provincias alfabéticamente por nombre, no por slug", () => {
    // "Ciudad de Buenos Aires" va antes que "Tucumán" aunque su slug sea "caba".
    // Ordenar por slug pondría la lista en un orden que nadie puede predecir.
    const g = agruparParaSelector(catalogo);
    expect(g.provincias.map((x) => x.nombre)).toEqual(["Ciudad de Buenos Aires", "Tucumán"]);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/indices.test.ts`
Expected: FAIL — `Failed to resolve import "../src/engine/indices.js"`

- [ ] **Step 3: Escribir `src/engine/indices.ts`**

```ts
/**
 * El catálogo de índices que el sitio puede usar.
 *
 * Vive en `engine/` y no en `ui/` porque es dato, no pintura: el pipeline lo escribe y la
 * interfaz lo lee. Acá adentro no hay ninguna cuenta.
 */

import type { Mes } from "./types.js";

export type TipoIndice = "nacional" | "provincia" | "region";

export type EntradaCatalogo = {
  slug: string;
  /** Cómo se llama en el desplegable. */
  nombre: string;
  tipo: TipoIndice;
  /** Nombre completo del organismo, para los pies y la página de datos. */
  organismo: string;
  /** La sigla que entra en una oración: "el INDEC todavía no publicó julio". */
  organismoCorto: string;
  /**
   * Qué mide de verdad. Se muestra sólo cuando el índice elegido no es el nacional, y es
   * lo que impide que una región se lea como si fuera un índice provincial.
   */
  cubre: string;
  primerMes: Mes;
  ultimoOficial: Mes;
};

export type CatalogoIndices = {
  indices: EntradaCatalogo[];
  actualizado: string;
};

export const SLUG_NACIONAL = "nacional";

/**
 * El índice pedido, o el nacional si no existe.
 *
 * No tira: un `?indice=` viejo, mal tipeado o de un fork no puede dejar la página en
 * blanco. Se calcula el nacional, que es lo que la persona habría visto sin el parámetro.
 */
export function buscarIndice(catalogo: CatalogoIndices, slug: string | null): EntradaCatalogo {
  const nacional = catalogo.indices.find((i) => i.slug === SLUG_NACIONAL);
  if (!nacional) throw new Error("El catálogo no trae el índice nacional");
  if (!slug) return nacional;
  return catalogo.indices.find((i) => i.slug === slug) ?? nacional;
}

export function agruparParaSelector(catalogo: CatalogoIndices): {
  provincias: EntradaCatalogo[];
  regiones: EntradaCatalogo[];
  nacional: EntradaCatalogo;
} {
  // Por nombre y con `localeCompare` en es-AR: ordenar por slug daría un orden que nadie
  // puede predecir mirando la lista, y un sort binario dejaría "Ñ" y los acentos al final.
  const porNombre = (a: EntradaCatalogo, b: EntradaCatalogo) =>
    a.nombre.localeCompare(b.nombre, "es-AR");

  return {
    nacional: buscarIndice(catalogo, SLUG_NACIONAL),
    provincias: catalogo.indices.filter((i) => i.tipo === "provincia").sort(porNombre),
    regiones: catalogo.indices.filter((i) => i.tipo === "region").sort(porNombre),
  };
}
```

- [ ] **Step 4: Generalizar `Origen` en `types.ts`**

`Origen` hoy es `"indec" | "bcra" | "proyeccion"`: un enum con dos organismos concretos adentro, que existe así porque la serie nacional se arma con dos fuentes. Con Mendoza elegida no hay ningún valor que sirva.

```ts
// en src/engine/types.ts

/**
 * De dónde salió el valor del índice de un mes.
 *
 * Antes era `"indec" | "bcra" | "proyeccion"`. Nombrar dos organismos concretos alcanzaba
 * mientras el único índice era el nacional, que se arma con esos dos; con un índice
 * provincial no hay ningún valor del enum que sea cierto. Ahora un punto dice **de cuál de
 * las `fuentes` de su serie** salió, y el rótulo se lee de ahí.
 *
 * `"proyeccion"` se queda como estaba: no es una fuente, es la ausencia de una.
 */
export type Origen = string;
export const ORIGEN_PROYECCION = "proyeccion";

export type FuenteSerie = {
  id: string;
  organismo: string;
  /** La sigla que entra en una oración. Ej: "INDEC", "IDECBA", "DEIE". */
  organismoCorto: string;
  /** Rango que aporta esta fuente al empalme, `YYYY-MM/YYYY-MM`. */
  rango: string;
};
```

`PuntoIndice.origen` pasa a ser el `id` de una entrada de `fuentes`. Para el nacional siguen siendo `"bcra:27"` y el id del INDEC, o sea que el comportamiento actual no cambia: lo que cambia es que el rótulo sale de `fuentes` en vez de un `if`.

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run tests/indices.test.ts && npm run verificar`
Expected: los tests de `indices` pasan. `verificar` **va a fallar** en `main.ts` y `fetch-snapshot.ts`, que todavía comparan `origen` contra `"indec"`. Se arregla en las tareas 2 y 3; no arreglarlo acá a medias.

- [ ] **Step 6: Commit**

```bash
git add src/engine/indices.ts src/engine/types.ts tests/indices.test.ts
git commit -m "El origen de un punto deja de ser un enum con dos organismos adentro

Origen era \"indec\" | \"bcra\" | \"proyeccion\". Alcanzaba mientras el único índice era el
nacional, que se arma justo con esas dos fuentes; con Mendoza elegida no hay ningún valor
del enum que sea cierto. Ahora un punto dice de cuál de las fuentes de su serie salió y el
rótulo se lee de ahí, así que agregar un organismo no toca el motor.

Para el nacional no cambia nada: siguen siendo las mismas dos fuentes y los mismos sellos."
```

---

### Task 2: El pipeline escribe un archivo por índice

**Files:**
- Modify: `scripts/fetch-snapshot.ts`
- Create: `scripts/indices-declarados.ts`
- Test: `tests/snapshot-guards.test.ts`

**Interfaces:**
- Consumes: `EntradaCatalogo`, `TipoIndice` de `src/engine/indices.js`; `empalmar` de `src/engine/splice.js`.
- Produces:
  - `INDICES: IndiceDeclarado[]` en `scripts/indices-declarados.ts`, con `type IndiceDeclarado = Omit<EntradaCatalogo, "primerMes" | "ultimoOficial"> & { series: string[] }`.
  - `function recortarRepresentable(puntos: PuntoCrudo[], slug: string): PuntoCrudo[]` exportada de `scripts/fetch-snapshot.ts`.
  - Archivos: `public/data/indices.json` y `public/data/indices/<slug>.json`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/snapshot-guards.test.ts
import { describe, it, expect } from "vitest";
import { recortarRepresentable } from "../scripts/fetch-snapshot.js";

describe("recortarRepresentable", () => {
  const p = (mes: string, valor: number) => ({ mes, valor });

  it("deja pasar una serie con valores normales", () => {
    const s = [p("2026-01", 100), p("2026-02", 102)];
    expect(recortarRepresentable(s, "test")).toEqual(s);
  });

  it("descarta los ceros que el MCP guarda por truncamiento", () => {
    // Medido en prod: Chaco tiene 256 puntos en cero, Tucumán 167, Mendoza 148. La
    // columna del MCP es numeric(20,6) y un índice encadenado hacia atrás cae por
    // debajo de una millonésima. Un cero acá haría explotar el cociente.
    const s = [p("1960-01", 0), p("1960-02", 0), p("1988-08", 0.0134), p("2026-06", 900)];
    expect(recortarRepresentable(s, "chaco")).toEqual([p("1988-08", 0.0134), p("2026-06", 900)]);
  });

  it("descarta también los que quedaron con dos cifras significativas", () => {
    const s = [p("1985-01", 0.000002), p("1990-03", 0.0102), p("2026-06", 900)];
    expect(recortarRepresentable(s, "cordoba").map((x) => x.mes)).toEqual(["1990-03", "2026-06"]);
  });

  it("explota si no queda nada, en vez de publicar un archivo vacío", () => {
    expect(() => recortarRepresentable([p("1968-01", 1e-13)], "test")).toThrow(/representable/);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/snapshot-guards.test.ts`
Expected: FAIL — `recortarRepresentable` no existe.

- [ ] **Step 3: Escribir `scripts/indices-declarados.ts`**

```ts
/**
 * Qué índices publica el sitio.
 *
 * Es la única lista que hay que tocar para sumar o sacar una jurisdicción: el pipeline
 * itera sobre esto y la interfaz lee lo que el pipeline escribió.
 *
 * Los `cubre` no son adorno. Una región del INDEC incluye a varias provincias pero no mide
 * a ninguna en particular, y sin esa frase alguien de Formosa lee "Noreste" como si fuera
 * el índice de Formosa. Es la regla de no prometer dato oficial donde no lo hay.
 */

import type { EntradaCatalogo } from "../src/engine/indices.js";

export type IndiceDeclarado = Omit<EntradaCatalogo, "primerMes" | "ultimoOficial"> & {
  /** Las series del MCP que lo componen, en orden de empalme. */
  series: string[];
};

export const INDICES: IndiceDeclarado[] = [
  {
    slug: "caba",
    nombre: "Ciudad de Buenos Aires",
    tipo: "provincia",
    organismo: "Instituto de Estadística y Censos de la Ciudad de Buenos Aires (IDECBA)",
    organismoCorto: "IDECBA",
    cubre:
      "Mide precios en la Ciudad de Buenos Aires, no en el conurbano. Para el aglomerado " +
      "completo está la región GBA del INDEC.",
    series: ["ipc:caba"],
  },
  {
    slug: "chaco",
    nombre: "Chaco",
    tipo: "provincia",
    organismo: "Instituto Provincial de Estadísticas y Ciencia de Datos del Chaco",
    organismoCorto: "IPECD Chaco",
    cubre: "Se releva en el Gran Resistencia y se publica como índice provincial.",
    series: ["indec:464.1_IPC_CHACO_NG_0_0_22_93"],
  },
  {
    slug: "cordoba",
    nombre: "Córdoba",
    tipo: "provincia",
    organismo: "Dirección General de Estadística y Censos de la Provincia de Córdoba",
    organismoCorto: "DGEyC Córdoba",
    cubre: "Índice provincial de Córdoba.",
    series: ["ipc:cordoba"],
  },
  {
    slug: "mendoza",
    nombre: "Mendoza",
    tipo: "provincia",
    organismo: "Dirección de Estadísticas e Investigaciones Económicas de Mendoza (DEIE)",
    organismoCorto: "DEIE",
    cubre: "Índice provincial de Mendoza.",
    series: ["indec:195.1_NIVEL_GENERAL_0_0_13"],
  },
  {
    slug: "neuquen",
    nombre: "Neuquén",
    tipo: "provincia",
    organismo: "Dirección Provincial de Estadística y Censos del Neuquén",
    organismoCorto: "DPEyC Neuquén",
    cubre: "Índice provincial del Neuquén.",
    series: ["indec:196.1_NIVEL_GENERAL_2014_0_13"],
  },
  {
    slug: "rio-negro",
    nombre: "Río Negro",
    tipo: "provincia",
    organismo: "Dirección de Estadística y Censos de la Provincia de Río Negro",
    organismoCorto: "DEyC Río Negro",
    cubre: "Se releva en Viedma y se publica como referencia provincial.",
    series: ["ipc:rio_negro"],
  },
  {
    slug: "san-luis",
    nombre: "San Luis",
    tipo: "provincia",
    organismo: "Dirección Provincial de Estadística y Censos de San Luis",
    organismoCorto: "DPEyC San Luis",
    cubre: "Índice provincial de San Luis.",
    series: ["indec:197.1_NIVEL_GENERAL_2014_0_13"],
  },
  {
    slug: "santa-fe",
    nombre: "Santa Fe",
    tipo: "provincia",
    organismo: "Instituto Provincial de Estadística y Censos de Santa Fe (IPEC)",
    organismoCorto: "IPEC Santa Fe",
    cubre: "Índice provincial de Santa Fe.",
    series: ["indec:198.1_NIVEL_GENERAL_2014_0_13"],
  },
  {
    slug: "tucuman",
    nombre: "Tucumán",
    tipo: "provincia",
    organismo: "Dirección de Estadística de la Provincia de Tucumán",
    organismoCorto: "DE Tucumán",
    cubre: "Índice provincial de Tucumán.",
    series: ["indec:199.1_NIVEL_GENERAL_2014_0_13"],
  },

  // ── Regiones del INDEC ──────────────────────────────────────────────────────
  // Existen para las catorce provincias que NO miden su propia inflación. Cubren a
  // varias provincias y no miden a ninguna en particular: por eso los `cubre` las
  // nombran a todas y ninguna frase dice "el IPC de <provincia>".
  {
    slug: "gba",
    nombre: "Gran Buenos Aires (región)",
    tipo: "region",
    organismo: "Instituto Nacional de Estadística y Censos (INDEC)",
    organismoCorto: "INDEC",
    cubre: "La Ciudad de Buenos Aires y los 24 partidos del conurbano bonaerense.",
    series: ["indec:148.3_INIVELGBA_DICI_M_21"],
  },
  {
    slug: "pampeana",
    nombre: "Región Pampeana",
    tipo: "region",
    organismo: "Instituto Nacional de Estadística y Censos (INDEC)",
    organismoCorto: "INDEC",
    cubre:
      "Buenos Aires, Córdoba, Entre Ríos, La Pampa y Santa Fe. No es el índice de " +
      "ninguna de ellas por separado.",
    series: ["indec:148.3_INIVELANA_DICI_M_26"],
  },
  {
    slug: "noroeste",
    nombre: "Región Noroeste",
    tipo: "region",
    organismo: "Instituto Nacional de Estadística y Censos (INDEC)",
    organismoCorto: "INDEC",
    cubre:
      "Catamarca, Jujuy, La Rioja, Salta, Santiago del Estero y Tucumán. No es el " +
      "índice de ninguna de ellas por separado.",
    series: ["indec:148.3_INIVELNOA_DICI_M_21"],
  },
  {
    slug: "noreste",
    nombre: "Región Noreste",
    tipo: "region",
    organismo: "Instituto Nacional de Estadística y Censos (INDEC)",
    organismoCorto: "INDEC",
    cubre:
      "Corrientes, Chaco, Formosa y Misiones. No es el índice de ninguna de ellas " +
      "por separado.",
    series: ["indec:148.3_INIVELNEA_DICI_M_21"],
  },
  {
    slug: "cuyo",
    nombre: "Región Cuyo",
    tipo: "region",
    organismo: "Instituto Nacional de Estadística y Censos (INDEC)",
    organismoCorto: "INDEC",
    cubre: "Mendoza, San Juan y San Luis. No es el índice de ninguna de ellas por separado.",
    series: ["indec:148.3_INIVELUYO_DICI_M_22"],
  },
  {
    slug: "patagonia",
    nombre: "Región Patagónica",
    tipo: "region",
    organismo: "Instituto Nacional de Estadística y Censos (INDEC)",
    organismoCorto: "INDEC",
    cubre:
      "Chubut, Neuquén, Río Negro, Santa Cruz y Tierra del Fuego. No es el índice de " +
      "ninguna de ellas por separado.",
    series: ["indec:148.3_INIVELNIA_DICI_M_27"],
  },
];
```

- [ ] **Step 4: Agregar el guard de precisión a `fetch-snapshot.ts`**

```ts
/**
 * El valor más chico que el MCP guarda sin perder cifras significativas.
 *
 * `series_data.valor` es `numeric(20,6)`. Un índice encadenado hacia atrás a través de los
 * cambios de moneda cae por debajo de una millonésima y **queda guardado como cero**.
 * Medido en prod el 2026-08-13: Chaco tiene 256 puntos en cero, Tucumán 167 y Mendoza 148.
 *
 * Un cero no es un dato impreciso: es una división por cero en el único cálculo que hace
 * este sitio. El umbral está en 1e-2 y no en 1e-6 porque no alcanza con que no sea cero:
 * con 1e-2 el peor caso conserva cuatro cifras significativas.
 *
 * Es del lado del MCP y hay que arreglarlo allá (82 series de nivel de índice, 1.888
 * puntos). Mientras tanto el sitio no puede confiar en lo que le llega.
 */
const VALOR_MINIMO_REPRESENTABLE = 0.01;

export function recortarRepresentable(puntos: PuntoCrudo[], slug: string): PuntoCrudo[] {
  let inicio = 0;
  for (let i = puntos.length - 1; i >= 0; i--) {
    if (!(puntos[i]!.valor >= VALOR_MINIMO_REPRESENTABLE)) {
      inicio = i + 1;
      break;
    }
  }
  const out = puntos.slice(inicio);
  if (out.length === 0) {
    throw new Error(
      `${slug}: no quedó ningún valor representable (todos por debajo de ` +
        `${VALOR_MINIMO_REPRESENTABLE}). El MCP los está sirviendo truncados a cero.`,
    );
  }
  if (out.length < puntos.length) {
    console.log(
      `  ${slug}: se descartaron ${puntos.length - out.length} punto(s) del arranque que el ` +
        `MCP sirve truncados; la serie arranca en ${out[0]!.mes}`,
    );
  }
  return out;
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run tests/snapshot-guards.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Hacer que `main()` recorra `INDICES`**

Cada índice se arma con la misma función y se escribe con `escribirSiMejora`, que ya protege la invariante de que un snapshot no puede encoger. Dos reglas:

- **Un índice que falla no puede voltear a los otros.** Se loguea, se lo saca del catálogo de esa corrida y se sigue. La única excepción es el nacional: si falla, corta todo, porque es el default.
- **El catálogo se escribe último**, con los `primerMes` y `ultimoOficial` que salieron de verdad. Escribirlo antes lo dejaría anunciando un índice que después falló.

```ts
async function construirIndice(decl: IndiceDeclarado): Promise<SerieIndice> {
  const series = await Promise.all(decl.series.map((id) => traerSerie(id, {})));
  const crudos = recortarRepresentable(aPuntos(series[0]!.datos), decl.slug);
  const datos = crudos.map((p) => ({ mes: p.mes, indice: p.valor, origen: decl.series[0]! }));
  return {
    serie: decl.slug,
    base: series[0]!.unidad,
    fuentes: [
      {
        id: decl.series[0]!,
        organismo: decl.organismo,
        organismoCorto: decl.organismoCorto,
        rango: `${datos[0]!.mes}/${datos.at(-1)!.mes}`,
      },
    ],
    ultimo_oficial: datos.at(-1)!.mes,
    actualizado: new Date().toISOString(),
    datos,
  };
}
```

**El REM sólo se le pone al nacional.** `construirIndice` no lo trae: el REM del BCRA pronostica el IPC nacional del INDEC y no existe uno provincial. Sin el campo, la interfaz esconde esa opción sola, que es el comportamiento que ya tiene hoy cuando el REM no viene.

- [ ] **Step 7: Correr el pipeline de verdad y mirar los archivos**

```bash
set -a; . ~/.secrets/calculadora-inflacion.env; set +a
npx tsx scripts/fetch-snapshot.ts
ls -la public/data/indices/ && cat public/data/indices.json | head -30
```

Expected: 16 archivos en `public/data/indices/` más `indices.json`. En el log tienen que aparecer los descartes de Chaco, Mendoza y Tucumán. **Verificar que ningún archivo tenga `"indice": 0`:**

```bash
grep -l '"indice": 0' public/data/indices/*.json || echo "ningún cero — bien"
```

- [ ] **Step 8: Commit**

```bash
git add scripts/indices-declarados.ts scripts/fetch-snapshot.ts tests/snapshot-guards.test.ts public/data/
git commit -m "Un archivo por índice, y un guard porque el MCP sirve ceros

El MCP guarda los índices en numeric(20,6) y un índice encadenado hacia atrás a través de
los cambios de moneda cae por debajo de una millonésima: queda en cero. Medido en prod:
Chaco 256 puntos, Tucumán 167, Mendoza 148. Un cero ahí no es un dato impreciso, es una
división por cero en el único cálculo que hace este sitio.

El pipeline descarta el arranque no representable y explota si no queda nada, en vez de
publicar un archivo que rompe la página. Hay que arreglarlo también del lado del MCP —son
82 series de nivel de índice, 1.888 puntos, la peor es el IPC histórico del propio INDEC—
pero el sitio no puede quedarse esperando eso.

Cada índice va a su propio archivo y se baja sólo si lo elegís: quien no toca el selector
baja un kilobyte más que antes, el del catálogo."
```

---

### Task 3: Despegar el organismo del texto

La tarea más grande y la de mayor riesgo de regresión. Hoy `"INDEC"` está escrito a mano en unas veinticinco frases de `src/ui/main.ts`.

**Files:**
- Create: `src/ui/organismo.ts`
- Modify: `src/ui/main.ts`
- Test: `tests/organismo.test.ts`

**Interfaces:**
- Consumes: `SerieIndice`, `Fila` de `src/engine/types.js`; `EntradaCatalogo` de `src/engine/indices.js`.
- Produces:
  - `function selloDeFila(fila: Fila, serie: SerieIndice): string | null` — `"INDEC ✓"`, `"IDECBA ✓"`, o `null` si la fila es proyectada o parcial.
  - `function nombrarOrganismo(indice: EntradaCatalogo): string` — la sigla que entra en una oración.

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/organismo.test.ts
import { describe, it, expect } from "vitest";
import { selloDeFila } from "../src/ui/organismo.js";
import type { Fila, SerieIndice } from "../src/engine/types.js";

const serieNacional = {
  serie: "nacional", base: "2016-12=100",
  fuentes: [
    { id: "bcra:27", organismo: "Banco Central", organismoCorto: "BCRA", rango: "1990-01/2016-11" },
    { id: "indec:ipc", organismo: "INDEC", organismoCorto: "INDEC", rango: "2016-12/2026-06" },
  ],
  ultimo_oficial: "2026-06", actualizado: "", datos: [],
} as unknown as SerieIndice;

const fila = (over: Partial<Fila>): Fila => ({
  punto: "2026-05", indice: 100, varMensualPct: 1, acumuladoPct: 1, monto: 100,
  esProyeccion: false, origen: "indec:ipc", esParcial: false, ...over,
});

describe("selloDeFila", () => {
  it("nombra al organismo de la fuente de ESA fila, no al del índice", () => {
    // El nacional se arma con dos fuentes: cada fila lleva el sello de la suya.
    expect(selloDeFila(fila({ origen: "indec:ipc" }), serieNacional)).toBe("INDEC ✓");
    expect(selloDeFila(fila({ origen: "bcra:27" }), serieNacional)).toBe("BCRA ✓");
  });

  it("no sella una fila proyectada", () => {
    expect(selloDeFila(fila({ esProyeccion: true }), serieNacional)).toBeNull();
  });

  it("no sella una fila parcial", () => {
    // Su número es la parte proporcional que le toca a unos días, una cuenta nuestra.
    // Ponerle el sello sería atribuirle al organismo una cifra que nunca publicó.
    expect(selloDeFila(fila({ esParcial: true }), serieNacional)).toBeNull();
  });

  it("no inventa un sello si el origen no está entre las fuentes", () => {
    expect(selloDeFila(fila({ origen: "vaya-a-saber" }), serieNacional)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/organismo.test.ts`
Expected: FAIL — no existe `src/ui/organismo.js`.

- [ ] **Step 3: Escribir `src/ui/organismo.ts`**

```ts
/**
 * Cómo se nombra al organismo que publicó cada número.
 *
 * Existe porque "INDEC" estaba escrito a mano en unas veinticinco frases de `main.ts` —las
 * explicaciones, el texto que se copia, el encabezado del CSV, el sello de cada fila—. Eso
 * alcanzaba mientras el único índice era el nacional. Con Mendoza elegida, cada una de esas
 * frases pasaba a ser falsa, y una frase falsa sobre la fuente es peor que un número
 * impreciso: es lo que la persona repite cuando alguien le pregunta de dónde lo sacó.
 */

import type { Fila, SerieIndice } from "../engine/types.js";
import { ORIGEN_PROYECCION } from "../engine/types.js";
import type { EntradaCatalogo } from "../engine/indices.js";

/**
 * El sello de una fila, o `null` si esa fila no lleva ninguno.
 *
 * Mira la fuente de LA FILA y no la del índice: el nacional se arma con dos, y cada fila
 * tiene que decir cuál la respalda. Las dos exclusiones —proyectada y parcial— ya existían
 * y no cambian: el número de una fila parcial es la parte proporcional que le toca a unos
 * días, una cuenta nuestra que ningún organismo publicó.
 */
export function selloDeFila(fila: Fila, serie: SerieIndice): string | null {
  if (fila.esProyeccion || fila.origen === ORIGEN_PROYECCION) return null;
  if (fila.esParcial) return null;
  const fuente = serie.fuentes.find((f) => f.id === fila.origen);
  return fuente ? `${fuente.organismoCorto} ✓` : null;
}

/** La sigla que entra en una oración: "el INDEC todavía no publicó julio". */
export function nombrarOrganismo(indice: EntradaCatalogo): string {
  return indice.organismoCorto;
}
```

- [ ] **Step 4: Reemplazar los "INDEC" a mano en `main.ts`**

```bash
grep -n "INDEC" src/ui/main.ts
```

Cada uno pasa a leer el organismo del índice activo. Los que están dentro de una oración usan `nombrarOrganismo(indiceActivo)`; el sello de la tabla usa `selloDeFila`.

**Ojo con el encabezado del CSV y con el texto de "Copiar explicación":** los dos nombran la serie y la fuente, y son justo los que la persona pega en un mail. Tienen que decir el índice elegido, no "IPC Nivel General Nacional, INDEC".

- [ ] **Step 5: Test de regresión — ningún "INDEC" hardcodeado sobrevive**

```ts
// en tests/organismo.test.ts
import { readFileSync } from "node:fs";

it("main.ts no nombra a ningún organismo a mano", () => {
  // La regresión más probable de todo el cambio y la más difícil de ver a ojo: alcanza
  // con que una sola frase quede con "INDEC" escrito para que el sitio le atribuya al
  // INDEC un número de Mendoza.
  const fuente = readFileSync(new URL("../src/ui/main.ts", import.meta.url), "utf8");
  const sinComentarios = fuente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  expect(sinComentarios).not.toMatch(/["'`][^"'`]*\bINDEC\b/);
  expect(sinComentarios).not.toMatch(/["'`][^"'`]*\bBCRA\b/);
});
```

- [ ] **Step 6: Correr todo y verificar que pasa**

Run: `npm run verificar`
Expected: PASS. Si el test de regresión falla, quedó una frase sin migrar — arreglarla, no relajar el test.

- [ ] **Step 7: Commit**

```bash
git add src/ui/organismo.ts src/ui/main.ts tests/organismo.test.ts
git commit -m "\"INDEC\" estaba escrito a mano en veinticinco frases

Las explicaciones, el texto que se copia, el encabezado del CSV y el sello de cada fila
nombraban al INDEC directamente. Alcanzaba mientras el único índice era el nacional; con
Mendoza elegida cada una de esas frases pasaba a ser falsa. Y una frase falsa sobre la
fuente es peor que un número impreciso: es lo que la persona repite cuando le preguntan de
dónde lo sacó.

El sello mira la fuente de LA FILA y no la del índice, así que el nacional sigue mostrando
INDEC y BCRA como hasta ahora. Hay un test que falla si vuelve a aparecer un organismo
escrito a mano en main.ts."
```

---

### Task 4: El selector, la carga diferida y la URL

**Files:**
- Modify: `index.html`, `src/ui/main.ts`, `src/styles.css`
- Test: `tests/indices.test.ts` (se amplía)

**Interfaces:**
- Consumes: `agruparParaSelector`, `buscarIndice`, `SLUG_NACIONAL`.
- Produces: `async function cargarIndice(slug: string): Promise<SerieIndice>` en `main.ts`.

- [ ] **Step 1: El markup**

Va al final de la fila del formulario, después de las fechas, para que la oración se lea de corrido.

```html
<div class="campo campo--indice">
  <label for="indice">según el IPC</label>
  <select id="indice" aria-label="Índice de precios a usar">
    <!-- lo puebla main.ts desde public/data/indices.json -->
  </select>
</div>
```

- [ ] **Step 2: Poblar el selector y cargar el índice elegido**

```ts
/**
 * El índice se baja recién cuando alguien lo elige.
 *
 * El nacional viene en `ipc.json` como siempre. Los otros quince viven en un archivo cada
 * uno y no se piden hasta que hacen falta: así quien no toca el selector —que es casi
 * todo el mundo— no paga un byte más que antes, salvo el kilobyte del catálogo.
 */
const cache = new Map<string, SerieIndice>();

async function cargarIndice(slug: string): Promise<SerieIndice> {
  const cacheado = cache.get(slug);
  if (cacheado) return cacheado;

  const ruta =
    slug === SLUG_NACIONAL
      ? `${import.meta.env.BASE_URL}data/ipc.json`
      : `${import.meta.env.BASE_URL}data/indices/${slug}.json`;

  const respuesta = await fetch(ruta);
  if (!respuesta.ok) throw new Error(`No se pudo cargar el índice ${slug}`);
  const serie = (await respuesta.json()) as SerieIndice;
  cache.set(slug, serie);
  return serie;
}
```

**El default no se persiste.** Igual que la metodología: quien entra de cero ve el nacional siempre, aunque la vez pasada haya mirado Tucumán. Un `?indice=` en la URL sí se respeta, y `sincronizarUrl` lo agrega **sólo si no es el nacional**, para que el link del caso común siga siendo el de hoy.

- [ ] **Step 3: La línea que dice qué mide de verdad**

```html
<p class="cobertura-indice" id="cobertura-indice" hidden></p>
```

Se muestra **sólo cuando el índice no es el nacional**, con el `cubre` del catálogo y el organismo. Con el nacional queda oculta y la pantalla es idéntica a la de hoy.

- [ ] **Step 4: Avisar cuando el índice está más atrasado que el nacional**

Neuquén está cinco meses detrás. El aviso sale de comparar `ultimoOficial` del índice elegido contra el del nacional, con un umbral de dos meses.

```ts
/**
 * Neuquén va cinco meses detrás del nacional y CABA va uno adelante. Las dos cosas son
 * normales y las dos cambian el cálculo, así que la de atrás hay que decirla: si no, el
 * número sale de una ventana mucho más vieja sin que nada lo explique.
 */
const MESES_DE_TOLERANCIA = 2;
```

- [ ] **Step 5: Verificar en un browser de verdad**

```bash
npm run dev
```

Con el nacional: **la pantalla tiene que ser idéntica a la de antes del cambio**. Comparar contra una captura previa, no de memoria.

Después probar `?indice=santa-fe` (arranca tarde), `?indice=chaco` (arranca en 1988), `?indice=neuquen` (atrasado) y `?indice=atlantida` (no existe: tiene que caer al nacional sin romper).

- [ ] **Step 6: Commit**

```bash
git add index.html src/ui/main.ts src/styles.css
git commit -m "El selector de índice, callado cuando no lo usás

Va al final de la fila del formulario para que la oración se siga leyendo de corrido, y
por default dice Nacional (INDEC). Con ese default la pantalla queda idéntica a la de
antes: la línea que explica qué mide el índice aparece sólo si elegís otro.

El archivo de cada índice se baja recién cuando lo elegís. Quien no toca el selector paga
un kilobyte más que antes, el del catálogo, y nada más.

El default no se persiste, igual que la metodología: quien entra de cero ve el nacional
aunque la vez pasada haya mirado Tucumán. Un ?indice= en la URL sí se respeta."
```

---

### Task 5: Que ningún control ofrezca lo que no puede cumplir

**Files:**
- Modify: `src/ui/main.ts`, `src/engine/adjust.ts`
- Test: `tests/adjust.test.ts` (se amplía)

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// en tests/adjust.test.ts
describe("índices sin REM", () => {
  it("con una serie sin REM, pedir la metodología rem tira RangoError", () => {
    // El REM del BCRA pronostica el IPC nacional del INDEC. No existe un REM de Mendoza
    // y no lo vamos a inventar promediando nada: la interfaz tiene que deshabilitar la
    // opción, y el motor tiene que negarse si igual se la piden.
    expect(() => adjust(1000, "2026-05", "2026-09", serieSinRem, { metodologia: "rem" }))
      .toThrow(/REM/);
  });
});

describe("períodos fuera del rango del índice", () => {
  it("avisa nombrando el primer mes de la serie, no un error genérico", () => {
    // Santa Fe arranca en dic-2013. Quien venía calculando 1995 con el nacional tiene que
    // poder leer qué pasó y decidir, no encontrarse con "no hay datos".
    expect(() => adjust(1000, "1995-01", "2026-06", serieSantaFe))
      .toThrow(/diciembre de 2013/);
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run tests/adjust.test.ts`

- [ ] **Step 3: Deshabilitar el REM en la interfaz cuando el índice no lo tiene**

Usa el mismo mecanismo que ya existe para `sin_proyectar` (`sePuedeEvitarEstimar` + el flag que distingue quién movió el selector). **No escribir un mecanismo nuevo**: la regla del repo es que un criterio se escribe una sola vez.

Al lado, la razón: *"El REM del BCRA pronostica la inflación nacional. Para un índice provincial no hay pronóstico publicado."*

- [ ] **Step 4: Recortar los años del selector de fecha al rango del índice**

Y si el período ya cargado queda afuera, decirlo con nombre y apellido en vez de recalcular en silencio:

> Santa Fe mide desde diciembre de 2013. Para 1995 hay que usar el índice nacional.

- [ ] **Step 5: Test que ata el desplegable con el motor**

```ts
it("el rango que ofrece el selector es exactamente el que adjust() acepta", () => {
  // Mismo patrón que el test que ata sePuedeEvitarEstimar con adjust: si la interfaz y el
  // motor calculan el rango por su cuenta, tarde o temprano el desplegable ofrece un año
  // que el motor rechaza.
  for (const indice of catalogo.indices) {
    const serie = cargarDeFixture(indice.slug);
    expect(() => adjust(1000, indice.primerMes, indice.ultimoOficial, serie)).not.toThrow();
    const antes = sumarMeses(indice.primerMes, -1);
    expect(() => adjust(1000, antes, indice.ultimoOficial, serie)).toThrow();
  }
});
```

- [ ] **Step 6: Correr todo y commitear**

Run: `npm run verificar`

```bash
git add src/ui/main.ts src/engine/adjust.ts tests/adjust.test.ts
git commit -m "El REM no existe fuera del nacional, y cada índice arranca donde arranca

El REM del BCRA pronostica el IPC nacional del INDEC. No hay uno de Mendoza y no lo vamos
a inventar promediando nada, así que la opción se deshabilita con el mismo mecanismo que
ya usa \"no estimar ninguno\" y al lado dice por qué.

Y cada índice tiene su propio arranque: Santa Fe mide desde dic-2013, Chaco desde 1988. Si
cambiar de índice deja tu período afuera, el sitio te lo dice nombrando el mes en vez de
recalcular otra cosa en silencio. Hay un test que exige que el rango que ofrece el
desplegable sea exactamente el que el motor acepta."
```

---

### Task 6: La página de datos, el analytics y el loop de revisión

**Files:**
- Modify: `datos.html`, `src/ui/datos.ts`, `src/ui/analytics.ts`
- Create: `docs/decisiones/0009-indices-jurisdiccionales.md`

- [ ] **Step 1: La página `/datos` lista los dieciséis índices**

Con organismo, rango y qué mide cada uno. Y dice explícitamente que **catorce provincias no miden su propia inflación** y por eso sólo tienen región: es la pregunta que va a hacer todo el mundo que no encuentre la suya.

- [ ] **Step 2: El analytics suma qué índice se usó**

Un campo más en el evento `calculo`. Nada de identificar a nadie: sigue sin IP y sin cookies, y **eso no se toca** — de ahí depende que el sitio no necesite banner de consentimiento (`docs/decisiones/0008`).

- [ ] **Step 3: Escribir la decisión 0009**

Con lo que se decidió y **la evidencia que lo produjo**: que sólo diez jurisdicciones miden, que Jujuy publica sólo PDF, que las provincias usan nomenclaturas de divisiones incompatibles entre sí, y que el MCP sirve ceros por truncamiento. Ese último es el que más va a costar recordar y el que más caro sale redescubrir.

- [ ] **Step 4: El loop de revisión**

Los tres revisores de `.claude/agents/`, en paralelo y sin verse. Con tres preguntas puestas sobre la mesa:

- **A la economista:** ¿se sostiene ofrecer una región del INDEC como alternativa para una provincia que no mide? ¿Y el recorte por precisión — el rango que queda es defendible?
- **A Vanina:** el formulario pasó de dos campos a tres. ¿Te metió ruido cuando no querías elegir nada? **Esta es la pregunta que puede mandar el diseño para atrás**, y si la respuesta es que sí, hay que volver a Agustín antes de publicar.
- **Al revisor de código:** ¿dónde puede empezar a mentir esto en tres meses? Mirar en particular qué pasa cuando un índice deja de actualizarse y cuando el MCP cambia un `serie_id`.

Llevar registro de **todos** los hallazgos, incluidos los rechazados y por qué, y pasárselos a la vuelta siguiente. Se corta cuando una vuelta no trae nada nuevo.

- [ ] **Step 5: Deploy**

Push a `main`. El Action de deploy publica a GitHub Pages y el snapshot diario ya viene armando los dieciséis archivos.

---

## Self-Review

**Cobertura del spec.** Catálogo y tipos (Task 1); un archivo por índice, carga diferida y tabla declarativa (Task 2); despegar el organismo (Task 3); el selector, el default que no se persiste y la línea de cobertura (Task 4); REM deshabilitado fuera del nacional, rangos por índice y el aviso de atraso (Tasks 4 y 5); página de datos, analytics y decisión escrita (Task 6). Los tres revisores están en Task 6.

**Lo que el spec no previó y este plan agrega:** el guard de precisión de Task 2. El spec asumía que las series del MCP llegaban usables; medidas en prod, tres de ellas traen cientos de ceros. Sin ese guard, elegir Chaco divide por cero.

**Placeholders.** Ninguno: cada paso trae el código, el comando o el texto exacto. Los rangos de la tabla de arriba están medidos, no supuestos.

**Consistencia de tipos.** `EntradaCatalogo` se define en Task 1 y la consumen Tasks 2 y 4; `IndiceDeclarado` la deriva con `Omit` así no se pueden desincronizar. `selloDeFila(fila, serie)` y `nombrarOrganismo(indice)` se definen en Task 3 con las firmas que usa Task 4. `Origen` pasa a `string` en Task 1, que es lo que hace compilable el `origen: decl.series[0]!` de Task 2.

**Riesgo que queda abierto.** Poner el selector en el formulario fue decisión de Agustín contra mi recomendación de ponerlo abajo con la metodología. La mitigación es que con el nacional la pantalla no cambia y toda la explicación aparece sólo al elegir otro índice, pero **el veredicto lo tiene Vanina en Task 6**, y si dice que le mete ruido eso vuelve a Agustín antes de publicar, no se resuelve por las nuestras.
