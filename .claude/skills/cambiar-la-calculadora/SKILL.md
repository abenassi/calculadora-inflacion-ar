---
name: cambiar-la-calculadora
description: Usar SIEMPRE antes de implementar cualquier cambio en este repo — feature nueva, corrección, cambio de textos o de metodología. Es el loop de desarrollo del repositorio: implementar, hacer revisar por los tres revisores, actuar sobre los hallazgos, y volver a revisar hasta que no aparezca nada nuevo. También sirve para revisar un cambio ya hecho, entrando por el paso 4.
---

# Cambiar la calculadora

La promesa de este sitio no es dar un número: es dar un número que **la persona pueda
defender ante otra persona**. Casi todas las reglas de acá salen de eso.

**Esto no es una checklist que se recorre una vez: es un loop.** Se implementa, se manda a
revisar, se actúa sobre lo que vuelve, y se manda a revisar de nuevo. Se corta cuando una
vuelta no trae nada nuevo, o cuando lo único que trae son cosas con las que no estás de
acuerdo y podés decir por qué.

```
paso 1  entender el caso
paso 2  implementar
paso 3  verificar que anda          ←──────────────┐
paso 4  revisar (3 revisores en paralelo)          │
          ├─ arreglaste algo ────────────────────────┘
          └─ no arreglaste nada (nada nuevo, o todo rechazado con razón)
paso 5  cerrar
```

Si venís a **revisar** algo ya implementado (tuyo o ajeno), entrá por el paso 4 — pero
antes escribí el caso concreto del paso 1 (montos y fechas), porque el paso 4 lo pide como
insumo, y abrí el registro del 4.3 vacío. Sin caso, los revisores contestan sobre el sitio
en general; sin registro, la segunda vuelta no puede distinguir un hallazgo nuevo de uno
repetido.

## Paso 0 — Leé el porqué antes de tocar el qué

`docs/decisiones/` tiene una entrada por decisión, con la evidencia que la produjo. Varias
existen porque la alternativa obvia ya se probó y estaba mal.

**No hace falta leerlas todas.** Buscá las que toca tu cambio:

| Si vas a tocar… | Leé |
|---|---|
| El pipeline de datos, el snapshot, la API key | 0001 |
| La interfaz, agregar modos o presets | 0002 |
| Meses sin publicar, las tres metodologías, el desplegable | 0003 |
| Fechas exactas, prorrateo dentro del mes | 0004 |
| Comparar contra el MCP u otra calculadora | 0005 |
| El REM | 0006 |
| Cómo se revisa (el loop de acá) | 0007 |
| Analytics, privacidad, qué se mide | 0008 |
| Los índices provinciales, el guard de sesgo | 0010 |
| El CSV de descarga | 0011 · 0014 |
| La ventana de referencia, el prorrateo por día | 0013 |
| Los rótulos de la tabla, el sello, deflactar | 0014 |

## Las reglas que no se negocian

**1. El sitio no llama al MCP en runtime.** Un Action diario baja las series y commitea
`public/data/*.json`. Así la API key nunca llega al browser, el sitio anda aunque el MCP
esté caído, y queda versionado qué números se mostraron cada día. Si algo parece necesitar
la key en el cliente, el diseño está mal — no hay que ofuscarla.

**2. Dato y estimación nunca se mezclan sin decirlo.** Cada fila y cada porcentaje declara
si es un dato publicado o una cuenta nuestra. Las filas prorrateadas van marcadas y **no
llevan el sello del organismo**: ese porcentaje no lo publicó nadie. La mitad que se
olvida es la simétrica: **no prometas dato oficial donde no lo hay.** Si un texto o una
referencia anuncia una parte oficial que en ese caso no existe, la persona la sale a
buscar, no la encuentra y deja de creerle al resto. Los textos que hablan de "el resto",
"las filas resaltadas" o cantidades de meses tienen que ser **contables en pantalla**.

**2 bis. Si cambiás un comportamiento, barré los textos que lo describen.** Es el modo de
falla más repetido acá: la opción quedó deshabilitada pero seguía diciendo "(recomendado)",
y `datos.html` seguía explicando el comportamiento viejo. Buscá el nombre de lo que
cambiaste en `*.html`, en `src/ui/` y en `docs/`.

