# Registro de revisión — índices jurisdiccionales

Es el registro del paso 4.3 de la skill `cambiar-la-calculadora`. Acumula **todo** lo que
los revisores levantaron, no sólo lo arreglado: sin los rechazados anotados con su razón,
el loop no converge porque cada vuelta vuelve a traer lo mismo.

## El caso concreto (paso 1)

Una contadora tiene que actualizar un presupuesto de un cliente de Córdoba y el cliente le
discute que la inflación nacional no es la que él ve en su ciudad. Hoy la calculadora sólo
sabe contestar con el nacional.

**Caso de prueba, el mismo en todas las vueltas:** $520.000 de mayo 2024 a junio 2026.

- Nacional: `?monto=520000&desde=2024-05&hasta=2026-06`
- Córdoba: `…&indice=cordoba`
- Neuquén (viene 5 meses atrasado): `…&indice=neuquen`
- Santa Fe con un período que no existe: `?monto=520000&desde=1995-01&hasta=2026-06&indice=santa-fe`
- Región Noreste (no es el índice de ninguna provincia): `…&indice=noreste`
- Un índice que no existe: `…&indice=atlantida`

Servidor: `http://localhost:5175`

## Hallazgos

| # | Hallazgo | Quién | Verificado | Qué se hizo |
|---|---|---|---|---|
| 0 | Un link con `?indice=santa-fe&desde=1995-01` dejaba el desplegable de años en blanco y el sitio contestaba "Mes inválido: -01" | yo, abriendo el browser antes de despachar | sí, reproducido | arreglado antes de la vuelta 1: el período de la URL pasa por el mismo acotado que el cambio de índice |

### Vuelta 1 — Vanina (usuaria)

**La pregunta que podía frenar el diseño**: el formulario pasó de dos campos a tres.
Contestó que **no le metió ruido** — el campo ya viene contestado, está en su propio
renglón y no le pisa el monto ni las fechas. El diseño sigue.

| # | Hallazgo | Quién | Verificado | Qué se hizo |
|---|---|---|---|---|
| 1 | **Neuquén da $1.761.628 contra $1.012.518 del nacional**, mismo monto y mismas fechas, y la opción marcada "(recomendado)" es la que da el número raro. La otra da $1.125.371: $636.000 de diferencia | usuaria + economista + código | **sí, y peor de lo que reportó**: la inflación real de Neuquén en el tramo disponible (may-24→ene-26) es 90,29%, contra 94,72% del nacional. Los 238,77% salen enteros de correr la ventana hasta dic-2023 y tragarse enero 2024 (+24,50%) | arreglado — ver abajo |
| 2 | La tabla de una región dice `INDEC ✓`, idéntica a la nacional. "Yo a la clienta le mando una foto de la tabla, no la pantalla entera" | usuaria | sí, reproducido en el browser | arreglado: ahora dice `INDEC Noreste ✓` |
| 3 | El aviso de atraso está en el mismo gris y tamaño que la descripción neutra del índice, pegado atrás. Lo leyó recién cuando fue a buscar por qué el número era raro | usuaria | sí | arreglado: nodo propio, renglón propio y fondo de advertencia |
| 4 | El encabezado sigue diciendo "según el IPC del INDEC" con Tucumán elegido | usuaria | sí | arreglado: la bajada sigue al índice |
| 5 | "oficial DE Tucumán" se lee como la preposición «de», no como una sigla | usuaria | sí, aparece 25 veces en el texto que se copia | arreglado: la sigla pasó a "Estadística Tucumán" |
| 6 | `datos.html` decía "sólo diez lo miden" y listaba a Jujuy, pero en el desplegable hay nueve. "Si soy de Jujuy me ilusiono al pedo" | usuaria | sí | arreglado: dice nueve, y Jujuy va en un párrafo aparte con el motivo |
| 7 | "serie empalmada" en la descripción de Córdoba es jerga | usuaria | sí | arreglado |
| 8 | La etiqueta "según el IPC" hace preguntar "¿el IPC qué?" | usuaria | sí, aunque ella misma aclara que no la trabó | arreglado: dice "según el índice" |
| 9 | En celular (390×844) el número grande queda a 739px con el nacional y a 821px con una provincia: hay que scrollear para ver el resultado | usuaria | pendiente de verificar | pendiente |
| 10 | El texto que se copia tiene 25 renglones y no se puede mandar por WhatsApp. Pide un "copiar resumen" además del completo | usuaria | sí, pero es **anterior a este cambio** | **rechazado por alcance**: es un problema real del botón de copiar que existe desde antes y no lo introdujo esta feature. Va a un cambio aparte para no seguir engordando éste — el techo de la skill existe justamente para eso |
| 11 | La tabla arranca en un mes que ella no pidió (dic-2023) | usuaria | sí | es el síntoma del #1, se resuelve con él |


