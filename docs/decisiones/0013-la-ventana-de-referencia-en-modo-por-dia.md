# 0013 · La ventana de referencia por día termina donde terminan los datos

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

## Lo que no cambia

El modo por meses sigue siendo el default y el recomendado cuando el número tiene que ser
indiscutible: nada de esto arregla que el IPC mensual no es la foto de un día (0004).
