# Trabajar en este repo

Calculadora de inflación argentina. Sitio estático, TypeScript sin framework, datos vía
[Argentina Data MCP](https://argentinadata.mymcps.dev).

**Antes de implementar cualquier cambio, usá la skill `cambiar-la-calculadora`**
(`.claude/skills/cambiar-la-calculadora/`). Trae el orden de trabajo y el gate de revisión.
Lo de acá es el mínimo que hay que saber aunque no vayas a tocar nada.

## La promesa del sitio

No es dar un número: es dar un número que **la persona pueda defender ante otra persona**.
Casi todas las reglas salen de ahí. Si un cambio hace el resultado más lindo pero menos
explicable, va para atrás.

## Cinco reglas que no se negocian

1. **El sitio no llama al MCP en runtime.** Un GitHub Action diario baja las series y
   commitea `public/data/*.json`. La API key vive sólo en los secrets del repo y **nunca**
   puede llegar al browser — ojo con las variables `VITE_*`, que terminan en el bundle
   público.
2. **Dato y estimación nunca se mezclan sin decirlo.** Cada fila declara si es un dato
   publicado por el INDEC o una cuenta nuestra. Las filas prorrateadas no llevan el sello
   del INDEC. Y al revés, que es la mitad que se olvida: **no prometas dato oficial donde
   no lo hay.** Un pie que dice "el resto son datos oficiales" sin haber resto, o una
   referencia de "dato oficial" con todas las barras rayadas, hace desconfiar de lo que sí
   es cierto.
3. **Un control no ofrece lo que no puede cumplir.** Si una opción no se puede honrar para
   el período elegido, se deshabilita y se explica al lado.
4. **Un criterio se escribe una sola vez.** Si la interfaz y el motor tienen que coincidir,
   sale de la misma función, con un test que ate las dos puntas.
5. **El analytics no guarda IP ni usa cookies.** De eso depende que el sitio no necesite
   banner de consentimiento ni sea una base de datos personales bajo la Ley 25.326. Ver
   `docs/decisiones/0008`.

## Dónde está cada cosa

| | |
|---|---|
| `src/engine/` | Toda la aritmética. Meses como strings `YYYY-MM`, sin `Date` ni zonas horarias |
| `src/ui/` | Orquestación y pintado. **Acá no se hace ninguna cuenta** |
| `scripts/fetch-snapshot.ts` | Lo único que sabe de qué se trata el proyecto en el pipeline |
| `scripts/mcp-client.ts` | Cliente del MCP. Reusable tal cual en otro proyecto |
| `public/data/*.json` | El snapshot, versionado. **No hace falta la API key para desarrollar** |
| `docs/decisiones/` | El porqué de cada decisión, con la evidencia que la produjo |

## Verificar

```bash
npm run verificar   # typecheck + tests + build
npm run dev         # servidor local
```

**Y miralo en un browser.** El gráfico estuvo roto en producción pasando todos los tests,
porque nadie lo había abierto.

## Revisión: dos perfiles opuestos

Cualquier cambio que toque el número o su explicación se revisa con los dos agentes de
`.claude/agents/`, **en paralelo y sin que se vean entre sí**:

- **`revisor-economista`** — audita el método contra el código y los datos reales.
- **`revisora-usuaria`** — una persona que necesita el número para trabajar y no maneja
  porcentajes.

No es redundancia: el número puede estar mal (lo ve quien sabe) o estar bien y no entenderse
(lo ve quien no sabe). Sus listas casi no se superponen y las dos suelen ser ciertas.
`docs/decisiones/0007` cuenta qué encontró cada uno.

**Verificá cada hallazgo antes de actuar**, incluso los del especialista.

## Castellano

Todo lo visible va en castellano rioplatense, con vos. Los comentarios y los mensajes de
commit también: explican **por qué**, no qué.
