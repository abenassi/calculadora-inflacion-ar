# 0011 · El CSV de descarga se queda sin metadata

## Contexto

El CSV que arma el botón "Descargar CSV" llevaba, arriba de la tabla, unas filas que
arrancaban con `#`: la fuente, el período, la fecha de actualización del snapshot y el
método de cálculo (ventana reciente o proyección, con sus meses estimados). La intención
era la misma de siempre: que el archivo se pudiera defender solo, sin la página al lado.

Algunos programas que abren CSV —hojas de cálculo, importadores— no entienden filas que
empiezan con `#` y las tratan como una fila de datos más, o directamente fallan al
importar. Para alguien que sólo quería ver los números, la primera experiencia con el
archivo era un problema de formato, no del cálculo.

## Decisión

El CSV pasa a ser tabla pura: una fila de encabezado (`punto,indice_ipc,variacion_pct,
acumulado_pct,monto,origen`) y una fila por punto. Nada de metadata arriba, en medio ni
abajo.

## Lo que no se pierde

La trazabilidad **por fila** —si ese punto es un dato oficial o una proyección— sigue
viva en la columna `origen`: dice el `id` de la fuente (por ejemplo `dgeyc-cordoba`) o
`"proyeccion"` si nadie lo publicó. Es la regla 2 de `AGENTS.md` ("dato y estimación
nunca se mezclan sin decirlo") y no dependía de las filas `#`: siempre vivió en esa
columna, incluso cuando el archivo tenía comentarios.

`revisora-usuaria` (Vanina) probó un caso con meses estimados después del cambio y
confirmó que la columna sigue distinguiendo bien: las filas oficiales dicen la fuente,
las proyectadas dicen `proyeccion`.

El nombre del archivo (`inflacion-cordoba-2026-04-a-2026-07.csv`) sigue llevando el
índice y el período, así que esa parte del contexto no depende de abrir el archivo.

## Lo que se paga

El archivo, mirado solo y sin la página al lado, ya no dice:

- **De cuándo es** el snapshot (antes: "Datos via Argentina Data MCP, actualizados al
  2026-08-13").
- El **método** de estimación cuando hay meses sin publicar (ventana reciente, cuántos
  meses, o la proyección con su tasa y su base REM).
- El **nombre largo** de la fuente (antes: "Calculadora de inflacion - fuente: IPC de la
  Provincia de Córdoba"; ahora sólo el `id` corto en `origen`, `dgeyc-cordoba`).

`revisora-usuaria` lo marcó explícitamente: si guarda el CSV y lo abre meses después, o
se lo manda a su contador sin la pantalla al lado, no tiene forma de saber si es viejo o
nuevo. Para el caso que probó (período enteramente oficial) igual lo usaría; para un caso
con estimación, dijo que preferiría acompañarlo con el link.

## Por qué se aceptó igual

Es una tensión real con la regla 1 de `AGENTS.md` ("un número que la persona pueda
defender ante otra persona"), y se decidió a conciencia, no por descuido: la alternativa
—agregar columnas repetidas (`actualizado_al`, `fuente_larga`) en vez de filas `#`—
mantenía la compatibilidad *y* el contexto, pero el dueño del producto priorizó la
compatibilidad universal por sobre el contexto adicional, porque lo que rompía la
experiencia de más gente (un archivo que algunos programas no podían ni abrir bien) pesaba
más que lo que ayudaba a menos gente (saber la fecha de un CSV descargado suelto).

Si en el futuro esto se revierte, la opción de columnas repetidas en vez de filas `#` es
el punto de partida: mismo problema de compatibilidad resuelto, sin volver a perder el
contexto.
