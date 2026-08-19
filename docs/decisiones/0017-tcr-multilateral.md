# 0017 · TCR multilateral, cuarta línea en `/tcr.html`

## Contexto

`/tcr.html` mostraba tres series fijas: TCR-blue, TCR-oficial (las dos calculadas
por este sitio) y el cross-check bilateral del BCRA contra Estados Unidos
(`tipo_cambio_real_estados_unidos`, ver [0016](0016-pagina-tcr.md)). Este cambio
agrega una cuarta: el Índice de Tipo de Cambio Real Multilateral (ITCRM) que
publica el BCRA — la referencia contra la canasta de monedas de los principales
socios comerciales, no sólo el dólar, y la que el propio BCRA usa para medir
competitividad.

A diferencia de TCR-blue/TCR-oficial, esta línea **no es una cuenta de este
sitio**: es el número del BCRA tal cual, igual que el cross-check bilateral que
ya existía. No hay metodología nueva que validar acá — la validación de 0016
(que la cuenta bilateral propia reproduce al BCRA cuando se alimenta con el
dólar oficial) sigue siendo la que sostiene TCR-blue/TCR-oficial; esta línea
sólo agrega el número multilateral del BCRA como cuarta referencia.

## La serie ya estaba en Argentina Data MCP

Antes de tocar código se confirmó que el ITCRM ya está en el catálogo unificado
del MCP, sin que hiciera falta ningún colector nuevo: `indec:116.4_TCRZE_2015_D_36_4`
(`tipo_cambio_real_multilateral_actual`), ingestado por el mismo mecanismo
genérico que trae la serie bilateral (republicación de datos.gob.ar), listado
en `collect_indec_priority.ts` del repo `argentina-data-mcp`. Es consultable
hoy mismo vía `series_search`/`series`/`series_metadata`, sin alias — sólo por
`serie_id` exacto o texto libre ("ITCR Multilateral"). No se agregó ningún alias
en este cambio (se evaluó y se decidió que no hacía falta: el sitio referencia el
`serie_id` directo, mismo patrón que ya usa la serie bilateral en
`indices-secundarios-declarados.ts`).

## Un hallazgo, no un motivo para no seguir: las dos series del BCRA están atrasadas

Al confirmar la serie se encontró que tanto el ITCRM como la serie bilateral que
ya se usaba están **7 meses atrasadas** al momento de este cambio: el último dato
de las dos es de 2026-01-28, y la propia herramienta del MCP advierte "no la uses
como valor actual". Es la misma fuente (la familia `TCRZE` de BCRA, republicada
vía datos.gob.ar) para las dos series, así que el atraso no es nuevo ni
específico del multilateral — ya afectaba silenciosamente al cross-check
bilateral que el sitio viene mostrando desde 0016. No bloquea este cambio porque
las dos líneas del BCRA en esta página son, por diseño, "comparación de forma,
no de nivel" (se reanclan al último dato propio, no al mes objetivo — ver
"Casos límite" en el spec de 0016) y ya llevan su propia nota explicando el
rezago de publicación. Queda anotado acá para quien audite el sitio: si el
atraso empeora mucho más allá de "varios meses", vale la pena revisar si
datos.gob.ar dejó de republicar esta familia de series.

## Qué se agregó, en una frase por pieza

- `scripts/fetch-snapshot.ts`: `construirTcrMultilateral()`, mismo patrón que
  `construirCrossCheck()` — mensualiza con `funcion_colapso: "last"` y escribe
  `series/tcr-multilateral.json`. Try/catch propio: si el BCRA falla un día, el
  resto del pipeline no se cae con él.
- `src/ui/tcr-eje.ts`: `armarLineaBcra()` — la reindexación de una línea del BCRA
  (reanclar al último dato propio, alinear al rango visible, avisar si no hay
  superposición) factorizada UNA vez y usada para las dos líneas del BCRA
  (bilateral y multilateral), en vez de duplicar el mismo cálculo — regla 4 de
  `AGENTS.md`.
