# 0009 · Una página por año, y por qué el SEO obligó a decir cosas incómodas

## Contexto

El sitio estaba invisible para Google. No por un problema de autoridad de dominio —eso
también, pero es lo lento— sino por cosas que directamente no existían: no había
`canonical`, ni `sitemap.xml`, ni `robots.txt` propio (Cloudflare servía uno generado con
sus *content signals*), ni Open Graph, ni datos estructurados. Y sobre todo: **no había
contenido**.

Ese último punto es el que importa y el que no es obvio. La home es un formulario. El
resultado, la tabla y el gráfico los arma el motor después de cargar, así que en el HTML
que un rastreador descarga no hay ni un número: hay cuatro `<select>` vacíos. La página
que mejor contesta "cuánto es tal monto de tal fecha" no contesta **ninguna** pregunta
hasta que alguien la completa.

Y lo que la gente escribe en Google es más chato que lo que el formulario resuelve:
*inflación 2024 argentina*, *inflación acumulada 2002*, *cuánto fue la inflación de 2016*.

## Decisión

Tres cosas, en orden de cuánto mueven la aguja:

1. **Una página por año**, de 1991 a hoy, generadas en el build desde el snapshot
   (`scripts/generar-paginas.ts`), más un índice en `/inflacion-por-anio/`. Cada una es una
   respuesta escrita a una pregunta concreta, con el mes a mes, el promedio mensual, el mes
   más alto y el más bajo, y un puente de vuelta a la calculadora.
2. **Un bloque de preguntas frecuentes en la home**, en HTML estático. Es lo único de esa
   página que se puede leer sin ejecutar JavaScript.
3. **La base técnica**: `canonical`, Open Graph y Twitter Card con imagen propia,
   `robots.txt`, `sitemap.xml` generado, y JSON-LD (`WebApplication` + `FAQPage` en la home,
   `Dataset` + `BreadcrumbList` en las generadas).

## Lo que no se hizo, y por qué

**Las páginas no estiman nada.** Todas terminan en el último mes que publicó el INDEC.
Proyectar es una decisión que toma quien usa la calculadora, con el selector a la vista; no
algo que se deje escrito en una página que un buscador va a cachear por meses y que después
alguien va a citar sin el contexto.

**No hay una segunda aritmética.** `resumenAnual()` llama por dentro al mismo `adjust()`
que responde el formulario, y hay un test que recorre los 37 años exigiendo que la
variación de cada página coincida con pedirle ese período a la calculadora. Si no, el sitio
se contradiría a sí mismo: alguien lee "la inflación de 2024 fue 117,76%", va a
comprobarlo, ve otro número, y el sitio pierde exactamente lo que promete.

**1990 no se publica.** La serie arranca en enero de 1990, así que no existe el diciembre
de 1989 contra el cual medir y lo único calculable es la variación de once meses: 706,06%.
La inflación de 1990 que la gente busca —y que va a encontrar en cualquier otro lado— es
~1.344%. Una página titulada "Inflación de 1990: 706,06%" con la salvedad debajo es una
página que el lector va a descartar entera, y con razón. Así que la regla es que **sólo se
publican los años medibles de diciembre a diciembre**.

La causa es un off-by-one del empalme, no un límite de los datos: `bcra:27` trae la
variación de enero de 1990 (79,2%) y el loop de `splice.ts` corta un mes antes de usarla,
así que nunca construye el índice de diciembre de 1989. Arreglarlo convierte a 1990 en un
año normal y la página aparece sola. Va aparte porque toca el motor, rompe tests que fijan
la conducta actual y obliga a regenerar el snapshot.

## Las tres cosas incómodas que el SEO obligó a escribir

Acá está lo interesante de esta decisión, y no es la parte de SEO. En los tres casos el
problema ya existía: lo que hizo el SEO fue sacarlo de adentro de un cálculo, donde
pasaba, y ponerlo de titular en una página cacheable, donde no.

### Los años del INDEC intervenido

La calculadora usa la serie oficial de 2007–2015 desde siempre, y nunca lo había dicho en
ningún lado. Mientras el número aparecía adentro de un cálculo de doce años, la omisión
pasaba. Pero una página titulada **"Inflación de 2011 en Argentina: 9,16% anual"** es otra
cosa: es una afirmación en primera persona sobre un año que mucha gente vivió, y ese número
no se sostiene solo.

Así que la salvedad quedó en tres lugares: arriba de todo en cada página de esos años (no
al pie), en la `<meta description>` —porque el resultado de Google es lo único que muchos
van a leer—, marcada con † en la tabla del índice, y con sección propia en `/datos`.

