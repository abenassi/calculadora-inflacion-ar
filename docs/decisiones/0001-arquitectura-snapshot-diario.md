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
  ruido. (Deploys sí hay uno por noche igual: ver "El push del snapshot no dispara el
  deploy".)

## Invariante que protege el pipeline

**Un snapshot nunca puede encoger ni perder meses.** Si el MCP responde raro, si el
INDEC revisa la serie hacia atrás, o si una fuente se cae, el job **falla ruidosamente
y no commitea**. El sitio sigue sirviendo el último snapshot bueno.

Además los tests corren contra el snapshot recién bajado, antes de publicarlo. Si la
serie cambió de forma incompatible, se caza ahí.

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

## Si vas a copiar esto

Es la parte más reusable del repo y funciona para cualquier serie del MCP. Mirá
`scripts/fetch-snapshot.ts` y `scripts/mcp-client.ts`.

Un detalle del protocolo que cuesta descubrir solo: el MCP habla JSON-RPC 2.0 sobre
HTTP **sin handshake de sesión**, pero la respuesta viene enmarcada en SSE
(`event: message\ndata: {...}`) y el payload está doble-serializado — el JSON que te
interesa es un string dentro de `result.content[0].text`. `desenmarcarSse()` en
`mcp-client.ts` resuelve las dos cosas en pocas líneas.
