# 0016 · Página TCR, separada de "Actualizar"

## Contexto

`/actualizar.html` mezclaba dos casos de uso: reindexar cualquier serie de valores
contra el IPC (genérico, en camino a generalizarse a series propias y a un buscador
del catálogo del MCP — cambio aparte, no cubierto acá), y calcular un tipo de cambio
real bilateral con el desplegable "ajustar también por" (específico, con una sola
cuenta correcta). Este cambio separa la segunda mitad en `/tcr.html`, con un
catálogo fijo de tres series — ver el spec
([2026-08-19-tcr-page-design.md](../superpowers/specs/2026-08-19-tcr-page-design.md)).

## La validación que motivó el cambio

Antes de escribir el spec se validó con datos reales por qué el TCR calculado con el
dólar blue se aleja tanto de `tipo_cambio_real_estados_unidos`, la serie que publica
el BCRA (`indec:116.4_TCRZE_2015_D_31_73`). Se corrió la misma cuenta que ya hacía
`actualizarSerieDoble` con tres cotizaciones —blue, oficial minorista, mayorista— y
se comparó cada resultado contra la serie del BCRA, en la ventana 2016-01 a 2026-01
(después del empalme de IPC, para no mezclar ese efecto):

| Serie usada | Correlación de variaciones mensuales vs. BCRA | Nivel, con el ancla fijada |
|---|---|---|
| dólar blue | 0,13 | inestable |
| dólar oficial minorista | **0,997** | estable, dentro de ±2% |
| dólar mayorista | 0,76 | estable pero peor ajuste |

La brecha entre "nuestro TCR" y el del BCRA es el dólar blue, no un error de la
fórmula: alimentada con el oficial, la misma cuenta reproduce al BCRA casi
exactamente. El mayorista ajustó peor de lo esperable (el BCRA usa una referencia
mayorista para su ITCRM) y quedó afuera del catálogo por eso — sin una explicación
firme de por qué.

Un hallazgo colateral: anclar el índice en diciembre de 2015 (la fecha base del
BCRA) da un nivel sesgado, porque ese mes promedia días de antes y de después de la
megadevaluación del 17 de diciembre de 2015. Con cualquier ancla sin salto cambiario
cerca, el ratio vuelve a ~1,00 con desvío ~1,7-1,8%. No afecta a `/tcr.html` porque
ahí nunca se ancla en una fecha fija — el mes objetivo lo elige quien usa la página.

## Qué queda fuera, a propósito

- Dólar mayorista (ver arriba).
- Cualquier cambio a `/actualizar.html`.
- Buscador de series del catálogo del MCP, serie propia por CSV/Google Sheet,
  descarga de CSV — la generalización de "Actualizar", con su propio spec futuro.
  Se discutió y se decidió explícitamente afuera de este cambio, en parte porque
  choca con la regla de "el sitio no llama al MCP en runtime" (ver AGENTS.md) y
  necesitaría una decisión de arquitectura propia.

## El loop de revisión

_A completar durante la revisión (paso 4 de la skill `cambiar-la-calculadora`)._
