# 0003 · Los meses que el INDEC todavía no publicó

## Contexto

El IPC se publica con semanas de retraso. El mes en curso **nunca** tiene dato, y a
menudo el anterior tampoco.

Y el uso dominante de una calculadora de inflación es traer un monto del pasado **al
presente**. O sea que el hueco no es un caso borde: es el caso normal.

Este es exactamente el problema que motivó el proyecto. El sitio de referencia
devuelve un número con un banner genérico —*"estás usando una proyección"*— sin decir
qué meses son dato real y cuáles no.

## Decisión

Tres metodologías, elegibles desde un selector discreto debajo del resultado. El
default no estima nada.

| Metodología | Qué hace con los meses que faltan | ¿Estima? |
|---|---|---|
| **No estimar ninguno** (default) | Usa la inflación de los últimos *N* meses publicados, con *N* = meses del período pedido | No |
| Inflación del último mes | Repite la última variación publicada sobre los meses que pediste | Sí, marcado |
| REM del BCRA | Usa la mediana que el REM pronostica para cada mes | Sí, marcado |

### La primera, que es la que importa

De mayo a agosto pasan tres meses. Si julio y agosto no salieron, se usa la inflación
acumulada de los **últimos tres meses publicados**. No hay ningún número inventado: son
todos del INDEC.

El razonamiento es que para alguien que no maneja números, *"de mayo a agosto hay tres
meses, así que uso la inflación de los últimos tres meses publicados"* se explica en
una oración y no obliga a entender qué es un promedio móvil ni a elegir entre dos
resultados.

**Lo que no es:** no es la inflación de mayo a agosto, que nadie puede conocer
todavía. Es la del período publicado más reciente de igual duración. Por eso la
interfaz nombra siempre los meses concretos que usó, el título de la tabla dice "sobre
el tramo de referencia", y el resultado lleva `~`.

### Cuándo cambia algo elegir

Sólo cuando hay meses sin publicar de por medio.

- Si el período está enteramente publicado, **las tres dan el mismo número**.
- En un período de un solo mes, la primera y la segunda **coinciden siempre**: correr
  la ventana un mes hacia atrás devuelve justamente el último mes publicado, que es la
  tasa que la segunda repetiría. Es por construcción, no casualidad, y hay un test que
  lo fija.
- Con un destino **futuro**, la primera no tiene alternativa: no existe ningún tramo
  publicado equivalente, así que estimaría igual y coincidiría con la segunda. **Por eso
  ahí deja de ser elegible** — ver abajo.

### La opción que no se puede cumplir no se ofrece (2026-08-13)

La primera versión dejaba «no estimar ninguno» elegible siempre y, cuando el período
obligaba a proyectar, lo compensaba con una aclaración debajo del resultado: *"elegiste no
estimar ningún mes, pero mayo 2027 todavía no llegó…"*.

Estaba mal por dos motivos. Uno, el control decía una cosa y el cálculo hacía otra, que es
la clase de incoherencia que hace desconfiar de todo lo demás. Dos, la aclaración llegaba
**tarde y en el lugar equivocado**: la decisión se toma arriba, en el desplegable, y el
texto aparecía abajo, después de que el número ya estaba pintado.

Ahora, cuando no hay forma de contestar sin estimar, la opción queda **deshabilitada**, el
selector pasa solo a la metodología que realmente se usa, y el motivo se explica al lado
del control. Alcanza a dos situaciones: destino posterior al mes en curso, y períodos donde
correr la ventana de referencia caería antes del inicio de la serie.

**La vuelta atrás es la parte delicada.** Si el cambio de metodología lo hizo el sitio, al
desaparecer la restricción vuelve al default; si lo eligió la persona, se respeta. Pisarle
una elección propia al cambiar una fecha sería peor que el problema original.

**Y el criterio no está escrito dos veces.** `sePuedeEvitarEstimar()` y el motor salen de la
misma función, con un test que recorre varios períodos y exige que el predicado del
desplegable y lo que hace `adjust()` coincidan. Sin eso, el control vuelve a mentir en
cuanto alguien toque una de las dos copias — y esta vez sin que nadie se entere.

## Consecuencias

**Rompe a propósito la paridad numérica con `ajuste_por_inflacion` del MCP**, que
proyecta con el promedio de las últimas tres variaciones. La coherencia con el MCP se
mantiene en el empalme de series y en el índice, no en el tratamiento del hueco: eso
es una decisión de producto del sitio. No hay que "arreglarlo" haciendo que vuelvan a
coincidir.

El default **nunca se persiste entre visitas**: quien entra de cero ve siempre la
metodología que no estima nada. Un `?metodo=` en la URL sí se respeta, porque ahí hubo
una elección explícita de quien compartió el link.

## Una crítica abierta, que no es un bug

Una auditoría metodológica señaló que en una desinflación la opción "no estimar
ninguno" es la que **más se aleja** de lo razonable, porque arrastra meses de otro
régimen: 7,32% contra 5,60% de la que se declara estimativa. Es cierto. La respuesta
por ahora es de rotulado —el título de la tabla, el `~`, el párrafo que nombra los
meses— y no de método. Queda anotado acá porque es una tensión real, no resuelta.

## Lo que encontró la revisión al deshabilitar la opción

