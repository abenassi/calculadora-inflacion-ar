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
