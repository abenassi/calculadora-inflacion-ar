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
| Meses sin dato oficial | Ventana de meses recientes si el destino no es futuro; repetir el último valor si lo es | Ver §5, *Los meses sin publicar* (revisado) |
| Método de proyección | Repetir la última variación mensual publicada | Se explica en una oración a alguien que no maneja números |
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
adjust(monto: number, desde: Punto, hasta: Punto, serie: SerieIndice,
       opciones?: { hoy?: Mes; metodologia?: Metodologia }): Resultado

type Resultado = {
  monto: number; desde: Punto; hasta: Punto;
  montoAjustado: number; variacionPct: number;
  metodo: Metodo; desglose: Fila[];
};

type Metodo =
  | { tipo: "directo" }
  | { tipo: "ventana_reciente"; mesesDelPeriodo: number;
      desplazamiento: number; mesesSinPublicar: Mes[] }
  | { tipo: "proyeccion"; tasaMensualPct: number;
      mesesEstimados: Mes[]; base: BaseProyeccion };

type BaseProyeccion =
  | { fuente: "ultimo_mes"; mes: Mes }
  | { fuente: "rem"; mesEncuesta: Mes; expectativaAnualPct: number };

type Metodologia = "sin_proyectar" | "repite_ultimo" | "rem";

