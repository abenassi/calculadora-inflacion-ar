# Actualizar series (MVP oculto)

Fecha: 2026-08-17

Hoy la calculadora hace una sola cosa: llevar **un monto** de una fecha a otra. Esto
es el mismo motor mirado al revés — llevar **una serie entera** de valores, cada uno
con su propia fecha, a los pesos de un único mes elegido. En vez de un número, un
gráfico.

Arranca como una página sin link desde ningún lado del sitio (`/actualizar/`), con una
sola serie hardcodeada — dólar blue — para probar la idea antes de pensar en un
selector de series o en integrarla a la landing.

## El dato: dólar blue, promedio mensual

`dolar_historico` (tool aparte de `series`, no está en el catálogo genérico) da
`tipo=blue` desde 2002-01 hasta hoy, 296 puntos mensuales con `frecuencia=mensual,
funcion_colapso=avg`. Fuente: Ámbito Financiero.

El promedio mensual no es una estimación nuestra en el sentido de la regla 2: es un
colapso bien definido sobre datos diarios reales, igual que ya hace `funcion_colapso`
para `dolar.json`/`uva.json` (que usan `last` en vez de `avg`). Se declara en el pie de
la página igual, para no dejarlo implícito.

## Pipeline de datos

Regla 1 sigue firme: nada de esto se llama desde el browser.

- **`scripts/mcp-client.ts`** gana `traerDolarHistorico(tipo, extra)`, que llama al
  tool `dolar_historico` — `traerSerie` no sirve porque llama a `series`, y el dólar
  blue no vive ahí.
- **`scripts/fetch-snapshot.ts`** gana `construirSerieDolarBlue()`, que pide
  `{ tipo: "blue", frecuencia: "mensual", funcion_colapso: "avg", fecha_desde:
  "2002-01-01" }` y escribe `public/data/series/dolar-blue.json` con la misma forma
  que ya usan `dolar.json`/`uva.json`: `{ serie, fuentes, unidad, actualizado, datos:
  [{ mes, valor }] }`. Se reusa `escribirSiMejora` tal cual, así que la invariante de
  que un snapshot no puede encoger también vale acá.
- Se llama desde `main()` en su propio `try/catch`, con el mismo criterio que ya usan
  los índices jurisdiccionales: si el tool de dólar falla un día, el resto del
  pipeline (IPC, índices, catálogo) se escribe igual y esto se queda con el snapshot
  de ayer. Esta sección secundaria no puede voltear a la principal.

## El cálculo: reindexar una serie contra el IPC

Archivo nuevo, `src/engine/actualizar.ts`, una sola función:

```ts
actualizarSerie(
  datos: { mes: Mes; valor: number }[],
  mesObjetivo: Mes,
  ipc: SerieIndice,
): { mes: Mes; valorOriginal: number; valorActualizado: number }[]
```

Por cada punto llama al `adjust()` que ya existe —
`adjust(valor, mes, mesObjetivo, ipc).montoAjustado` — y nada más. Cero lógica de
inflación nueva: es la regla 4 (un criterio se escribe una sola vez) aplicada al pie
de la letra.

`mesObjetivo` queda acotado al `rangoPedible(ipc)` que ya usa el selector principal,
así que **esta versión nunca proyecta**: todo punto resuelve `directo` o
`ventana_reciente`, nunca una tasa inventada. Eso evita tener que replicar acá el
sistema de sellos por fila que sí tiene sentido en la calculadora principal — en el
MVP ninguna fila necesita distinguirse como estimada.

Tests en `src/engine/actualizar.test.ts`, con vitest, mismo patrón que el resto del
motor: al menos que el valor en el propio `mesObjetivo` no cambia, que el resultado
coincide con llamar `adjust()` a mano punto por punto, y un caso con `mesObjetivo`
anterior al último punto de la serie (deflactando, no sólo actualizando).

## La página `/actualizar/`

- **`actualizar.html`** nuevo, con el mismo header/footer y `styles.css` que
  `index.html` (`.cabecera`, `.pie`, mismos tokens) — se ve como parte del sitio, sólo
  que nadie llega ahí sin la URL a mano. El footer sigue linkeando de vuelta a la
  calculadora principal, para no dejarla como un callejón sin salida.
- `<meta name="robots" content="noindex">`, como capa extra: el sitemap ya sólo lista
  las páginas por año así que esto no aparece ahí, pero si alguna vez alguien la
  linkea desde afuera, que no la indexen igual.
- **`src/ui/actualizar-main.ts`**, entry point propio (como ya tiene `paginas.ts`).
  Se agrega a `vite.config.ts` → `rollupOptions.input`.
- Un solo control: "expresar en pesos de: [mes] [año]", poblado con el mismo patrón
  que `poblarSelects()`, acotado a la intersección de `rangoPedible(ipc)` y el rango
  de la serie de dólar. Default: mes actual.
- Un gráfico de línea (Chart.js, ya es dependencia) con la serie actualizada. Función
  nueva en `src/ui/chart.ts` o un archivo propio, `dibujarSerieActualizada`.
- Al cargar: `fetch` de `data/series/dolar-blue.json` y `data/ipc.json`, mismo patrón
  que `cargarIndice`. Nada toca el MCP en runtime.
- Pie de página propio (no el `nota-legal` de la calculadora) citando las dos fuentes:
  dólar blue promedio mensual (Ámbito Financiero), actualizado según el IPC empalmado
  (INDEC/BCRA).

## Cómo se verifica

- `npm run verificar` (typecheck + tests + build) tiene que seguir pasando con el
  nuevo entry point.
- Tests unitarios de `actualizarSerie` descritos arriba.
- Browser real: abrir `/actualizar/` servido en local, cambiar el mes objetivo,
  confirmar que el gráfico se redibuja y que un mes fuera de rango no rompe nada.
- No hace falta el loop de los tres revisores de `.claude/agents/` para esta versión:
  es una página sin tráfico real y sin promesa pública todavía. Si de acá sale algo
  que se vaya a linkear, ahí sí pasa por el loop completo.

## Lo que este trabajo NO hace

- No agrega selector de series — sólo dólar blue, hardcodeado.
- No compara la serie nominal y la actualizada en el mismo gráfico.
- No arma una tabla con desglose fila por fila ni sellos de origen, como sí tiene la
  calculadora principal.
- No manda eventos de analytics — sin tráfico real todavía, no hay nada que medir.
- No se linkea desde `index.html`, el nav, ni el sitemap.
- No ofrece dólar oficial, MEP, cierre de mes, ni compra — sólo blue, promedio
  mensual.
