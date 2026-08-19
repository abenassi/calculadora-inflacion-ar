# TCR: página propia, separada de "Actualizar"

Fecha: 2026-08-19

## Contexto

`/actualizar.html` hoy hace dos cosas a la vez: reindexar una serie de valores
cualquiera (hoy sólo el dólar blue) contra el IPC, y —con el índice secundario
elegido— convertir eso en un tipo de cambio real bilateral, con el desplegable
"ajustar también por" y el cross-check del BCRA.

Ese mezcla dos casos de uso distintos. "Actualizar" va camino a hacerse más simple y
genérico (elegir cualquier serie, en algún momento incluso una propia) — un cambio
aparte, no cubierto por este spec. El tipo de cambio real es lo opuesto: específico,
con una sola cuenta correcta y varias trampas metodológicas que conviene explicar en
el momento en vez de asumir que quien mira el gráfico las conoce.

Este spec separa esa segunda mitad en una página propia, `tcr.html`, con un catálogo
fijo de series (no elegible, no genérico) y fichas explicativas al lado de cada una.
`/actualizar.html` **no se toca** en este cambio: sigue exactamente como está.

## Por qué esto no es especulativo: la validación previa

Antes de este spec se validó con datos reales, en una sesión aparte (no versionada
como código, sólo como conversación), la hipótesis de por qué el TCR calculado con el
dólar blue se aleja tanto del `tipo_cambio_real_estados_unidos` que publica el BCRA
(`indec:116.4_TCRZE_2015_D_31_73`, el mismo cross-check que ya usa `/actualizar.html`).
Método: correr la misma cuenta que ya hace `actualizarSerieDoble` con tres entradas
—dólar blue, dólar oficial minorista, dólar mayorista— y comparar cada resultado
contra la serie del BCRA, en la ventana 2016-01 a 2026-01 (después del empalme de IPC,
para no mezclar ese efecto).

| Serie usada | Correlación de variaciones mensuales vs. BCRA | Nivel, una vez fijado el ancla |
|---|---|---|
| dólar blue | 0,13 (prácticamente nada) | inestable |
| dólar oficial minorista | **0,997** | estable, dentro de ±2% |
| dólar mayorista | 0,76 | estable pero peor ajuste |

Conclusión: la brecha visual entre "nuestro TCR" y el del BCRA es el dólar blue, no un
error de la fórmula — alimentada con el oficial, la misma cuenta reproduce al BCRA casi
exactamente. El mayorista, contra lo esperable (el BCRA usa una referencia mayorista
para su ITCRM), ajustó peor; no hay una explicación firme y por eso queda afuera del
catálogo de esta página (ver "Alcance").

Un hallazgo colateral, para que quien revise el número lo tenga presente: anclar el
índice en diciembre de 2015 (la fecha base del BCRA, "17-Dic-2015=100") da un nivel
sesgado, porque ese mes promedia días de antes y de después de la megadevaluación del
17 de diciembre. Con cualquier ancla sin salto cambiario cerca (se probó 2017-06,
2019-06, 2021-06, 2024-06) el ratio vuelve a ~1,00 con desvío ~1,7-1,8%. No afecta a
esta página porque acá nunca se ancla en una fecha fija — el "mes objetivo" lo elige
quien usa la página, igual que en `/actualizar.html` hoy.

## Alcance

**Entra:**
- Página nueva `tcr.html`, mismo status que `/actualizar.html` hoy: `noindex`, no
  linkeada desde ningún lado del sitio.
- Un solo control: mes objetivo (mismo selector mes+año, mismos límites que hoy).
- Tres series fijas, no elegibles: **TCR-blue**, **TCR-oficial**, **BCRA (cross-check)**.
- Una ficha breve fija por serie, explicando qué es y su limitación principal.
- Slider de rango temporal, igual al de `/actualizar.html` (reusa `rango-slider.ts`
  sin cambios).
- Una función nueva en el motor, `calcularTcrBilateral`, que fija la dirección del
  índice secundario en vez de dejarla como parámetro.

**No entra (queda para otro cambio):**
- Dólar mayorista (ver "Por qué esto no es especulativo").
- Cualquier cambio a `/actualizar.html` — sigue con el dólar blue, el desplegable de
  índice secundario, y las curvas "sólo pesos".
