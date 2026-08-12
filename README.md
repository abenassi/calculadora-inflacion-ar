# Calculadora de inflación de Argentina

Una calculadora de inflación que **muestra el cálculo** y **nunca confunde un dato
oficial con una estimación**.

🔗 **[abenassi.github.io/calculadora-inflacion-ar](https://abenassi.github.io/calculadora-inflacion-ar/)**

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

- **Contesta el período que pediste**, aunque haya que estimar para llegar. La
  estimación se marca; no se esconde ni se trata como un error. Debajo, como
  respaldo, el número que sale usando solo meses ya publicados.
- **De dónde sale la tasa de proyección**, siempre a la vista: los meses publicados
  que entran en el promedio, con el porcentaje de cada uno. Es la respuesta a
  "¿de dónde sacaste ese porcentaje?".
- **El desglose mes a mes.** Cuánto subió, cuánto acumula, cuánta plata, y de qué
  fuente salió cada fila: `INDEC ✓`, `BCRA ✓` o `estimado`.
- **Un texto para pegar.** El botón *Copiar explicación* arma un párrafo que se
  entiende solo y trae la fuente adentro, listo para mandar por mensaje.
- **Meses por defecto, días si hacen falta.** El modo por día interpola el índice
  dentro del mes, con el mismo criterio del coeficiente CER del BCRA.

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

### La proyección

Promedio de las últimas tres variaciones mensuales publicadas — otra vez, el mismo
método que `ajuste_por_inflacion`. La coherencia es deliberada: preguntar desde el
sitio o desde tu propio agente de IA tiene que dar el mismo número. Hay un test que
lo verifica contra el caso testigo.

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

## Dominio propio (pendiente)

El sitio está pensado para vivir en `inflacion.mymcps.dev`. Para activarlo:

1. Crear en Cloudflare un registro `CNAME` de `inflacion` → `abenassi.github.io`,
   **sin proxy** (nube gris), para que GitHub pueda emitir el certificado.
2. Restaurar el archivo `public/CNAME` con el contenido `inflacion.mymcps.dev`.

El build ya usa rutas relativas, así que sirve igual desde la raíz de un dominio
propio o desde el subpath de `github.io`: no hay que tocar nada más.

## Aviso

Cálculo orientativo basado en el IPC del INDEC. No constituye asesoramiento
contable, financiero ni legal.

## Licencia

MIT
