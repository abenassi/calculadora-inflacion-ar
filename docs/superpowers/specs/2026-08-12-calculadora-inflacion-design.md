# Calculadora de inflación argentina — diseño

**Fecha:** 2026-08-12
**Repo:** `abenassi/calculadora-inflacion-ar` (público)
**Sitio:** `inflacion.mymcps.dev`

## 1. Problema

Las calculadoras de inflación argentinas existentes resuelven mal el caso más común:
pedir un ajuste hasta un mes para el que el INDEC todavía no publicó el IPC.

Caso testigo (2026-08-11): una usuaria consultó calculadoradeinflacion.com por
$520.000 de mayo 2026 a agosto 2026. El sitio devolvió `6.11%` acompañado de un
banner genérico: *"Estás usando una proyección de inflación del mes actual y/o
futura"*. El banner no dice **qué meses** son dato oficial y cuáles proyección, ni
muestra el cálculo. Para responder la duda hubo que reconstruir a mano, en una
planilla, la serie mensual del IPC con su columna de acumulado.

El dato necesario para responder bien ya existe y está estructurado. La tool
`ajuste_por_inflacion` de Argentina Data MCP devuelve para esa misma consulta:

```json
{
  "inflacion_acumulada_pct": 6.43,
  "ultimo_ipc_disponible": "2026-06",
  "proyeccion_usada": true,
  "detalle_proyeccion": "2 mes(es) proyectados con promedio de últimos 3 meses (2.2% mensual)"
}
```

El sitio de referencia tiene esa información y la esconde. **La oportunidad es de
UX, no de datos.**

## 2. Objetivos

1. **Producto:** una calculadora que muestra el cálculo, no solo el resultado, y que
   nunca deja ambiguo qué es dato oficial y qué es estimación.
2. **Negocio:** dar visibilidad a Argentina Data MCP. Quien se pregunte de dónde
   salen los números encuentra una respuesta que lo lleva a conectar el MCP a su
   propio agente de IA.

### Criterio de éxito

Una persona que consulta un período que incluye meses sin publicar entiende, sin
leer letra chica, cuánto vale su plata con datos oficiales y cuánto es estimación.

### No-objetivos

- Asesoramiento contable, financiero o legal.
- Comparar fuentes de ajuste lado a lado (IPC vs dólar vs UVA). Los datos quedan
  cacheados para habilitarlo después, pero no entra en este alcance.
- Cobertura anterior a 1990.

## 3. Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Origen de datos | Snapshot diario cacheado en el repo | La API key nunca llega al cliente; cero quota por visita; cero latencia; el JSON en el repo público es prueba social del MCP |
| Meses sin dato oficial | Dos resultados separados | Es la ambigüedad exacta que motivó el proyecto |
| Método de proyección | Promedio de las últimas 3 variaciones mensuales | Reproduce exactamente lo que devuelve `ajuste_por_inflacion`: sitio y MCP nunca se contradicen |
| Cobertura | 1990-01 en adelante | Mismo empalme que ya usa el MCP; no inventa metodología propia |
| Stack | Vite + TypeScript vanilla | Una página, un formulario; deps mínimas, build trivial, sobrevive sin mantenimiento |
| Hosting | GitHub Pages + `inflacion.mymcps.dev` | Estático puro; dominio y token de Cloudflare ya disponibles |
| Atribución | Fuerte pero elegante | Badge por resultado + página `/datos` con snippet MCP copiable |
| API key | Dedicada, exclusiva del proyecto | Hoy ~99% del `request_log` son agentes internos con la key `adm_`; una key propia deja medir el sitio de verdad y revocarlo aislado |

## 4. Datos

### Series consumidas

| Serie | ID | Frecuencia | Cobertura | Rol |
|---|---|---|---|---|
| Inflación mensual BCRA | `bcra:27` | mensual | 1990-01 → 2026-02 | Retropolación pre-dic-2016 |
| IPC Nivel General Nacional | `indec:148.3_INIVELNAL_DICI_M_26` | mensual | 2016-12 → 2026-06 | Índice oficial reciente |
| UVA | `bcra:31` | diaria | 2016-03 → hoy | Cacheada, sin uso en este alcance |
| Dólar minorista | `bcra:4` | diaria | 2010-06 → hoy | Cacheada, sin uso en este alcance |

