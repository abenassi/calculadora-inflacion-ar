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
de un mes es una sola y no depende de en qué dirección se pregunte. Preguntar de febrero a
julio y de julio a febrero da **la misma tabla de porcentajes, con el mismo sello**, en orden
invertido. Hay dos tests que atan exactamente eso, uno por mitad — la primera versión afirmaba
atar el sello y sólo ataba los porcentajes.

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

Deflactando, **la columna de porcentajes sube y la de montos baja**, y en una misma fila el
porcentaje es de un mes y el monto es del anterior: la fila "jun 2026" dice +1,89% —lo que
subieron los precios en junio— y al lado tiene el monto de **mayo**, que es dónde se llega
después de sacarle ese 1,89%.

Las dos cosas son ciertas y juntas se leen como un error si nadie las nombra, así que el pie
lo nombra: *"Vas para atrás en el tiempo, así que los porcentajes son la inflación que hubo
—la que publicó el INDEC— y cada monto es el que queda después de sacársela."*

Se evaluó la alternativa de **dar vuelta la tabla** y mostrarla siempre cronológica, de lo
viejo a lo nuevo, arrancando en la respuesta ($887.237) y terminando en el monto que la persona
escribió. Alinea el rótulo, el porcentaje y el monto de cada fila, y se descartó por una razón
de producto: la primera fila deja de ser el monto que se tipeó, y toda la interfaz está
construida alrededor de eso —el número grande, el punto de partida de la tabla, el nombre del
CSV, la primera barra del gráfico—. Queda anotada acá porque es una alternativa razonable y no
un error, y si algún día la tabla se lee mal en el celular es la primera que hay que volver a
mirar.

Hay un caso donde el rótulo se rompe solo: deflactando, el primer tramo saca la inflación del
mes en el que arranca el período, así que su rótulo repetiría el de la fila de partida —dos
filas seguidas diciendo "jul 2026", una con guiones y la otra con +2,11%—. Ahí, y sólo ahí, la
fila se nombra por sus dos puntas (`jun 2026 → jul 2026`), igual que un tramo de días.

## Lo que se barrió con esto

- El CSV tenía una columna `punto_inicial` clavada en la fila anterior: deflactando salía el
  par `2026-07, 2026-06` con `+2.11`, el signo para un lado y las fechas para el otro. Ahora
  son `tramo_desde`/`tramo_hasta`, cronológicas. Ver 0011.
- La nota del interés compuesto contraponía la suma de la columna con el cambio del monto:
  *"te va a dar 12,11%, no −11,28%"*, dos números de signo distinto presentados como si uno
  fuera la versión bien hecha del otro. Ahora se compara contra la inflación acumulada, y hay
  un test que exige que los dos números que la nota contrapone sean del mismo signo.
- Las flechas de las filas prorrateadas apuntaban para atrás en el tiempo (`15 jul 2026 → 1
  jul 2026`). Una flecha se lee "de acá hasta acá".
- El párrafo del resultado decía *"con una baja de 11,28%"* arriba de una tabla con todos los
  porcentajes positivos. Ahora dice *"con 12,71% de inflación en el medio"*, y el resultado más
  chico ya está en el número grande.
- El comentario de `chart.ts` que explicaba que "con deflación la barra baja": ya no, las
  barras son inflación mensual y suben también deflactando. Bajan sólo cuando el mes tuvo
  deflación de verdad.

## Lo que no cambia

El número. `montoAjustado` y `variacionPct` dan exactamente lo mismo que antes: el error era
entero de presentación y de atribución. Los 700 tests que había pasaban con la tabla mintiendo,
que es la razón por la que ahora hay uno que compara la ida contra la vuelta.
