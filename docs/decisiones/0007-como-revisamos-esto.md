# 0007 · El loop de revisión, con tres perfiles que no se superponen

## Contexto

La promesa del sitio es que el resultado sea **defendible ante otra persona**. Eso
falla de dos maneras que no se detectan igual:

- El número está mal o el método no se sostiene. Lo ve alguien que sabe.
- El número está bien pero nadie entiende de dónde salió. Lo ve alguien que no sabe.

Y hay una tercera, que no se ve en ninguna de las dos: el número está bien **hoy** y el
código quedó en un estado donde va a empezar a mentir en tres meses. Un desplegable que
duplica un criterio del motor da bien el día que se escribe.

Un solo revisor no encuentra las tres.

## Decisión

Cada vez que se toca este repo se revisa con **tres perfiles que no se superponen, en
paralelo y sin que se vean entre sí** — y no una vez, sino **en loop**: se implementa, se
revisa, se actúa sobre lo que vuelve, y se revisa de nuevo hasta que una vuelta no traiga
nada nuevo.

> **Los tres están escritos y versionados** en [`.claude/agents/`](../../.claude/agents/):
> `revisor-economista`, `revisora-usuaria` y `revisor-codigo`. Dejaron de ser un prompt que había que
> reconstruir de memoria cada vez — que era la forma más fácil de que el método se perdiera
> o se degradara sin que nadie lo notara. El paso a paso para invocarlos está en la skill
> [`cambiar-la-calculadora`](../../.claude/skills/cambiar-la-calculadora/SKILL.md).

- **Un economista especialista en índices de precios.** Audita contra el código y los
  datos reales, no contra la descripción. Se le pide explícitamente que sea exigente y
  que confirme lo que está bien, para no cambiar por las dudas cosas que funcionan.
- **Una usuaria que necesita el número para trabajar y no maneja porcentajes.** Es una
  estilista que actualiza presupuestos y tiene que contestarle al cliente *"¿por qué me
  subiste tanto?"*. Contesta en primera persona, no como consultora de UX.
- **Un revisor de código**, que no busca estilo sino las formas concretas en que este repo
  ya se rompió: criterios duplicados entre la interfaz y el motor, textos que quedaron
  describiendo el comportamiento viejo, cuentas filtradas a la capa de pintado, la API key
  acercándose al browser. **Va siempre**, incluso en un cambio de texto — porque el modo de
  falla más repetido del repo es justamente un texto desactualizado, y eso no lo ve nadie
  mirando la pantalla.

## Qué encontró cada uno

De la primera corrida, cuando los perfiles eran dos. No se superpusieron casi nada, y las
dos listas eran ciertas.

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

## La primera corrida con los agentes ya versionados

Apenas quedaron escritos en `.claude/agents/`, se despachó a `revisora-usuaria` contra
producción con un caso concreto, para ver si un agente versionado rinde lo mismo que el
prompt reconstruido a mano. Rindió: encontró que tres partes de la pantalla decían
7, 8 y 11 para la misma cantidad de meses, que el pie prometía "el resto son datos
oficiales" sin haber ninguno, y que el texto que se copia le atribuía al INDEC un
porcentaje que el INDEC no publicó. Todo eso está en
[0003](0003-los-meses-que-el-indec-no-publico.md).

Dos cosas que confirma el método más que el hallazgo:

- **Encontró regresiones del cambio que la había motivado.** La opción deshabilitada
  seguía diciendo "(recomendado)" y `datos.html` seguía describiendo el comportamiento
  viejo. Cambiar un comportamiento y no barrer los textos que lo describen es el modo
  de falla más repetido de este repo.
- **Confirmó explícitamente lo que estaba bien**, y eso evitó trabajo: el cartel que
  explica por qué la opción está en gris quedó intacto.

Se verificó cada hallazgo contra el código antes de tocar nada, y uno cambió de forma al
verificarlo: los "11 meses" no eran un error de conteo sino que el rango arrancaba antes
del punto de partida. El diagnóstico correcto salió de la verificación, no del reporte.

## Por qué es un loop y no una revisión

Una sola pasada asume que arreglar un hallazgo no genera otro. Acá pasó lo contrario: el
cambio que deshabilitó una opción del desplegable **generó dos textos nuevos que quedaron
mintiendo** —la opción gris seguía diciendo "(recomendado)" y `datos.html` seguía
describiendo el default viejo— y esos aparecieron recién en la revisión, no en la
implementación. Una revisión que no se repite después de arreglar no puede ver el daño de
sus propios arreglos.

Entonces: implementar → verificar → revisar → actuar → **volver a verificar y revisar**.

