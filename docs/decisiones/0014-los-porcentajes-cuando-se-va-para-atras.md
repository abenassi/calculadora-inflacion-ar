# 0014 — Los porcentajes cuando se va para atrás

> Los números concretos de acá salen del snapshot del 17 de agosto de 2026, con julio como
> último mes publicado. Sirven para reproducir el caso, no como dato de hoy.

## El problema

"Cobré $1.000.000 el 15 de julio. ¿Cuánto era eso en febrero?" es una consulta común —pasa
con cada seña, con cada anticipo, con cada precio que alguien quiere traer al pasado— y la
calculadora la contestaba con la tabla al revés. Literalmente al revés:

| CUÁNDO | SUBIÓ | ORIGEN | lo que el INDEC publicó de ese mes |
|---|---|---|---|
| jun 2026 | **−2,07%** | `INDEC ✓` | +1,89% |
| may 2026 | −1,85% | `INDEC ✓` | +2,15% |
| abr 2026 | −2,10% | `INDEC ✓` | +2,58% |
| mar 2026 | −2,52% | `INDEC ✓` | +3,38% |
| feb 2026 | −3,27% | `INDEC ✓` | +2,90% |

Cada fila mostraba el **recíproco de la inflación del mes siguiente**. El −2,07% de la fila
"jun" es el +2,11% de julio dado vuelta. Son dos errores encimados:

- **El signo.** Se dividía en el orden del recorrido, y deflactando el recorrido va del punto
  nuevo al viejo. Junio subió 1,89% y la tabla decía −1,85%, abajo de una columna que se llama
  **Subió** y al lado de un sello que dice `INDEC ✓`. Es la regla 2 rota de la forma más cara:
  atribuirle al organismo una cifra que nunca publicó. Y viajaba al texto que se copia como
  `- jun 2026: -2,07% (oficial INDEC)`, que es lo que alguien le manda a un cliente.
- **El mes.** El rótulo nombraba el punto de **llegada** y el porcentaje pertenecía al mes que
  se estaba deshaciendo. Yendo para adelante los dos coinciden y nadie lo vio en un año;
  deflactando se separan y toda la columna queda corrida.

Y un tercero, en el renglón que más se lee: el texto que se copia decía
`Inflación acumulada: −11,28% (IPC del INDEC)`. La inflación entre febrero y julio fue
**+12,71%**. El −11,28% es cuánto baja un millón al sacársela, que es otra cosa y no es lo que
dice el renglón.

La revisora usuaria lo resumió mejor que ninguna especificación: *"si junio subió 1,89%, que
diga 1,89% aunque yo vaya para atrás"*, y *"eso no lo mando ni loca: el día que la clienta lo
googlea, se me cae todo, incluidos los presupuestos que sí estaban bien"*.

## La decisión

**Los porcentajes de la tabla son la inflación que hubo, siempre cronológica.** La inflación
de un mes es una sola y no depende de en qué dirección se pregunte.

**Y el desglose se recorre siempre del mes más viejo al más nuevo, también deflactando.** Con
eso, preguntar de febrero a julio y de julio a febrero da **la misma tabla**: los mismos meses,
los mismos porcentajes, los mismos sellos, en el mismo orden. Lo único que cambia con la
dirección es **dónde se apoya el monto** que la persona escribió: yendo para adelante está en
la primera fila, y deflactando en la última, marcada `← tu monto`. Hay tests que atan las tres
mitades por separado — los porcentajes, el sello, y el anclaje del monto.

> **Esta parte se decidió dos veces, y la primera estaba mal.** La versión que se publicó el
> 17 de agosto mantenía el recorrido en el orden de la pregunta y sólo corregía los
> porcentajes y el rótulo. Era coherente en su propio marco y aun así rompía tres cosas, que
> los tres revisores encontraron por caminos distintos:
>
> - **La columna Índice IPC se contradecía a sí misma.** La fila `jun 2026` mostraba
>   11.826,41 preguntando al derecho y 11.607,39 al revés. Es la columna que se puede ir a
>   comprobar contra la publicación oficial.
> - **El mes preguntado no aparecía en ninguna fila.** Pidiendo febrero, la última fila decía
>   `mar 2026` con los $887.237 al lado.
> - **Un índice publicado terminaba en una fila marcada `estimado`.** Deflactando de septiembre
>   a abril, la fila rotulada "ago 2026" mostraba 12.076,39 —el índice real de julio— con el
>   cartel de estimación.
>
> Las tres son la misma cosa: con el recorrido invertido, la fila mezclaba dos meses. El
> rótulo y el porcentaje salían del tramo; el índice, el monto y el sello, del punto. Un
> rótulo por tramo sólo es coherente si **toda** la fila pertenece a ese mes, y eso es cierto
> yendo para adelante y falso yendo para atrás. El recorrido cronológico es el único diseño
> donde cada fila es de un solo mes, y encima saca un caso especial del motor en vez de
> agregarlo.

