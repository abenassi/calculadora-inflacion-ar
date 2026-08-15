# 0012 · Atajos de fecha: "ahora" y 1m/3m/6m/12m

## Contexto

Elegir el período implicaba siempre tocar cuatro `<select>` (mes y año de cada punta), o
tipear dos fechas en modo por día. Para el caso más común —"esto lo pasé hace N meses,
¿cuánto sale ahora?"— era ir contando meses con los dedos y clickeando desplegable por
desplegable.

## Decisión

Dos filas de botones chicos, pegadas a cada campo:

- Debajo de "de" (el origen): **1m · 3m · 6m · 12m**. Ponen el origen a N meses antes del
  **destino ya cargado**, sea cual sea ese destino.
- Debajo de "equivale, en" (el destino): **ahora** (o **hoy** en modo por día). Pone el
  destino en el momento actual, sin tocar el origen.

El chip que reproduce el valor que ya está en pantalla queda marcado. Como el default del
sitio ya es "destino = mes actual, origen = 3 meses antes", quien entra sin tocar nada ve
"ahora" y "3m" ya prendidos.

## Por qué esto no es lo que sacó la 0002

[0002](0002-un-solo-calculo-sin-presets.md) sacó cuatro presets (presupuesto, sueldo,
alquiler, cuánto vale hoy) porque cambiaban **etiquetas y valores por defecto** y sugerían
que había cálculos distintos cuando siempre era el mismo. La regla que dejó: *"un control
nuevo tiene que cambiar el resultado, no la decoración."*

Los atajos de acá cumplen esa regla al pie de la letra: mueven fechas, nada de texto ni de
metodología cambia según cuál se toque. No reviven los presets de la 0002 — son un
mecanismo distinto (desplazar una fecha) para el mismo cálculo de siempre.

## El anclaje: al destino, no a "hoy"

Los chips de origen restan meses del **destino que esté cargado en ese momento**, no de
hoy. Si se anclaran a hoy, "12m" sobre un destino puesto a mano en el pasado (por ejemplo
mayo 2024) daría un origen posterior al destino y el período quedaría invertido. Anclado
al destino, "12m" siempre significa "un período de 12 meses", sea cual sea el destino.

## El criterio de deshabilitado sale de una sola función

Un atajo que caería antes de donde arranca la serie del índice elegido —típico en los
índices provinciales, más cortos que el nacional— se deshabilita en vez de calcular mal
(regla 3 de `AGENTS.md`). El chip deshabilitado lleva un `title` que dice por qué.

El chip "ahora" tiene un segundo motivo de deshabilitado: si moverlo dejaría el destino
antes del origen ya cargado, invertiría el período sin avisar. La comparación de "qué
punto es más nuevo" sale de `compararPuntos()` (`src/engine/mes.ts`), la misma función de
la que salen `extremoNuevo`/`extremoViejo` en `src/engine/adjust.ts` — antes tenían el
criterio duplicado inline, ahora comparten uno solo (regla 4).

El piso en modo por día es distinto al de modo por mes: prorratear un día del primer mes
de la serie necesita el índice del mes anterior, que no existe. `primerMesPedible(dias)`
en `src/ui/main.ts` es la única función de la que sale ese piso, reusada tanto por
`poblarSelects` (el `min` del calendario) como por `sincronizarAtajos` (qué chip
deshabilitar).

## `mesActual()` pasó de UTC a hora local

Necesario para que "ahora"/"hoy" fueran correctos: con `getUTCFullYear()/getUTCMonth()`,
en Argentina (UTC-3) las últimas tres horas de cada día ya "son" el día siguiente en UTC,
así que un chip de "ahora" podía adelantarse un mes entero durante la noche, todas las
noches. El cambio no es sólo para los chips: `mesActual()` también decide, en
`evaluarPeriodo()`, si un período pedido a mano es "futuro" — así que el default del sitio
(sin tocar ningún atajo) también podía adelantarse de mes en ese margen horario antes de
este cambio.

## El loop de revisión

Dos vueltas, con `revisor-economista`, `revisora-usuaria` y `revisor-codigo`. Registro
completo:

| # | Hallazgo | Quién | Qué se hizo |
|---|---|---|---|
| 1 | El chip "ahora" podía dejar el período invertido sin avisar (un origen puesto a futuro, "ahora" mueve el destino a un mes anterior a ese origen) | economista | Arreglado: "ahora" se deshabilita si invertiría, con `title` explicando por qué |
| 2 | Un chip deshabilitado (índice corto cerca de su arranque) no explicaba por qué al pasar el mouse | usuaria | Arreglado: `title` en todos los atajos deshabilitados |
| 3 | Un atajo de origen pisa una fecha tipeada a mano en vez de "ajustarla" | usuaria | **Rechazado**: es el comportamiento intencional del control — siempre pone el origen a N meses del destino actual, no ajusta lo que había. Cambiarlo le sacaría al botón la propiedad que lo hace predecible (siempre da exactamente N meses). |
| 4 | "La página cambiaba sola de fecha e índice" sin tocar nada | usuaria | **Rechazado**: artefacto de que los tres revisores compartieron la misma sesión de browser headless en la vuelta 1 (confirmado por `revisor-codigo`, que encontró la misma contaminación de pestañas). No es un bug del sitio. |
| 5 | En modo por día, con un índice corto, un atajo de origen podía quedar habilitado un mes antes de donde el modo día realmente permite, y el clic disparaba `RangoError` en vez de deshabilitarse | codigo | Arreglado con `primerMesPedible(dias)` compartida |

La vuelta 2 (economista y código, sobre los hallazgos 1 y 5) no trajo nada nuevo — cierre
limpio.

## Analytics

Nuevo evento `preset` (`src/ui/analytics.ts`), con qué atajo se tocó. Sumado también a la
allowlist de `argentina-data-mcp` (`src/analytics/eventos-web.ts`), en un commit aparte de
ese repo — el endpoint de ingesta es público sin auth y rechaza cualquier nombre de evento
que no esté en la lista.
