---
name: cambiar-la-calculadora
description: Usar SIEMPRE antes de implementar cualquier cambio en este repo — feature nueva, corrección, cambio de textos o de metodología. Trae el orden de trabajo, las reglas que no se negocian y el gate de revisión con los dos revisores. También sirve para revisar un cambio ya hecho, entrando por el paso 4.
---

# Cambiar la calculadora

La promesa de este sitio no es dar un número: es dar un número que **la persona pueda
defender ante otra persona**. Casi todas las reglas de acá salen de eso.

Si venís a **revisar** algo ya implementado (tuyo o ajeno), saltá directo al paso 4.

## Paso 0 — Leé el porqué antes de tocar el qué

`docs/decisiones/` tiene una entrada por decisión, con la evidencia que la produjo. Varias
existen porque la alternativa obvia ya se probó y estaba mal.

**No hace falta leerlas todas.** Buscá las que toca tu cambio:

| Si vas a tocar… | Leé |
|---|---|
| El pipeline de datos, el snapshot, la API key | 0001 |
| La interfaz, agregar modos o presets | 0002 |
| Meses sin publicar, las tres metodologías, el desplegable | 0003 |
| Fechas exactas, prorrateo dentro del mes | 0004 |
| Comparar contra el MCP u otra calculadora | 0005 |
| El REM | 0006 |
| Cómo se revisa (el paso 4 de acá) | 0007 |
| Analytics, privacidad, qué se mide | 0008 |

## Las reglas que no se negocian

**1. El sitio no llama al MCP en runtime.** Un Action diario baja las series y commitea
`public/data/*.json`. Así la API key nunca llega al browser, el sitio anda aunque el MCP
esté caído, y queda versionado qué números se mostraron cada día. Si algo parece necesitar
la key en el cliente, el diseño está mal — no hay que ofuscarla.

**2. Dato y estimación nunca se mezclan sin decirlo.** Cada fila y cada porcentaje declara
si es un dato publicado o una cuenta nuestra. Las filas prorrateadas van marcadas y **no
llevan el sello del organismo**: ese porcentaje no lo publicó nadie.

**3. Un control no ofrece lo que no puede cumplir.** Si una opción no se puede honrar para
el período elegido, se deshabilita y se explica al lado — no se ofrece y después se aclara
abajo que en realidad se hizo otra cosa.

**4. Un criterio se escribe una sola vez.** Si la interfaz y el motor tienen que estar de
acuerdo sobre algo, sale de la misma función, con un test que ate las dos puntas. Duplicar
el criterio es cómo el desplegable termina mintiendo seis meses después.

**5. No se rompe la privacidad del analytics.** Sin IP, sin identificador persistente, sin
cookies. De ahí depende que el sitio no necesite banner ni sea una base de datos personales.
Ver 0008 antes de agregar cualquier medición.

## Paso 1 — Entender el caso real

Escribí en una línea qué le pasa a la persona que va a usar esto. Si no se puede escribir,
probablemente el cambio no tenga un caso de uso atrás — y este sitio ya perdió una vez
funcionalidad por eso (los presets de 0002).

## Paso 2 — Implementar

- La aritmética de inflación vive en `src/engine/`. La orquestación y el pintado, en
  `src/ui/`. **No se hace ninguna cuenta en `src/ui/`.**
- Los meses son strings `YYYY-MM` y la aritmética está en `src/engine/mes.ts`, sin `Date` y
  sin zonas horarias. No introduzcas `Date` para operar con meses.
- Todo texto visible va en castellano rioplatense, con vos.
- Si el cambio toca cómo se calcula o cómo se explica, **agregá o actualizá una entrada en
  `docs/decisiones/`**. Si una decisión ya existente queda revertida, se actualiza ese
  documento — no se crea uno nuevo.

## Paso 3 — Verificar que anda

```bash
npm run verificar     # typecheck + tests + build, todo junto
```

Y después, **miralo en un browser de verdad**. No es opcional y no es ceremonia: el gráfico
de barras estuvo roto en producción —las barras se quedaban en cero— pasando todos los
tests, porque nadie lo había mirado. Si tenés una herramienta de browser disponible, usala;
si no, `npm run dev` y abrilo vos.

Si vas a verificar en producción después de deployar, agregá un parámetro de cache-busting
(`?v=algo`): ya pasó de comparar el hash del bundle, ver que era idéntico, y estar mirando
el HTML viejo de caché.

## Paso 4 — El gate de revisión

**Cualquier cambio que toque el número o su explicación pasa por acá.** Es el paso que más
errores encontró en este repo, y los encontró porque son **dos perfiles opuestos**: el
número puede estar mal (lo ve quien sabe) o puede estar bien y no entenderse (lo ve quien no
sabe). Un solo revisor no encuentra las dos.

Despachá los dos **en paralelo y sin que se vean entre sí**:

- **`revisor-economista`** — si tocaste el motor, las series, las metodologías o el
  prorrateo.
- **`revisora-usuaria`** — si tocaste algo que se ve o se lee: textos, tabla, gráfico,
  explicación, el texto que se copia.

Si el cambio toca las dos cosas, van los dos. Si sólo cambiaste un texto, alcanza con la
usuaria; si sólo tocaste el motor sin cambiar nada visible, alcanza con el economista.

### Cómo pedirles la revisión

**Dales el material completo.** Una vez se pidió un botón de "copiar explicación" que ya
existía: no se lo habíamos mostrado. Ese hallazgo era artefacto del prompt, no del producto,
y costó trabajo al pedo. Decile a la revisora qué hay en pantalla y qué se puede tocar.

**Dales el caso concreto**, con montos y fechas reales, no "revisá el sitio".

### Qué hacer con lo que devuelven

**Verificá cada hallazgo antes de actuar.** Un revisor puede tener razón en el fondo y
equivocarse en el número — ya pasó. El número que termina en el repo es el que verificaste
vos.

**Lo que confirman como correcto, no se toca.** Sin esa lista se cambian por las dudas cosas
que funcionaban.

**Si uno refuta una hipótesis tuya, aceptalo.** Ya pasó que una hipótesis sobre etiquetado
parecía obvia, era falsa, y "arreglarla" habría roto algo que andaba.

Las dos listas suelen **no superponerse casi nada** y las dos suelen ser ciertas.

## Paso 5 — Cerrar

- `docs/decisiones/` actualizado si el cambio movió una decisión.
- El README sigue diciendo la verdad. Ya pasó de documentar lo contrario de lo configurado,
  que es peor que no documentar: el siguiente "arregla" algo que estaba bien.
- Mensaje de commit que explique **por qué**, no qué. El qué está en el diff.
