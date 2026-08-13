# Calculadora de inflación de Argentina

Una calculadora de inflación que **muestra el cálculo** y **nunca confunde un dato
oficial con una estimación**.

🔗 **[inflacion.mymcps.dev](https://inflacion.mymcps.dev)**

Datos vía **[Argentina Data MCP](https://argentinadata.mymcps.dev)** — INDEC y BCRA,
desde enero de 1990.

## Por qué existe

El IPC del INDEC se publica con semanas de retraso. Si hoy consultás un ajuste
"hasta agosto" y el último dato publicado es de junio, cualquier calculadora tiene
que estimar dos meses. El problema es cómo lo cuenta.

Las calculadoras existentes devuelven un solo número acompañado de una advertencia
genérica del tipo *"estás usando una proyección"*, sin decir **qué meses** son dato
real y cuáles no. Para desambiguarlo hay que abrir una planilla y reconstruir la
serie del IPC a mano.

Esta calculadora hace esa planilla por vos:

- **Contesta el período que pediste**, y dice con qué meses concretos lo contestó.
  Cuando el destino es el mes en curso —el caso más común, traer un monto de antes
  a hoy— no estima nada: usa la inflación de los últimos N meses ya publicados,
  con N igual a la cantidad de meses del período.
- **De dónde salen los números, siempre a la vista**: los meses que entraron en la
  cuenta, nombrados, con el porcentaje de cada uno. Es la respuesta a "¿de dónde
  sacaste ese porcentaje?".
- **El desglose mes a mes.** Cuánto subió, cuánto acumula, cuánta plata, y de qué
  fuente salió cada fila: `INDEC ✓`, `BCRA ✓` o `estimado`.
- **Un texto para pegar.** El botón *Copiar explicación* arma un párrafo que se
  entiende solo y trae la fuente adentro, listo para mandar por mensaje.
- **Meses por defecto, días si hacen falta.** El modo por día le da a los días
  sueltos de las puntas la parte proporcional de la inflación de su mes, y los marca
  como `prorrateado` en vez de atribuirle al INDEC un número que no publicó.

## Cómo funciona

```
GitHub Actions (1×/día)  →  Argentina Data MCP  →  public/data/*.json  →  sitio estático
```

El sitio **no llama al MCP en runtime**. Un workflow diario baja las series, arma el
índice y commitea el snapshot al repo. El browser sólo lee JSON estático: sin
latencia, sin consumo de cuota por visita, y la API key nunca sale de GitHub
Secrets.

Como el snapshot queda versionado, podés ver exactamente qué números se usaron en
cada momento.

### El empalme

El INDEC publica un índice de nivel sólo desde diciembre de 2016. Para atrás existe
la serie de variación mensual del BCRA, desde enero de 1990. El pipeline retropola:
ancla diciembre de 2016 en 100 y camina hacia atrás dividiendo por cada variación
mensual.

| Serie | Fuente | Cobertura | Rol |
|---|---|---|---|
| `indec:148.3_INIVELNAL_DICI_M_26` | INDEC | 2016-12 → hoy | Índice oficial |
| `bcra:27` | BCRA | 1990-01 → 2016-11 | Retropolación |

Es el mismo empalme que hace la herramienta `ajuste_por_inflacion` del MCP.

### Los meses sin publicar y las tres metodologías

El IPC sale con retraso, así que el mes en curso nunca tiene dato y a veces el
anterior tampoco. Hay **tres metodologías**, elegibles desde un selector debajo del
resultado. El default no estima nada, y es al que llega siempre quien entra de cero.

| Metodología | Qué hace con los meses que faltan | ¿Estima? |
|---|---|---|
| **No estimar ninguno** (default) | Usa la inflación de los últimos N meses publicados, con N = meses del período pedido | No |
| Inflación del último mes | Repite la última variación mensual publicada sobre los meses que pediste | Sí, marcado |
| REM del BCRA | Usa la mediana que el REM pronostica para cada mes | Sí, marcado |

La primera resuelve el uso dominante —traer un monto de mayo a hoy— sin inventar
ningún número: de mayo a agosto pasan tres meses, así que se aplica la inflación
acumulada de los últimos tres meses publicados. **No es la inflación del período
pedido**, sino la del período publicado más reciente de igual duración; por eso la
interfaz nombra siempre los meses concretos que usó.

Las otras dos muestran los meses que pediste de verdad y completan los que faltan con
una tasa mensual constante, marcada como estimación en la tabla y con trama diagonal
en el gráfico.

Sobre el REM: el relevamiento publica una mediana esperada **para cada mes**, y eso es
lo que usa el sitio (`rem:ipc_mensual`). Su horizonte mes a mes llega a unos seis
meses; más allá, los meses restantes se completan repartiendo pareja la expectativa a
doce meses (`bcra:29`), y el texto del resultado dice desde qué mes empieza esa parte.

La senda mensual **no existía en el catálogo del MCP** hasta agosto de 2026: sólo
estaba el número a doce meses. Se indexó a partir del histórico que publica el BCRA,
justamente para que este sitio pudiera dejar de repartir parejo.

Cuando el período pedido está enteramente publicado, las tres dan el mismo número.

Para un mes futuro no hay período publicado equivalente, así que incluso el default
proyecta — y en ese caso coincide exactamente con la segunda metodología.

### Sobre la precisión

El ajuste se calcula como cociente entre los índices de los dos meses, que es el
método exacto. Otras calculadoras componen variaciones mensuales redondeadas, lo que
acumula deriva sobre plazos largos. Por eso, en períodos de décadas, podés ver
diferencias de fracciones de punto contra otras herramientas.

## Desarrollo

```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # motor de cálculo y formateo
npm run build      # build de producción
npm run snapshot   # baja los datos (necesita ARGENTINA_DATA_API_KEY)
```

### Estructura

```
src/engine/     motor de cálculo — TypeScript puro, sin DOM ni red
src/ui/         interfaz
scripts/        pipeline de datos y cliente MCP
public/data/    snapshot versionado
tests/
```

Toda la lógica delicada —el empalme y la proyección— vive en `src/engine`, aislada
del DOM y de la red, y se testea sola.

### Por qué el código es así

En [`docs/decisiones/`](docs/decisiones/) está el **por qué** de cada decisión, con la
evidencia que la cambió cuando la hubo: la arquitectura del snapshot, las tres
metodologías, la auditoría metodológica que movió el resultado medio punto, y cómo se
indexó una serie del BCRA que no existía en ninguna API.

## Hacé la tuya

**Este repo es un template.** Apretá *Use this template* en GitHub y tenés el mismo
esqueleto para cualquiera de las 32.000 series del MCP: dólar, salarios, reservas,
combustibles, precios de supermercados, patentamientos.

El esqueleto es este, y **no depende del IPC**:

```
GitHub Actions (1×/día)  →  Argentina Data MCP  →  public/data/*.json  →  sitio estático
```

La API key vive sólo en GitHub Secrets y nunca llega al browser. El sitio no hace una
sola llamada de red a nadie: lee un JSON que está commiteado en el repo.

### Los cuatro pasos

1. **Conseguí una key.** Escribinos desde [argentinadata.mymcps.dev](https://argentinadata.mymcps.dev).
   Guardala como secret `ARGENTINA_DATA_API_KEY` en tu repo
   (*Settings → Secrets and variables → Actions*).

2. **Elegí tu serie.** Buscala con la tool `series_search` desde cualquier agente
   conectado al MCP, o mirá el catálogo. Anotate el `serie_id`.

3. **Cambiá el pipeline.** En `scripts/fetch-snapshot.ts` están los IDs arriba de
   todo. Reemplazalos por el tuyo y ajustá qué escribe en `public/data/`. Si tu serie
   es "un número por fecha" —la mayoría lo son— el resto del pipeline sirve tal cual,
   incluidas las protecciones: **el snapshot nunca puede encoger**, los tests corren
   contra los datos recién bajados antes de publicarlos, y no se commitea nada si los
   datos no cambiaron.

4. **Escribí tu cálculo.** `src/engine/` es TypeScript puro, sin DOM ni red, y se
   testea solo. Es el único lugar que tenés que pensar de cero.

### Lo que te podés llevar sin tocar

- `scripts/mcp-client.ts` — cliente JSON-RPC del MCP. Resuelve dos cosas que cuestan
  descubrir solas: la respuesta viene enmarcada en SSE y el payload está
  doble-serializado dentro de `result.content[0].text`.
- `.github/workflows/` — snapshot diario y deploy a GitHub Pages, andando.
- `src/engine/mes.ts` — aritmética de meses y días sobre strings `YYYY-MM`, sin
  `Date` y sin líos de zona horaria.
- El build usa `base: "./"`, así que el mismo artefacto sirve desde un dominio propio
  y desde un subpath de `github.io`. No hay que recompilar para cambiar de uno a otro.
- `src/ui/analytics.ts` — medición de uso que no guarda IP ni usa cookies. Ver abajo.
- `.claude/` y `AGENTS.md` — el andamiaje para desarrollar con IA. Ver abajo.

### Está preparado para desarrollarse con IA

No como adorno: el repo trae el contexto que un asistente necesita para no repetir errores
que acá ya se pagaron.

- **`AGENTS.md`** (y `CLAUDE.md`, que lo referencia) — lo que hay que saber antes de tocar
  nada: la promesa del sitio, las cinco reglas que no se negocian, dónde está cada cosa.
- **`.claude/skills/cambiar-la-calculadora/`** — el orden de trabajo para cualquier cambio,
  con las trampas ya pagadas y el gate de revisión.
- **`.claude/agents/`** — **los dos revisores**, que son la parte más reusable de todo esto.
  Un especialista del dominio que audita contra el código y los datos, y una usuaria que
  necesita el número para trabajar y no maneja porcentajes. No es redundancia: el número
  puede estar mal (lo ve quien sabe) o estar bien y no entenderse (lo ve quien no sabe), y
  sus listas de hallazgos casi no se superponen. Encontraron un sesgo de medio punto en el
  anclaje del índice y, del otro lado, que la tabla no se le podía mostrar a un cliente.

Si forkeás esto para otro dominio, **el patrón de los dos revisores se lleva tal cual**:
cambiale la especialidad al primero y el oficio a la segunda. `docs/decisiones/0007` cuenta
por qué funciona y qué reglas hay que respetar para que siga funcionando.

### El analytics no se copia prendido

`src/ui/analytics.ts` sólo emite desde los hostnames listados en su mapa `SITIOS`. Tu
fork, desplegado en cualquier otro lado o corriendo en `localhost`, **no manda nada**: no
hay red, no hay endpoint, no hay que acordarse de apagar nada ni pedir una key.

Si querés el tuyo, agregá tu hostname al mapa y apuntá `ENDPOINT` a tu backend. El diseño
está en [`docs/decisiones/0008`](docs/decisiones/0008-analytics-sin-guardar-la-ip.md) y
vale la pena aunque uses otra herramienta: el visitante sale de un hash con una sal que
rota a diario y se borra a los dos días, así que se pueden contar personas sin guardar la
IP, sin identificador persistente y —esto es lo práctico— **sin banner de cookies**.

### Un consejo que nos costó aprender

Si vas a mostrar datos oficiales, **mostrá el cálculo y decí siempre qué parte es dato
y qué parte es cuenta tuya**. Es la diferencia entre un número que la gente puede
defender ante otra persona y uno que tiene que creer. En `docs/decisiones/` está lo que
nos enseñó eso, incluidos los errores.

## Estos datos no son exclusivos del sitio

Argentina Data MCP es un servidor [MCP](https://modelcontextprotocol.io): podés
conectarlo a Claude, a ChatGPT o a cualquier agente compatible y preguntarle lo
mismo en lenguaje natural, además de otras 32.000 series económicas argentinas,
padrón de ARCA, precios de supermercados y más.

```json
{
  "mcpServers": {
    "argentina-data": {
      "type": "http",
      "url": "https://argentinadata.mymcps.dev/mcp",
      "headers": { "Authorization": "Bearer TU_API_KEY" }
    }
  }
}
```

## Dominio

`inflacion.mymcps.dev`, vía un `CNAME` a `abenassi.github.io`, **con el proxy de
Cloudflare prendido** (nube naranja).

El orden importa y es la parte que cuesta descubrir: **para EMITIR el certificado por
primera vez hay que estar en nube gris.** GitHub valida el dominio y, con el proxy
adelante, el nombre resuelve a IPs de Cloudflare en vez de a las suyas, así que la emisión
falla. Una vez que `gh api repos/<owner>/<repo>/pages` dice `cert_state: approved`, se
puede prender el proxy y el sitio sigue sirviendo — ahí se gana conteo server-side que los
bloqueadores no evitan, WAF y el header de país.

Lo que queda pendiente de ver es la **renovación** con el proxy puesto, porque usa el mismo
mecanismo de validación que la emisión. Dos cosas medidas que acotan el riesgo: el path
`/.well-known/acme-challenge/` **atraviesa el proxy** y llega al origen (contesta 404 de
GitHub, no 403 de Cloudflare), y la zona está en SSL **`full`**, que *no* valida el
certificado del origen — así que aun si venciera, el sitio seguiría sirviendo para el
visitante. Si algún día se pasa la zona a `full (strict)`, esa red deja de existir y hay
que volver a gris un rato para renovar.

El build usa rutas relativas, así que el mismo artefacto sirve desde la raíz del
dominio propio y desde el subpath de `github.io`. No hay que recompilar para
cambiar de uno a otro.

## Aviso

Cálculo orientativo basado en el IPC del INDEC. No constituye asesoramiento
contable, financiero ni legal.

## Licencia

MIT