- Buscador de series del catálogo del MCP, serie propia por CSV/Google Sheet,
  descarga de CSV — todo esto es la generalización de "Actualizar" y tiene su propio
  spec futuro. Nombrarlo acá es sólo para dejar constancia de que se discutió y se
  decidió afuera.
- Datos nuevos en el pipeline: todo lo que esta página necesita ya está en el
  snapshot (`ipc.json`, `dolar-blue.json`, `dolar.json`, `series/secundario-cpi-eeuu.json`,
  `series/crosscheck-cpi-eeuu.json`). `scripts/fetch-snapshot.ts` no cambia.

## Motor: `calcularTcrBilateral`

Nueva función en `src/engine/actualizar.ts`, al lado de `actualizarSerieDoble`:

```ts
/**
 * `actualizarSerieDoble` con la dirección fija en "multiplicar" — la única que tiene
 * sentido económico para un tipo de cambio real (ver el spec del 2026-08-17, sección
 * "La cuenta": la primera versión de ese spec tuvo el signo invertido dos veces antes
 * de llegar a código). TCR nunca necesita elegir dirección porque sólo compone un
 * índice de precios de otro país sobre una cotización — no hay un segundo caso.
 */
export function calcularTcrBilateral(
  datos: PuntoValor[],
  mesObjetivo: Mes,
  ipc: SerieIndice,
  cpiUs: SerieIndice,
): PuntoActualizadoDoble[] {
  return actualizarSerieDoble(datos, mesObjetivo, ipc, cpiUs, "multiplicar");
}
```

No hace falta tocar `actualizarSerieDoble` ni `fueraDeCobertura`: el guard de piso ya
existe y ya se prueba en `tests/actualizar.test.ts`. `calcularTcrBilateral` es una
capa fina para que `tcr-main.ts` no tenga que repetir la llamada completa dos veces
(una por moneda) con los mismos cuatro parámetros salvo `datos` — regla 4, un
criterio se escribe una sola vez.

`indices-secundarios.ts` / `indices-secundarios-declarados.ts` no cambian: siguen
siendo el catálogo que usa `/actualizar.html` para su desplegable. TCR no lee ese
catálogo — usa `fred:cpi_us_nsa` directo, sabiendo de antemano que es el único índice
secundario que existe hoy.

## Interfaz: `tcr.html` + `src/ui/tcr-main.ts` + `src/ui/chart-tcr.ts`

### Por qué un gráfico propio y no `dibujarSerieActualizada`

`dibujarSerieActualizada` (en `chart-serie.ts`) está armada alrededor de **una** serie
real más, opcionalmente, su versión "sólo pesos" y un cross-check — con el label
"Dólar blue" escrito adentro. TCR necesita **dos** series reales con nombre propio
(blue, oficial) más el cross-check, sin la versión "sólo pesos" de ninguna. Generalizar
`dibujarSerieActualizada` para server los dos casos la volvería más difícil de leer
para el caso que ya sirve (`/actualizar.html`, que no se toca), así que en vez de eso
se agrega `chart-tcr.ts`: mismo patrón de Chart.js (registro, tokens, formato de
tooltip con `pesosRedondo`/`indice`), adaptado a N series con nombre en vez de una.

```ts
// src/ui/chart-tcr.ts
export type SerieTcrGraficada = {
  label: string;
  /** Mismo largo y orden que el eje temporal del gráfico; `null` donde esa serie no tiene dato. */
  valores: (number | null)[];
  color: string;
};

export function dibujarComparacionTcr(
  canvas: HTMLCanvasElement,
  meses: Mes[],
  series: SerieTcrGraficada[],
  crossCheck?: { valores: (number | null)[]; label: string },
): void
```

`series` siempre trae TCR-blue y TCR-oficial, en ese orden, con sus colores
(`--series-1`, `--series-2` — hace falta agregar un tercer token `--series-3` para el
cross-check, que hoy usa `serie2`; ver "Casos límite y detalles menores"). El eje
`y` es pesos (`pesosRedondo`), igual que hoy; el cross-check sigue en `y1` como
índice (`indice`), reescalado con `reescalarCrossCheck` sin cambios.

