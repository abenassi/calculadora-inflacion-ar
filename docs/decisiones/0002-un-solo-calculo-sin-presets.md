# 0002 · Un solo modo de cálculo

## Contexto

El diseño original tenía cuatro presets: *¿cuánto vale hoy?*, *actualizar un
presupuesto*, *actualizar un sueldo*, *actualizar un alquiler*. Cambiaban etiquetas y
valores por defecto, no el motor.

Parecían una buena idea: hablarle a cada persona en su vocabulario.

## Decisión

Se eliminaron todos. Hay **un** formulario: un monto, dos fechas, el IPC.

Queda un único control opcional, apagado por defecto: el checkbox de fechas exactas
(ver [0004](0004-fechas-exactas-anclaje-a-fin-de-mes.md)).

## Por qué

Los presets sugerían que había **cálculos distintos** cuando siempre había uno solo.
Eso genera una pregunta que la persona no tiene forma de contestar —*¿elegí bien?*—
antes de poder hacer la única pregunta que traía.

El caso del alquiler lo dejaba en evidencia: el preset tenía que aclarar que calculaba
IPC y que, desde el DNU 70/2023, la actualización contractual es la que las partes
pactaron. O sea que el preset creaba una expectativa equivocada y después la
desactivaba con letra chica.

## Consecuencias

- Menos código, menos estado, menos superficie de bugs. Un bug real que desapareció
  con esto: un link compartido con el preset de alquiler pisaba el mes de destino de
  la URL.
- El mismo motor contesta todos los casos, así que no hay forma de que dos preguntas
  equivalentes den números distintos.
- Se pierde la posibilidad de guiar a alguien que no sabe qué está buscando. Es un
  costo real y se asumió: quien llega a una calculadora de inflación ya sabe qué
  quiere, y lo que necesita es que el resultado sea defendible, no que la interfaz le
  hable en su jerga.

## Regla que dejó

Un control nuevo tiene que cambiar el **resultado**, no la decoración. Si sólo cambia
etiquetas, es ruido que le hace dudar a la persona de si eligió bien.