`bcra:27` está declarada `dato_atrasado: true` (llega hasta 2026-02, cuatro meses
detrás del INDEC). **No importa:** solo se usa para meses anteriores a dic-2016,
que son definitivos y no se revisan.

### Empalme

El motor trabaja sobre un único índice base **dic-2016 = 100**:

- **Meses ≥ 2016-12:** índice INDEC reescalado a base dic-2016=100.
- **Meses < 2016-12:** retropolación hacia atrás desde dic-2016 dividiendo
  sucesivamente por `(1 + v/100)`, con `v` la variación mensual de `bcra:27` del
  mes siguiente.

Esto replica el empalme que `ajuste_por_inflacion` ya hace del lado del servidor.

### Pipeline

`scripts/fetch-snapshot.ts`, ejecutado por GitHub Actions una vez por día:

1. `POST https://argentinadata.mymcps.dev/mcp` con `Authorization: Bearer <key>` y
   `Accept: application/json, text/event-stream`. JSON-RPC plano, sin handshake de
   sesión. La respuesta viene enmarcada en SSE (`event: message\ndata: {...}`) y se
   desenmarca con un parse de línea.
2. Cuatro llamadas `tools/call` (una por serie).
3. Construye el índice unificado y escribe `data/ipc.json`, `data/uva.json`,
   `data/dolar.json`, `data/meta.json`.
4. Commitea solo si el contenido cambió.

Si el MCP falla o devuelve una serie más corta que la del snapshot vigente, el job
**aborta sin commitear** y falla ruidosamente. El sitio sigue sirviendo el último
snapshot bueno. Un snapshot no puede encoger ni perder meses.

### Formato del snapshot

```json
{
  "serie": "ipc_nacional_empalmado",
  "base": "2016-12=100",
  "fuentes": [
    {"id": "bcra:27", "organismo": "BCRA", "rango": "1990-01/2016-11"},
    {"id": "indec:148.3_INIVELNAL_DICI_M_26", "organismo": "INDEC", "rango": "2016-12/2026-06"}
  ],
  "ultimo_oficial": "2026-06",
  "actualizado": "2026-08-12T12:00:00Z",
  "datos": [{"mes": "1990-01", "indice": 0.0000123, "origen": "bcra"}]
}
```

Cada punto declara su `origen`. La UI lo usa para etiquetar cada fila del desglose.

## 5. Motor de cálculo

`src/engine/` — TypeScript puro, sin DOM, sin red. Toda la lógica delicada vive acá
y se testea aislada.

- `splice.ts` — construye el índice unificado a partir de las dos series crudas.
  Consumido por el pipeline, no por el browser.
- `adjust.ts` — la API pública:

```ts
adjust(monto: number, desde: Mes, hasta: Mes, serie: SerieIndice): Resultado

type Resultado = {
  oficial:   { hasta: Mes; monto: number; variacionPct: number };
  estimado?: { hasta: Mes; monto: number; variacionPct: number;
               mesesProyectados: number; tasaMensualPct: number };
  desglose:  Fila[];
};

type Fila = {
  mes: Mes; indice: number; varMensualPct: number | null;
  acumuladoPct: number | null; monto: number; esProyeccion: boolean;
};
```

`estimado` está presente solo si `hasta` supera el último mes oficial. Cuando no hay
proyección, la UI muestra un único resultado y no hay bloque secundario que explicar.

### Convención de fechas

Una fecha es un mes, y se interpreta como el valor del índice de ese mes (igual que
el sitio de referencia, que documenta "el primero del mes"). El ajuste de mayo a
agosto es `idx(ago) / idx(may)`.

Esto es exactamente lo que confunde a la gente, así que el desglose lo hace
explícito: la primera fila es el mes de origen con el monto original y sin
variación, y cada fila siguiente es un mes transcurrido. Nunca se muestra un
porcentaje acumulado sin las filas que lo componen.

### Proyección

Tasa mensual `t` = promedio aritmético de las variaciones mensuales de los últimos
3 meses oficiales. Cada mes faltante multiplica por `(1 + t/100)`.

**Test de oro:** para `(520000, 2026-05, 2026-08)` el motor debe devolver
`6.43%` / `$553.448,55`, idéntico a `ajuste_por_inflacion`. Este test se corre en CI
contra el fixture y protege la propiedad de que sitio y MCP nunca se contradigan.

## 6. Interfaz

Una página, un formulario, cuatro presets.

**Presets** (chips sobre el formulario, cambian etiquetas y defaults, no el motor):

