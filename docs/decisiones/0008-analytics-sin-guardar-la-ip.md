# 0008 · Analytics propio, sin guardar la IP

## Contexto

El sitio salió a producción sin ninguna medición. GitHub Pages no expone access logs, así
que no había ni un contador de visitas: literalmente no se sabía si había entrado una
persona o mil.

La opción obvia era pegar Plausible, Umami o Google Analytics y terminar en diez minutos.

## Por qué no alcanzaba una herramienta lista

Lo que esas herramientas contestan bien —cuánta gente entró, de dónde vino, con qué
dispositivo— es lo barato. La pregunta cara es **qué calcula la gente**: qué montos, qué
períodos, cuánto se van para atrás en el tiempo, qué metodología eligen. Eso vive adentro
de la app y ninguna herramienta genérica lo ve.

Y hay una segunda razón, específica de este proyecto: el sitio existe para promocionar
Argentina Data MCP, así que la pregunta que hay que poder contestar es *¿alguna
suscripción vino de acá?*. Con los eventos en la misma base que los usuarios del MCP, eso
es un JOIN. Con los eventos en la nube de un tercero, es un proyecto.

## Decisión

Un endpoint propio (`POST /api/eventos` en la API del MCP) que escribe en una tabla
`eventos_web` del mismo Postgres donde viven los usuarios y el log de llamadas.

## El punto que importa: no se guarda la IP

La IP es dato personal bajo la Ley 25.326. Guardarla convertiría al proyecto en
responsable de una base de datos personales —registro ante la AAIP, derechos de acceso y
supresión, deber de seguridad— y todo eso para obtener la identidad, que no es lo que
hace falta. Lo que hace falta es **contar personas distintas**, que es otra cosa.

El visitante es entonces:

```
sha256(sal_del_día || ip || user-agent || sitio)
```

La IP entra en el hash y se descarta en el mismo request: nunca se escribe.

**La propiedad que hace que esto funcione está en la sal, no en el hash.** La sal es
aleatoria, vive un período y se borra al rotar. Mientras existe, alguien con la sal y una
IP candidata podría verificar si esa IP estuvo — por eso se borra. Después de borrada, el
hash viejo no se puede revertir ni teniendo la base entera y la IP sospechada: no queda con
qué recomputarlo.

Eso es lo que separa este diseño de una promesa de política. No es que no miremos: es que
no se puede.

### La ventana de rotación: de 1 día a 30 (2026-08-22)

La sal rotaba **cada día**. Rota **cada 30 días corridos**, y al rotar se borra la anterior:
existe una sola sal viva a la vez.

El motivo del cambio es que con rotación diaria el sitio no podía contestar ninguna pregunta
sobre personas. Cuántas hay de verdad en un mes, cuántas vuelven, cuántas de las que vuelven
terminan yendo al MCP: el mismo navegador era un hash nuevo cada mañana, así que "visitantes"
sobre cualquier ventana de más de un día era una suma de conteos diarios donde alguien que vino
tres días figuraba como tres personas. El panel lo decía —el campo se llamaba `visitantes_dia`—
pero decirlo no lo arregla: la métrica seguía sin existir. Al 2026-08-21, con nueve días de
datos, los 25 visitantes registrados tenían **todos** exactamente un día de actividad, que es lo
que el diseño garantizaba por construcción y no un hallazgo sobre la gente.

**Qué se paga, exactamente.** No cambia la naturaleza de la garantía: la IP sigue sin escribirse
nunca, el hash sigue sin poder recomputarse una vez borrada la sal, y sigue sin haber cookies ni
identificador en el cliente. Cambia **cuánto tarda esa garantía en hacerse efectiva**: la ventana
en la que alguien con acceso a la base y una IP candidata podría verificar si esa IP estuvo pasa
de 1 día a 30.

Es una decisión tomada con ese costo a la vista, y lo que no es negociable es que el sitio lo
diga: prometer rotación diaria en `/datos` mientras el servidor rota cada 30 días sería peor que
cualquiera de las dos alternativas.

**Por qué 30 días corridos y no el mes calendario.** Para que la garantía sea pareja —"la sal
nunca vive más de 30 días"— en vez de depender de si el mes tiene 28 o 31.

Tampoco se guarda el user-agent crudo (sólo dispositivo/navegador/SO, porque el UA
completo es casi una huella digital) ni la URL completa del referrer (sólo el host, porque
la URL entera filtra búsquedas privadas y rutas internas ajenas).

## Lo que se paga