### El eje temporal: unión, no intersección

Por la decisión ya tomada ("cada serie se dibuja hasta donde llega"), el eje temporal
del gráfico no es el de una sola serie: es la **unión** de los meses de TCR-blue y
TCR-oficial para el mes objetivo elegido, ordenada. Blue arranca en 2002-01, antes que
oficial (2010-06); en la práctica el eje coincide con el de TCR-blue casi siempre, pero
calcularlo como unión evita asumirlo a mano — la misma razón por la que
`actualizarSerieDoble` reusa `adjust()` en vez de escribir el cociente de índices a mano.

```ts
// tcr-main.ts, capa de interfaz — no hace ninguna cuenta de inflación, sólo arma arrays para el gráfico
function armarEjeYSeries(
  blue: PuntoActualizadoDoble[],
  oficial: PuntoActualizadoDoble[],
): { meses: Mes[]; blue: (number | null)[]; oficial: (number | null)[] }
```

Mismo patrón que ya usa `armarOverlay` en `actualizar-main.ts` para alinear el
cross-check por mes con un `Map`, aplicado ahora a dos series reales en vez de a una
sola comparada contra un índice.

### Formulario y estado

Un solo control (mes objetivo) — se reusan `poblarSelectorObjetivo`,
`acotarMesesObjetivo`, `limiteObjetivo` **copiadas** a `tcr-main.ts` (no importadas de
`actualizar-main.ts`, que es la entrada de otra página y no un módulo compartido; si
en algún momento un tercer lugar las necesita, ahí se factorizan a un archivo común —
YAGNI hasta que haga falta una segunda vez de verdad). El slider de rango reusa
`rango-slider.ts` sin cambios: opera sobre índices de un array, y acá ese array es
`meses` (el eje temporal calculado), no `puntosCompletos` de una sola serie.

Estado del módulo, análogo a `actualizar-main.ts` pero sin índice secundario elegible
ni "sólo pesos":

```ts
let ipc: SerieIndice;
let cpiUs: SerieIndice;
let dolarBlue: SerieValores;
let dolarOficial: SerieValores;
let crossCheckDatos: SerieValores | null; // crosscheck-cpi-eeuu.json; null si el snapshot no lo trae

let meses: Mes[] = [];              // eje temporal completo (sin recortar por el slider)
let valoresBlue: (number | null)[] = [];
let valoresOficial: (number | null)[] = [];
let mesObjetivoTexto = "";
let rango: EstadoRango | null = null;
```

### Casos límite y detalles menores

- **Mes objetivo anterior a 2002-01 (piso de `fred:cpi_us_nsa`).** `calcularTcrBilateral`
  devuelve `[]` para blue Y para oficial (mismo guard `fueraDeCobertura` que ya existe:
  si el mes objetivo mismo cae antes del piso del índice secundario, ningún punto se
  puede resolver). El selector de mes objetivo sigue permitiendo elegir 1992-2001 (mismo
  límite que hoy, `PRIMER_ANIO_EN_PESOS`), así que ese rango de años **siempre** muestra
  el estado vacío en esta página — a diferencia de `/actualizar.html`, donde ese rango
  sólo se rompe si se elige el índice secundario a mano. Se explica con el mismo tipo de
  mensaje que ya existe (`aviso-grafico`): "El tipo de cambio real necesita inflación de
  Estados Unidos, que no tiene dato antes de enero de 2002 — elegí un mes objetivo
  posterior."
- **Mes objetivo entre 2002-01 y 2010-05.** TCR-oficial no tiene dato en ningún punto de
  esa serie (el dólar oficial recién arranca en 2010-06) aunque el mes objetivo sí sea
  resoluble — la línea de oficial no aparece en absoluto, sólo blue y BCRA. Nota fija (no
  condicional a un cálculo, es siempre cierta para ese rango): "El dólar oficial minorista
  tiene serie desde junio de 2010; antes de esa fecha el gráfico muestra sólo blue y BCRA."
