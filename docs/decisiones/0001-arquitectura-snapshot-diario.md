# 0001 · El sitio no llama al MCP en runtime

## Contexto

La calculadora consume datos de Argentina Data MCP, que pide una API key. Un sitio
estático no puede guardar una key: cualquier cosa que llegue al browser es pública.

Las salidas habituales son un backend que haga de proxy, o una función serverless. Las
dos implican infraestructura que hay que mantener, monitorear y pagar, para un sitio
que muestra números que cambian una vez por mes.

## Decisión

```
GitHub Actions (1×/día)  →  Argentina Data MCP  →  public/data/*.json  →  sitio estático
```

Un workflow diario baja las series, arma el índice empalmado y **commitea el snapshot
al repo**. El browser sólo lee JSON estático. La key vive únicamente en GitHub
Secrets.

## Consecuencias

**Lo que se gana:**

- La key nunca sale de GitHub. No hay proxy que asegurar ni rate limit que administrar.
- Cero consumo de cuota por visita: seis llamadas por día, no seis por usuario.
- Cero latencia: no hay red entre el click y el número.
- Si el MCP está caído, el sitio sigue funcionando con el último snapshot bueno.
- El snapshot queda versionado. Cualquiera puede ver en el historial de git **qué
  números exactos se usaron en cada momento**, que para una calculadora de inflación
  es una propiedad más valiosa de lo que parece.

**Lo que se paga:**

- Los datos tienen hasta 24 horas de atraso. Para el IPC, que se publica una vez por
  mes con semanas de retraso, es irrelevante.
