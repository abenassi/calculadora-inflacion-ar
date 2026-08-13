# Índices provinciales y regionales

Fecha: 2026-08-13

Poder calcular con el IPC de tu provincia en lugar del nacional, sin que quien no
lo necesita se entere de que existe.

## El hallazgo que cambia el encuadre

La pregunta original era "agregá los 24 índices provinciales". **No son 24: son 9.**
Sólo diez jurisdicciones miden su propia inflación, y una de ellas (Jujuy) no publica
la serie en ningún formato que se pueda leer sin manos. Las catorce restantes no
tienen instituto que releve precios: para ellas lo único que existe es la región del
INDEC que las contiene.

Eso convierte el trabajo en dos cosas distintas y hay que decir las dos:

- Para nueve jurisdicciones hay un índice propio, medido en su territorio.
- Para las otras catorce hay un índice **regional**, que las incluye pero no las
  mide a ellas. Ofrecerlo está bien; llamarlo "IPC de Formosa" sería mentira.

## Lo segundo que cambia el encuadre

El trabajo grande no es el desplegable. Es que **"INDEC" está escrito a mano en unos
veinticinco lugares de `src/ui/main.ts`**: en las explicaciones, en el texto que se
copia, en el encabezado del CSV, en el sello de cada fila de la tabla. Con el índice
de Mendoza elegido, cada una de esas frases pasa a ser falsa.

O sea que la feature es, sobre todo, **despegar el organismo del texto**. Si eso no
se hace primero, el desplegable funciona y el sitio miente.

## Qué se ofrece

Dieciséis índices, en tres grupos:

**Nacional** — `indec:148.3_INIVELNAL_DICI_M_26` empalmado con `bcra:27`. Lo que hay
hoy. Default, y no se toca.

**Provincias con índice propio** (9)

| Jurisdicción | Serie | Cubre desde | Último dato | Organismo |
|---|---|---|---|---|
| CABA | `ipc:caba` ✱ | 2012-07 | 2026-07 | IDECBA |
| Chaco (Gran Resistencia) | `indec:464.1_IPC_CHACO_NG_0_0_22_93` | 1960-01 | 2026-06 | IPECD Chaco |
| Córdoba | `ipc:cordoba` ✱ | 2013-07 | 2026-06 | DGEyC Córdoba |
| Mendoza | `indec:195.1_NIVEL_GENERAL_0_0_13` | 1968-01 | 2026-06 | DEIE |
| Neuquén | `indec:196.1_NIVEL_GENERAL_2014_0_13` | 2001-11 | 2026-01 | DPEyC Neuquén |
| Río Negro (Viedma) | `ipc:rio_negro` ✱ | 1973-01 | 2026-07 | DEyC Río Negro |
| San Luis | `indec:197.1_NIVEL_GENERAL_2014_0_13` | 2005-10 | 2026-06 | DPEyC San Luis |
| Santa Fe | `indec:198.1_NIVEL_GENERAL_2014_0_13` | 2013-12 | 2026-06 | IPEC Santa Fe |
| Tucumán | `indec:199.1_NIVEL_GENERAL_2014_0_13` | 1968-01 | 2026-06 | DE Tucumán |

✱ = serie nueva, hay que construir el colector (ver más abajo).

**Regiones del INDEC** (6) — todas desde 2016-12, todas al 2026-06, misma base que la
nacional.

| Región | Serie | Provincias que incluye |
|---|---|---|
| GBA | `indec:148.3_INIVELGBA_DICI_M_21` | CABA y los 24 partidos del conurbano |
| Pampeana | `indec:148.3_INIVELANA_DICI_M_26` | Buenos Aires, Córdoba, Entre Ríos, La Pampa, Santa Fe |
| Noroeste | `indec:148.3_INIVELNOA_DICI_M_21` | Catamarca, Jujuy, La Rioja, Salta, Santiago del Estero, Tucumán |
| Noreste | `indec:148.3_INIVELNEA_DICI_M_21` | Corrientes, Chaco, Formosa, Misiones |
| Cuyo | `indec:148.3_INIVELUYO_DICI_M_22` | Mendoza, San Juan, San Luis |
| Patagonia | `indec:148.3_INIVELNIA_DICI_M_27` | Chubut, Neuquén, Río Negro, Santa Cruz, Tierra del Fuego |

**Jujuy queda afuera y hay que decir por qué.** La DiPEC publica un informe PDF por
mes y su tabla de serie histórica dice "próximamente". Sacar los números de ahí sería
parsear PDFs mensuales, que es la clase de fuente que se rompe en silencio. Cuando
publiquen la serie, entra sin tocar nada más que la tabla de índices.

## Arquitectura de datos

**`public/data/ipc.json` no se toca.** Sigue siendo el nacional, con la misma forma y
el mismo nombre. Cambiarlo sería arriesgar lo único que hoy anda para todo el mundo.

Se agregan:

- **`public/data/indices.json`** — el catálogo. Una entrada por índice con `slug`,
  `nombre`, `tipo` (`nacional` | `provincia` | `region`), `organismo`, `organismoCorto`,
  `primerMes`, `ultimoOficial`, `cubre` (el texto que dice qué mide de verdad). Ronda
  el kilobyte y se carga siempre, porque el desplegable lo necesita para armarse.
- **`public/data/indices/<slug>.json`** — un archivo por índice no nacional, con la
  misma estructura `SerieIndice` que ya existe. **Se baja sólo cuando alguien elige
  ese índice.**

Quien nunca toca el selector baja exactamente un kilobyte más que hoy. Ese es el
precio total de la feature para la persona que no la quiere.

### El pipeline

`scripts/fetch-snapshot.ts` gana una tabla declarativa `INDICES`: slug, nombre, ids de
serie, organismo, tipo, texto de cobertura. El resto del script itera sobre ella.

El tool `series` toma diez ids por llamada, así que las quince series nuevas son dos
llamadas de cuota extra. El pipeline pasa de seis a ocho.

`escribirSiMejora` se aplica a cada archivo por separado, así que la invariante de que
un snapshot no puede encoger vale para cada índice por su cuenta. **Un índice que
falla no puede voltear a los otros**: si Neuquén no viene, se escribe el resto, se
avisa en el log y ese índice desaparece del catálogo de esa corrida. La única
excepción es el nacional, que si falla sí corta todo, porque es el default.

**Cada serie tiene que pasar `verificarContinuidad`.** Las series largas de provincia
(Chaco desde 1960, Mendoza y Tucumán desde 1968) atraviesan hiperinflación, cambios de
base y el período de intervención del INDEC. Si una tiene huecos, se trunca a su cola
continua más reciente y el catálogo publica ese `primerMes` recortado, en vez de
publicar una serie con agujeros que el motor va a leer como si fueran meses contiguos.

### Empalmes

El nacional empalma BCRA con INDEC, como hoy. De las nuevas, sólo **Córdoba** necesita
empalme: cambió de base en diciembre de 2025 y el republicador de datos.gob.ar se
quedó justo ahí. `splice.ts` ya sabe hacerlo y se reusa; no se escribe metodología
nueva. CABA viene **ya empalmada desde la fuente** —IDECBA publica la serie unida con
la base anterior— y esa es la razón para preferir su archivo antes que armar el
empalme nosotros.

## Cambios en el motor

Menos de los que parece: `adjust()` ya recibe una `SerieIndice` y no sabe de dónde
salió. Tres cosas sí:

**1. `Origen` deja de ser un enum de dos organismos.** Hoy es `"indec" | "bcra" |
"proyeccion"`, y existe así porque la serie nacional se arma con dos fuentes. La
generalización es que cada `PuntoIndice` diga **de cuál de las `fuentes` de su serie
salió**, y que el rótulo se lea de ahí. `"proyeccion"` se queda como está: no es una
fuente, es la ausencia de una.

**2. El REM se deshabilita fuera del nacional.** El REM del BCRA pronostica el IPC
nacional del INDEC. No existe un REM de Mendoza y no lo vamos a inventar promediando
nada. Con un índice provincial elegido, la opción se deshabilita con el mismo
mecanismo que ya usa `sePuedeEvitarEstimar`, y al lado dice por qué. Las otras dos
metodologías funcionan igual en todos los índices.

**3. Cada índice tiene su propio arranque y su propio último mes.** `armarIndice` ya
lee `primerMes` y `ultimo_oficial` de la serie, así que la ventana reciente sale sola.
Lo que falta es del lado de la interfaz, abajo.

## Cambios en la interfaz

### El selector

Un `<select>` al final de la fila del formulario, después de las fechas, agrupado con
`<optgroup>` en "Provincias con índice propio" y "Regiones del INDEC", con el nacional
suelto arriba. Por default dice **"Nacional (INDEC)"** y la oración se sigue leyendo
de corrido:

> $520.000 de mayo 2026 equivale, en agosto 2026, según el IPC **Nacional (INDEC)**

**El default no se persiste nunca**, igual que la metodología: quien entra de cero ve
el nacional siempre, aunque la vez pasada haya mirado Tucumán. Un `?indice=` en la URL
sí se respeta, y viaja en "Copiar link" y en el texto que se copia.

### Lo que aparece sólo si lo cambiás

Con el nacional elegido, **la pantalla es idéntica a la de hoy**. Nada nuevo, ni una
línea. Al elegir otro índice aparece una sola línea debajo del resultado que dice qué
mide de verdad:

- Provincia: *"IPC de la Ciudad de Buenos Aires, que publica IDECBA. Mide precios en
  CABA, no en el conurbano."*
- Región: *"IPC de la región Noreste (INDEC): Chaco, Corrientes, Formosa y Misiones.
  No es un índice de Formosa sola: no hay."*

### Despegar el organismo del texto