- `src/ui/chart-tcr.ts`: `crossCheck?: SerieTcrGraficada` pasó a ser
  `lineasIndice: SerieTcrGraficada[]` (0 a 2 elementos, orden fijo: bilateral,
  multilateral), cada una en el eje `y1` con su propio color de leyenda.
- `src/styles.css` / `chart.ts`: token `--series-4`, validado con el script del
  skill de dataviz en modo `--pairs all` (las cuatro series conviven en el mismo
  gráfico) contra las tres existentes. Verde azulado (~172° OKLCH), matiz sin
  usar por ninguna otra serie del sitio — `#329e82` claro / `#288e6c` oscuro.
- `tcr.html`: cuarta ficha ("BCRA (multilateral)"), nota de cobertura propia, y
  la ficha existente pasó de "BCRA (oficial)" a "BCRA (bilateral)" — con dos
  líneas del BCRA, "oficial" dejó de ser un nombre que distingue una de otra.

## Qué queda fuera, a propósito

- Ningún cambio en Argentina Data MCP: la serie ya estaba disponible por
  `serie_id`, y no se agregó alias (ver arriba).
- No se investiga por qué el mayorista ajustaba peor que el oficial contra el
  bilateral (pregunta abierta de 0016, sigue abierta, no es parte de este
  cambio).
- No se toca `/actualizar.html`.

## El loop de revisión

Los tres agentes especializados de `.claude/agents/` no se registraron en esta
sesión — la misma limitación ya anotada en 0016 (se necesita abrir Claude Code
directo en este directorio, no desde uno padre). Se reemplazaron por agentes
genéricos que leyeron cada definición (`revisor-economista.md`,
`revisora-usuaria.md`, `revisor-codigo.md`) y adoptaron esa persona antes de
revisar — mismo criterio y mismo formato de reporte, con la salvedad de que no
son el agente nativo.

Los tres, de forma independiente, encontraron el mismo hallazgo Bloqueante:
las dos notas de metodología del BCRA (bilateral y multilateral) usaban el
mismo texto genérico sin decir a cuál línea se referían — y como las dos
series comparten hoy el mismo último dato (el atraso de 7 meses de arriba),
quedaban como el mismo párrafo repetido dos veces en la vista por defecto, sin
ningún parámetro especial en la URL. Se corrigió: `armarLineaBcra` ahora recibe
un `nombreCorto` ("bilateral"/"multilateral") y lo incluye en la nota.

De paso se corrigieron tres Importantes que salieron de la misma vuelta:

- El `<h2>` del panel decía "bilateral vs. Estados Unidos" a pesar de que el
  gráfico debajo ya incluía la línea multilateral (economista, usuaria).
- La nota de "sin dato en el rango" sólo reportaba dónde termina la cobertura
  de la serie (`mesAncla`), nunca dónde empieza — con el multilateral, que
  arranca diez años más tarde que el resto de la página (2012-05, no 2002-01),
  eso hacía leer "El BCRA no tiene dato... llega hasta enero 2026" como si el
  problema fuera que la serie terminó, cuando en realidad todavía no había
  empezado (economista). Ahora reporta las dos puntas.
- `coloresIndice[i]!` en `chart-tcr.ts` asumía sin verificarlo que nunca iba a
  haber más de dos líneas de índice; se agregó un guard que tira si esa
  invariante se rompe, en vez de dejar que Chart.js dibuje un color
  `undefined` en silencio (código).

Quedaron anotados y **no se tocaron**, por menores y no bloqueantes:

- El pie de fuente (`badge-serie`) sigue sin mencionar al BCRA como fuente de
  ninguna de las dos líneas — así era desde 0016, no lo introdujo este cambio.
- "Varios meses de rezago" en las fichas, sin cuantificar el número — decisión
  de estilo (no atarse a un número que cambia solo), no un error.
