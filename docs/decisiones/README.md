# Decisiones

Por qué esta calculadora hace lo que hace.

Cada archivo es una decisión con su razón y, cuando la hubo, la evidencia que la
cambió. Están acá porque el código muestra **qué** hace el sitio y estos documentos
muestran **por qué**, que es lo que hace falta para reusarlo, discutirlo o llevarlo a
otro dominio.

Si venís a forkear esto para armar otra cosa con [Argentina Data
MCP](https://argentinadata.mymcps.dev), empezá por la 0001: es la que explica la
arquitectura y la que probablemente quieras copiar tal cual.

| # | Decisión | Por qué importa |
|---|---|---|
| [0001](0001-arquitectura-snapshot-diario.md) | El sitio no llama al MCP en runtime | La API key nunca llega al browser, y el sitio funciona aunque el MCP no responda |
| [0002](0002-un-solo-calculo-sin-presets.md) | Un solo modo de cálculo | Los "casos de uso" sugerían cálculos distintos donde siempre había uno |
| [0003](0003-los-meses-que-el-indec-no-publico.md) | Tres metodologías para el hueco | El mes en curso nunca tiene IPC, y ese es el caso normal, no el raro |
| [0004](0004-fechas-exactas-anclaje-a-fin-de-mes.md) | Anclaje a fin de mes | Una auditoría metodológica movió el resultado medio punto |
| [0005](0005-precision-y-divergencia-con-el-mcp.md) | El sitio no coincide con el MCP en plazos largos | Y es a propósito |
| [0006](0006-la-senda-mensual-del-rem.md) | La senda del REM no existía y la indexamos | Cómo se agrega una serie que no está en ninguna API |
| [0007](0007-como-revisamos-esto.md) | Dos revisores de perfiles opuestos | El método que encontró casi todos los errores de este repo |
| [0008](0008-analytics-sin-guardar-la-ip.md) | Analytics propio, sin guardar la IP | Cómo medir de verdad sin volverse una base de datos personales |
| [0009](0009-paginas-por-anio-y-seo.md) | Una página por año | El SEO obligó a decir en voz alta dos cosas que el sitio callaba |
| [0010](0010-indices-provinciales-y-regiones.md) | El IPC de tu provincia | Sólo diez de veinticuatro miden, y ofrecer una región sin decirlo sería prometer lo que no hay |
| [0011](0011-csv-de-descarga-sin-metadata.md) | El CSV de descarga se queda sin metadata | Las filas `#` rompían la lectura en algunos programas; se sacrifica contexto (fecha, método) para que el archivo abra bien en cualquier lado |
| [0012](0012-atajos-de-fecha.md) | Atajos de fecha: "ahora" y 1m/3m/6m/12m | Mueven fechas, no cambian el cálculo — no reviven los presets que sacó la 0002 |
| [0013](0013-la-ventana-de-referencia-en-modo-por-dia.md) | La ventana de referencia por día | Correr meses enteros conservando el día dejaba el tramo terminando a mitad del último mes publicado, y volvía falso el pie de la tabla |
| [0014](0014-los-porcentajes-cuando-se-va-para-atras.md) | Los porcentajes cuando se va para atrás | Deflactando, la tabla mostraba el recíproco de la inflación del mes de al lado, con el sello del organismo; ahora los porcentajes son cronológicos y el rótulo nombra el mes de su propio número |

## Formato

Nada ceremonioso: contexto, decisión, consecuencias. Si una decisión se revirtió, el
documento se actualiza y deja dicho qué la revirtió, en vez de crear uno nuevo. Lo que
importa es que dentro de un año se pueda entender por qué el código es así.

El diseño original completo está en
[`docs/superpowers/specs/`](../superpowers/specs/), y se mantiene al día. Estos
documentos no lo reemplazan: lo complementan con las decisiones que aparecieron
después de escribirlo, que fueron la mayoría de las importantes.