### Vuelta 1 — el economista (metodología)

Verificó los números **contra los archivos publicados por cada organismo**, no contra el
MCP: CABA +100,87%, Córdoba +98,16%, Santa Fe +95,56% y Chaco +91,67% para el caso de
prueba, los cuatro idénticos a la decimal. La cadena organismo → MCP → snapshot → pantalla
no pierde una cifra, y se confirma que no se reescala.

| # | Hallazgo | Verificado | Qué se hizo |
|---|---|---|---|
| 12 | **El rótulo "Regiones del INDEC (para las provincias que no miden)" es una recomendación que los datos no respaldan.** Entre las 8 provincias que sí miden y están dentro de una región, la región le acierta más que el nacional apenas 3 de 8 veces. Río Negro dio +72,10% contra +98,72% de su Región Patagónica: 26,6 pp, $138.429 sobre $520.000 | sí, midió las 8 provincias en cuatro períodos | arreglado: el rótulo dice "Regiones del INDEC" a secas. El `cubre` ya hace el trabajo y el economista lo dio por impecable |
| 13 | **"Mendoza mide desde abril 2016" es falso**: Mendoza mide desde 1968 y publicó de corrido de 1988 a 2012. Lo que arranca en 2016 es *nuestra* serie, después del recorte. Igual de falso para Córdoba y Chaco | sí, contra la descripción del propio MCP | arreglado: "La serie de Mendoza que usamos arranca en abril 2016" |
| 14 | **El umbral 0,01 garantiza cinco cifras significativas, no cuatro**: el comentario estaba errado por un orden de magnitud. Con 1e-3 se recuperarían 20 meses de Chaco y 19 de Tucumán | sí, la cuantización de `numeric(20,6)` es 1e-6 | comentario corregido. **Bajar el umbral queda pendiente y anotado**: el mismo criterio vive en los colectores del MCP, que son los que recortan Córdoba y Río Negro. Se cambia en los dos repos o en ninguno |
| 15 | **El criterio de la ventana corrida no puede ser cuántos meses se corre, sino qué arrastra.** Con `d=1` sobre diciembre de 2023 la distorsión ya llega al 23%; con `d=5` en un tramo estable queda en 2,6% y es defendible | sí, simuló 16.200 períodos del nacional desde 2004 | **arreglado, es el bloqueante**: `sesgoDeLaVentana` calcula la distorsión exacta —la inflación de los `d` meses que la ventana mete sobre la de los `d` que saca— y por encima del 10% la opción deja de ofrecerse. Con el catálogo de hoy **el único índice que cambia de comportamiento es Neuquén**, y hay un test que lo fija |
| 16 | El REM deshabilitado fuera del nacional | sí | **confirmado correcto, no se toca.** Propuso una alternativa (aplicar la senda nacional al índice provincial diciendo el supuesto) y él mismo la desaconsejó: no compra precisión y le pone el nombre del BCRA a un número que el BCRA no calculó |
| 17 | El recorte por continuidad de Mendoza | sí, las 16 series quedan sin un hueco | **confirmado correcto, no se toca** |
| 18 | **El dominio del Chaco está muerto**: `estadistica.chaco.gob.ar` no resuelve, el vivo es `dipiet.chaco.gob.ar` | sí, lo verifiqué yo por DNS | URL corregida. **La sigla del sello queda en IPECD**: el economista aclaró que no confirmó el acto formal de renombramiento y el propio MCP sigue devolviendo ese nombre. Cambiar el rótulo de autoridad de una fila por una inferencia de DNS sería peor que dejarlo viejo |

### Vuelta 1 — el revisor de código

Veredicto: **no publicar todavía**, por tres cosas que se disparan solas. Verificó primero
lo que estaba bien, con evidencia: la atribución sigue al índice en los siete lugares donde
tenía que seguirlo (sello, párrafo, rótulo, nota legal, texto copiado, CSV y nombre del
archivo), la API key no se acercó al browser, el gráfico pinta con un índice provincial
(33.099 píxeles en 305 columnas), y las páginas por año siguen siendo nacionales y
coherentes.

