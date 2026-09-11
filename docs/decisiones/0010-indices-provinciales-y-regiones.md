# 0010 · Calcular con el índice de tu provincia

## Contexto

La calculadora contestaba siempre con la inflación nacional. Es el número correcto para
casi todo, pero no para la discusión concreta que aparece cuando alguien tiene que
justificar un ajuste ante otra persona: *"esa es la del país, en mi provincia los precios
se movieron distinto"*.

Y a veces es cierto. En el primer semestre de 2026 el IPC nacional acumuló 12,6%, el de
CABA 16,0%, el de Córdoba 15,9% y el de Río Negro 13,3%.

## Cuántas provincias miden de verdad

Lo primero que había que averiguar, porque cambia todo el diseño: **de las veinticuatro
jurisdicciones, sólo diez miden su propia inflación.** Chaco, Ciudad de Buenos Aires,
Córdoba, Jujuy, Mendoza, Neuquén, Río Negro, San Luis, Santa Fe y Tucumán.

De esas diez, **Jujuy queda afuera**: publica su índice únicamente en PDF. Un PDF no es
una fuente que se pueda bajar todos los meses sin que alguien lo transcriba a mano, y una
fuente que necesita una persona todos los meses es una fuente que va a quedar vieja.

Quedan nueve. Las otras catorce provincias no tienen índice propio que ofrecer.

## Decisión

**Se ofrecen los nueve índices provinciales y, además, las seis regiones del INDEC**, en
dos grupos rotulados por lo que son: *"Provincias que miden su propia inflación"* y
*"Regiones del INDEC (para las provincias que no miden)"*.

Una región cubre a varias provincias y **no mide a ninguna en particular**. Ofrecerla sin
decirlo sería exactamente la regla 2 al revés: prometer dato oficial donde no lo hay.
Alguien de Formosa elige "Noreste", ve un número, se lo manda a un cliente como "la
inflación de Formosa" y no es. Por eso cada región lleva pegada la frase que enumera a
quién cubre y aclara que no es el índice de ninguna por separado.

El selector va **en el formulario, al final**, para que la línea se siga leyendo como una
oración: *$520.000 de mayo 2024 equivale, en junio 2026, según el IPC Nacional (INDEC)*.

## Por qué esto no viola la 0002

[0002](0002-un-solo-calculo-sin-presets.md) eliminó los presets y dejó la regla: *un
control nuevo tiene que cambiar el resultado, no la decoración*. Este lo cambia — con
Córdoba el mismo monto da $1.030.415 en vez de $1.012.518 — así que pasa. No hay dos
formas de preguntar lo mismo: hay un índice distinto.

Lo que sí se cuidó es que **no le pese a quien no lo necesita**. Con el nacional elegido la
pantalla es idéntica a la de antes: la línea que explica qué mide el índice aparece sólo si
elegís otro, el link que se comparte no lleva ningún parámetro nuevo, y el archivo de cada
índice se baja recién cuando lo elegís. La elección tampoco se recuerda entre visitas —
igual que la metodología, por [0003](0003-los-meses-que-el-indec-no-publico.md)—: quien
entra de cero ve el nacional aunque la vez pasada haya mirado Tucumán.

## Lo que quedó afuera, y por qué

**Los otros índices del INDEC** —núcleo, estacionales, regulados, y los agregados por
capítulo—. Se evaluaron y se descartaron. El núcleo es un índice analítico: sirve para leer
la política monetaria, no para actualizar un monto. Actualizar un presupuesto con el IPC
núcleo es decirle a la persona que su plata no perdió el poder adquisitivo que sí perdió,
porque justamente se le sacaron los precios que más se movieron. La calculadora contesta
"cuánto vale hoy", y para eso el índice correcto es el nivel general.

Al buscarlos apareció además una trampa del catálogo que conviene dejar anotada: las series
`indec:345.1`, `346.1` y `347.1` declaran unidad "Índice" pero son **incidencia absoluta**,
no niveles de índice; `348.1` son precios de productos en pesos. Los únicos niveles de
índice son `146.3`, `147.3` y `148.3`.

**Las divisiones por capítulo de cada provincia.** Cada provincia usa su propia
nomenclatura y no son comparables entre sí, así que un desplegable de "rubro" que cambiara
de opciones según la provincia elegida sería un control que promete comparar cosas que no
se comparan.

## Tres cosas que rompían en silencio y hubo que defenderse

Las tres se encontraron bajando los datos de verdad, ninguna la anticipó el diseño.

**El MCP devuelve los últimos 365 puntos si no le pasás `fecha_desde`, y no lo dice.**
Mendoza tiene 654 meses y llegaban 365, arrancando en 1992 en vez de 1968. `limit` no lo
cambia. Se notó de casualidad, porque cinco series dieron 365 justo.

