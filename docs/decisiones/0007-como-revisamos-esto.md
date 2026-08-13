# 0007 · Dos revisores de perfiles opuestos

## Contexto

La promesa del sitio es que el resultado sea **defendible ante otra persona**. Eso
falla de dos maneras que no se detectan igual:

- El número está mal o el método no se sostiene. Lo ve alguien que sabe.
- El número está bien pero nadie entiende de dónde salió. Lo ve alguien que no sabe.

Un solo revisor no encuentra las dos.

## Decisión

Cada vez que se toca la metodología o la explicación, se revisa con **dos perfiles
opuestos, en paralelo y sin que se vean entre sí**.

> **Los dos están escritos y versionados** en [`.claude/agents/`](../../.claude/agents/):
> `revisor-economista` y `revisora-usuaria`. Dejaron de ser un prompt que había que
> reconstruir de memoria cada vez — que era la forma más fácil de que el método se perdiera
> o se degradara sin que nadie lo notara. El paso a paso para invocarlos está en la skill
> [`cambiar-la-calculadora`](../../.claude/skills/cambiar-la-calculadora/SKILL.md).

- **Un economista especialista en índices de precios.** Audita contra el código y los
  datos reales, no contra la descripción. Se le pide explícitamente que sea exigente y
  que confirme lo que está bien, para no cambiar por las dudas cosas que funcionan.
- **Una usuaria que necesita el número para trabajar y no maneja porcentajes.** Es una
  estilista que actualiza presupuestos y tiene que contestarle al cliente *"¿por qué me
  subiste tanto?"*. Contesta en primera persona, no como consultora de UX.

## Qué encontró cada uno

No se superpusieron casi nada, y las dos listas eran ciertas.

**El economista** encontró que el anclaje del índice movía el resultado medio punto
(→ [0004](0004-fechas-exactas-anclaje-a-fin-de-mes.md)), que la afirmación sobre el CER
era falsa, y que la proyección se evaluaba por punto final en vez de por tramo, así que
un tramo con datos publicados salía marcado como estimado. También **refutó** una
hipótesis que traíamos sobre etiquetado, que era incorrecta.

**La usuaria** sumó la columna de porcentajes con la calculadora del celular, no le dio
—es interés compuesto, el sitio estaba bien— y su conclusión fue desconfiar: *"si a mí
no me dan, al cliente tampoco, y ese es justo el momento en que me quedo sin qué
contestar"*. Detectó que el texto decía "pasaron 3 meses" para un tramo de 87 días. Y
señaló la contradicción entre el `~` del resultado y la frase "para no tener que hacer
ninguna estimación".

Su hallazgo más caro no fue un bug: *"esa tabla yo no se la puedo mostrar al cliente,
lo primero que me dice es '¿qué febrero? yo vine en mayo'"*. Notó la anomalía, no la
entendió, y siguió igual. Que es peor que no notarla.

## Consecuencias

Casi todo lo que hoy hace bien la explicación salió de ahí: el título que avisa que la
tabla es un tramo de referencia, la nota fija de que los porcentajes no se suman, el
`~` atribuido a su causa real, las filas prorrateadas que dejaron de llevar el sello
del INDEC.

## Reglas que dejó el método

**Verificar los hallazgos antes de actuar.** El economista dio un número de anclaje
que al recalcularlo dio distinto del mío; la conclusión no cambiaba, pero el número que
quedó en el repo es el que verifiqué. Un revisor puede tener razón en el fondo y
equivocarse en un detalle, y al revés.

**Confirmar lo que está bien, no sólo lo que está mal.** Sin eso se cambian cosas que
funcionaban.

**Darle a la usuaria el material completo.** Vanina pidió un botón de "copiar
explicación" que ya existía: no se lo habíamos mostrado. Ese hallazgo era artefacto del
prompt, no del producto, y confundirlo habría costado trabajo al pedo.
