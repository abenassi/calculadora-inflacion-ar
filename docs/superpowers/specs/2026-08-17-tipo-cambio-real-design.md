# Tipo de cambio real bilateral Argentina–EE.UU.

Fecha: 2026-08-17

`/actualizar.html` hoy reindexa una serie de valores contra **un** índice (el IPC).
Este cambio la extiende para que, opcionalmente, también se pueda ajustar por un
**segundo** índice — hoy sólo el CPI de Estados Unidos, para calcular el dólar blue
en términos de tipo de cambio real en vez de sólo pesos constantes.

Precedido por `docs/superpowers/specs/2026-08-17-cpi-eeuu-design.md` del repo
`argentina-data-mcp` (repo separado, no linkeable desde acá): el colector
`fred_cpi_us` ya está deployado y `fred:cpi_us_nsa` es consultable en el catálogo.
Este spec no vuelve sobre esa parte.

## La cuenta

Reindexar por un solo índice (lo que ya hace `actualizarSerie`) contesta: *"¿cuántos
pesos de agosto de 2026 hacía falta tener en marzo de 2020 para comprar lo mismo?"*
Multiplica por `IPC(t0)/IPC(t)` — el índice **divide** el valor del mes de origen.

El tipo de cambio real bilateral agrega una segunda pregunta encima: no sólo cuánto
valen esos pesos hoy, sino cuánto valían los DÓLARES que esos pesos compraban, medidos
también en poder de compra de hoy. La fórmula estándar (dólares por peso, cotización
"pesos por dólar"):

```
TCR(t) = TCN(t) × CPI_US(t) / IPC_AR(t)
```

Expresado "en pesos de t0", como ya hace el sitio:

```
dolarBlue_real(t) = dolarBlue(t) × [IPC_AR(t0)/IPC_AR(t)] × [CPI_US(t)/CPI_US(t0)]
```

El primer factor es exactamente `adjust()` de siempre. El segundo es la MISMA cuenta
de `adjust()` pero **invertida**: en vez de `objetivo/origen` es `origen/objetivo`.
Esa inversión no es un detalle de implementación — es lo que separa "ajustar por
inflación argentina" de "ajustar por inflación argentina Y estadounidense": si el
segundo factor fuera en la misma dirección que el primero, el resultado sería un
tercer índice sin sentido económico, no un tipo de cambio real.

## Alcance: exactamente dos índices, con dirección

No una lista de N pasos encadenados. El motor acepta un índice base (como hoy, sin
cambios de comportamiento) y un índice secundario **opcional** con una dirección
(`multiplicar` | `dividir`), fijada en el catálogo del índice secundario y nunca
expuesta como control suelto en la interfaz — quien usa el sitio elige "CPI de
Estados Unidos" en un desplegable, no "multiplicar o dividir".

Si en el futuro aparece un tercer caso que necesite 3+ índices, se generaliza
entonces. Hoy sólo hace falta uno.

## Motor: `src/engine/actualizar.ts`

Nueva función, junto a la existente `actualizarSerie` (que queda intacta — nadie que
la llame hoy cambia de comportamiento):

```ts
export type DireccionSecundaria = "multiplicar" | "dividir";

export type PuntoActualizadoDoble = PuntoActualizado & {
  /** Sólo el ajuste por el índice base, sin el secundario — para overlay/comparación. */
  valorSoloBase: number;
};

export function actualizarSerieDoble(
  datos: PuntoValor[],
  mesObjetivo: Mes,
  indiceBase: SerieIndice,
  indiceSecundario: SerieIndice,
  direccion: DireccionSecundaria,
): PuntoActualizadoDoble[]
```

Por cada punto: si `motivoParaEstimar` descarta el punto para CUALQUIERA de los dos
índices, se descarta entero — misma regla que hoy (no estimar en silencio), aplicada a
los dos índices por igual. Si pasa ambos filtros:

```ts
const soloBase = adjust(punto.valor, punto.mes, mesObjetivo, indiceBase).montoAjustado;
// adjust(monto, desde, hasta, serie) da monto × serie(hasta)/serie(desde). Para
// obtener CPI_US(t)/CPI_US(t0) hay que INVERTIR el orden de desde/hasta respecto de
// cómo se llama para el índice base: desde=mesObjetivo, hasta=punto.mes.
const factorSecundario = adjust(1, mesObjetivo, punto.mes, indiceSecundario, opciones).montoAjustado;
const valorActualizado = direccion === "multiplicar"
  ? soloBase * factorSecundario
  : soloBase / factorSecundario;
```

Invertir `desde`/`hasta` en la llamada a `adjust()` (en vez de escribir
`indiceSecundario(t)/indiceSecundario(t0)` a mano) es la parte que importa: reusa el
mismo código que ya resuelve empalmes, proyección y `metodologia` para el índice
secundario, en vez de duplicar esa lógica con un desvío que sólo se ejercita acá. Con
ese orden invertido, `factorSecundario` YA da `CPI_US(t)/CPI_US(t0)` — la fórmula de
"La cuenta" es `soloBase × factorSecundario`, así que `direccion` para el CPI de
EE.UU. es **`"multiplicar"`**, no `"dividir"` (corregido en el self-review de este
spec — la primera versión tenía el signo al revés; ver el punto de control en
"Testing" para no repetir el error en la implementación).