**3. Un control no ofrece lo que no puede cumplir.** Si una opción no se puede honrar para
el período elegido, se deshabilita y se explica al lado — no se ofrece y después se aclara
abajo que en realidad se hizo otra cosa.

**4. Un criterio se escribe una sola vez.** Si la interfaz y el motor tienen que estar de
acuerdo sobre algo, sale de la misma función, con un test que ate las dos puntas. Duplicar
el criterio es cómo el desplegable termina mintiendo seis meses después.

**5. No se rompe la privacidad del analytics.** Sin IP, sin identificador persistente, sin
cookies. De ahí depende que el sitio no necesite banner ni sea una base de datos personales.
Ver 0008 antes de agregar cualquier medición.

## Paso 1 — Entender el caso real

Escribí en una línea qué le pasa a la persona que va a usar esto. Si no se puede escribir,
probablemente el cambio no tenga un caso de uso atrás — y este sitio ya perdió una vez
funcionalidad por eso (los presets de 0002).

Anotá también **el caso concreto con montos y fechas** que vas a usar para probar. Los
revisores lo van a necesitar y conviene que sea el mismo en todas las vueltas, así se
puede comparar.

## Paso 2 — Implementar

- La aritmética de inflación vive en `src/engine/`. La orquestación y el pintado, en
  `src/ui/`. **No se hace ninguna cuenta en `src/ui/`.**
- Los meses son strings `YYYY-MM` y la aritmética está en `src/engine/mes.ts`, sin `Date` y
  sin zonas horarias. No introduzcas `Date` para operar con meses.
- Todo texto visible va en castellano rioplatense, con vos.
- Si el cambio toca cómo se calcula o cómo se explica, **agregá o actualizá una entrada en
  `docs/decisiones/`**. Si una decisión ya existente queda revertida, se actualiza ese
  documento — no se crea uno nuevo.

## Paso 3 — Verificar que anda

```bash
npm run verificar     # typecheck + tests + build, todo junto
```

Y después, **miralo en un browser de verdad**. No es opcional y no es ceremonia: el gráfico
de barras estuvo roto en producción —las barras se quedaban en cero— pasando todos los
tests, porque nadie lo había mirado.

**Usá `mcp__playwright__*`.** Es el browser que corresponde en este repo. Si no lo tenés,
cualquier otra herramienta de browser sirve; si no tenés ninguna, `npm run dev` y abrilo a
mano — pero entonces decílo, porque cambia cuánto vale lo que verificaste.

**Dejá el servidor levantado en un puerto fijo y anotá la URL**: la vas a necesitar en el
paso 4. Si cada revisor levanta el suyo chocan de puerto cuando corren en paralelo.

Si vas a verificar en producción después de deployar, agregá un parámetro de cache-busting
(`?v=algo`): ya pasó de comparar el hash del bundle, ver que era idéntico, y estar mirando
el HTML viejo de caché.

**No mandes a revisar algo que no verificaste.** Los revisores cuestan, y gastarlos en
encontrar que los tests no pasan es tirarlos.

## Paso 4 — El loop de revisión

Es el paso que más errores encontró en este repo. Y los encuentra porque son **perfiles que
no se superponen**: el número puede estar mal (lo ve quien sabe de índices), puede estar
bien y no entenderse (lo ve quien no sabe), y puede estar bien hoy y empezar a mentir en
tres meses (lo ve quien mira el código). Las tres listas casi no se pisan y las tres suelen
ser ciertas.

### 4.1 — Quiénes van en esta vuelta

Los tres agentes están en `.claude/agents/`. Despachalos **en paralelo y sin que se vean
entre sí**: si uno lee lo que encontró el otro, deja de ser una tercera mirada.

| Agente | Va cuando el cambio toca… |
|---|---|
| **`revisor-economista`** | el motor, las series, el empalme, las metodologías, el prorrateo |
| **`revisora-usuaria`** | algo que se ve o se lee: textos, tabla, gráfico, explicación, el texto que se copia |
| **`revisor-codigo`** | **siempre** |

El de código va siempre, incluso en un cambio de texto: el modo de falla más repetido del
repo es justamente un texto que quedó describiendo un comportamiento que ya no existe, y
eso no lo ve nadie mirando la pantalla.

