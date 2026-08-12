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
  publicado equivalente, así que estima igual y coincide con la segunda. La interfaz
  lo dice con todas las letras, porque si no se lee como si el selector estuviera roto.

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
