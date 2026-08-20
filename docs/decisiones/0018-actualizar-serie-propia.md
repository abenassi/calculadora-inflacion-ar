# 0018 · Actualizar pasa a ser series propias del usuario

## Contexto

`/actualizar.html` era un MVP de prueba con una sola serie hardcodeada —dólar
blue— sin link desde ningún lado. La 0016 había separado de ahí el caso de tipo de
cambio real hacia `/tcr.html`, y dejó anotado que "serie propia por CSV" era la
generalización futura de Actualizar. Este cambio es esa generalización: la página
entera pasa a aceptar una serie que la persona pega o sube, y deja de depender del
dólar blue — ver el spec
([2026-08-20-actualizar-serie-propia-design.md](../superpowers/specs/2026-08-20-actualizar-serie-propia-design.md)).

## Por qué no un toggle en la landing

Ver el spec, sección "Por qué no un toggle en la landing": ramificar el resultado
de `index.html` en dos experiencias (un monto vs. una serie) atrás de un checkbox
repite el problema que la 0002 ya cortó con los presets.

## Qué sigue vivo, qué se borró

`dolar-blue.json`, `actualizarSerieDoble`, `reescalarCrossCheck`,
`calcularTcrBilateral` y el loop de índices secundarios declarados en
`fetch-snapshot.ts` siguen exactamente igual — los sigue usando `/tcr.html`. Se
borró el catálogo GENÉRICO de índices secundarios (`src/engine/indices-secundarios.ts`,
`indices-secundarios.json`, `construirCatalogoSecundarios()`), que sólo alimentaba
el desplegable "ajustar también por" que esta página ya no tiene.

## El loop de revisión

Tres vueltas de `revisor-economista`, `revisora-usuaria` y `revisor-codigo`, en paralelo
y sin verse entre sí, contra el sitio real (no sólo el código).

**Vuelta 1 — cuatro hallazgos:**

- **Bloqueante, confirmado independientemente por economista y usuaria:** una fecha
  anterior a donde arranca el IPC (`1985-01`, con la serie arrancando en 1990) o un año
  extremo (`9999-12`) hacía que `actualizarSerie` reventara con una `RangoError` sin
  capturar, y el resultado entero desaparecía sin ningún aviso — hasta las filas que sí
  eran válidas. Fix: un año fuera de un rango plausible (1000–3000) se rechaza al
  parsear, y `actualizarSerie` gana el mismo guard de cobertura que ya usaba
  `actualizarSerieDoble` para el índice secundario.
- **Bloqueante, confirmado independientemente por usuaria y revisor-codigo:** el CSV
  que exporta Excel/Sheets en configuración Argentina/España (separador de campo `;`,
  decimal `,`) rompía el parseo completo, porque el detector de separador elegía por
  presencia en la línea y no por dónde separaba de verdad los campos. Fix: probar los
  tres separadores y quedarse con el que da una fecha Y un valor que efectivamente
  parsean.
- **Importante (revisor-codigo):** faltaba la cobertura de test que el spec pedía
  explícitamente para los caminos `ventana_reciente`/`rem` de `actualizarSerie`.
- **Menor (revisor-codigo):** este mismo placeholder, sin completar.

**Vuelta 2 — un hallazgo nuevo:** revisor-codigo encontró que el guard de cobertura de
la vuelta 1 sólo miraba el mes del punto, no el mes anterior que `adjust()` también
necesita para cualquier fecha exacta (no sólo mes entero) — una fecha completa cayendo
justo en el primer mes publicado (`1990-01-15`) seguía reventando el batch entero. Fix:
reusar `mesPisoNecesario` (ya existía en `adjust.ts` para este mismo propósito, sólo
faltaba exportarla) en vez de reinventar el criterio.

**Vuelta 3 — nada nuevo.** Cierre del loop con la salida "vuelta que no trae nada
nuevo", incluida una pasada final sobre los bordes vecinos (mes puro en el primer mes,
fecha en el último mes publicado, `actualizarSerieDoble` sin cambios de comportamiento).
