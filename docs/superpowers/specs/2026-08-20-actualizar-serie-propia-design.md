# Actualizar: de dólar blue hardcodeado a serie propia del usuario

Fecha: 2026-08-20

## Contexto

`/actualizar.html` es hoy un MVP de prueba (sin link desde ningún lado, `noindex`)
que reindexa **una sola serie hardcodeada** — dólar blue — contra el IPC. La decisión
[0016](../../decisiones/0016-pagina-tcr.md) separó de ahí el caso de tipo de cambio
real hacia `/tcr.html`, y dejó anotado a propósito que la otra mitad — "serie propia
por CSV/Google Sheet" — era la generalización futura de Actualizar, con su propia
decisión de arquitectura. Este spec es esa decisión.

El pedido original: alguien tiene una serie de valores nominales en pesos —un
alquiler mes a mes, un sueldo, una factura recurrente— y quiere verla reexpresada en
los pesos de un único mes, igual que hoy se puede hacer con un monto. Es el mismo
motor mirado al revés, ya construido para el caso del dólar blue.

## Por qué no un toggle en la landing

Se evaluó agregarlo como un toggle en `index.html`, al lado de "usar fecha exacta".
Se descartó: los toggles que ya existen ahí sólo **revelan campos** dentro del mismo
árbol de resultado (un monto, sus chips, su tabla de desglose). Una serie propia
necesita una entrada distinta (texto pegado o archivo, no un monto y una fecha) y una
salida distinta (gráfico + tabla multi-punto, no un número). Ramificar el resultado
de la landing en dos experiencias completamente distintas atrás de un checkbox es el
mismo problema que la decisión
[0002](../../decisiones/0002-un-solo-calculo-sin-presets.md) ya cortó de raíz al
sacar los cuatro presets: sugiere que hay cálculos distintos donde el sitio siempre
prometió que hay uno solo.