type Fila = {
  punto: Punto; indice: number; varMensualPct: number | null;
  acumuladoPct: number | null; monto: number;
  esProyeccion: boolean; origen: Origen;
};
```

Hay **un solo resultado**, y `metodo` dice cómo se llegó a él. La versión original de
este spec devolvía un par `oficial` / `estimado` y la UI mostraba dos números; se
descartó (ver §6).

### Convención de fechas

Una fecha es un mes, y se interpreta como el valor del índice de ese mes (igual que
el sitio de referencia, que documenta "el primero del mes"). El ajuste de mayo a
agosto es `idx(ago) / idx(may)`.

Esto es exactamente lo que confunde a la gente, así que el desglose lo hace
explícito: la primera fila es el mes de origen con el monto original y sin
variación, y cada fila siguiente es un mes transcurrido. Nunca se muestra un
porcentaje acumulado sin las filas que lo componen.

### Los meses sin publicar

El IPC sale con semanas de retraso: el mes en curso nunca tiene dato y a veces el
anterior tampoco. Como el uso dominante es traer un monto del pasado al presente, el
hueco aparece en casi toda consulta. `adjust` lo resuelve por tres caminos, elegidos
por el desplazamiento necesario y por si el destino supera el mes en curso:

| `metodo.tipo` | Cuándo | Qué hace |
|---|---|---|
| `directo` | Todo el período está publicado | `idx(hasta) / idx(desde)` |
| `ventana_reciente` | El destino no se publicó pero no es futuro, y la metodología es `sin_proyectar` | Corre la ventana hacia atrás: aplica la inflación de los últimos *N* meses publicados, con *N* = meses del período pedido |
| `proyeccion` | El destino supera el mes en curso, o la metodología pide proyectar | Extrapola con una tasa mensual constante sobre los meses pedidos |

**Metodología elegible** (`OpcionesAjuste.metodologia`, expuesta como un `select`
discreto debajo del resultado):

| `Metodologia` | Tasa de proyección | Default |
|---|---|---|
| `sin_proyectar` | — sólo proyecta si el destino es futuro, y ahí repite el último mes | ✅ |
| `repite_ultimo` | Última variación mensual publicada | |
| `rem` | `(1 + REM/100)^(1/12) − 1`, con REM = mediana a 12 meses de `bcra:29` | |

`proyeccion.base` discrimina de dónde salió la tasa (`ultimo_mes` | `rem`); las dos
comparten toda la maquinaria de extrapolación porque la única diferencia real entre
ellas es el número, y duplicarla las dejaría separarse.

El default nunca se persiste entre visitas: quien entra de cero ve siempre la
metodología que no estima nada. Un link con `?metodo=` sí se respeta, porque es una
elección explícita de quien compartió.

**Limitación del REM, asumida a conciencia.** El relevamiento publica una senda mes a
mes, pero la única serie del REM en el catálogo es la mediana de inflación esperada a
doce meses: un número por encuesta. El sitio lo reparte parejo. No es lo que los
analistas proyectaron para cada mes, y `/datos` lo dice con esas palabras. Si alguna
vez aparece la senda mensual en el catálogo, `BaseProyeccion` es el lugar donde
entraría una tercera variante sin tocar el resto.

`ventana_reciente` **no estima nada**: todos los números son del INDEC. Tampoco es la
inflación del período pedido, sino la del período publicado más reciente de igual
duración, así que la UI nombra siempre los meses concretos que entraron. El desglose
muestra esos meses, no los del período pedido.

`proyeccion` usa una tasa mensual constante en lugar de promediar o modelar, a
propósito: la explicación cabe en una oración, y para el usuario objetivo eso vale
más que la sofisticación.

**Test de oro:** `(520000, 2026-05, 2026-08)` con `hoy = 2026-08` resuelve por
`ventana_reciente` con `mesesDelPeriodo = 3`, desglose `mar–jun 2026` y `+6,76%`.

Esto rompe deliberadamente la paridad numérica con `ajuste_por_inflacion`, que sigue
proyectando con el promedio de tres meses. La coherencia con el MCP se mantiene en el
empalme y en el índice; el tratamiento del hueco es una decisión de producto del
sitio.

### Precisión: divergencia deliberada con el MCP en plazos largos

Medido durante la implementación: sobre períodos de décadas el motor difiere del MCP
en fracciones de punto (0,06% en 2017→2026; 0,34% en 1995→2026). No es un bug del
empalme. El MCP compone variaciones mensuales redondeadas; acá se toma el cociente
de los índices de nivel, que es el método exacto. Componer porcentajes redondeados
acumula deriva, así que replicar el número del MCP habría significado replicar su
imprecisión.

Sobre ventanas recientes —el caso dominante— la coincidencia es exacta. El test de
tolerancia fija los desvíos largos para que un empalme roto de verdad se distinga
del ruido de redondeo, y la página `/datos` lo explica al lector.

## 6. Interfaz

Una página, un formulario, un solo modo de cálculo.

**Sin presets.** El spec original definía cuatro (presupuesto, sueldo, alquiler,
cuánto vale hoy). Se eliminaron: sugerían que había cálculos distintos cuando siempre
es el mismo —un monto, dos fechas, el IPC— y hacían dudar al usuario sobre si había
elegido bien.

**Resultado.** Un solo número grande, con el mes de destino dicho en palabras y un
párrafo que nombra los meses concretos que se usaron. Chip `ESTIMADO` sólo cuando el
método es `proyeccion`; prefijo `~` en todo lo que no sea `directo`.

**Desglose.** Tabla mes a mes: índice, variación mensual, acumulado desde el
origen, monto, y origen del dato (`INDEC ✓` / `BCRA ✓` / `estimado`). Las filas
proyectadas van visualmente diferenciadas. En `ventana_reciente` el pie de la tabla
aclara que las filas son los meses publicados de referencia.

**Modo por día.** Opcional, apagado por defecto. Interpola el índice dentro del mes
en proporción a los días, con el criterio del coeficiente CER del BCRA.

**Gráfico.** Barras de la variación mensual del IPC en los meses que entraron en el
cálculo, al final de la página. Chart.js.

La versión original graficaba la evolución del monto, y se descartó: un monto
ajustado por inflación siempre sube, así que la curva tenía la misma forma para
cualquier consulta y no aportaba nada a la pregunta "¿por qué ese porcentaje?". La
variación mensual sí: muestra la desinflación del período y hace visible que en
`proyeccion` todas las barras estimadas valen lo mismo. Las barras estimadas van
con trama diagonal, nunca por color solo.

**Compartir.** URL que reproduce la consulta (`?monto=&desde=&hasta=`) y
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

- Test de oro del caso testigo: `ventana_reciente` sobre los últimos 3 meses publicados.
- Empalme en el borde: dic-2016 debe dar idéntico por ambas ramas.
- Mes de origen = mes destino → monto sin cambios, desglose de una fila.
- Destino anterior al origen → deflación, montos decrecientes.
- Hiperinflación 1990 (79,2% / 61,6% / 95,5% mensual) sin pérdida de precisión.
- Destino sin publicar pero no futuro → `ventana_reciente`, desglose corrido, sin
  ninguna fila estimada.
- Destino futuro → `proyeccion`, todas las filas faltantes a la misma tasa.
- Las tres metodologías: distintas entre sí con meses faltantes, idénticas sin
  ellos; `sin_proyectar` y `repite_ultimo` coinciden en períodos de un mes y con
  destino futuro; `rem` sin datos del REM lanza error en vez de inventar una tasa.
- `tasaMensualDelRem` compone de vuelta la expectativa anual.
- Destino dentro del rango publicado → `directo`.
- Modo por día: un día posterior al 1 del último mes publicado fuerza el
  desplazamiento aunque su propio mes ya esté publicado.
- Fechas fuera de rango (anterior a 1990-01) → error explícito, no un `NaN`.

**Integración:** el pipeline corre contra el MCP real en CI y valida el esquema y la
monotonía del snapshot.

**End-to-end (Playwright headless):** el caso testigo cargado por URL renderiza el
resultado, el párrafo que nombra los meses usados y el desglose completo.

## 9. Estructura

```
.github/workflows/snapshot.yml   cron diario → public/data/*.json
.github/workflows/deploy.yml     build + GitHub Pages
scripts/fetch-snapshot.ts        cliente MCP JSON-RPC
scripts/mcp-client.ts            JSON-RPC sobre HTTP, desenmarcado de SSE
scripts/provision-api-key.sh     aprovisionamiento de la key dedicada
public/data/*.json               snapshot commiteado
src/engine/{splice,adjust,mes,types}.ts
src/ui/{main,chart,format,datos}.ts
tests/{adjust,splice,format}.test.ts
index.html · datos.html
```

El build usa `base: "./"` y enlaces relativos, así que el mismo artefacto sirve
desde la raíz de un dominio propio y desde un subpath de `github.io`. El archivo
`CNAME` se agrega recién cuando exista el registro DNS: con `CNAME` presente y sin
DNS, Pages redirige `github.io` al dominio custom y deja el sitio inaccesible.

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