- El repo acumula commits de datos. Se mitiga comparando por contenido: el pipeline
  ignora el timestamp `actualizado` al decidir si hubo cambios (salvo en `meta.json`, cuyo
  `actualizado` sale del de las demás series y es lo que el sitio muestra como "Última
  actualización"), así que un día sin
  novedades en ninguna serie no genera commit. Sin eso serían 365 commits al año de puro
  ruido. Y compara números, no texto: el mismo valor que el MCP sirve con más o menos
  decimales no es un cambio (ver "Comparar por contenido es comparar números"). (Deploys sí hay uno por
  noche igual: ver "El push del snapshot no dispara el deploy".)

## Invariante que protege el pipeline

**Un snapshot nunca puede encoger ni perder meses.** Si el MCP responde raro, si el
INDEC revisa la serie hacia atrás, o si una fuente se cae, el job **falla ruidosamente
y no commitea**. El sitio sigue sirviendo el último snapshot bueno.

Además los tests corren contra el snapshot recién bajado, antes de publicarlo. Si la
serie cambió de forma incompatible, se caza ahí.

### Comparar por contenido es comparar números

Comparar el JSON como texto dejó de alcanzar el 2026-09-05. Ese día el MCP sacó la escala de
6 decimales de `series_data.valor` (su `sql/170`, para dejar de guardar en cero los índices
encadenados hacia atrás) y sus colectores empezaron a guardar el float tal cual lo publica la
fuente. El 09-10 Córdoba pasó a una fuente que redondea a 8. El mismo número llegó con 6, 18 y
8 decimales (`0.016615` → `0.016614728801318833` → `0.01661473`), y como texto cada vez era un
cambio: nueve archivos en tres commits (`78dabc6`, `56a955c`, `0a80c59`) sin una sola cifra
distinta, el del 09-07 entero de ruido, y cada uno movía "Última actualización" a un día sin
ningún dato nuevo.

Por eso `scripts/mismo-contenido.ts` compara número contra número: dos valores son el mismo
dato si el más grueso es el más fino redondeado a sus decimales, **contando al menos seis**.
Seis es la escala con la que el MCP sirvió todo hasta el 09-05, y además no manda los ceros
finales: `3.591` es `3.591000`, y un dólar de `1528.6` que al otro día vale `1528.62` son dos
centavos, no un decimal más. Todo lo que no es número se compara exacto, y un mes nuevo es un
array más largo, así que siempre cuenta.

**No es una tolerancia relativa porque los datos la descartan.** En el historial de
`public/data` (08-12 a 09-11), el cambio de sólo precisión más grande en términos relativos es
de 1,77e-5 (Córdoba 1990-05) y la cotización real más chica que se movió, de 6,5e-6 (dólar
`1533.22` → `1533.21`): ningún umbral relativo separa las dos. El ruido es de decimales, así
que pesa más cuanto más chico el valor. Medidos en unidades del último decimal del número más
grueso (con el piso de seis), los 1.068 valores que sólo cambiaron de precisión quedan en
0,4997 o menos, y los 46 que cambiaron de verdad en 10.000 o más. **Tampoco es redondear a
decimales fijos**: un valor chiquísimo (Córdoba encadenada desde 1968 llega a `4.3e-13`) se
compara con los decimales que trae, y una revisión de `3.1e-10` a `3.3e-10` cuenta.

Pasada por el historial, de 86 archivos que la comparación vieja daba por cambiados quedan 77.
Los nueve que salen son exactamente los de sólo precisión; no se pierde ningún mes nuevo ni
ninguna revisión, y el commit del 09-07 no habría existido.

Límite conocido, elegido: más allá del sexto decimal, un cero final que JSON no escribe no se
distingue de un redondeo (`128.3969924` puede ser `128.39699240`), así que una revisión de
menos de media unidad de ese último decimal se lee como precisión. En un índice de 128 eso es
2e-10 relativo, por debajo de cualquier cifra que alguien vaya a defender. A seis decimales el
margen real es casi una unidad entera y no media, porque el vigente ya guarda el valor
redondeado: si era `0.0166145001` (guardado `0.016615`) y se revisa a `0.0166154999`, la
revisión fue de 1e-6 y da igual. Pega en las filas viejas que el MCP todavía sirve con seis
decimales (Chaco, Tucumán, Neuquén); el peor caso es Chaco 1988-08 (`0.01064`), 9,4e-5
relativo, el doble del 0,005% que ya acepta el corte de cinco cifras (`CIFRAS_MINIMAS`). Y no se pierde: se
demora hasta el próximo cambio real del archivo, que lo reescribe entero. Para el otro lado
el error es inofensivo: si el MCP algún día manda ruido que esta regla no reconoce, se commitea
de más, como antes, pero nunca se pierde un dato.

La holgura del float es de un épsilon (`ε·|x|`, siempre al menos una unidad de float) y no más.
Con cuatro se comía un centavo de Río Negro, que publica con dos decimales y va por
`16746051448071.4`: ahí cuatro épsilon son 0,015. Y hay un límite que no depende de nosotros:
por encima de ~4,5e13 un centavo mide poco más de una unidad de float, y una revisión en el
segundo decimal queda debajo de lo que un float puede representar. Hoy el índice más grande es
Río Negro, con 1,67e13.

Todo esto vale para lo que el MCP sirve tal cual. `ipc.json` sale de una cuenta: el empalme
(`src/engine/splice.ts`) reescala y divide en cadena, así que un cambio de precisión en
`bcra:27` (un `3.4000000000000004`) se arrastra por todo el tramo 1990-2016 y cuenta como
cambio. Es el lado inofensivo, commitear de más, y hoy `bcra:27` viene con cero o un decimal.

### Fallar ruidoso no es fallar por un pestañeo de la red

"Fallar ruidosamente" vale cuando lo que falló dice algo. Un `fetch` que se cae por un
segundo no dice nada: el 2026-08-28 la corrida diaria se cayó entera con un `fetch failed`
pelado a los nueve segundos —la misma bajada corrió bien a mano un rato después— y el
resultado fue un mail de build roto por algo que se arregla solo, más un día sin snapshot.

Por eso `mcp-client.ts` reintenta tres veces, con esperas de 2 y 6 segundos, sólo lo que
puede andar bien en el intento siguiente: errores de red, 429 y 5xx. Un 401 o un 400 vuelven
en el acto, porque esperar no los arregla. Cada intento tiene un techo de 30 segundos: sin
eso, una conexión colgada deja el job esperando hasta el límite de seis horas de Actions.

La invariante no se toca: agotados los reintentos, el job **falla y no commitea**. Lo que
cambia es qué cuenta como motivo para fallar, y que la alarma que suena se pueda creer.

### El push del snapshot no dispara el deploy

El commit de datos lo pushea el `GITHUB_TOKEN` del workflow, y GitHub **no arranca otros
workflows por eventos de ese token** (es su freno contra loops). `deploy.yml` escucha
`push` a `main`, así que nunca se enteraba de los datos nuevos: el sitio sólo se
republicaba cuando alguien pusheaba código. Hasta el 20/8 eso pasaba casi a diario y el bug
no se veía; después hubo tramos de 6 y 7 días sin publicar. Se vio el 2026-09-10: el IPCBA
de agosto estaba en `main` desde el 09 y el sitio seguía en julio, con el último deploy del
03. Tampoco había llegado al sitio el REM de agosto (commit del 05).

Por eso el paso que commitea termina con `gh workflow run deploy.yml`: `workflow_dispatch` es
la excepción que el `GITHUB_TOKEN` sí puede disparar, y sólo se llama si hubo commit. Así
el dato nuevo llega al sitio minutos después de bajarlo. Un PAT también andaría, pero es un
secreto más que rotar.

**Y además `deploy.yml` corre solo todas las noches** (00:23 ART), haya o no datos nuevos.
Es la red: el sitio tiene que actualizarse sin que nadie intervenga, y el dispatch es un
eslabón que puede fallar, o que un cambio futuro puede volver a cortar sin que se note.
Con el deploy nocturno, lo que esté en `main` llega al sitio normalmente esa misma noche, y
si GitHub descarta esa corrida, la siguiente. Lo único que lo frena es que los tests de
`main` estén en rojo, y eso ya avisa por su lado. Publicar sin cambios no rompe nada y
cuesta un minuto de Actions.

Si falla sólo el dispatch, el job del snapshot queda en rojo con los datos ya en `main`.
**No se arregla con "Re-run"**: el re-run usa el mismo commit de partida, de antes de los
datos, y no publica nada. Lo publica el deploy de esa noche; para no esperar,
`gh workflow run deploy.yml`.

Queda un caso que ninguna de las dos cosas cubre: que el MCP deje de traer datos nuevos sin
dar error. El snapshot dice "Sin cambios", el deploy publica lo mismo, todo en verde, y el
sitio envejece sin que nadie se entere. Por eso el snapshot termina con
`scripts/verificar-frescura.ts`, que pone el job en rojo si el IPC nacional tiene más de
dos meses de atraso (el INDEC publica el mes M a mediados de M+1, así que hasta dos es lo normal).
Mira también la encuesta del REM con la misma cuenta: si el REM no se puede bajar, el
snapshot conserva la encuesta vigente en vez de omitirla (omitirla dejaba los tests en rojo
y el job no commiteaba nada ese día), y sin este aviso esa encuesta envejecería callada.
Va después de commitear y publicar, para no frenar las demás series, y no mira los índices
provinciales: hay algunos con meses de rezago habitual. Ese aviso también llega
antes de los 60 días sin actividad con los que GitHub apaga los schedules de un repo
público.

El otro silencio era el de un índice jurisdiccional que no se puede actualizar.
`construirCatalogo` atrapa el error, conserva el índice de la corrida anterior para no
sacarlo del desplegable y sigue con los demás, y eso sigue así. Pero quedaba en un
`console.warn` con el job en verde, y la invariante de arriba lo vuelve peligroso: si el
recorte de `recorte-representable.ts` le saca un mes a una serie, la escritura falla por
encoger y el índice queda congelado para siempre. Ahora `fetch-snapshot.ts` deja la lista en
`.snapshot/indices-conservados.json` (fuera de `public/`, no se commitea) y el último paso,
`scripts/verificar-indices-conservados.ts`, pone el job en rojo con un `::error::` por índice
y su motivo. Corre después de commitear y publicar, y también si falló el de frescura.

## Si vas a copiar esto

Es la parte más reusable del repo y funciona para cualquier serie del MCP. Mirá
`scripts/fetch-snapshot.ts` y `scripts/mcp-client.ts`.

Un detalle del protocolo que cuesta descubrir solo: el MCP habla JSON-RPC 2.0 sobre
HTTP **sin handshake de sesión**, pero la respuesta viene enmarcada en SSE
(`event: message\ndata: {...}`) y el payload está doble-serializado — el JSON que te
interesa es un string dentro de `result.content[0].text`. `desenmarcarSse()` en
`mcp-client.ts` resuelve las dos cosas en pocas líneas.
