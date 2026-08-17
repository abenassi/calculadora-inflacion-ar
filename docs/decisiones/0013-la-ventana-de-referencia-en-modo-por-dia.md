# 0013 · La ventana de referencia por día termina donde terminan los datos

> **Los ejemplos de acá usan el snapshot del día en que se decidió esto**, con el INDEC
> publicado hasta **junio de 2026**. El sitio con el snapshot de hoy contesta el mismo caso
> con julio y 31 días. El caso está congelado en `tests/explicaciones.test.ts` para que se
> pueda reproducir aunque la serie siga avanzando.

## Contexto

Cuando el período pedido todavía no se publicó entero, el sitio no estima: contesta con
**el tramo publicado más reciente del mismo largo** (0003). Con meses enteros eso es
correr la ventana N meses hacia atrás, y el extremo nuevo cae justo sobre el último mes
publicado.

Con fechas exactas se hacía lo mismo: correr **meses enteros conservando el día del mes**.
Del 17 de julio al 15 de agosto de 2026, con el INDEC publicado hasta junio, salía el
tramo 17 de mayo → 15 de junio.

## El problema

**Uno.** La ventana terminaba el 15 de junio con junio publicado entero. El tramo publicado
más reciente de 29 días no termina el 15 de junio: termina cuando termina junio. Se tiraba
media publicación a la basura, y es la mitad más fresca.

**Dos, y es el que obliga a cambiarlo:** el pie de la tabla promete, textual, *"Este es el
tramo publicado más reciente del mismo largo que el que pediste"*. Con esa ventana era
**falso**. No es un matiz de redacción — no hay forma de escribir esa frase para que sea
cierta mientras la ventana se construya corriendo meses.

**Tres.** Obligaba a explicar de dónde sale el 17 de mayo. La explicación quedaba
*"usamos del 17 de mayo al 15 de junio"*, que mezcla dos meses en un período de 29 días
que entra entero en uno. Es exactamente el tipo de frase que 0004 sacó del modo por día:
defendible, pero no explicable.

## Decisión

**La ventana por día se ancla al final de lo publicado, no a la fecha pedida.** Son los N
días que terminan con el último mes publicado, con N medido en días calendario.

El caso testigo pasa a decirse en los términos de quien pregunta: *"usamos los últimos 29
días publicados: la inflación de junio de 2026, el último mes con dato, prorrateada a 29 de
sus 30 días"*. Un solo mes, una regla de tres que la persona puede rehacer.

Es la misma regla del modo mensual —la ventana termina donde terminan los datos—, sólo que
medida en la unidad en la que se pidió el período. Y descansa sobre la convención de 0004:
el dato de un mes vale por todos los días de ese mes, así que prorratearlo es repartir lo
que el INDEC publicó, no estimar.

### Termina el último día del mes, no en el 1 del siguiente

El cierre exacto del mes publicado es el **1 del siguiente** (0004: el día 1 y el cierre
del mes anterior son el mismo punto), y anclar ahí sería un día más fresco y haría que un
período de largo un mes calzara exacto sobre el último mes publicado.

No se eligió: la fila quedaría rotulada **"1 ago 2026"** tres renglones abajo de *"el INDEC
todavía no publicó agosto"*. Es defendible y se lee como una contradicción, que es
justamente lo que la regla 2 existe para evitar. Lo que se paga son 1/31 de un mes en el
peor caso, invisible en el resultado.

## Consecuencias

- **El número cambia**, y usa datos más frescos. En el caso testigo, +1,83% contra +1,98%
  (con julio ya publicado): ~$1.400 sobre un millón.
- El pie de la tabla ahora dice la verdad en los dos modos.
- Cuando la ventana entra entera en el último mes publicado —el caso más común, porque los
  períodos por día suelen ser cortos— la tabla tiene **una sola fila** y la explicación
  nombra **un solo mes**.
- `cabeLaVentana` pasó a medirse sobre la ventana que se va a usar de verdad, con la misma
  función que la construye (regla 4). De paso arregla un caso latente: prorratear un día
  necesita también el índice del **mes anterior**, y medir sin eso dejaba al motor
  ofreciendo "sin estimación" para una ventana que después reventaba con `RangoError`.
