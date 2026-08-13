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

**La columna `series_data.valor` del MCP es `numeric(20,6)`.** Un índice encadenado hacia
atrás a través de los cambios de moneda cae por debajo de una millonésima y queda guardado
como cero: Chaco tenía 256 puntos en cero, Tucumán 167, Mendoza 148. Un cero ahí no es un
dato impreciso, es una división por cero en el único cálculo que hace este sitio. El
pipeline descarta el arranque no representable con umbral `0.01` —que garantiza cuatro
cifras significativas, no sólo "que no sea cero"— y **recorta en vez de reescalar**:
reescalar preservaría los cocientes pero nuestros números dejarían de coincidir con la
tabla que publica el organismo, que es justo lo que alguien cruza cuando quiere verificar.
Es un problema del lado del MCP —82 series, 1.888 puntos, la peor es el IPC histórico del
propio INDEC— y hay que arreglarlo allá; mientras tanto el sitio no puede confiar en lo
que le llega.

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
- **Cada índice arranca donde arranca.** Santa Fe mide desde diciembre de 2013 y Chaco
  desde 1988. Si cambiar de índice deja tu período afuera, se corre y se dice cuál era el
  mes que pediste.
- **Neuquén viene cinco meses detrás del nacional**, y eso cambia sobre qué ventana se
  calcula. Se avisa a partir de dos meses de atraso: uno es lo normal —los organismos
  publican en fechas distintas— y avisarlo sería un cartel permanente que nadie lee.
- Sumar una jurisdicción es agregar una entrada a `scripts/indices-declarados.ts`. Nada
  más.

## Regla que dejó

Un índice que no se puede bajar sin que una persona lo transcriba no se ofrece, por más
que exista. Y un índice que se ofrece tiene que poder decir, en una oración, **qué mide y
qué no**.
