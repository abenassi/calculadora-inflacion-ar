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
aleatoria, distinta cada día, y se borra a los dos días. Mientras existe, alguien con la
sal y una IP candidata podría verificar si esa IP estuvo — por eso se borra. Después de
borrada, el hash de anteayer no se puede revertir ni teniendo la base entera y la IP
sospechada: no queda con qué recomputarlo.

Eso es lo que separa este diseño de una promesa de política. No es que no miremos: es que
no se puede.

Tampoco se guarda el user-agent crudo (sólo dispositivo/navegador/SO, porque el UA
completo es casi una huella digital) ni la URL completa del referrer (sólo el host, porque
la URL entera filtra búsquedas privadas y rutas internas ajenas).

## Lo que se paga

**Un visitante no se puede seguir de un día al otro.** No hay cohortes, no hay retención a
30 días, no hay "usuarios que vuelven en la semana". Sobre una ventana de varios días, la
suma de visitantes únicos diarios cuenta tres veces a quien vino tres días.

Lo que sí queda es el embudo completo **dentro de la visita**, vía un id de sesión que
genera el cliente en `sessionStorage` y muere al cerrar la pestaña.

Se eligió a conciencia: la alternativa era un identificador persistente, que da cohortes y
a cambio trae el banner de consentimiento, el aviso de privacidad y la categoría legal
entera.

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