Se podría haber puesto en letra chica. Habría sido peor: el sitio existe para dar un número
que la persona pueda defender ante otra persona, y este es un número que le van a discutir.

### La atribución no es siempre el INDEC

El índice de nivel del INDEC arranca en diciembre de 2016. Todo lo anterior sale de la
serie de variación mensual del BCRA, y la tabla de esos años ya llevaba el sello `BCRA ✓`
en cada fila. La primera versión de estas páginas igual titulaba "según el IPC del INDEC" en
las 37, incluida la de 1990.

Es la mitad de la regla 2 que siempre se olvida: **no prometas dato oficial donde no lo
hay.** Alguien lo sale a buscar al INDEC, no lo encuentra, y deja de creerle al resto de la
página.

Y arreglarlo sólo en las páginas nuevas habría sido peor que no arreglarlo: la revisión
encontró que **la calculadora hacía exactamente lo mismo**, con la palabra "INDEC" escrita
a mano en siete lugares. Un cálculo de 1990 a hoy decía "todos los meses son datos
publicados por el INDEC" tres líneas arriba de 322 filas selladas `BCRA ✓`, y el texto del
botón *Copiar explicación* —el que se manda por mensaje— etiquetaba cada mes como "oficial
INDEC". O sea que las páginas nuevas iban a mandar tráfico de Google a una pantalla que las
contradecía.

Así que la atribución vive ahora en **una sola función**, `fuenteDe()` en
`src/ui/etiquetas.ts`, que usan la calculadora y el generador, y se deduce del `origen` de
las filas y no de una fecha escrita a mano: si el punto de empalme cambia, los textos
cambian con él. Es la regla 4 aplicada a un texto en vez de a un número. De paso apareció
que el disclaimer del pie decía lo mismo en las tres plantillas, y se corrigió en todas.

### Antes de 1992 no había pesos

`/inflacion-1991/` publicaba "$100.000 de enero de 1991 compran lo mismo que $X de hoy". En
enero de 1991 la moneda era el **austral**; el peso convertible llega el 1 de enero de 1992
a razón de 1 peso = 10.000 australes (Ley 23.928). El índice es continuo a través de esa
redenominación porque mide precios, pero el monto no: el número era correcto en unidades de
precio y cuatro órdenes de magnitud fuera de escala en unidades de dinero.

La palabra "austral" no aparecía en ningún archivo del repo. No estaba en letra chica: no
estaba. Ahora el bloque de equivalencia no se dibuja para años anteriores a 1992 y `/datos`
tiene una sección que lo explica.

## Los textos salieron de `main.ts`

`src/ui/explicaciones.ts` es nuevo y no tiene nada que ver con el SEO: es lo que la
revisión dejó claro que faltaba. Todas las frases que explican un resultado —el párrafo
del número, el pie de la tabla, la nota del compuesto, la línea "Fuente:" del texto que se
copia— vivían adentro de `main.ts`, que toca el DOM apenas se carga y por eso **ningún test
podía importar**. El resultado práctico: un pie que decía "todas las filas salen de datos
oficiales" sobre una tabla de una sola fila sellada `estimado` pasaba la suite entera sin
que nada se pusiera rojo.

Los textos son la parte del sitio que puede mentir. Un número mal calculado lo caza un test
del motor; una frase que promete dato oficial donde hay estimación no la cazaba nadie.
Ahora el módulo es `Resultado` entra, string sale, sin un solo `document`, y
`tests/explicaciones.test.ts` recorre quince períodos —publicados, mixtos, enteramente
futuros, por día, un mes contra sí mismo— exigiendo que ninguna de esas frases prometa lo
que la tabla desmiente. Verificado a mano que el test falla si se revierte el arreglo.

## Lo que la revisión encontró que no era de este cambio

Dos afirmaciones del sitio que eran falsas antes y que estas páginas ponían en la vidriera:

- **"No hay redondeo intermedio porque no hay paso intermedio"** (`0005`, y ahora también el
  FAQ de la home y un `FAQPage` que Google puede mostrar como respuesta destacada). Es cierto
  de diciembre de 2016 en adelante. Para atrás el índice **no viene dado**: lo construye
  `splice.ts` encadenando variaciones del BCRA publicadas con un solo decimal, o sea que es
  exactamente un producto de variaciones redondeadas — lo mismo que `0005` le señala al MCP.
  Corregido en los cuatro lugares. Es también la explicación de por qué 2011 da 9,16% acá y
  la cifra que circula es 9,5%.