En cambio, `/actualizar.html` ya es exactamente el lugar para la segunda promesa
("ver una serie entera reexpresada", distinta de "traer un monto de una fecha a
otra") y ya tiene la infraestructura — gráfico, slider de rango — construida para
eso. Este cambio repurposea esa página entera: dado que nada en producción depende
hoy del dólar blue ahí (no tiene link, no tiene tráfico), reemplazarla no rompe nada.
La landing queda sin tocar.

## El dato que sigue vivo en otro lado

`public/data/series/dolar-blue.json` y `construirSerieDolarBlue()` en
`scripts/fetch-snapshot.ts` **no se tocan**: `/tcr.html` (`tcr-main.ts`) los usa como
una de sus tres series del catálogo fijo, independiente de este cambio. Lo que se
saca es únicamente el *wiring* hardcodeado de `actualizar-main.ts` (el fetch de ese
JSON puntual y su uso como única serie de la página) y el desplegable "ajustar
también por índice secundario" completo —fetch de `indices-secundarios.json`,
`actualizarSerieDoble`, `reescalarCrossCheck`, el catálogo de índices secundarios—
porque ese caso de uso ya vive en `/tcr.html` desde la 0016 y dejarlo duplicado en
dos páginas es la clase de criterio-escrito-dos-veces que la regla 4 de `AGENTS.md`
prohíbe.

## Formato de entrada

Cada línea pegada o cada fila de CSV es un punto: `<fecha><separador><valor>`.

- **Separador**: autodetectado por línea, en este orden — tab (así llega un paste de
  Excel/Sheets), si no hay, coma, si no, punto y coma.
- **Fecha**: acepta `YYYY-MM`, `YYYY-MM-DD` (ISO), `DD/MM/YYYY`, `MM/YYYY`
  (argentino). **DD/MM siempre, nunca MM/DD** — se aclara en texto al lado del
  textarea, porque `03/04/2024` es ambiguo y el sitio no adivina. Una fecha con
  día > 31 o mes > 12 en cualquier lectura es una fila inválida, no un intento de
  adivinar la otra convención.
- **Valor**: acepta decimal con coma o con punto, con o sin separador de miles
  (`1234.56`, `1234,56`, `1.234,56`, `1234`). Regla, en orden:
  1. Si aparecen los dos símbolos (`,` y `.`), el más a la derecha es el decimal y el
     otro es separador de miles y se descarta (`1.234,56` → `1234.56`).
  2. Si aparece uno solo y a la derecha quedan 1 o 2 dígitos, es decimal
     (`1234,5` → `1234.5`; `1234.56` → `1234.56`).
  3. Si aparece uno solo y a la derecha quedan exactamente 3 dígitos, es separador de
     miles y se descarta — nadie factura con 3 decimales, y en un CSV exportado
     `1.234` casi siempre quiere decir mil doscientos treinta y cuatro
     (`1.234` → `1234`; `1,234` → `1234`).
  4. Cualquier otro largo después del símbolo (0, o 4+) es fila inválida: no hay
     lectura razonable.
- **Encabezado**: la primera línea que no parsea como fecha+valor se descarta sin
  aviso — no hace falta que la persona la saque a mano.
- **Duplicados**: una fecha repetida se queda con la primera aparición; las
  siguientes se listan como inválidas con el motivo "fecha repetida".
- **Mínimo**: 2 puntos válidos para poder graficar — mismo piso que ya exige
  `armarIndice` en `adjust.ts`.
- **Errores no bloquean**: las filas inválidas se listan debajo del textarea con
  línea y motivo (`"línea 4: fecha no reconocida"`), y el gráfico se arma igual con
  las que sí parsearon.

Vive en un archivo nuevo de `src/engine/` (aritmética/parseo puro, sin DOM, mismo
patrón que el resto del motor — así se testea sin browser), con una función que
devuelve `{ puntos: PuntoValor[], errores: { linea: number; motivo: string }[] }`.

## El motor: de `Mes` a `Punto`

`adjust()` ya acepta `Punto` (`Mes | Fecha`) en `desde`/`hasta`, con todo el
prorrateo a fin de mes resuelto (decisión
[0004](../../decisiones/0004-fechas-exactas-anclaje-a-fin-de-mes.md)) — soportar
fecha exacta por fila no es lógica nueva, es ampliar el tipo que hoy usa
`actualizarSerie`. Cambia:

```ts
// antes
export function actualizarSerie(datos: PuntoValor[], mesObjetivo: Mes, ipc: SerieIndice)
// donde PuntoValor = { mes: Mes; valor: number }

// después
export function actualizarSerie(datos: PuntoValor[], mesObjetivo: Mes, ipc: SerieIndice, opciones?: OpcionesAjuste)
// donde PuntoValor = { punto: Punto; valor: number }
```

`actualizarSerieDoble` y `calcularTcrBilateral` (que usa `/tcr.html`) no cambian de
firma — sólo `actualizarSerie`, que es la que usa esta página nueva. `OpcionesAjuste`
ya existe en `adjust.ts`; se lo pasa tal cual a cada `adjust()` interno.

## Metodología: el mismo selector que la landing

Cuando un punto cae en un mes sin publicar, el MVP actual lo descarta en silencio.
Se reemplaza por el mismo selector "qué hacer con los meses sin publicar" que ya
tiene `index.html` (`sin_proyectar` / `ventana_reciente` / `rem`), aplicado a toda la
serie de una — mismo componente, mismo criterio, reusando `sePuedeEvitarEstimar` y
`motivoParaEstimar` de `adjust.ts` sin reescribir nada (regla 4).

Con `sin_proyectar` (default) un punto que necesitaría estimar ya no desaparece: se
muestra en la tabla marcado como no actualizado, con el motivo
(`motivoParaEstimar` ya distingue `"futuro"` / `"ventana_no_cabe"` /
`"ventana_sesgada"`) — es la regla 3 de `AGENTS.md` ("un control no ofrece lo que no
puede cumplir") aplicada a una fila de tabla y no sólo a un control de formulario.

## La página

- **Entrada**: un textarea grande para pegar, y un input de archivo `.csv` al lado —
  mismo parser para los dos, porque subir un CSV es pegar el mismo texto por otra
  vía.
- **Controles**: "expresar en pesos de" (ya existe) + el selector de metodología
  nuevo.
- **Gráfico**: dos líneas — la serie nominal tal cual se pegó, y la actualizada — con
  leyenda. El MVP actual no las comparaba; sumarlo es lo que hace que el resultado se
  pueda defender (la promesa del sitio), no sólo mostrar un número final.
- **Tabla** debajo del gráfico: fecha, valor original, valor actualizado, con las
  filas no actualizables marcadas en vez de ausentes (ver arriba).
- **Pie de página propio**: qué es esto, que los datos son los que pegó la persona
  (el sitio no los valida contra ninguna fuente), y de dónde sale el IPC con el que
  se actualiza.
- Deja de ser `noindex, nofollow` una vez que esté terminada — hasta entonces sigue
  como está.
- La landing gana un link discreto hacia acá (en el pie, cerca de donde ya vive el
  link a `/datos`), del estilo "¿Tenés una serie completa en vez de un monto? →
  Actualizarla". No un toggle: un link de salida.

## Cómo se verifica

- `npm run verificar` (typecheck + tests + build) con el parser nuevo y la extensión
  `Mes → Punto`.
- Tests unitarios del parser: los cuatro formatos de fecha, los tres formatos de
  valor, encabezado, duplicados, filas inválidas mezcladas con válidas.
- Tests de `actualizarSerie` con `Punto` (fecha exacta) además de `Mes`, y con el
  selector de metodología pasando por `ventana_reciente`/`rem`.
- Browser real: pegar una serie de ejemplo, subir el mismo contenido como `.csv` y
  confirmar que da lo mismo, cambiar mes objetivo y metodología, forzar filas
  inválidas y confirmar que se listan sin romper el resto.
- **Esta vez sí pasa por el loop completo de los tres revisores** de
  `.claude/agents/` (a diferencia del MVP del dólar blue): va a tener link desde la
  landing y tráfico real.

## Fuera de alcance, a propósito

- Buscador de series del catálogo del MCP — sigue siendo el otro pendiente que ya
  nombraba la 0016, con su propia decisión futura (choca con la regla 1 si se
  resuelve mal: el sitio no puede llamar al MCP en runtime).
- Descarga en CSV del resultado actualizado.
- Comparación contra una serie institucional (eso es exactamente lo que ya hace
  `/tcr.html`, con su catálogo fijo).
- Importar directo desde Google Sheets (sólo pegar texto o subir un archivo).
- Ajustar por un segundo índice ("tipo de cambio real" con una serie propia) — ese
  caso, si aparece, es una extensión de `/tcr.html`, no de acá.
