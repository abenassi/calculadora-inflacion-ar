# 0005 · El sitio no coincide con el MCP en plazos largos, y es a propósito

## Contexto

El sitio y la herramienta `ajuste_por_inflacion` de Argentina Data MCP contestan la
misma pregunta con los mismos datos. Lo esperable sería que den el mismo número
siempre.

Sobre ventanas recientes coinciden al centavo. Sobre décadas, no:

| Período | Divergencia |
|---|---|
| 2017 → 2026 | 0,06% |
| 1995 → 2026 | 0,34% |

## Por qué pasa

No es un bug del empalme de series. Son dos métodos distintos de llegar al mismo
lugar:

- **El MCP** compone variaciones mensuales **redondeadas**. Cada mes aporta un error de
  redondeo chiquito, y sobre 370 meses se acumulan.
- **El sitio** toma el cociente entre los índices de nivel de los dos meses. Es el
  método exacto: no hay redondeo intermedio porque no hay paso intermedio.

### Corrección (2026-08-13): esa última frase valía sólo para la mitad de la serie

Salió en la revisión de las páginas por año, y era una afirmación absoluta sobre un caso
que varía — el defecto que este repo comete más seguido.

"No hay paso intermedio" es cierto **de diciembre de 2016 en adelante**, que es desde
cuando el INDEC publica un índice de nivel y el sitio simplemente lo divide. Para atrás
el índice de nivel **no existe**: lo construye `splice.ts` encadenando las variaciones
mensuales de `bcra:27`, y esas vienen publicadas **con un solo decimal**. O sea que en
todo el tramo 1990–2016 el índice del sitio *es* un producto de variaciones redondeadas
—exactamente lo que este documento le señala al MCP— y el redondeo se acumula igual.

La diferencia con el MCP se mantiene y la decisión no cambia: el MCP redondea también el
tramo moderno, el sitio no. Lo que cambia es el alcance de la frase. Medido: un acumulado
anual de los años viejos puede quedar unas décimas de la cifra oficial que circula, y el
efecto crece con la inflación del año.

No es corregible desde acá: el redondeo viene de la fuente, no lo introduce el sitio. Lo
que sí corresponde es **decirlo**, y por eso está en `/datos`, en el README y en las
preguntas frecuentes de la home.

## Decisión

**No replicar la imprecisión del MCP.** El sitio se queda con el cociente de índices.

Replicar el número del MCP habría significado replicar su error acumulado, y un sitio
cuya promesa es "mostrá el cálculo" no puede elegir a propósito el cálculo peor para
que dos herramientas coincidan.

## Consecuencias

- Sobre plazos de décadas, el sitio difiere de otras calculadoras argentinas por
  fracciones de punto. Muchas componen variaciones redondeadas, así que la divergencia
  no es sólo contra el MCP.
- La página `/datos` lo explica al lector en vez de esconderlo.
- Hay un **test de tolerancia** que fija los desvíos largos. No verifica que el número
  sea igual al del MCP: verifica que la diferencia esté dentro del rango del ruido de
  redondeo. Así, un empalme roto de verdad se distingue de la divergencia esperada, que
  es la única forma de que este documento no se vuelva una excusa para ignorar un bug.

## Nota para quien compare

Si estás verificando este sitio contra otra herramienta y los números no dan exacto en
períodos largos, no necesariamente hay un error. Comparalos sobre ventanas de pocos
meses: ahí tienen que coincidir. Si no coinciden ahí, sí hay algo roto.