**Se elige sobre el diff acumulado del loop, no sobre lo que arreglaste en la última
vuelta.** Si no, una vuelta limpia puede ser artefacto de no haber despachado a alguien:
este mismo repo tuvo un cambio que arrancó como corrección de textos y terminó
reescribiendo el rango de meses del motor. Despachado como "textos", el economista nunca
habría visto el motor nuevo y la vuelta habría vuelto vacía por omisión.

**Escalá al tamaño del cambio.** Cambiar una palabra en un título no necesita al
economista. Tocar el empalme de series los necesita a los tres, y probablemente más de una
vuelta.

### 4.2 — Cómo pedirles la revisión

**Dales el material completo.** Una vez se pidió un botón de "copiar explicación" que ya
existía: no se lo habíamos mostrado. Ese hallazgo era artefacto del prompt, no del
producto, y costó trabajo al pedo. Decile a cada uno qué hay en pantalla y qué se puede
tocar.

**Dales el caso concreto**, con montos y fechas reales, no "revisá el sitio". El del paso
1, el mismo en todas las vueltas.

**Y dales la URL del servidor que levantaste en el paso 3**, con el caso ya adentro
(`?monto=&desde=&hasta=&metodo=`). Los tres tienen `mcp__playwright__*` en su definición y
tienen que abrir el sitio: casi todo lo que revisan —el pie de la tabla, la leyenda del
gráfico, el chip, el texto que se copia— lo arma el JS y en `index.html` no existe. Un
revisor que sólo leyó el diff entrega sospechas con tono de certeza, y ya pasó: los cuatro
hallazgos que rompieron la vuelta 2 se confirmaron abriendo el sitio, no leyendo el código.

Pediles que **listen las URLs que abrieron**.

**Y a partir de la segunda vuelta, dales también:**

- **Qué cambió desde su revisión anterior**, para que no vuelvan a auditar lo que ya
  auditaron.
- **El registro de hallazgos rechazados, con la razón.** Sin esto el loop no termina: el
  revisor vuelve a levantar lo mismo cada vuelta y nunca converge. Pediles que, si no están
  de acuerdo con una razón, lo digan **una vez** y con evidencia nueva; no que repitan el
  hallazgo original.

### 4.3 — El registro

Llevá una tabla **en un archivo del cambio** (o en el cuerpo del PR), no en un mensaje de
la conversación. Es lo que hace que el loop termine, y un loop que cruza dos sesiones —o
una compactación de contexto— pierde lo que vivía sólo en un mensaje. Cuando el cambio se
cierra, lo que sobrevive del registro son los desacuerdos, que van a `docs/decisiones/`.

| # | Hallazgo | Quién | Verificado | Qué se hizo |
|---|---|---|---|---|
| 1 | … | usuaria | sí, contra `main.ts:326` | arreglado en la vuelta 1 |
| 2 | … | código | no se sostiene | **rechazado**: … |

**El registro acumula todo lo visto, no sólo lo arreglado.** Si sólo anotás lo que
arreglaste, los rechazados vuelven a aparecer vuelta tras vuelta y el loop no converge
nunca.

### 4.4 — Qué hacer con cada hallazgo

**Verificá cada uno antes de actuar, incluso los del especialista.** Un revisor puede tener
razón en el fondo y equivocarse en el detalle — ya pasó dos veces. El economista dio un
número de anclaje que al recalcularlo dio distinto; la conclusión no cambiaba, pero el
número que quedó en el repo es el verificado. Y los "11 meses" que reportó la usuaria no
eran un error de conteo como parecía: el rango arrancaba antes del punto de partida. **El
diagnóstico correcto sale de la verificación, no del reporte.**

Después, cada hallazgo termina en uno de tres lugares:

- **Arreglado.** Volvés al paso 2.
- **Rechazado, con la razón escrita.** Es una salida legítima y el usuario del loop la
  decide. Pero la razón se escribe: "no estoy de acuerdo" no es una razón, "el CER usa
  meses ya publicados por Res. MECON 47/2002, así que la analogía no aplica" sí. Si el
  desacuerdo sobrevive al final del loop, va a `docs/decisiones/` — una tensión conocida y
  anotada vale mucho más que una que se descartó en silencio.