- **"El propio organismo declaró la emergencia estadística".** La declaró el Poder Ejecutivo
  por Decreto 55/2016. Es un matiz chico y es una afirmación de autoridad sobre un
  instrumento concreto: la clase de cosa que quien conoce el tema usa para descartar el
  resto de la página.

## Consecuencias

- **El año en curso no es "la inflación de ese año":** es un acumulado parcial y se llama
  así, con la cantidad de meses publicados a la vista.
- **Los extremos vienen con sus empates.** 2011 tiene seis meses en 0,80%; mostrar uno solo
  hacía preguntarse por qué justo ése. El empate se juzga sobre el valor redondeado a la
  precisión con la que se muestra, no sobre el flotante.
- **La nota del interés compuesto dice los dos números.** Decía "el acumulado siempre da un
  poco más que la suma": en 2024 la brecha son 36 puntos (81,94% contra 117,76%) y en 1996,
  que tiene meses negativos, el acumulado da *menos*. O sea que la palabra "siempre" era
  falsa y "un poco" perdía a la persona justo cuando estaba comprobando —que es lo primero
  que hace cualquiera que desconfía—. Ahora la nota nombra la suma real y el acumulado real,
  y **solo aparece si los dos números se ven distintos**: en tramos cortos caen en el mismo
  redondeo y la nota decía "te va a dar -0,80%, no -0,80%", que contradice lo que muestra en
  el mismo renglón. El criterio vive en `seVenDistintos()` (`src/ui/format.ts`) porque la
  calculadora y las páginas generadas tienen que decidirlo igual.
- **La suma que se promete es la de la pantalla, no la del flotante.** Sumar los doce
  porcentajes de 2017 tal como están impresos da 22,37%; sumar los flotantes da 22,38%, y
  eso era lo que decía la nota. Un centésimo de diferencia en la única cuenta que el sitio
  invita a rehacer a mano es exactamente lo que hace desconfiar del resto. `comoSeMuestra()`
  (`src/ui/format.ts`) es ahora el único lugar donde se decide con qué precisión se imprime
  un porcentaje: lo usan el formateo, la suma de la columna y el empate de los extremos, que
  antes tenía su propia copia del redondeo en `anual.ts`.
- **Ninguna frase afirma una dirección que el número desmiente.** Un mes contra sí mismo
  daba "un aumento de 0,00%"; el promedio de 1996 se muestra como 0,00% y la nota invitaba a
  comprobar que "repetido 12 meses da −0,01%", una cuenta que no cierra. Las dos dicen ahora
  otra cosa.
- **El índice y la página del año cuentan el mismo empate.** El índice decía "mar 2011 ·
  0,80%" y la página, a un clic, "0,80% — marzo y 5 meses más". Los dos usan `nombrarEmpate`.
- **El texto que se copia atribuye lo que efectivamente usó.** Con todo el período estimado
  por REM la línea final decía "Fuente: el IPC Nivel General Nacional del INDEC", tres
  renglones abajo de "en esta tabla no hay ningún dato oficial". Ese texto viaja por mensaje,
  sin el sitio al lado: es donde una atribución equivocada más caro sale.
- **El build depende del manifest de Vite.** El generador corre después de `vite build` y
  saca de `dist/.vite/manifest.json` los nombres con hash del CSS y del entry de analytics.
  Si el entry `src/ui/paginas.ts` desaparece de `vite.config.ts`, el build falla en vez de
  publicar páginas sin estilos.
- **El sitemap se genera, no se versiona.** Cada año nuevo agrega una página; un archivo
  estático se olvida, y un sitemap que anuncia URLs que no existen es peor que no tenerlo.
- **Las páginas se actualizan solas.** El Action del snapshot commitea los datos nuevos, el
  push dispara el deploy, y el generador vuelve a correr. El día que el INDEC publica julio,
  la página de 2026 lo tiene.
- **Falta un paso manual que no puede hacer un agente:** verificar el sitio en Google Search
  Console y pedir la indexación. Requiere la cuenta de Google de Agustín. Lo técnico ya está;
  lo que falta para indexar es autoridad, no código.

## Lo que queda abierto

Que Google indexe 40 páginas nuevas de un dominio sin autoridad no es automático ni rápido:
el patrón conocido es "Descubierta: actualmente sin indexar" durante semanas. No hay que
debuggear eso como si fuera un problema técnico. Lo que lo destraba son backlinks y pedir
indexación a mano, no más `<meta>`.
