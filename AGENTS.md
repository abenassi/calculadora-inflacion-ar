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
| `src/ui/explicaciones.ts` | Las frases que explican un resultado. Sin `document` a propósito: son la parte que puede mentir, y así se pueden testear |
| `scripts/fetch-snapshot.ts` | Lo único que sabe de qué se trata el proyecto en el pipeline |
| `scripts/generar-paginas.ts` | Las páginas por año (`/inflacion-2024/`), que se arman en el build. **No hacen ninguna cuenta propia**: salen de `resumenAnual()`, que llama a `adjust()` |
| `scripts/mcp-client.ts` | Cliente del MCP. Reusable tal cual en otro proyecto |
| `public/data/*.json` | El snapshot, versionado. **No hace falta la API key para desarrollar** |
| `docs/decisiones/` | El porqué de cada decisión, con la evidencia que la produjo |

## Verificar

```bash
npm run verificar   # typecheck + tests + build
npm run dev         # servidor local
```

**Y miralo en un browser** — con `mcp__playwright__*` si lo tenés, y si no con cualquier
otra herramienta de browser. El gráfico estuvo roto en producción pasando todos los tests,
porque nadie lo había abierto. Los tres revisores también abren el sitio: casi todo lo que
revisan lo arma el JS y en `index.html` no existe.

## Desarrollar acá es un loop, no una checklist

Se implementa, se manda a revisar, se actúa sobre lo que vuelve, **y se manda a revisar de
nuevo**. Tiene tres salidas: una vuelta que no trae nada nuevo, una vuelta cuyos hallazgos
rechazás con la razón escrita, o el **techo de tres vueltas** que encuentran cosas — a la
tercera, el cambio es demasiado grande y hay que partirlo. El paso a paso está en la skill;
acá va el mapa.

Los tres revisores viven en `.claude/agents/` y van **en paralelo y sin verse entre sí**.

> **Abrí el asistente adentro de este directorio.** Los agentes de `.claude/agents/` se
> registran por proyecto: si abrís Claude Code en el directorio padre y trabajás desde ahí,
> no aparecen y `revisora-usuaria` no existe como tipo de agente. Se nota rápido —
> "Agent type not found"— pero es fácil confundirlo con que el repo no los trae.

- **`revisor-economista`** — audita el método contra el código y los datos reales.
- **`revisora-usuaria`** — una persona que necesita el número para trabajar y no maneja
  porcentajes.
- **`revisor-codigo`** — busca dónde el código puede empezar a mentir aunque hoy dé bien.
  **Va siempre**, incluso en un cambio de texto.

No es redundancia: el número puede estar mal (lo ve quien sabe), estar bien y no entenderse
(lo ve quien no sabe), o estar bien hoy y mentir en tres meses (lo ve quien mira el código).
Las tres listas casi no se superponen y las tres suelen ser ciertas.
`docs/decisiones/0007` cuenta qué encontró cada uno y por qué el loop está armado así.

Dos cosas que hacen que el loop termine y no dé vueltas para siempre:

- **Llevá un registro de todos los hallazgos vistos, no sólo de los arreglados.** Los
  rechazados también se anotan, con la razón, y se les pasan a los revisores en la vuelta
  siguiente. Sin eso vuelven a levantar lo mismo cada vez.
- **Verificá cada hallazgo antes de actuar**, incluso los del especialista. Ya pasó dos
  veces que el reporte tuviera razón en el fondo y el diagnóstico correcto saliera recién
  de la verificación.

## Castellano

Todo lo visible va en castellano rioplatense, con vos. Los comentarios y los mensajes de
commit también: explican **por qué**, no qué.