`valorSoloBase` viaja aparte porque la interfaz va a mostrar las dos curvas — ver
"Overlay de comparación" más abajo.

## Catálogo de índices secundarios

Archivo nuevo `scripts/indices-secundarios-declarados.ts`, deliberadamente separado de
`indices-declarados.ts`: ese archivo declara el índice **primario** que gobierna toda
la calculadora (el desplegable "¿qué inflación mirás?"); éste declara índices que se
componen **encima** de un cálculo que ya está corriendo, un rol distinto con reglas
distintas (dirección fija, y no todos van a tener cross-check oficial).

```ts
export type IndiceSecundarioDeclarado = {
  slug: string;
  nombre: string;
  /** La serie del catálogo del MCP. */
  serie: string;
  direccion: DireccionSecundaria;
  organismo: string;
  url: string;
  etiqueta: EtiquetaFuente;
  /** slug del `IndiceDeclarado` primario que sirve de índice base — hoy siempre nacional,
   *  pero declararlo explícito documenta la restricción en vez de asumirla en el código. */
  requiereIndiceBase: "nacional";
  /** serie_id de un índice oficial equivalente, si existe, para el overlay de
   *  comparación (ver abajo). `undefined` si no hay cross-check publicado. */
  serieCrossCheck?: string;
};

export const INDICES_SECUNDARIOS: IndiceSecundarioDeclarado[] = [
  {
    slug: "cpi-eeuu",
    nombre: "CPI de Estados Unidos",
    serie: "fred:cpi_us_nsa",
    direccion: "multiplicar",
    organismo: "Bureau of Labor Statistics (BLS) vía FRED",
    url: "https://fred.stlouisfed.org/series/CPIAUCNS",
    etiqueta: {
      corta: "CPI de Estados Unidos (BLS)",
      larga: "el Índice de Precios al Consumidor de Estados Unidos (BLS, vía FRED)",
      publicadosPor: "el Bureau of Labor Statistics de Estados Unidos",
    },
    requiereIndiceBase: "nacional",
    serieCrossCheck: "indec:116.4_TCRZE_2015_D_31_73", // tipo_cambio_real_estados_unidos, BCRA
  },
];
```

`direccion: "multiplicar"` porque, con el orden de `desde`/`hasta` invertido que usa
`actualizarSerieDoble` (ver sección "Motor" arriba), `factorSecundario` ya da
`CPI_US(t)/CPI_US(t0)` — así que combinarlo con `soloBase × factorSecundario` da
exactamente la fórmula de "La cuenta". La primera versión de este spec tenía
`direccion: "dividir"` acá, un error que el self-review encontró releyendo la cuenta
a mano: con `"dividir"` el resultado hubiera sido `soloBase × CPI_US(t0)/CPI_US(t)` —
el factor del CPI de EE.UU. invertido (`t0/t` en vez de `t/t0`), con `soloBase` (el
factor del IPC argentino) sin cambios. El punto de control de "Testing" existe
justamente para que la implementación no pueda repetir este error sin que un test lo
grite.

`requiereIndiceBase: "nacional"` porque el IPC nacional es el único que tiene el
mismo punto de partida temporal (2002+) que el dólar blue y que `fred:cpi_us_nsa`; un
índice provincial que arranca en 2013 dejaría la mayoría de la serie sin componer.
Si se elige un índice secundario con un índice primario que no sea el nacional, el
selector de índice secundario se deshabilita (no se oculta: mejor decir por qué no
está disponible que hacerlo desaparecer sin explicación).

## Pipeline de datos

Regla 1 firme: nada de esto se llama desde el browser.

- **`scripts/fetch-snapshot.ts`**: nueva función `construirSerieSecundaria(declarada:
  IndiceSecundarioDeclarado)` que llama `traerSerie(declarada.serie, { fecha_desde:
  "2002-01-01" })` (mismo piso que el dólar blue) y escribe
  `public/data/series/secundario-${slug}.json` con la MISMA forma que `ipc.json`
  (`SerieIndice`, para poder pasarla tal cual a `adjust()`/`actualizarSerieDoble`).
  Se llama en un `try/catch` propio, igual que `construirSerieDolarBlue()`: si FRED
  falla un día, el resto del pipeline no se cae con él, y el selector del índice
  secundario simplemente no aparece hasta que el snapshot tenga el archivo.
- Si `declarada.serieCrossCheck` existe, se trae también con `traerSerie` y se escribe
  como `public/data/series/crosscheck-${slug}.json`, forma `SerieValores` (es un valor
  a comparar, no un índice con el que se ajusta nada).
- El invariante "el snapshot no puede encoger" (`escribirSiMejora`) aplica igual.

## Interfaz: `/actualizar.html` + `src/ui/actualizar-main.ts`