**El sello de un tramo sale del extremo viejo, no del punto de llegada.** Es la misma corrida
de un mes, en otra columna. La variación de diciembre de 2016 sale de dividir el índice de
diciembre —el primero que publicó el INDEC, 100— por el de noviembre, que no existe y
`splice.ts` retropola con el BCRA: el +1,20% es del BCRA. Preguntando de septiembre 2016 a
enero 2017 salía `INDEC ✓` y al revés `BCRA ✓`, con el mismo porcentaje en la misma fila. Toca
cualquier rango que cruce nov/dic 2016 en la serie nacional, en las dos direcciones.

**El rótulo de cada fila nombra el mes de su propio porcentaje.** El criterio quedó uno solo,
`mesDelTramo`, y ya no es "el punto de llegada" ni "el más viejo de los dos extremos" —las dos
reglas anteriores acertaban en un caso y erraban en el otro—. Es: se toma el extremo
cronológicamente más nuevo como instante y se nombra el mes que termina ahí. Un mes vale por
su cierre (0004) y un día 1 es el cierre del mes anterior, así que la conversión a instante es
lo que hace que la regla valga para meses y para días a la vez.

**El renglón del acumulado dice dos números, y la inflación primero:**

```
Inflación acumulada: +12,71% (IPC del INDEC). Sacarle esa inflación al monto lo baja 11,28%.
```

La cifra que lleva el nombre del organismo es la que el organismo publicó. El efecto sobre el
monto va después y sin atribución. Yendo para adelante los dos números son el mismo y la
segunda oración no aparece.

Por eso `Resultado` tiene dos campos y no uno: `variacionPct` es cuánto cambió el monto —el
que manda el número grande— e `inflacionPct` es la inflación del período. Coinciden salvo
deflactando.

## Lo que esto cuesta, dicho de frente

Deflactando, **la primera fila de la tabla ya no es el monto que la persona escribió**: es la
respuesta. El monto pedido queda abajo de todo, marcado `← tu monto`, y el pie lo dice: *"La
tabla va del mes más viejo al más nuevo, así que el monto que pediste ajustar está en la última
fila y el resultado, en la primera."*

La marca aparece **sólo cuando la fila es de verdad el punto que se pidió**. Con la ventana de
referencia las filas son el tramo publicado y no el período pedido, así que ninguna lo es:
pidiendo de agosto a marzo, la última fila dice "jul 2026" y la marca la firmaba como el monto
de la persona, con `INDEC ✓` al lado. Sin la marca la tabla mostraba otros meses y se quedaba
callada, que es incómodo; señalar uno y llamarlo tuyo es mentir. Hay un barrido que exige que
ninguna marca caiga sobre una fila cuyo punto no sea el pedido.

Es un costo real y se eligió a conciencia contra el de la alternativa. La otra opción evaluada
—mantener el orden de la pregunta— deja el monto arriba, que es lo que la interfaz venía
suponiendo en todos lados, pero paga con que cada fila hable de dos meses a la vez. Entre "la
primera fila no es la tuya" y "el índice del INDEC de esta fila no es el de este mes", la
segunda es la que rompe la promesa del sitio.

## Un caso que se cerró solo

Con el recorrido en el orden de la pregunta hubo que agregarle a `rotularFila` una rama para
un choque de nombres: deflactando, el primer tramo sacaba la inflación del mes en el que
arrancaba el período, así que su rótulo repetía el de la fila de partida y había que nombrarlo
por sus dos puntas (`jun 2026 → jul 2026`). La revisora usuaria lo rechazó con razón —dejaba
dos renglones seguidos empezando con "jun" y queriendo decir meses distintos, en la tabla y en
el gráfico—. Con el recorrido cronológico el choque no existe y la rama se borró.

## Lo que se barrió con esto

- El CSV tenía una columna `punto_inicial` clavada en la fila anterior: deflactando salía el
  par `2026-07, 2026-06` con `+2.11`, el signo para un lado y las fechas para el otro. Ahora
  son `tramo_desde`/`tramo_hasta`, cronológicas. Ver 0011.
- La nota del interés compuesto contraponía la suma de la columna con el cambio del monto:
  *"te va a dar 12,11%, no −11,28%"*, dos números de signo distinto presentados como si uno
  fuera la versión bien hecha del otro. Ahora se compara contra la inflación acumulada, y hay
  un test que exige que los dos números que la nota contrapone sean del mismo signo.