- **Confirmado como correcto: no se toca.** La lista de lo verificado-y-correcto es tan
  útil como la de hallazgos. Sin ella se cambian por las dudas cosas que funcionaban.

**Si uno refuta una hipótesis tuya, aceptalo.** Ya pasó que una hipótesis sobre etiquetado
parecía obvia, era falsa, y "arreglarla" habría roto algo que andaba.

### 4.5 — Cuándo se corta

Volvés al paso 3 (verificar) y después al 4 (revisar) cada vez que arreglás algo. El loop
termina cuando se cumple una de estas dos:

1. **Una vuelta no trae ningún hallazgo nuevo.** Nuevo se predica de la **evidencia**, no
   del título del hallazgo: si un revisor vuelve sobre algo que rechazaste pero trae un
   caso concreto que antes no estaba, **eso es nuevo y reabre el loop**. Repetir el mismo
   argumento con otras palabras, no.

   Es la diferencia entre un loop que converge y uno que se blinda: si "ya está en el
   registro" alcanzara para cerrar, un rechazo equivocado en la primera vuelta se volvería
   imposible de corregir después, y la salida por desacuerdo dejaría de ser una decisión
   para pasar a ser una trampa. Ya pasó que un hallazgo del tipo "nadie deflacta desde un
   mes futuro" se rechazara por inverosímil y fuera un bug real.
2. **Lo único que trae son hallazgos que rechazás, y la razón está escrita.**

**Ninguna de las dos cuenta si nadie abrió el browser.** Una vuelta cuyos revisores sólo
leyeron el diff no cierra el loop: no vio la mitad de lo que el loop existe para mirar. Si
un revisor avisa que no tuvo herramienta de browser, esa parte queda sin revisar — o lo
volvés a despachar con una, o abrís vos los casos y se los pegás, pero no se da por
cerrada.

Que una vuelta no traiga nada nuevo es información, no una formalidad: es la única
evidencia de que los arreglos de la vuelta anterior no rompieron otra cosa. Arreglar el
hallazgo 3 y romper lo que se había arreglado en el hallazgo 1 es exactamente lo que esta
vuelta existe para atrapar.

**Ojo con la salida por desacuerdo.** Es legítima, pero si estás rechazando todo, el que
está fallando es el loop y no los revisores. Si en una vuelta rechazás más de lo que
arreglás, pará y preguntate si entendieron mal el cambio (probablemente les diste material
incompleto: ver 4.2) o si el que no quiere escuchar sos vos.

### 4.6 — El techo

**Tres vueltas que encuentran cosas.** Si a la tercera siguen apareciendo hallazgos nuevos,
el problema no es que falte una vuelta más: el cambio es demasiado grande para revisarse de
una.

**La vuelta de confirmación no cuenta contra el techo.** El techo limita las vueltas que
encuentran cosas nuevas, no las que verifican que los últimos arreglos no rompieron nada.
Si contara, el techo te obligaría a publicar exactamente el estado que el 4.5 declara no
verificado: arreglás en la vuelta 3 y publicás sin que nadie haya mirado ese arreglo. Una
vuelta de confirmación sobre los últimos arreglos siempre se puede hacer, y con un solo
revisor alcanza si el arreglo fue chico.

Al llegar al techo, lo que se publica es lo que **pasó una vuelta limpia**. Los arreglos de
la última vuelta que no la pasaron se confirman o se revierten — no se publican a mitad de
camino. Y lo que queda pendiente se parte en un cambio aparte, con dos condiciones que sin
ellas el techo es nominal: **la partición tiene que ser estrictamente más chica** que lo
que ya cerraste, y **el registro viaja con ella**. Si no, el mismo hallazgo sin resolver
puede saltar de cambio en cambio para siempre, con presupuesto fresco cada vez.

## Paso 5 — Cerrar

- `docs/decisiones/` actualizado si el cambio movió una decisión, **y con los desacuerdos
  que quedaron abiertos**.
- El README sigue diciendo la verdad. Ya pasó de documentar lo contrario de lo configurado,
  que es peor que no documentar: el siguiente "arregla" algo que estaba bien.
- Mensaje de commit que explique **por qué**, no qué. El qué está en el diff.
