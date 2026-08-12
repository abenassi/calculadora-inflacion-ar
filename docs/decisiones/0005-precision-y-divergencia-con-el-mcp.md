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