**La columna `series_data.valor` del MCP era `numeric(20,6)`.** Un índice encadenado hacia
atrás a través de los cambios de moneda cae por debajo de una millonésima y quedaba guardado
como cero: Chaco tenía 256 puntos en cero, Tucumán 167, Mendoza 148. Un cero ahí no es un
dato impreciso, es una división por cero en el único cálculo que hace este sitio. El
pipeline descarta el arranque que no trae **cinco cifras significativas como mínimo** —no
sólo "que no sea cero"— y **recorta en vez de reescalar**: reescalar preservaría los
cocientes pero nuestros números dejarían de coincidir con la tabla que publica el
organismo, que es justo lo que alguien cruza cuando quiere verificar. Era un problema del
lado del MCP —82 series, 1.888 puntos, la peor es el IPC histórico del propio INDEC— y el
MCP lo arregló el 2026-09-05: le sacó la escala a la columna y borró los ceros. **El corte
ya vive sólo en el sitio.** Lo sigue justificando que las filas guardadas antes de ese día
no se reescribieron: medido el 2026-09-11, Chaco (87 puntos), Mendoza (97) y Tucumán (87)
todavía traen por debajo de 0,01 valores con seis decimales y de una a cuatro cifras.

**Hasta el 2026-09-11 el corte era por valor, en 0,01; ese día pasó a ser por cifras.** Para
las filas de seis decimales es exactamente lo mismo —`0.010640` trae cinco cifras, y
cualquier valor más chico con seis decimales trae cuatro o menos—, pero por valor también se
recortaba Córdoba, que no tiene nada truncado: sus 266 puntos por debajo de 0,01 (1968-01 a
1990-02) vienen sin truncar de la planilla que publicaba la provincia. Medido contra el MCP
ese día, el corte por cifras lleva a Córdoba de 438 a 704 meses y deja idénticas las otras
catorce series y el CPI de EE.UU. El criterio y sus límites están en
`scripts/recorte-representable.ts`.

Sin truncar no quiere decir preciso. El float trae 16 o 17 cifras, pero de 1968 a 1974 la
provincia publicó el índice con cuatro —los cocientes entre meses son fracciones exactas de
cuatro cifras (1239/1229, 1452/1433, 5216/5291), y la variación mensual que publica la
provincia lo confirma— y muchos meses hasta fines de los ochenta con cuatro o cinco (desde 1975
muchos pares necesitan cinco o seis). En ese tramo cada punto puede estar corrido hasta 0,05%
(el máximo medido es 0,0407%) y una variación mensual hasta una décima de punto (medido:
0,082). Y el portal que la provincia tiene hoy redondea a ocho decimales,
que antes de 1982-04 da cero: quien cruce 1968 contra el portal no encuentra nada. El corte
protege contra lo que se perdió al guardar; no mejora lo que se publicó, y `datos.html` lo dice.

**Cortar de más tampoco es inofensivo.** El snapshot no puede encoger, así que si el recorte le
saca un mes a una serie la escritura falla y el índice queda con los datos de la corrida
anterior. Pasaría con un cero final: Córdoba publica 1989-07 a 1990-02 a ocho decimales, y un
`0.00126100` llega como `0.001261` y cuenta cuatro cifras, lo que cortaría todo 1968-1989. Por
eso cada índice declara los decimales de su fuente cuando son más de seis
(`decimalesDeLaFuente`, Córdoba 8) y se usan como piso, y un índice conservado pone el job en
rojo (ver 0001).

Recuperar esa historia destapó cosas que el corte por valor tapaba, y todas son la misma
mentira —un número que se lee como cero sin serlo, o uno que se lee en la moneda equivocada— o
una página que no entra:

- La columna *Índice IPC* imprimía cuatro decimales fijos, así que enero de 1968 (`4,33e-13`)
  se leía "0,0000". Ahora imprime cifras significativas, y el CSV también, escrito entero
  ("0.0000000000004333") y nunca en notación exponencial.
- Deflactando, $1.000.000 de agosto 2026 llevados a enero de 1975 dan 0,0000000227: el
  resultado decía "$ 0", la tabla "$ 0,00" y el CSV "0.00". Ahora todo monto distinto de cero
  menor que uno va con cifras significativas (de dos a cuatro), con un solo criterio
  (`vaConCifras`) en el resultado, la tabla y el CSV: antes, de mayo de 1985 salía "$ 0,01194"
  arriba y "$ 0,01" en la fila del resultado. Y el texto que se copia decía "lo baja 100,00%"
  por redondear −99,99999999999773%; ahora dice "más de 99,99%".
- $1.000 de 1970 dan "$ 255.323.213.736.518.400", 25 caracteres con el espacio. La primera
  medición en el celular salió mal: la página ya venía ensanchada por el desplegable de
  metodología (469 px a 375 con cualquier índice provincial, 415 con el nacional estimado),
  que ahora se achica con la pantalla. Medida de nuevo, la cifra usa letra chica desde 12
  caracteres visibles y sólo se corta de renglón después de un punto de miles, en renglones
  parejos (`text-wrap: balance`) para que no quede un "400" suelto. La tabla, con montos así,
  medía 960 px en 878 a 1280: pasa a letra chica. Una celda se puede cortar en los puntos de
  miles sólo si ella misma pasa de 14 caracteres visibles, en cualquier tabla. Con el corte
  habilitado en todas las celdas, en un celular "$ 1.000,00" se leía "$ 1." y "000,00" (Chromium
  corta en un `<wbr>` aunque la celda diga `nowrap`); con 14 entra entero a 320 px, y junio 1985
  → agosto 2026, que no llega a cifras largas, ya no deja la columna Monto cortada por el
  costado. En el celular, además, "← el resultado" va debajo de la fecha, el sello de origen
  puede partirse y la tabla usa todo el ancho de la tarjeta: un monto sin puntos de miles como
  "$ 0,0000000227" quedaba cortado por el costado y se leía "$ 0,00".