| # | Hallazgo | Verificado | Qué se hizo |
|---|---|---|---|
| 19 | **Un 404 en el archivo de un índice deja el desplegable diciendo Tucumán y la pantalla entera mostrando Mendoza**, sellos incluidos, sin ningún error visible | sí, lo reprodujo interceptando la request | arreglado: el `.catch` devuelve el control al índice que se está mostrando y explica qué pasó |
| 20 | **El acotado sólo miraba el piso.** Un índice que se atrase hasta cruzar un año deja el año elegido sin `option` y el sitio contesta `Mes inválido: "-05"` | sí, lo reprodujo sirviendo un Neuquén congelado en junio 2025 | arreglado: `rangoPedible()` es ahora la única fuente del rango, y acota las dos puntas |
| 21 | **En 15 de los 16 índices el primer año ofrece meses que el motor rechaza.** Con Santa Fe se podía elegir enero 2013 y el sitio contestaba "no hay datos anteriores a diciembre 2013" | sí | arreglado: los meses fuera de rango quedan deshabilitados en el primer y el último año |
| 22 | **La guarda de "un snapshot no puede encoger" no cubría al catálogo**, que tiene `indices` y no `datos`: la comparación quedaba en `0 < 0`. Y ningún test se enteraba de un catálogo al que le faltaran provincias, porque todos **iteran el catálogo** | sí | arreglado: la guarda cuenta las dos formas, y hay dos tests nuevos —el catálogo tiene una entrada por índice declarado, y no quedan archivos huérfanos en disco— |
| 23 | **La opción del REM decía "(sólo para el índice nacional)" incluso estando en el nacional**, cuando el pipeline no había podido bajar el REM. Un control gris que explica un motivo falso es peor que uno sin explicación | sí, lo reprodujo sirviendo un `ipc.json` sin `rem` | arreglado: el texto sale de por qué está gris |
| 24 | **`datos.html` bajaba los 16 archivos completos (~400 KB) para leer una columna**, y un solo 404 dejaba la tabla entera en el guión | sí | arreglado: las siglas viajan en el catálogo, que ya se estaba bajando |
| 25 | El selector de índices se armaba con `innerHTML` sobre datos del snapshot, mientras `datos.ts` —del mismo commit y con los mismos datos— construía con nodos | sí | arreglado: nodos en los dos, y también en los desplegables de mes y año |
| 26 | El FAQ seguía contestando "¿Desde qué año hay datos? Desde enero de 1990", falso para 10 de los 16, y comprobable en la misma pantalla. Duplicado en el JSON-LD | sí | arreglado en los dos lugares |
| 27 | Textos menores: "Seis llamadas de quota" (son 21), la invariante del encabezado, la bajada de `datos.html`, y la sección "Sobre la precisión" que no mencionaba el error heredado de los índices provinciales | sí | arreglados |
| 28 | **Un índice que se recorta más que ayer queda congelado para siempre** y la única señal es un `console.warn` en un job que termina en verde | sí, es real | **pendiente, va aparte.** Es una mejora del monitoreo del pipeline, no un defecto de lo que se ve en pantalla, y arreglarlo bien es agregar señal de frescura con ancla absoluta — un cambio propio |
| 29 | El techo de 24 meses se cumplía en los campos de fecha pero no en los desplegables, que acotan por año | sí, pudo pedir diciembre 2028 con Santa Fe | arreglado por el mismo `rangoPedible()` del #20 y #21 |
| 30 | En el server de desarrollo `/inflacion-2024/` sirve la calculadora, no la página por año | sí | **no es un hallazgo del producto**: es cómo Vite hace fallback. Anotado para que la próxima revisión no lo redescubra |
| 31 | El texto que explicaba por qué «no estimar ninguno» está gris hablaba siempre del destino futuro | sí, lo vi yo al verificar el arreglo del #1: decía "el mes de destino todavía no llegó" sobre un pedido a junio, estando en agosto | arreglado: el motivo lo contesta el motor, en la misma evaluación que decide si la opción se ofrece |


---

## Vuelta 2

### Vanina (usuaria)