- Las flechas de las filas prorrateadas apuntaban para atrás en el tiempo (`15 jul 2026 → 1
  jul 2026`). Una flecha se lee "de acá hasta acá". Con el recorrido cronológico ya no se
  pueden escribir mal, pero el test se queda: ata la promesa, no la implementación.
- `ordenReal`, que compara dos puntos por el instante que representan y no por su día 1. Es lo
  que decide la dirección, y con `compararPuntos` un mes contra un día de ese mismo mes daba
  al revés: `adjust(x, "2026-07", "2026-07-01")` mostraba **−1,56%** bajo "Subió" cuando julio
  subió +2,11%. No se llegaba desde la interfaz, que normaliza el mes a su día 1. Vive en
  `mes.ts` al lado de `compararPuntos`, con el reparto escrito entre las dos.
- El verbo de "Sacarle esa inflación al monto lo baja X" salía cableado, con un `Math.abs()`
  encima. Sobre un período de **deflación** leído para atrás el monto sube, y la frase decía lo
  contrario dos renglones abajo del número correcto: "$1.000.000 equivalen a $1.007.643" y
  después "lo baja 0,76%". El 2,39% de las consultas hacia atrás del índice nacional, y una de
  ellas es agosto contra julio de 2016 en CABA, que es la forma de consulta más común que hay.
- El párrafo del resultado decía *"con una baja de 11,28%"* arriba de una tabla con todos los
  porcentajes positivos. Ahora dice *"con 12,71% de inflación en el medio"*, y el resultado más
  chico ya está en el número grande.
- El comentario de `chart.ts` que explicaba que "con deflación la barra baja": ya no, las
  barras son inflación mensual y suben también deflactando. Bajan sólo cuando el mes tuvo
  deflación de verdad.

## El alcance de `extremoNuevo` / `extremoViejo`

Pasarlas a `ordenReal` toca el ancla de `sesgoDeLaVentana` y el cálculo de `esFuturo`, así que
se barrió aparte: 9.408 consultas (48 puntos × 48 × 3 metodologías), comparando `metodo.tipo`,
`montoAjustado`, `inflacionPct`, cantidad de filas, desplazamiento y `sePuedeEvitarEstimar`.
Cambian **3**, y son la misma consulta con las tres metodologías: `2026-09-01 → 2026-08`, dos
puntos que son **el mismo instante** —el día 1 de septiembre es el cierre de agosto—. El monto
da idéntico (1000,00000000) porque el período tiene largo cero; lo que cambia es que ahora se
clasifica como `ventana_reciente` en vez de `proyeccion`, que es lo correcto: no hay nada que
estimar. Cae adentro de las puntas mixtas, que no son alcanzables desde la interfaz.

## El techo, y qué quedó afuera

Este cambio llegó al techo de tres vueltas que encuentran cosas. Lo que la vuelta 3 levantó y
**no** entró queda anotado acá, con la razón:

- **Dos `sort` que no pueden permutar siguen en pie**, uno en `mesDelTramo` y otro en el CSV,
  mientras que los otros cuatro se sacaron. Medido: 29.318 pares adyacentes del desglose, cero
  desordenados. No mienten y no tocan ningún número; lo que hay que decidir es una sola
  doctrina —o se sacan los tres, o se quedan los tres con la razón escrita— y hoy conviven las
  dos en el mismo archivo.
- Sigue en pie lo diferido de la 0013: el guard `sesgoDeLaVentana`, el layout en el celular, la
  metodología por default, el día ≠ 1 del primer mes de la serie, y si "tramo de referencia"
  debería decirse "el último período comparable".
- **Puntas mixtas mes+día**, con la razón corregida: se difería diciendo que no son alcanzables
  desde la interfaz, y es cierto de las mixtas, pero no cubre la fila fantasma de largo cero,
  que también sale de `?desde=2026-05-15&hasta=2026-05-15` —el mismo punto contra sí mismo— sin
  ninguna punta mixta. Pre-existente e idéntica antes y después de este cambio.
- Y el pendiente de la revisora usuaria: por fechas exactas la tabla sigue teniendo filas que
  nombran dos cosas (`15 feb 2026` como fila y otra vez adentro del rango `15 feb → 1 mar`).
  Ella misma verificó que pasa igual en las dos direcciones: no es regresión, es cómo funciona
  el modo por día desde siempre.

## Lo que no cambia

El número. `montoAjustado` y `variacionPct` dan exactamente lo mismo que antes: el error era
entero de presentación y de atribución. El economista lo comprobó barriendo 13.475 consultas
—5 series × 3 metodologías × 35×35 pares de puntos, meses y días, ida y vuelta— contra el árbol
anterior, campo por campo: cero diferencias.

Y la tabla mintiendo pasaba **todos** los tests que había. Ésa es la razón de los que se
agregaron: comparan la ida contra la vuelta en vez de fijar un número.