El grueso del trabajo. Hoy `main.ts` dice "INDEC" a mano en las explicaciones, el
texto que se copia, el CSV y el sello de la tabla. Todo eso pasa a leer el organismo
de la serie activa. Dos reglas para no romper lo que ya funciona:

- **El sello de una fila nombra la fuente de esa fila**, no la del índice. En el
  nacional eso sigue dando "INDEC ✓" y "BCRA ✓" exactamente como hoy.
- **Las filas parciales y las proyectadas siguen sin sello**, como hoy. Esa regla no
  depende del organismo y no se toca.

### Cuando cambiar de índice deja el período afuera

Santa Fe arranca en dic-2013 y CABA en jul-2012. Si alguien calculó 1995 → 2026 con el
nacional y elige Santa Fe, el período deja de ser calculable.

**No se recalcula en silencio ni se recorta el período por su cuenta.** Los años del
desplegable de fecha se limitan al rango del índice elegido, y si el período que ya
estaba cargado queda afuera, el sitio lo dice con nombre y apellido: *"Santa Fe mide
desde diciembre de 2013. Para 1995 hay que usar el índice nacional."* La persona
decide si cambia el período o vuelve al nacional.

### Cuando el índice está más atrasado que el nacional

Neuquén está en enero de 2026, cinco meses detrás del nacional. Se ofrece igual, pero
el catálogo lleva el `ultimoOficial` de cada índice y la interfaz lo dice cuando está
más de dos meses detrás del nacional. Esconderlo sería peor: el número saldría de una
ventana mucho más vieja sin que nada lo explique.

## Colectores nuevos en el MCP

Tres, con el patrón del colector del REM: bajar un archivo de una URL estable,
parsearlo, escribir una serie propia. Los tres verificados a mano el 2026-08-13.

**`ipc:caba`** — xlsx de IDECBA, ya empalmado en origen, 2012-07 → 2026-07 (más fresco
que el nacional). Dos columnas, mes e índice, sin sorpresas. La URL del archivo cuelga
de `/uploads/YYYY/MM/`, o sea que se mueve; **la URL estable es la de la ficha del
banco de datos**, y el archivo se resuelve por la REST API de WordPress (post type
`banco_datos`). Resolver por API y no por el path es la diferencia entre un colector
que dura y uno que se rompe el mes que vuelvan a subir el archivo.

**`ipc:rio_negro`** — xlsx de URL fija, 1973-01 → 2026-07. Viene como matriz de meses ×
años, no como lista: hay que transponerlo. Es el más barato de los tres.

**`ipc:cordoba`** — portal CKAN propio, → 2026-06. El recurso se resuelve por la API de
CKAN porque el nombre del archivo lleva el mes adentro. Requiere empalmar base 2014 con
base jun-nov 2025.

Los tres con `fecha_fin` real, así que a diferencia del REM acá `dato_atrasado` sirve y
hay que dejarlo funcionando.

### Por qué no alcanzaba con lo que ya estaba

Las tres existen en el catálogo vía datos.gob.ar y las tres están congeladas ahí: CABA
y Neuquén en enero de 2026, Córdoba en agosto de 2025. El MCP las marca bien como
`dato_atrasado`, así que no hay bug que arreglar — el republicador es el que se quedó.
Córdoba se congeló justo cuando cambió de base, que es la explicación más probable
también para las otras dos.

**Neuquén no lleva colector propio en este trabajo** y se sirve del catálogo, atrasado.
Si el atraso se vuelve permanente, entra después con el mismo patrón.

## Cómo se verifica

Además de `npm run verificar`:

- **Un test que ate el desplegable con el motor**, como el que ya existe para la
  metodología: para cada índice del catálogo, el rango que ofrece el selector de fechas
  tiene que ser exactamente el rango que `adjust()` acepta sin tirar `RangoError`.
- **Un test de que ningún texto visible dice "INDEC" hardcodeado** cuando el índice
  activo es otro. Es la regresión más probable de todas y la más difícil de ver a ojo.
- **Un test de que el nacional no cambió**: mismo input, mismo output que antes del
  cambio, hasta el último decimal.
- **Browser real**, con el nacional y con al menos dos provinciales de rangos distintos
  (Santa Fe, que arranca tarde, y Chaco, que arranca en 1960).
- **Los tres revisores** de `.claude/agents/`, en paralelo. Con dos preguntas puestas
  explícitamente sobre la mesa: a la economista, si el índice regional presentado como
  alternativa para una provincia que no mide se sostiene metodológicamente; a Vanina,
  si el tercer campo en el formulario le mete ruido cuando ella no quiere elegir nada.

## Lo que este trabajo NO hace

- No compara dos índices entre sí. Un solo índice por cálculo.
- No inventa un REM provincial ni proyecta con expectativas regionales.
- No promedia regiones para fabricarle un índice a una provincia que no mide.
- No toca el analytics más allá de sumar qué índice se usó al evento `calculo`.
- No agrega Jujuy, ni las catorce provincias sin índice propio como si lo tuvieran.
