# 0006 · La senda mensual del REM no estaba en ninguna API

## Contexto

El REM (Relevamiento de Expectativas de Mercado) es la encuesta mensual que el BCRA
les hace a consultoras, bancos y centros de investigación. Es la mejor referencia
pública sobre qué inflación se espera hacia adelante, porque no sale de un modelo
propio sino del consenso de quienes se dedican a proyectarla.

La tercera metodología del sitio lo usa para estimar los meses sin publicar.

## El problema

La única serie del REM en el catálogo de Argentina Data MCP era `bcra:29`: la **mediana
de inflación esperada a doce meses**. Un solo número por encuesta.

La primera versión del sitio lo repartía en doce meses iguales: 21,8% anual → 1,66%
mensual. Funcionaba, pero obligaba a aclarar que **los analistas nunca dijeron eso**.
Era un promedio nuestro, presentado al lado de números que sí eran de ellos.

## Qué encontramos

Los tres caminos posibles, verificados:

- **`datos.gob.ar`** republica la senda como `indec:430.1_*` y ya estaba en el
  catálogo, pero **congelada en diciembre de 2025**. Además en fracciones (`0,023`) en
  vez de porcentaje, e indexada por horizonte, así que reconstruir el camino de un mes
  significa leer siete series y elegir a mano.
- **La API del BCRA**: la variable 29 es la única entrada del REM. No hay senda.
- **El sitio del BCRA**: ahí está, en el Excel histórico del relevamiento. Con una
  propiedad que lo salva: **la URL es fija y no tiene fecha**, el BCRA la sobrescribe
  cada mes con el histórico acumulado. Es un GET, no scraping frágil.

## Decisión

Se indexó la senda en Argentina Data MCP como **`rem:ipc_mensual`** (aliases
`inflacion_esperada`, `rem`, `senda_rem`), en porcentaje, fechada por **mes
pronosticado** tomando la encuesta más reciente que lo cubre.

Esa forma de fechar tiene una propiedad linda: como la encuesta de un mes pronostica
`t..t+6`, la última encuesta que habla de un mes es siempre la de ese mes. Así, los
meses pasados quedan como nowcasts congelados y sólo se mueven los futuros.

El sitio ahora usa el valor que el REM pronosticó **para cada mes**:

> julio +1,95% · agosto +1,80% · septiembre +1,80% · octubre +1,66% · noviembre
> +1,63% · diciembre +1,80% · enero 2027 +1,70%

## Lo que sigue siendo un límite

**El REM pronostica mes a mes unos seis meses hacia adelante, no doce** (`t..t+6`).
Más allá publica interanuales y años calendario, nada más.

Los meses que quedan afuera se completan repartiendo pareja la expectativa a doce
meses, y el texto del resultado dice **desde qué mes** empieza esa parte.
`BaseProyeccion` separa `mesesDeLaSenda` de `mesesExtrapolados` justamente para poder
decirlo.

## Consecuencias en el motor

La tasa de proyección dejó de ser un número y pasó a ser una función del mes, así que
el índice proyectado se **encadena** en vez de elevar una tasa única a la cantidad de
meses. `Metodo.proyeccion.tasaMensualPct` es `number | null`: con la senda, cada mes
tiene la suya y nombrar "una" tasa sería inventar un promedio que no se usó.

## Dos trampas que dejó documentadas

**`rem:ipc_mensual` tiene `fecha_fin` en el futuro**, así que `dato_atrasado` es
permanentemente `false` y **no sirve para detectar que la serie quedó vieja**. El MCP
devuelve una `nota` con la fecha de la encuesta para eso.

**El mes de la encuesta sale de `bcra:29` y la senda de `rem:ipc_mensual`**, dos series
que se actualizan por caminos distintos. Si una queda un mes atrás de la otra, el sitio
nombraría una encuesta equivocada al lado de números correctos. El pipeline verifica
que el horizonte dé 6 meses y avisa si no.

## La moraleja

El dato que necesitabas puede no existir todavía, y a veces la respuesta correcta no es
aproximarlo mejor sino **ir a buscarlo**. Acá el trabajo terminó siendo una serie nueva
en el catálogo, que ahora está disponible para cualquiera que use el MCP, no sólo para
este sitio.