- Deflactando (destino anterior al origen) la ventana se recorre al revés, así que el
  resultado sigue dividiendo. Está testeado como ida y vuelta.

## Lo que se arregló de paso, en los textos

Todo esto salió de leer el texto que se copia, y de ahí salieron tres cosas más:

- **Los días no llevaban artículo.** *"$1.000.000 de 17 de julio equivalen a $X en 15 de
  agosto"*. Un mes no lo lleva ("de julio 2026") y un día sí ("del 17 de julio de 2026").
  Ahora sale de `conPreposicion`, que arma también las contracciones, en vez de estar
  escrito a mano en ocho oraciones.
- **La preposición del destino cambia con el modo**: un mes es el período dentro del cual
  vale el monto ("en agosto 2026") y un día es el instante al que se lo trae ("al 15 de
  agosto de 2026"). "A agosto 2026" y "en el 15 de agosto" son las dos combinaciones que
  nadie escribiría.
- **"la inflación de el último mes publicado"**, en modo mensual con un período de un solo
  mes. La contracción estaba armada afuera de un `plural()` cuya rama singular empieza con
  "el".

## La tensión que queda abierta: el guard de sesgo mide la ventana vieja

`sesgoDeLaVentana` (0010) sigue midiendo *"la inflación de los `d` **meses** que la ventana
mete dividida por la de los `d` meses que saca"*. En modo por día la ventana ya no se corre
`d` meses: se ancla al último día publicado, así que el corrimiento real va de un día a
varios meses. **El criterio dejó de describir lo que hace el motor**, que es justo lo que la
regla 4 existe para evitar, y esta decisión es la que lo produjo.

Los dos revisores lo levantaron por separado, con evidencia distinta y la misma conclusión.
Lo verificado:

- **Sobreestima y bloquea de más.** Nacional, `15-ene-2024 → 15-ago-2026`: el guard mide
  18,12% y deshabilita "no estimar ninguno"; el sesgo real de la ventana que construiría es
  **8,53%**, por debajo del 10% que el sitio se fijó. La persona recibe una estimación de
  ~$3.170.385 donde había una ventana publicada que daba $3.440.766.
- **Subestima y deja pasar de más** *(esto es anterior a este cambio: se comporta igual en
  `83ae4f1^`)*. Nacional, `2-abr-1990 → 28-ago-2026`: el guard mide 9,1% y pasa; la ventana
  real descarta 28 días de marzo de 1990 (+95,5% mensual) y su sesgo real es **76,6%**.
  Aparece en las 16 series.
- **Se puede saltear el guard tildando "usar fechas exactas".** Neuquén, `dic-2024 →
  ago-2026`: por meses la opción sale deshabilitada (+69,77% estimado) y con las mismas
  fechas en día 1 sale habilitada y recomendada (+89,73%). Son $199.617 sobre un millón.
  6 pares sobre 6144 barridos, todos en la dirección peligrosa.

**No se arregla acá, y la razón es el tamaño.** La corrección conocida —medir el sesgo sobre
la ventana que devuelve `ventanaDeReferencia`, en días, con la fórmula que colapsa a la
actual en modo mensual— cambia qué períodos quedan habilitados, y el 10% de 0010 se calibró
barriendo pares de **meses**. Meterlo en este cambio significa mover una decisión calibrada
sin recalibrarla, en el mismo commit que cambia la ventana. Va aparte, con su propio barrido
y su propia actualización de 0010.

Mientras tanto el guard es **conservador en el caso que lo motivó** (bloquea de más, no de
menos) salvo por el agujero de las ventanas que cruzan bordes de mes, que ya existía.

## Lo que no cambia

El modo por meses sigue siendo el default y el recomendado cuando el número tiene que ser
indiscutible: nada de esto arregla que el IPC mensual no es la foto de un día (0004).

## Lo que aprendió el pie de la tabla, en tres vueltas

Cambiar la ventana no cambió un solo número del modo mensual, y aun así rompió el pie de la
tabla dos veces. Vale la pena dejar por qué, porque el error de fondo es el mismo las dos
veces: **una fila prorrateada no cae de ningún lado de la pregunta vieja.** No es una
proyección —nadie estimó nada— y tampoco es un dato publicado —el INDEC no publica días—, y
todos los predicados del sitio estaban escritos para un mundo de dos categorías.

- La vuelta 1 preguntaba "¿hay alguna fila que no sea proyección?", y una tabla enteramente
  prorrateada contestaba que sí: *"Todas las filas salen de datos oficiales."*
- La vuelta 2 lo corrigió preguntando por el sello, y se pasó de largo para el otro lado: un
  período por día que arranca dentro del último mes publicado no tiene ninguna fila sellada,
  y el pie pasó a decir *"el INDEC todavía no publicó ninguno de estos meses"* dos renglones
  abajo de citar la inflación de julio.
- La vuelta 3 encontró que la pregunta seguía mal planteada en un tercer eje: **de qué filas
  habla**. Las tres frases hablan de los porcentajes, y la fila de partida no muestra
  ninguno. Con el origen el 1 de un mes publicado, esa fila lleva su `INDEC ✓` impreso y
  arrastraba al pie a decir *"Todas las filas salen de datos oficiales"* sobre una tabla cuyo
  único porcentaje dice `prorrateado` — mientras el gráfico de la misma pantalla contestaba
  lo contrario, porque él siempre miró `slice(1)`.

Quedó un solo predicado, `hayTramoOficial` (sello sobre `slice(1)`), y **tres** frases, no
dos: hay un caso donde ningún porcentaje es publicado y aun así todos salen de meses
publicados, y otro donde ninguno es publicado y la fila de partida sí lo es. Las tres se
atan con un test que pasa por `selloDeFila` —lo que se imprime en la columna Origen— y por
el texto renderizado. El test anterior era `if (hayDatoOficial(r)) expect(<la definición de
hayDatoOficial>)`: no podía fallar, y no falló cuando el revisor de código devolvió el
predicado a su versión equivocada.

## El techo de tres vueltas

Este cambio llegó al techo que fija el skill: tres vueltas que encuentran cosas. Lo que la
vuelta 3 levantó y **no** entró acá va como cambios propios, y está anotado para no perderse:

- ~~**Deflactando, la tabla le pone a cada porcentaje el mes de al lado.**~~ **Resuelto en la
  [0014](0014-los-porcentajes-cuando-se-va-para-atras.md).** Yendo para atrás, la fila rotulada
  "jun 2026" mostraba la variación jul→jun: −2,07%, que es julio dado vuelta. Junio fue +1,89%.
  Con `INDEC ✓` al lado, y así viajaba al texto que se copia. Era pre-existente —el camino de
  deflactar no lo tocó este cambio— y era una violación de la regla 2 de las caras. La razón
  con la que se difirió en la vuelta 2, *"es el mismo dato leído en la dirección que se
  pidió"*, era **falsa**.
- **Puntas mixtas mes+día.** `adjust("2026-06", "2026-07-15")` produce una fila fantasma
  "jun 2026, +0,00%, INDEC ✓" que duplica la de partida, porque `puntosDelRecorrido` sigue
  mapeando un mes a su día 1 mientras el motor lo valúa en su cierre. Y la UI reinterpreta
  `?desde=2026-06&hasta=2026-07-15` como `2026-06-01`, así que el mismo par de puntos
  contesta +2,85% en pantalla y +0,95% en el motor. Hoy no se llega desde la interfaz, pero
  el motor promete soportarlo y tiene tests que lo dicen.
- **El texto que se copia habla de "tramo de referencia"**, que es vocabulario nuestro. La
  revisora usuaria propuso "el último período comparable". Es una decisión de nombre que
  toca el pie, el nombre del CSV y esta misma ADR.
- Sigue en pie lo diferido de las vueltas 1 y 2: el guard de sesgo, el layout en el celular,
  la metodología por default, y el día ≠ 1 del primer mes de la serie.