- **Cross-check sin dato en el rango visible.** Mismo caso que ya maneja
  `armarOverlay`/`reescalarCrossCheck` hoy: se reancla al último dato del propio
  cross-check (no al mes objetivo), y si aun así el rango visible no lo cubre, no se
  dibuja esa línea y se avisa por qué — mismo texto que ya existe, adaptado.
- **Slider con menos de dos puntos visibles.** Mismo guard que ya existe en `redibujar()`
  de `actualizar-main.ts` (hallazgo 3/7 de la 0015): "Elegí un rango más largo…".
- **Token de color faltante.** Se agrega `--series-3` a `src/styles.css` (claro y
  oscuro), siguiendo la paleta de referencia ya validada por el skill de dataviz —
  mismo proceso que se siguió para `--series-1`/`--series-2`. `tokens()` en
  `chart.ts` gana un tercer campo `serie3`.

## Contenido explicativo: las tres fichas

Fijas, sin interacción, en `tcr.html` cerca de la leyenda/selector. Texto propuesto
(a ajustar en el loop de revisión, especialmente por `revisora-usuaria`):

> **TCR-blue.** El dólar blue medido en tipo de cambio real. Incluye la brecha del
> mercado informal, así que se aleja mucho de la serie del BCRA en los períodos con
> cepo cambiario — no porque el cálculo esté mal, sino porque el BCRA no mide el blue.
>
> **TCR-oficial.** El dólar oficial minorista medido en tipo de cambio real. Es la que
> mejor reproduce a la del BCRA: en la comparación mes a mes desde 2016, coinciden en
> un 99,7%.
>
> **BCRA (oficial).** La serie de tipo de cambio real que publica el Banco Central
> (`tipo_cambio_real_estados_unidos`). Tiene varios meses de rezago de publicación:
> el último dato casi nunca es del mes en curso.

El número "99,7%" y el resto de la validación quedan documentados en
`docs/decisiones/0016-pagina-tcr.md` (a crear durante la implementación, con el
detalle completo de la sesión de validación resumida arriba), para que quien audite
el sitio dentro de un año encuentre de dónde salió ese número sin tener que
reproducir la validación.

## Build

`tcr.html` se agrega a `rollupOptions.input` en `vite.config.ts`, mismo patrón que
`actualizar` (commit `cd24f13`):

```ts
input: {
  main: resolve(raiz, "index.html"),
  datos: resolve(raiz, "datos.html"),
  actualizar: resolve(raiz, "actualizar.html"),
  tcr: resolve(raiz, "tcr.html"),
  paginas: resolve(raiz, "src/ui/paginas.ts"),
},
```

## Testing

- `calcularTcrBilateral`: un test que confirme que delega en `actualizarSerieDoble`
  con `direccion: "multiplicar"` — alcanza con el mismo punto de control ya
  hand-verificado que usa `tests/actualizar.test.ts` para `actualizarSerieDoble`,
  llamado a través del wrapper.
- `armarEjeYSeries` (o como termine llamándose la función de alineación): test con
  datos donde blue y oficial tienen pisos distintos (igual que el caso real
  2002 vs. 2010-06), verificando que el eje es la unión y que la serie más corta
  queda con `null` en los meses que no cubre.
- Fallback de cross-check ausente: mismo test que ya existe adaptado, o reusado si la
  función de reescalado no cambia de firma.
- Mes objetivo anterior a 2002-01 → las dos series vacías, estado "sin datos".
- Mes objetivo entre 2002-01 y 2010-05 → blue y BCRA con datos, oficial ausente en
  todo el rango.

Y, como en cualquier cambio de este repo: **npm run verificar** primero, después
navegador real (Playwright si está disponible) antes de mandar a los tres revisores,
loop completo (paso 4 de la skill) antes de cerrar.

## No-goals

- No se toca `/actualizar.html` ni su motor de índice secundario genérico.
- No se agrega dólar mayorista (ver "Por qué esto no es especulativo").
- No se linkea la página desde el sitio en este cambio.
- No se generaliza `dibujarSerieActualizada` para servir los dos casos — se prefiere
  un archivo de gráfico propio y chico para TCR antes que una función compartida con
  ramas por caso de uso.
- No se toca el pipeline de datos (`scripts/fetch-snapshot.ts`): todo lo que esta
  página necesita ya está en el snapshot.