| Preset | Qué configura |
|---|---|
| ¿Cuánto vale hoy? | Default. Mes de origen libre → mes actual |
| Actualizar un presupuesto | Etiquetas de honorarios/cotización. El caso testigo |
| Actualizar un sueldo | Además del ajuste, muestra cuánto perdió el monto real |
| Actualizar un alquiler | Periodicidad trimestral/cuatrimestral/semestral/anual |

El preset de alquiler aclara de forma visible que calcula IPC y que, desde el DNU
70/2023, la actualización contractual es la que las partes pactaron. Es una
calculadora, no un dictamen.

**Resultado.** Primario grande (solo datos oficiales, con el mes de corte dicho en
palabras). Secundario separado por regla y con chip `ESTIMADO`, indicando cuántos
meses se proyectaron y a qué tasa. Nunca uno solo cuando hay proyección de por
medio.

**Desglose.** Tabla mes a mes: índice, variación mensual, acumulado desde el
origen, monto, y origen del dato (`INDEC ✓` / `BCRA ✓` / `estimado`). Las filas
proyectadas van visualmente diferenciadas.

**Gráfico.** Línea del monto en el tiempo, con el tramo proyectado punteado.
Chart.js.

**Compartir.** URL que reproduce la consulta (`?monto=&desde=&hasta=&preset=`) y
descarga del desglose en CSV. El objetivo explícito es que la gente mande el link en
vez de un screenshot.

**Accesibilidad.** La distinción oficial/estimado no puede depender solo del color:
va también en texto (`ESTIMADO`, `INDEC ✓`) y en `aria-label`.

## 7. Atribución de Argentina Data MCP

- Badge bajo cada resultado: *"Datos vía Argentina Data MCP · actualizado 12 ago 2026"*, linkeado.
- Página `/datos`: de dónde sale cada número, qué series, qué empalme, cuándo se
  actualizó, y un bloque copiable con la config MCP para conectar los mismos datos a
  Claude o ChatGPT.
- README del repo con el pipeline explicado.

Sin banners en el hero: el sitio tiene que leerse como una herramienta creíble, no
como un anuncio. La conversión viene de que el cálculo esté bien hecho.

## 8. Testing

**Unitarios (vitest) sobre el motor** — es la única parte con lógica no trivial:

- Test de oro contra `ajuste_por_inflacion` (caso testigo).
- Empalme en el borde: dic-2016 debe dar idéntico por ambas ramas.
- Mes de origen = mes destino → monto sin cambios, desglose de una fila.
- Destino anterior al origen → deflación, montos decrecientes.
- Hiperinflación 1990 (79,2% / 61,6% / 95,5% mensual) sin pérdida de precisión.
- Destino más allá del último oficial → `estimado` presente, `mesesProyectados`
  correcto, filas marcadas.
- Destino dentro del rango oficial → `estimado` ausente.
- Fechas fuera de rango (anterior a 1990-01) → error explícito, no un `NaN`.

**Integración:** el pipeline corre contra el MCP real en CI y valida el esquema y la
monotonía del snapshot.

**End-to-end (Playwright headless):** el caso testigo cargado por URL renderiza los
dos resultados y el desglose completo.

## 9. Estructura

```
.github/workflows/snapshot.yml   cron diario → data/*.json
.github/workflows/deploy.yml     build + GitHub Pages
scripts/fetch-snapshot.ts        cliente MCP JSON-RPC
data/*.json                      snapshot commiteado
src/engine/{splice,adjust,types}.ts
src/ui/
tests/
index.html · datos.html · CNAME
```

## 10. Secretos

`ARGENTINA_DATA_API_KEY` como GitHub Actions secret, seteado vía `gh secret set`
leyendo desde `~/.secrets/`. No se imprime en chat, no se escribe en el repo, no
llega al bundle del cliente. Key dedicada a este proyecto, revocable de forma
aislada.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| El INDEC cambia de base o revisa la serie | El pipeline valida que el snapshot no encoja ni pierda meses; falla ruidoso sin pisar el snapshot bueno |
| El MCP cambia el formato de respuesta | El pipeline valida esquema antes de escribir; el sitio sigue con el último snapshot bueno |
| Divergencia sitio vs MCP | Test de oro en CI |
| Alguien toma la estimación como dato oficial | Separación visual, chip `ESTIMADO`, texto explícito, y la tasa de proyección siempre a la vista |