Deshabilitar "no estimar ninguno" para períodos futuros dejó a la vista un conjunto de
textos que ya venían mal y que, juntos, hacían desconfiar del número aunque el número
estuviera bien. Los encontró la revisora usuaria sobre el sitio en producción, con un
caso concreto: $520.000 de octubre 2026 a mayo 2027.

**Tres números distintos para la misma cosa.** El párrafo decía "el INDEC todavía no
publicó los **11 meses** que van de julio 2026 a mayo 2027", el pie de la tabla decía
"las **8 filas** resaltadas", y en pantalla había **7** porcentajes. Los tres eran
ciertos en su propia lógica y ninguno era verificable mirando la tabla.

- Los **11** salían de que `mesesEstimados` arrancaba siempre en el mes siguiente al
  último publicado, sin mirar desde dónde se pedía el cálculo. Pero el resultado es el
  cociente `índice(hasta)/índice(desde)`: **todo lo anterior a `desde` se cancela y no
  mueve el número ni un peso.** Nombrar julio a alguien que pidió octubre era además el
  caso exacto que ya había fallado antes — el texto nombrando meses que la persona no
  pidió. Ahora el rango arranca en el primer mes que efectivamente entra en la cuenta.
- Las **8** salían de contar filas en vez de tramos. La fila de partida sale resaltada
  —su índice está estimado— pero no muestra ningún porcentaje, así que llamarla "tramo
  proyectado" sumaba uno que no se puede contar. El pie cuenta porcentajes.

**"El resto son datos oficiales" cuando no hay resto.** La frase era incondicional. Con
el destino en el futuro la tabla entera está estimada, así que mandaba a buscar un dato
del INDEC imposible de señalar. Lo mismo hacía la referencia del gráfico, que anunciaba
"dato oficial" con todas las barras rayadas. Las dos ahora dependen de que exista al
menos un tramo oficial. Es la regla 2 aplicada al revés de como se suele leer: no
prometer dato oficial donde no lo hay es tan importante como marcar lo estimado.

**El texto que se copia arrancaba diciendo "IPC del INDEC".** En pantalla el cartel de
ESTIMADO está pegado al número y se ve de lejos; pegado en un mensaje eso desaparece y
quedan dos renglones que le atribuyen al INDEC un porcentaje que el INDEC no publicó.
Quien lo recibe lee el primer renglón y el monto. El aviso ahora va **antes** del
número, y el acumulado dice "estimada" en vez de citar la fuente.

**Y el propio cambio dejó dos mentiras nuevas**, que es lo que pasa cuando se cambia un
comportamiento sin barrer sus textos: la opción deshabilitada seguía diciendo
"(recomendado)" —recomendando justo la única que no se podía elegir— y `datos.html`
seguía afirmando "si no lo tocás, siempre estás en la primera". Las dos corregidas.

Vale la pena registrar qué **no** se tocó: el cartel que explica por qué la opción está
en gris quedó tal cual. Fue lo único de todo el flujo que la revisión confirmó que se
entendía a la primera.

## Qué corrigió la vuelta 2

El arreglo de arriba era correcto en el caso testigo y rompía los bordes. Lo encontró el
revisor de código sobre los mismos cambios:

**El rango se derivaba de `desde`, que no siempre es la punta vieja.** Deflactando hacia
atrás —"cobré esto en diciembre, ¿cuánto era en agosto?"— `desde` es el extremo **nuevo**,
el piso se iba por encima del techo y la lista quedaba vacía: *"El INDEC todavía no
publicó ,"*, con la coma colgando, en pantalla y en el texto que se copia. Ahora se toma
el extremo más viejo del recorrido.

**En modo por día volvía el mismo 7 contra 8.** El tramo que va del 15 de octubre al 1 de
noviembre lleva la parte de octubre que va del 15 en adelante: es un mes sin publicar y sí
mueve el número. `mesTopeNecesario` de un día devuelve su propio mes, así que el `+1` lo
salteaba entero. Ahora, cuando la punta vieja cae en un día que no es el 1, su mes entra.

**Y la frase nueva mentía en espejo.** *"En esta tabla no hay ningún dato oficial"* se
decidía mirando sólo los tramos, así que aparecía con una fila de partida que llevaba su
`INDEC ✓` impreso dos centímetros más arriba. Es la misma falla que vino a corregir, dada
vuelta. Ahora sale de `hayDatoOficial()`, que mira todas las filas — y de una sola función,
porque el pie de la tabla y la referencia del gráfico afirman lo mismo y se leen juntos.

**Pedir una metodología de estimación no obliga a que haya algo que estimar.** Con un
destino que cae el 1° del mes siguiente al último publicado no queda nada que proyectar, y
el sitio igual ponía el cartel ≈ ESTIMADO, el `~` y *"Los 0 porcentajes resaltados son
tramos proyectados"* sobre una tabla enteramente sellada por el INDEC. El anuncio de
estimación ahora depende de que haya algo estimado, no de la metodología que se pidió.

El test que ataba todo esto fijaba un literal en modo mes hacia adelante y no atrapaba
ninguno de los cuatro. Lo reemplazó una grilla {mes, día} × {adelante, atrás} × {mixto,
todo estimado} sobre el invariante que la interfaz necesita de verdad: **la cantidad de
meses nombrados tiene que ser igual a la de tramos proyectados en la tabla.** Es la regla
4 aplicada a un texto y una tabla que la persona lee juntos.