**Un visitante no se puede seguir de un período al siguiente.** Quien viene el día 29 de una
ventana y vuelve el día 2 de la próxima son dos hashes distintos: es un corte real y no se
compensa con nada. Las curvas de recurrencia se leen adentro del período, y contar visitantes
distintos sobre 90 días o un año vuelve a contar dos veces a quien cruzó una rotación — por eso
el reporte devuelve `visitantes_confiables` y el panel avisa cuando la ventana elegida supera los
30 días, en vez de capar la ventana y esconder el problema.

Tampoco hay identidad entre dispositivos ni entre navegadores: cada uno es una persona distinta,
como en cualquier medición sin login.

Lo que sí queda, y no cambió, es el embudo completo **dentro de la visita**, vía un id de sesión
que genera el cliente en `sessionStorage` y muere al cerrar la pestaña.

Se eligió a conciencia: la alternativa era un identificador persistente en el cliente, que da
cohortes entre dispositivos y a cambio trae el banner de consentimiento, el aviso de privacidad y
la categoría legal entera.

## Consecuencias

- **El sitio no necesita banner de cookies**, porque no hay ninguna. El banner que no
  existe es la mejor prueba de que el diseño se sostiene.
- La página `/datos` explica esto en castellano llano, incluido el link al archivo que
  manda los eventos. Alguien que quiera verificar la afirmación puede leerlo en dos
  minutos.
- El endpoint es público y sin auth, así que va cerrado por default: allowlist de sitios y
  de eventos, tope de props, límite por IP, y **204 siempre** —incluso al descartar—,
  porque un 4xx sólo le sirve a quien quiera sondear qué acepta.
- Nunca tira. Un evento perdido es un renglón menos en un gráfico; un 500 en el camino
  sería un usuario menos.

## Si forkeaste este repo, no manda nada

`src/ui/analytics.ts` sólo emite desde un hostname que esté en su mapa `SITIOS`. Un fork
desplegado en otro lado, o corriendo en `localhost`, es un no-op completo: no hay red, no
hay endpoint, no hay que acordarse de apagar nada ni pedir una key.

Es deliberado, y no sólo por cortesía. Si el interruptor fuera una variable de entorno que
hay que acordarse de desactivar, cada fork nos mandaría eventos indistinguibles de los
nuestros y los conteos dejarían de ser de este sitio. **Un default que depende de que el
otro se acuerde no es un default.**

Para prender el tuyo: agregá tu hostname al mapa y apuntá `ENDPOINT` a tu propio backend.

## Por qué no se agregó Google Analytics (2026-08-22)

Se evaluó pegarle GA4 al sitio, en la misma conversación que subió la sal a 30 días. No se hizo,
y el motivo no es ideológico.

Primero, un dato que conviene tener a mano porque circula al revés: **GitHub Pages no tiene
ninguna integración con Google Analytics.** Lo que existe es una opción de los temas de Jekyll
(`google_analytics:` en `_config.yml`) que escribe el snippet por vos. Este sitio es Vite +
TypeScript, no Jekyll, así que en cualquier caso sería pegar `gtag.js` a mano en cada HTML.

Y después, la disyuntiva que no tiene punto medio:

- **GA4 con su default** pone la cookie `_ga`, un identificador persistente de hasta dos años, y
  manda los eventos a Google. Eso obliga a un banner de consentimiento, a reescribir la sección de
  privacidad de `/datos`, y a que la frase "no se comparte nada con Google" deje de ser cierta.
  Encima, en Safari e iOS el ITP le borra esa cookie a los 7 días de inactividad, así que la
  retención larga que uno cree estar comprando no llega entera.
- **GA4 sin cookies** (`client_storage: 'none'`, o consent mode con `analytics_storage` denegado)
  no rompe ninguna promesa, pero manda pings sin identificador: no cuenta usuarios ni sesiones. El
  modelado estadístico con el que Google tapa ese agujero exige del orden de 1.000 usuarios diarios
  consintiendo; este sitio está tres órdenes de magnitud abajo.

O sea: la versión de GA que no rompe nada no mide personas, y la que mide personas cuesta el
banner. Lo único que GA agregaría de verdad sobre el analytics propio es **de qué búsquedas llega
la gente**, y eso lo da Google Search Console: gratis, sin código en la página, sin cookies y sin
tocar `/datos`. Ese es el camino elegido.

Si algún día se decide asumir el banner, esta decisión se actualiza acá — no se agrega GA en
silencio.
