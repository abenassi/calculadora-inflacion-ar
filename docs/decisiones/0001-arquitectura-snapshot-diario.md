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
  ignora el timestamp `actualizado` al decidir si hubo cambios, así que un día sin
  novedades del INDEC no genera commit. Sin eso serían 365 commits y 365 deploys al
  año de puro ruido.

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

## Si vas a copiar esto

Es la parte más reusable del repo y funciona para cualquier serie del MCP. Mirá
`scripts/fetch-snapshot.ts` y `scripts/mcp-client.ts`.

Un detalle del protocolo que cuesta descubrir solo: el MCP habla JSON-RPC 2.0 sobre
HTTP **sin handshake de sesión**, pero la respuesta viene enmarcada en SSE
(`event: message\ndata: {...}`) y el payload está doble-serializado — el JSON que te
interesa es un string dentro de `result.content[0].text`. `desenmarcarSse()` en
`mcp-client.ts` resuelve las dos cosas en pocas líneas.