**Cuándo se corta.** Cuando una vuelta no trae ningún hallazgo nuevo, o cuando lo único
que trae son hallazgos que quien implementa rechaza con una razón escrita. Las dos son
salidas legítimas. Que una vuelta vuelva vacía no es una formalidad: es la única evidencia
de que los arreglos de la vuelta anterior no rompieron otra cosa.

**Lo que hace que termine.** Un registro de **todos** los hallazgos vistos, no sólo de los
arreglados, que se les pasa a los revisores en la vuelta siguiente. Si sólo se anota lo
arreglado, los rechazados se vuelven a levantar cada vuelta y el loop no converge nunca.
Esto es lo único del diseño que es estructural y no de criterio: sin el registro, el loop
está roto aunque todo lo demás esté bien.

**El desacuerdo es una salida, con una condición.** Quien implementa puede rechazar un
hallazgo y eso corta el loop — pero la razón se escribe. "No estoy de acuerdo" no es una
razón; "el CER usa meses ya publicados por Res. MECON 47/2002, así que la analogía no
aplica" sí. Si el desacuerdo sobrevive al final, va a `docs/decisiones/`: una tensión
conocida y anotada vale mucho más que una descartada en silencio. Justamente por eso la
crítica metodológica que quedó abierta en [0003](0003-los-meses-que-el-indec-no-publico.md)
está escrita ahí y no borrada.

**El techo son tres vueltas.** Si a la tercera siguen apareciendo hallazgos nuevos, el
problema no es que falte una vuelta más: el cambio es demasiado grande para revisarse de
una y hay que partirlo. El loop tiene que poder terminar por convergencia, no por
cansancio.

**El riesgo conocido de esta decisión** es que el desacuerdo se use como salida fácil y el
loop termine en la primera vuelta siempre. La defensa es barata y no estructural: si en
una vuelta se rechaza más de lo que se arregla, hay que parar y revisar si los revisores
recibieron material incompleto —que ya pasó, y produjo un hallazgo que era artefacto del
prompt— o si el que no quiere escuchar es quien implementa. Queda anotado porque es una
debilidad real del diseño, no algo que esté resuelto.

## La primera corrida del loop completo, que se justificó sola

La vuelta 1 (revisora usuaria) produjo los arreglos que están en
[0003](0003-los-meses-que-el-indec-no-publico.md). La vuelta 2 la hizo el revisor de
código recién escrito, sobre esos mismos arreglos, y **encontró que dos de ellos habían
roto casos que antes andaban**:

- Deflactando hacia atrás —destino anterior al origen— la lista de meses quedaba vacía y
  el sitio decía *"El INDEC todavía no publicó ,"*, con la coma colgando, también en el
  texto que se copia. El arreglo de la vuelta 1 derivaba el rango desde `desde`, que yendo
  para atrás es la punta **nueva**.
- En modo por día volvía el mismo 7 contra 8 que la vuelta 1 había venido a cerrar: el
  tramo que va del 15 de octubre al 1 de noviembre lleva inflación de octubre, un mes sin
  publicar que el párrafo no nombraba.

Y encontró que la frase nueva *"en esta tabla no hay ningún dato oficial"* contradecía la
fila de partida cuando el origen ya estaba publicado y llevaba su `INDEC ✓` impreso: la
misma falla de la frase que había reemplazado, en espejo.

**Esto es exactamente lo que una revisión de una sola pasada no puede ver**, y es la razón
de que el loop exista. Los arreglos de la vuelta 1 eran correctos en el caso testigo y
rompían los bordes; sin una segunda vuelta se publicaban los tres.

También revisó **la mecánica del loop en sí** y encontró que podía terminar antes de
tiempo. El hallazgo más filoso: definir "hallazgo nuevo" como "que no está en el registro"
blinda los rechazos equivocados, porque un revisor que vuelve con evidencia nueva sigue
trayendo el mismo hallazgo. Con esa regla, un rechazo mal puesto en la vuelta 1 era
imposible de corregir después. Quedó corregido: **nuevo se predica de la evidencia, no del
título del hallazgo.** El resto de sus correcciones a la mecánica —el techo que no cuenta
las vueltas de confirmación, los revisores elegidos sobre el diff acumulado, el registro
como archivo y no como mensaje, la partición estrictamente más chica— están en la skill.

Vale registrar un límite del método que salió de acá: `revisor-codigo` declaraba que hay
que abrir el sitio y no tenía herramienta de browser. Los cuatro hallazgos de arriba los
confirmó abriéndolo; leyendo el diff eran sospechas. **Un revisor que no puede ejecutar lo
que su definición le exige entrega conjeturas con tono de certeza**, así que ahora la
definición dice qué hacer en cada caso y pide marcar las sospechas como tales.