**Neuquén cerrado.** *"Sí, este número se lo muestro a una clienta. Le puedo decir 'en
Neuquén todavía no salieron los últimos cinco meses, así que esto es una cuenta con el
último dato que hay'. Lo otro, el de $1.761.628, no se lo podía mostrar a nadie."* La tabla
arranca en su mes y las cinco filas estimadas dicen `estimado`.

**El rótulo sin el paréntesis: aprobado.** *"No quedó suelto… me gusta más que antes, porque
el paréntesis viejo me estaba empujando a elegir región si mi provincia no estaba."*

Confirmó además que funcionan el sello `INDEC Noreste ✓` ("ahora sí le saco la foto a la
tabla"), el encabezado de ida y de vuelta, "oficial Estadística Tucumán", los meses grises
de Santa Fe en 2013, y `datos.html`.

| # | Hallazgo | Verificado | Qué se hizo |
|---|---|---|---|
| 32 | Las opciones de región no dicen qué provincias tienen adentro: hay que elegir a ciegas y leer el párrafo de abajo para saber si te tocaba | sí | arreglado: el renglón del desplegable las lleva, "Región Noreste (Corrientes, Chaco, Formosa, Misiones)" |
| 33 | **La descripción de las regiones decía "Lo publica el INDEC, que lo publica para la región noreste"** — publica dos veces, y la región en minúscula | sí, lo rompí yo en la vuelta 1 | arreglado: la cláusula sobraba entera |
| 34 | **Sacar "serie empalmada" empeoró la descripción de Córdoba**: la reemplacé por dos frases que tampoco se entienden ("lo publica encadenado", "los números son tan chicos que se pierden cifras") | sí, lo rompí yo en la vuelta 1 | arreglado: "Índice provincial de Córdoba, con datos desde 1990". El porqué queda en la página de fuentes |
| 35 | El renglón del medio del párrafo que explica por qué la opción quedó gris es palabrerío: "tramo", "referencia" y "reemplaza" no significan nada | sí | arreglado: se borró. Queda "este índice viene atrasado" + la consecuencia, que es la parte que sirvió |
| 36 | "¿Y para qué está la región, entonces?" — al sacar el paréntesis, el grupo quedó sin justificación visible | sí, es una consecuencia directa del arreglo #12 | contestado en `datos.html` con el número: la región le acierta a tu provincia más que el nacional tres de cada ocho veces |
| 37 | En celular el aviso de atraso arranca a 959 sobre una pantalla de 844: queda abajo del corte | sí | **rechazado**: el cartel ESTIMADO sí se ve sin scrollear (755), que es la advertencia que no se puede perder. Bajar el aviso de atraso más arriba significa subirlo por encima del número, que es de donde lo mudamos justamente porque ahí se salteaba. Ella misma dijo "lo dejaría así" |
| 38 | El número grande en celular entra con 29 puntos de margen: "en mi iPhone de verdad, con la barra de abajo de Safari, me la juego a que lo veo cortado" | sí | **anotado, no resuelto.** Ya pasaba antes de este cambio y arreglarlo es rediseñar el alto del formulario. Va aparte, junto con el #10 |
| 39 | El texto que se copia tiene 33 renglones con Tucumán | sí | **rechazo confirmado por ella misma**: *"es una molestia mía, no un riesgo… déjenlo para el cambio aparte, me parece bien"* |

### El economista (metodología)

Verificó la fórmula contra su propia derivación: es la misma, verbatim, con la sustitución
correcta y el umbral en el lugar que no se puede separar del desplegable. Confirmó también
que **el rótulo de las regiones sin el paréntesis alcanza** —"lo que había que sacar era la
afirmación que los datos no bancan, y ya no está. No agregues nada"—, que esperar para bajar
el umbral 0,01 es la decisión correcta ("tu razón es mejor que mi hallazgo: es la regla 4
cruzando repos"), y que dejar la sigla del Chaco en IPECD corresponde hasta que cambie el
upstream.

| # | Hallazgo | Verificado | Qué se hizo |
|---|---|---|---|
| 40 | 🔴 **El mismo bug estaba espejado hacia atrás.** El guard se anclaba en `desde`, y deflactando —de junio 2026 a mayo 2024— `desde` es el extremo nuevo, no tiene dato publicado, y el guard se daba por vencido devolviendo cero. Contestaba −70,48% cuando lo real ronda −44%, otra vez desde la opción «(recomendado)» | sí, lo reprodujo en pantalla y yo después | arreglado: se ancla en el extremo **viejo**, que es el que arrastra los meses vaya el cálculo en la dirección que vaya. Test del caso hacia atrás agregado |
| 41 | El cartel decía "daría un número bastante **más alto**", pero el sesgo se mide en valor absoluto: de los períodos que bloquea, 119 darían uno más **bajo**, y el caso deflactando es siempre en esa dirección | sí | arreglado: "bastante distinto de" |
| 42 | "Neuquén es el único índice que cambia" es cierto para el caso testeado, pero sobre una grilla de períodos 12 de los 16 tienen algún período que ahora se bloquea | sí, y revisó caso por caso | **confirmado correcto, no se toca**: no encontró un solo falso positivo. Son `A` parado sobre el pico dic-2023/ene-2024 y `A` en la hiper del 89/90, o sea exactamente lo que el criterio existe para atrapar |
| 43 | Si `U−d` cayera antes del primer mes de la serie no habría tramo de referencia y el guard devolvería 0 sin bloquear | sí, y verificó que **hoy no se puede llegar** | **rechazado por ahora**: haría falta una serie futura, corta y atrasada. Él mismo recomendó dejarlo |
| 44 | El FAQ sigue diciendo "Desde enero de 1990" | **no se sostiene**: lo verifiqué y ya estaba arreglado en `e0c5638`, en el `<details>` y en el JSON-LD. Su revisión miró un rango de commits anterior | nada que hacer |
| 45 | Ofrecer sólo la estimación cuando existe una respuesta con datos reales ($989.502 hasta enero 2026) | sí | **rechazado, con su acuerdo**: "no son respuestas a la misma pregunta". $989.502 es la inflación hasta enero 2026 y la pregunta era hasta junio; presentarla como la respuesta sería pasar una cota inferior por una estimación. Su punto intermedio —una oración con el dato publicado al lado— queda anotado para el cambio aparte |

### El revisor de código

Verificó positivamente: `rangoPedible` es una fuente única de verdad (0 diferencias en los
dieciséis índices y cuatro bordes de diciembre), `motivoParaEstimar` y `sePuedeEvitarEstimar`
nunca se contradicen (54.883 pares, 0 desacuerdos), `sesgoDeLaVentana` no tira en ~57.000
casos, `datos.html` hace exactamente dos pedidos a `/data/`, y la recuperación del 404 no
deja ningún `unhandledrejection`. Sus hallazgos #1 y #4 son los mismos #40 y #41 del
economista, ya arreglados en `a75f17c` — su revisión miró el commit anterior.

| # | Hallazgo | Verificado | Qué se hizo |
|---|---|---|---|
| 46 | 🔴 **Los tres tests de la ventana corrida rompen el pipeline diario el día que Neuquén publique.** Piden "2024-05" → "2026-06" sobre el archivo vivo y dan por sentado enero 2026: con febrero, el desplazamiento baja a cuatro, la ventana deja de tragarse enero 2024 y se ponen rojos sin que nadie toque el código. Y el job diario corre `verificar` **antes** de commitear, así que un dato nuevo de Neuquén dejaría de publicar el mes nuevo de los dieciséis, el nacional incluido | sí | arreglado: la regla se prueba sobre dos series sintéticas —la misma con y sin un salto adentro del tramo que arrastra la ventana— y el caso real de Neuquén queda con los números de verdad pero recortado a enero 2026 y con `hoy` fijo. Seis tests se ponen rojos si se afloja el umbral. El que barría el catálogo tenía el mismo problema: ahora pide de punta a punta de cada archivo, donde el desplazamiento es cero y un bloqueo sería un falso positivo real |
| 47 | 🔴 **`#aviso-atraso` se quedaba pegado al volver al nacional.** El nodo se mudó a la tarjeta del resultado y el early return del nacional pasa **antes** del bloque que lo escribe: "Ojo: Neuquén publicó hasta enero 2026, 5 meses detrás" abajo del número del INDEC, que está al día. Se dispara sin tocar el selector, volviendo | sí, reproducido en browser | arreglado: el atraso se calcula siempre, antes de cualquier `return`. Con el nacional da cero y el nodo se apaga solo. Verificado en browser: al volver queda vacío y oculto |
| 48 | **La nota del acotado explicaba el piso aunque se hubiera topado con el techo.** `escribirPeriodoAcotado` empezó a acotar por las dos puntas pero seguía devolviendo un solo punto, y el texto era fijo: con `?indice=neuquen&hasta=2029-05` decía "la serie arranca en noviembre 2001, así que se corrió el período: pediste desde mayo 2029" — las dos mitades falsas | sí | arreglado: devuelve qué punta y contra qué extremo, como `motivoParaEstimar`. Verificado en browser el caso del techo y el de las dos puntas juntas |
| 49 | El error de carga anidaba ("No se pudo cargar ese índice (No se pudo cargar el índice (HTTP 404))") y el único nombre de la oración era el del índice que **sí** quedó en pantalla | sí | arreglado: `cargarIndice` tira sólo la causa y el que llama arma la oración. Verificado en browser: "No se pudo cargar Tucumán (HTTP 404). Se sigue mostrando Santa Fe." |
| 50 | `rangoPedible` rehacía la aritmética de meses en vez de usar `mes.ts` | sí | arreglado: `sumarMeses` |
| 51 | Tres fechas escritas a mano en el FAQ nuevo (Chaco 1988, Santa Fe diciembre 2013, las regiones diciembre 2016) que quedan falsas si cambia el arranque de una serie | sí, y ya pasó adentro de este cambio con Mendoza | arreglado con un test. **Ese sí tiene que frenar el pipeline**: que un índice publique un mes nuevo es normal, que cambie dónde arranca es raro y mientras el texto no se corrija la página afirma algo falso |
| 52 | `tests/_zz_v2.test.ts` quedó sin trackear y corriendo adentro de `npm run verificar` | sí | borrado, junto con `probe.ts` y `probe2.ts` |

---

## Vuelta 3

Los tres revisores otra vez en paralelo, sin verse. Verdicto de los tres: **no publicar
todavía** — cada uno encontró algo real y distinto.

### Vanina (usuaria)

Confirmó que los cuatro arreglos de la vuelta 2 funcionan y no rompieron nada: el aviso de
atraso se apaga solo al volver al nacional, la nota del acotado dice la causa real en los
tres casos (piso, techo, los dos), el error de carga nombra bien al que falló. Encontró una
regresión que bloqueaba publicar y una de usabilidad.

| # | Hallazgo | Verificado | Qué se hizo |
|---|---|---|---|
| 53 | 🔴 **El primer renglón del texto que se copia —el que se manda a una clienta— tenía el sujeto invertido, hasta en el nacional.** Al sacar el "El INDEC" fijo de `armarExplicacion`, quedó "Todavía no publicó los 24 meses que van de julio 2026 a junio 2028 el IPEC, el instituto de estadística de Santa Fe" — el sujeto tirado al final de una lista de meses. Antes de este cambio decía "El INDEC todavía no publicó…", con el sujeto primero | sí, y confirmó que afectaba también al nacional: "Todavía no publicó los 5 meses que van de julio 2026 a noviembre 2026 el INDEC" | arreglado: el sujeto vuelve primero, usando `quienPublicaAhora` capitalizado. Verificado interceptando `clipboard.writeText` en browser, con Santa Fe y con el nacional |
| 54 | La nota con las dos puntas corridas empuja el cartel ESTIMADO y el número fuera de la pantalla en celular (390×844): con `desde` y `hasta` corridos, el cartel arrancaba en 884px, más abajo que el corte de pantalla | sí, medido en 390×844 con las dos puntas corridas | mejorado: las dos oraciones de `fraseDelCorrido` se combinan en una sola cuando se corren las dos puntas ("Santa Fe tiene datos de… y el cálculo no estima más allá de…, así que se corrió el período: pediste de… a…"). El cartel pasa de 884px a 841px, la cifra de ~910px a 866px. Sigue quedando justo en el borde del pliegue, no completamente arriba: una solución completa implicaría mover la nota de lugar, que ya se decidió no hacer en la vuelta 2 para el aviso de atraso |
| 55 | Con Neuquén y el techo corrido, dos frases seguidas empiezan igual ("el cálculo no estima más allá de…" / "El cálculo no puede llegar más allá de…") con meses distintos (2028 y "ese mes" = enero 2026), una arriba y otra abajo del número | sí | **anotado, no resuelto en esta vuelta**: es una arista real pero no bloqueaba publicar por sí sola, y las dos frases tocan código de sesiones distintas (la nota del acotado y `#aviso-atraso`). Queda para el cambio aparte junto con el rediseño del alto del formulario (#38) |

### El economista (metodología)

Verificó que `extremoViejo` sigue en pie (47.574 pares, 0 asimetrías) y que el catálogo
sintético prueba de verdad "cero" contra "mucho" pero no dónde está el corte del 10%.
Encontró un bug metodológico **anterior a este cambio**, multiplicado por dieciséis: un
período enteramente publicado, con el destino cayendo el día 1 de un mes, entraba por la
ventana corrida en vez de calcular directo — porque `desplazamientoNecesario` medía sobre
`mesDe(punto)` en vez de sobre `mesTopeNecesario(punto)`, que el propio archivo ya usaba en
otro lado para la misma pregunta.

| # | Hallazgo | Verificado | Qué se hizo |
|---|---|---|---|
| 56 | 🔴 **Un período ya publicado entero se contestaba con los meses equivocados, en la opción "(recomendado)", en los 16 índices.** `1-jul-2025 → 1-jul-2026` (el ajuste anual de alquiler, la consulta más común) contestaba +33,20% ($692.622) usando mayo 2025 a mayo 2026, cuando lo publicado da +33,55% ($694.448) con junio a junio, y afirmaba que "el INDEC todavía no publicó julio de 2026" sin que julio hiciera falta. Es anterior a este cambio (`c98e7c1`) pero el selector de índices lo multiplicó por 16: peor caso, Río Negro, $10.567 de diferencia sobre $520.000 a un año | sí, reproducido con datos reales antes y después del arreglo | arreglado: `desplazamientoNecesario` mide sobre `mesTopeNecesario`, y `valorEn` deja de pedir el índice del propio mes en un día 1 —matemáticamente no le hace falta, `fraccionDeMes` da 0—. Verificado: $692.621,91 → $694.448,20, exacto al cálculo directo a mano. Rompió dos tests que documentaban el síntoma como si fuera correcto; se reescribieron como casos `directo` |
| 57 | 🔴 **Consecuencia directa del #56, y esta sí introducida por este cambio: el guard nuevo deshabilitaba "no estimar ninguno" sobre períodos 100% publicados**, con la tarjeta contradiciéndose a dos renglones de distancia ("Todos los meses son datos oficiales" arriba, "este índice viene atrasado" abajo). 131 combinaciones (índice, fecha), 13 en el nacional | sí, con CABA en pantalla | arreglado por el mismo cambio del #56. Verificado en browser: "no estimar ninguno (recomendado)" vuelve a estar habilitada para CABA en el caso que fallaba |
| 58 | 🟠 El umbral de 0,1 no estaba ejercido por ningún test: cualquier valor entre 0,05 y 0,55 pasaba las 273 pruebas (mutación exhaustiva, 0,0001 a 0,6) | sí | arreglado: dos series sintéticas más, con el salto calibrado por bisección justo a los dos lados de la frontera real (0,115 pasa, 0,13 bloquea, frontera en 0,122). Verificado con la misma mutación: ahora cualquier valor entre 0,05 y 0,55 rompe al menos un test |
| 59 | 🟡 El comentario que justificaba el umbral decía "1,4% de las veces" para un mes de corrimiento; recalculado da 3,14–3,17% (dos cálculos independientes coinciden), y no mencionaba que la mayoría de los índices opera con dos meses de corrimiento, no uno, donde el 10% se toca 10,3–10,4% de las veces | sí, recalculado con la serie nacional completa desde 2004 | arreglado: el comentario cita los números recalculados para uno y dos meses de corrimiento, y linkea a este documento |
| 60 | 🟡 El criterio metodológico más grande de este cambio —cuándo se apaga "(recomendado)"— no estaba en `docs/decisiones/` | sí | arreglado: agregado a las consecuencias de la 0010 |
| 61 | ⚪ El guard deja pasar hasta 10% de distorsión bajo "(recomendado)" sin decir cuánto (`1990-04 → 2026-07` nacional: 9,3% de brecha entre estimar y no estimar, servida sin number) | sí | **fuera de alcance**: el guard ya calcula ese número; mostrarlo es una mejora de texto, no un defecto, y queda para el cambio aparte |

### El revisor de código

Partió de que el árbol de trabajo estaba sucio con la corrección del hallazgo #53 en curso
—lo señaló sin tocarlo, y confirmó su veredicto contra `45e3f10` limpio—. Encontró que la
familia de bug del #46 no se había erradicado, sólo movido: otras dos bombas de tiempo
exactamente iguales en otros archivos de test, una a días de explotar.

| # | Hallazgo | Verificado | Qué se hizo |
|---|---|---|---|
| 62 | 🔴 **`tests/adjust.test.ts` tenía el mismo bug del #46, sin congelar: `serie` es `ipc.json` vivo** (nacional, `ultimo_oficial` 2026-06) y un test fijaba `hasta="2026-08"` esperando `mesesSinPublicar: ["2026-07","2026-08"]`. Y es inminente: CABA, Córdoba y Río Negro **ya están en julio**, el nacional a días de seguirlos | sí, agregando julio a un snapshot de prueba y corriendo el test, que se rompió | arreglado: la serie se recorta a junio 2026 con el mismo patrón que Neuquén (copia congelada + test centinela que el recorte no se quede corto) |
| 63 | 🔴 Segunda bomba en `tests/indices.test.ts`: "no sella las filas estimadas" pedía Córdoba de enero a septiembre 2026 dando por sentado que no iba a publicar agosto ni septiembre. Simulado con +2 meses de publicación, ya se rompía | sí | arreglado: `hasta` sale de `sumarMeses(serie.ultimo_oficial, 2)`, con `hoy` igual, no de un literal |
| 64 | 🟠 Tercera bomba en `tests/fuente.test.ts`, más lejos (~enero 2027) y anterior a este cambio, pero misma familia: un período fijo "2026-12 → 2027-05" asumía que el nacional no iba a publicar diciembre | sí | arreglado: `desde`/`hasta` salen de `sumarMeses(serie.ultimo_oficial, …)` |
| 65 | 🟡 El barrido "no toca a ningún otro índice del catálogo" de la vuelta 2 (hallazgo #46) quedó **vacío sin que nadie se diera cuenta**: pedir de punta a punta de cada archivo da desplazamiento cero, y `evaluarPeriodo` corta ahí antes de llegar a `sesgoDeLaVentana`. Con el umbral en `-1` (bloquear todo) o en `1000` (no bloquear nada) el test no se movía en ningún caso | sí, con la misma mutación que ya se usaba para el umbral | arreglado, y no trivialmente: el primer reemplazo (`primerMes`+24 meses) caía sobre la hiperinflación de 1989/90 para Chaco y Tucumán, un bloqueo legítimo y no un falso positivo; el segundo (2 años antes de `ultimoOficial`, desplazamiento 3) tocaba la devaluación real de 2023/24 en 9 de 16 índices, también legítimo. El que quedó: desplazamiento de 2 meses —el borde de `MESES_DE_ATRASO_TOLERADOS`— sobre los dos años antes de `ultimoOficial` de cada índice, salvo Neuquén (que a esa distancia también bloquea de verdad, y ya lo prueba el describe de abajo) |
| 66 | 🟡 `datos.html` y la decisión 0010 seguían diciendo "cuatro cifras significativas" cuando el propio comentario de `fetch-snapshot.ts` decía "cinco" desde la vuelta 1, y el ejemplo de la misma oración (Córdoba en 0,016615) tiene cinco cifras, no cuatro | sí | arreglado en los dos lugares |
| 67 | 🟡 El test de las fechas del FAQ (#51) comparaba a Chaco y Córdoba **al mes**, cuando la página sólo afirma el año para esos dos. Bajar el umbral de cifras significativas —ya anotado como pendiente— podría mover el arranque de Chaco unos meses sin volver falso ningún texto, y el test frenaría el pipeline igual | sí | arreglado: Chaco y Córdoba se comparan sólo al año; el nacional y Santa Fe, que sí llevan mes en la página, siguen comparándose al mes |
| 68 | El browser de `mcp__playwright__*` está compartido entre sesiones paralelas, no aislado por sesión | sí, lo detectó comparando `location.href` | **no es un hallazgo del producto**: anotado para que la próxima vuelta con revisores en paralelo lo sepa de antemano |

**276 tests, `tsc --noEmit` y build limpios.** Los hallazgos #53, #56 y #57 eran bloqueantes
por separado; los tres están arreglados y verificados en browser con datos reales. Queda
pendiente, explícitamente fuera de esta vuelta: #54 (el pliegue en celular, mejorado pero no
resuelto del todo), #55 (las dos frases parecidas de Neuquén) y #61 (mostrar la brecha del
9,3% en vez de sólo advertirla).