Un desplegable nuevo, "Ajustar también por", con "(ninguno)" como opción por
defecto y una entrada por cada `INDICES_SECUNDARIOS` cuyo `requiereIndiceBase`
coincida con el índice primario activo (hoy siempre coincide, porque la página no
tiene selector de índice primario todavía — sólo nacional). Sin selección, el
comportamiento es idéntico al de hoy: `actualizarSerie` de un solo índice.

Con una selección: se cargan (lazy, sólo al elegir — mismo criterio ya documentado en
`engine/indices.ts` de no bajar de más) el `secundario-${slug}.json` y, si existe, el
`crosscheck-${slug}.json`; se llama `actualizarSerieDoble` en vez de
`actualizarSerie`; el gráfico pasa a graficar `valorActualizado` (la curva real) con
`valorSoloBase` como una segunda línea punteada del mismo color de tono más claro
(comparación "sólo pesos" vs. "tipo de cambio real") y, si hay cross-check, una
tercera línea con el índice oficial de BCRA reescalado — ver siguiente sección.

## Overlay de comparación con la serie oficial del BCRA

Por tu respuesta de "las dos cosas": el sitio muestra el cálculo propio Y lo
compara con `tipo_cambio_real_estados_unidos` del BCRA (`indec:116.4_TCRZE_2015_D_31_73`,
índice diaria, base 17-dic-2015=100).

La serie del BCRA es un ÍNDICE (base 100 en una fecha), no está en pesos de ningún
mes — así que no se superpone directo con `valorActualizado` (que sí está en pesos).
Se reescala a la MISMA base 100 en `mesObjetivo`: `crossCheck_reescalado(t) =
crossCheck(t) / crossCheck(mesObjetivo) × 100`, mostrado en un eje secundario del
gráfico (dos escalas: pesos a la izquierda, índice 100 a la derecha) — patrón
estándar para comparar una serie en niveles contra una en índice cuando no comparten
unidad. La leyenda aclara que es una comparación de FORMA (¿se mueven parecido?), no
de nivel.

Si `crosscheck-${slug}.json` no existe (FRED/BCRA caído ese día, o un índice
secundario futuro sin cross-check declarado), el gráfico muestra sólo las dos curvas
propias — el overlay es un adicional, nunca un bloqueante.

## Testing

- `actualizarSerieDoble`: punto de control conocido — un mes donde `dolarBlue`,
  `IPC_AR` y `CPI_US` son todos valores reales y estables, verificar a mano contra la
  fórmula de la sección "La cuenta" con una calculadora aparte antes de confiar en el
  test (exactamente el mismo cuidado que ya existe en `adjust.test.ts` para el
  motor de un solo índice — buscar un caso ahí para copiar el estilo).
- Dirección `"dividir"` vs `"multiplicar"`: test que verifica el signo del efecto, no
  sólo el número exacto — un signo invertido pasa un test de "da tal número" si el
  número también está mal. **Corrección post-implementación:** una primera versión de
  este párrafo decía que el resultado debía ser MAYOR que `valorSoloBase` "cuando el
  CPI de EE.UU. sube más que el IPC argentino en el tramo", comparando las dos tasas
  entre sí. Es falso: con `direccion: "multiplicar"`,
  `valorActualizado = soloBase × CPI_US(t)/CPI_US(t0)` (t = mes del punto, t0 = mes
  objetivo), y ese cociente sólo depende del signo de la inflación de EE.UU. en el
  tramo — nunca de compararla contra la de Argentina. El test correcto (implementado
  en `tests/actualizar.test.ts`) aísla la variable: con el mismo IPC argentino en los
  dos casos, el resultado da MAYOR que `valorSoloBase` cuando el CPI de EE.UU. tuvo
  **deflación neta** en el tramo, y MENOR cuando tuvo **inflación neta positiva** —
  encontrado por `revisor-economista` en la vuelta 1 del review de este cambio.
- Reescalado del cross-check: `crossCheck_reescalado(mesObjetivo) === 100` siempre,
  por construcción — test directo.
- Fallback: snapshot sin `secundario-*.json` → el desplegable no ofrece la opción
  (no truena). Snapshot sin `crosscheck-*.json` → el gráfico se dibuja igual, sin la
  tercera línea.
- Índice secundario con `requiereIndiceBase` que no coincide con el activo → opción
  deshabilitada en el desplegable, con el texto explicando por qué.

## No-goals

- No se agrega un selector de índice PRIMARIO a `/actualizar.html` (hoy sólo nacional
  vía dólar blue). Si se agrega en otro momento, `requiereIndiceBase` ya deja la
  compuerta lista.
- No se generaliza a N índices encadenados — ver "Alcance" arriba.
- No se toca `src/ui/main.ts` (la calculadora principal) ni su propio selector de
  índices — son sistemas de selección distintos con roles distintos, ver "Catálogo de
  índices secundarios".
- No se construye ningún colector nuevo en Argentina Data MCP — `fred:cpi_us_nsa` y
  el cross-check de BCRA ya existen en el catálogo.