- Entre 1968 y 1992 hay cinco monedas, no sólo el austral (ver `datos.html#monedas`), y el
  resultado queda en la moneda del monto. Debajo del resultado, y en el texto que se copia, la
  calculadora arranca con cuánto es en la moneda de la otra punta —destacado; con cuatro cifras
  significativas por debajo de mil, y nunca con más cifras que el resultado— y después explica
  en qué moneda está (`src/engine/moneda.ts`, por día). Junio de 1985 tuvo dos monedas y el
  aviso da las dos cuentas, cortas. Vale también para el nacional desde 1990, que es el caso
  más peligroso porque el número es creíble: $1.000 de enero de 1990 dan "$ 16.101.575", y en
  pesos son $ 1.610.

**Mendoza no publicó entre marzo de 2012 y abril de 2016.** Sin recortar, el motor habría
leído ese salto como una variación mensual de cuatro años. Se sirve el tramo continuo que
llega hasta el dato más nuevo, aunque eso cueste veinticuatro años de historia: rellenar el
hueco sería inventar números que no publicó nadie, y quedarse con el tramo largo viejo no
sirve para lo único que hace este sitio, que es traer un monto hasta hoy.

## Consecuencias

- **El organismo dejó de estar escrito a mano.** Estaba en unas veinticinco frases: el
  sello de cada fila, el pie de la tabla, el rótulo de la metodología, el texto que se
  copia, el encabezado del CSV, la nota legal del pie y el JSON-LD de las 36 páginas por
  año. Ahora cada punto dice de cuál de las fuentes de su serie salió, y las frases viajan
  en el snapshot pegadas a la fuente.
- **El REM sólo existe para el nacional.** El Relevamiento de Expectativas del BCRA
  pronostica el IPC nacional del INDEC; no hay uno provincial y repartir el nacional entre
  las provincias sería inventar un número y ponerlo al lado de otros que sí publicó
  alguien. La opción se deshabilita y al lado dice por qué, en vez de desaparecer: una
  opción que desaparece se lee como un bug.
- **Cada índice arranca donde arranca.** Santa Fe mide desde diciembre de 2013, Chaco
  desde 1988 y Córdoba desde 1968. Si cambiar de índice deja tu período afuera, se corre y se dice cuál era el
  mes que pediste.
- **Neuquén viene cinco meses detrás del nacional**, y eso cambia sobre qué ventana se
  calcula. Se avisa a partir de dos meses de atraso: uno es lo normal —los organismos
  publican en fechas distintas— y avisarlo sería un cartel permanente que nadie lee.
- **La ventana corrida deja de ofrecerse cuando arrastra meses muy distintos.** Con un
  índice atrasado, "sin estimar" (la opción "(recomendado)") corre la ventana hacia atrás
  tantos meses como haga falta y usa el tramo equivalente más reciente. Eso está bien
  cuando el tramo que se pierde y el que lo reemplaza se parecen; con Neuquén cinco meses
  atrás, un pedido de mayo 2024 a junio 2026 se corría hasta diciembre de 2023 y se tragaba
  enero de 2024 —el mes de la devaluación, +24,5%—, contestando +238,77% cuando la
  inflación real del período fue +90,29%, desde la opción marcada como recomendada. El
  criterio que lo bloquea (`sesgoDeLaVentana` en `src/engine/adjust.ts`) compara la
  inflación de los meses que la ventana arrastra contra la de los meses equivalentes más
  recientes, ancladas las dos en el extremo **viejo** del período —no en `desde` a secas:
  deflactando, `desde` es el extremo nuevo sin dato publicado, y anclar ahí dejaba el guard
  ciego en esa dirección, con el mismo caso contestando −70,48% en vez de −44%—. Se
  bloquea por encima del 10% de diferencia, calibrado barriendo el índice nacional desde
  2004: con un mes de corrimiento se toca el 3,2% de los períodos, con dos —el caso más
  común entre los que van sistemáticamente detrás— el 10,4%, y siempre corresponde: son
  meses parados sobre un salto real.
- Sumar una jurisdicción es agregar una entrada a `scripts/indices-declarados.ts`. Nada
  más.

## Regla que dejó

Un índice que no se puede bajar sin que una persona lo transcriba no se ofrece, por más
que exista. Y un índice que se ofrece tiene que poder decir, en una oración, **qué mide y
qué no**.
