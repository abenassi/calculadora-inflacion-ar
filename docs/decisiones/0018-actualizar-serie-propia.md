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

_A completar durante la revisión (paso 4 de la skill `cambiar-la-calculadora`)._
