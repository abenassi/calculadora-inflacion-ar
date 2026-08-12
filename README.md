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

`inflacion.mymcps.dev`, vía un `CNAME` a `abenassi.github.io` **sin proxy de
Cloudflare** (nube gris): con el proxy adelante, GitHub no puede validar el dominio
para emitir el certificado.

El build usa rutas relativas, así que el mismo artefacto sirve desde la raíz del
dominio propio y desde el subpath de `github.io`. No hay que recompilar para
cambiar de uno a otro.

## Aviso

Cálculo orientativo basado en el IPC del INDEC. No constituye asesoramiento
contable, financiero ni legal.

## Licencia

MIT
