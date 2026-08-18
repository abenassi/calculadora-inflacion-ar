# 0015 · Tipo de cambio real: un segundo índice, opcional

## Contexto

`/actualizar.html` reindexaba una serie de valores (el dólar blue) contra un solo índice
(el IPC de Argentina), lo cual da una actualización por inflación argentina, no un tipo de
cambio real. El spec ([2026-08-17-tipo-cambio-real-design.md](../superpowers/specs/2026-08-17-tipo-cambio-real-design.md))
agrega un segundo índice opcional —la inflación de Estados Unidos, `fred:cpi_us_nsa`, ya
vivo en el catálogo del Argentina Data MCP— para poder calcular un tipo de cambio real
bilateral, con la serie oficial del BCRA (`indec:116.4_TCRZE_2015_D_31_73`) de cruce visual.

## La cuenta

```
dolarBlue_real(t) = dolarBlue(t) × [IPC_AR(t0)/IPC_AR(t)] × [CPI_US(t)/CPI_US(t0)]
```

Ajustar por inflación argentina (como ya hacía el sitio) y multiplicar por el cociente
inverso de inflación de EE.UU. — la misma fórmula, rescalada, que la del tipo de cambio
real `TCR(t) = TCN(t) × CPI_US(t)/IPC_AR(t)`. Confirmado por dos derivaciones independientes
antes de escribir código, porque el spec tenía un error de signo ya corregido una vez
(`direccion: "multiplicar"` vs `"dividir"` para la entrada del catálogo).

El motor no reescribe `actualizarSerie` (la función de un solo índice): agrega
`actualizarSerieDoble()` al lado, en `src/engine/actualizar.ts`.

## El piso que `motivoParaEstimar` no chequea

`motivoParaEstimar` sólo mira el techo de cobertura de una serie (`ultimoOficial`), nunca
el piso (`primerMes`). Con un solo índice nunca importó, porque el IPC nacional cubre
prácticamente cualquier fecha que el sitio permite elegir. Con un segundo índice que
arranca más tarde (CPI de EE.UU., 2002-01, contra un selector de año que llega a 1992) un
punto o un `mesObjetivo` anterior a ese piso producía un `RangeError` sin capturar.
`fueraDeCobertura(mes, serie)` en `src/engine/actualizar.ts` cierra el chequeo que
faltaba, con guardas tanto en el motor (`actualizarSerieDoble`) como en la interfaz
(`redibujar()` en `src/ui/actualizar-main.ts`, para el caso de llegar a ese estado sin
pasar por el desplegable de índice — por ejemplo moviendo el año objetivo a mano).

## El anclaje del cross-check: al propio último dato, no al mes objetivo

La serie de cruce del BCRA se reescala a base 100 para superponerse en el mismo eje que el
resto del gráfico. La primera versión la anclaba al `mesObjetivo` elegido — pero el BCRA
publica esa serie con varios meses de retraso, así que en el estado por default del
sitio (mes objetivo = mes actual) el ancla caía fuera de la cobertura del BCRA y la
tercera línea nunca aparecía. Se reancla al último dato que el propio cross-check tiene
disponible (`crossCheckDatos.datos.at(-1)!.mes`), así la línea aparece sin que quien usa
el sitio tenga que elegir un mes especial.

## El loop de revisión

Dos vueltas, con `revisor-economista`, `revisora-usuaria` y `revisor-codigo`. Registro
completo:

| # | Hallazgo | Quién | Qué se hizo |
|---|---|---|---|
| 1 | `actualizarSerieDoble` no chequeaba el piso del índice secundario — `RangeError` sin capturar para un punto o un `mesObjetivo` anterior a él | codigo | Arreglado: `fueraDeCobertura()` en el motor, con tests de regresión que reproducen el crash antes del fix |
| 2 | El slider de rango podía desincronizarse de mes al cambiar de índice secundario (clampeaba índices de posición, no meses) | codigo | Arreglado: `capturarMesesDeRango()` + re-resolución por mes (mismo mecanismo que ya usan los links compartidos) |
| 3 | Elegir `mesObjetivo` anterior al piso del secundario vía los selectores de mes/año normales (no el desplegable de índice) dejaba `puntosCompletos` vacío y `redibujar()` explotaba leyendo `.mes` de `undefined` | autoencontrado, mismo bug de fondo que el 1 | Arreglado: guard en `redibujar()` para 0 puntos y para <2 puntos en el rango visible, con mensaje explicativo |
| 4 | Tooltip mezclaba pesos (miles con punto, coma decimal) con el valor del BCRA en punto decimal, en el mismo cartel | usuaria | Arreglado: `indice()` (es-AR) para el valor y los ticks del eje del cross-check |
| 5 | "CPI" (sigla en inglés) sin explicar en ningún lado visible | usuaria | Arreglado: `nombre` del catálogo pasó de "CPI de Estados Unidos" a "Inflación de Estados Unidos" (única fuente, se propaga a selector/título/badge/leyenda) |
| 6 | Frase del badge run-on, sin decir qué ajusta cada fuente | usuaria | Reescrita para separar los dos ajustes |
| 7 | Slider con las dos puntas en el mismo mes producía gráfico en blanco sin explicación | usuaria | Mismo guard que el 3 |
| 8 | El overlay del BCRA nunca aparecía en el estado por default, por el anclaje al mes objetivo en vez del propio último dato del cross-check | economista | Arreglado — ver sección anterior |
| 9 | La prosa de "Testing" del spec describía mal el test de signo (decía que dependía de comparar la tasa del CPI de EE.UU. contra la del IPC argentino; en realidad depende sólo de si el CPI de EE.UU. tuvo inflación o deflación neta en el tramo) | economista | Corregido el texto del spec, sin cambio de código — los tests ya reflejaban lo correcto |
| 10 | El punto de octubre de 2025 del CPI de EE.UU. (interpolado por FRED, cierre del gobierno de EE.UU.) no llevaba ninguna aclaración | economista | Agregada aclaración a `etiqueta.larga` en `scripts/indices-secundarios-declarados.ts` — hoy es documentación de la fuente, no se renderiza todavía en `/actualizar.html` |

Ningún hallazgo se rechazó. La vuelta 2 confirmó los diez arreglos (incluido, del lado del
revisor de código, que el criterio de cobertura no quedó duplicado entre motor e
interfaz) y no trajo nada nuevo.
