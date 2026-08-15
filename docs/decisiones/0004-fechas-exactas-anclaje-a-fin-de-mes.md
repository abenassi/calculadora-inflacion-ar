# 0004 · Fechas exactas: el índice de un mes vale al terminarlo

## Contexto

El IPC es mensual. El modo por fechas exactas necesita ubicar un día dentro del mes, y
para eso hay que decidir **a qué momento del mes corresponde el índice publicado**.

La primera versión lo ancló al **día 1**: el índice de mayo es el nivel del 1 de mayo,
y un día posterior se interpola hacia el índice de junio.

## El problema

Esa convención tiene tres consecuencias, y ninguna se ve hasta que la mirás de cerca.

**Uno.** La explicación honesta de lo que hacía era *"los días de mayo se ajustan con
la inflación de junio"*. Indefendible ante alguien que pregunta.

**Dos.** El tramo calendario del 1 de marzo al 1 de abril contenía la inflación de
**abril**. Contraintuitivo hasta el ridículo para cualquier lector.

**Tres, y es la que más cuesta:** es el único de los tres anclajes posibles que
necesita el índice del **mes siguiente**. Eso obligaba a correr la ventana de
referencia un mes de más. Se pagaba un mes de frescura por la convención menos exacta.

Porque además era la menos exacta. El índice de un mes sale de precios relevados **a
lo largo de todo el mes**, así que como foto corresponde aproximadamente al día 15.
Medido sobre el tramo 15-feb → 10-may de la serie real:

| Dónde se ancla el índice del mes | Resultado |
|---|---|
| Día 1 (la versión original) | 7,13% |
| Mitad de mes (lo más exacto) | 7,68% |
| Fin de mes | 8,24% |

Sobre $520.000 son unos $4.000 de diferencia. El sesgo se cancela entre las dos puntas
sólo si la tasa mensual es estable; con la desinflación actual el residuo es grande y
**siempre subestima**.

## Decisión

**Anclaje a fin de mes**: el índice de un mes es el nivel al que se llega al
terminarlo. Un día prorratea la inflación de su **propio** mes, geométricamente.

El 1 de junio y el cierre de mayo son, por construcción, el mismo punto.

No se eligió mitad de mes, que es el más exacto, porque cada fila mezclaría dos meses
y no hay forma de explicárselo al público del sitio. Fin de mes es igual de inexacto
en magnitud pero de signo opuesto, y se explica en una frase repetible: *"en mayo la
inflación fue 2,15% y usaste 9 días, así que va la parte proporcional"*.

## Consecuencias

- **Se gana un mes de frescura.** Un día del último mes publicado ya no fuerza el
  corrimiento de la ventana. En el caso testigo la referencia pasó de arrancar el 15
  de febrero a arrancar el 15 de marzo.
- **Desapareció un desfasaje de honestidad.** Antes, la última fila interpolaba con el
  mes siguiente, así que el cálculo usaba un mes estimado más de los que declaraba.
- El tramo del 1 de marzo al 1 de abril ahora contiene la inflación de marzo.
- **El 1 de un mes ya no equivale al mes en modo mensual.** Es inherente: los dos
  modos comparan cosas distintas, niveles de meses contra niveles de días.
- El primer mes de la serie no admite fechas, porque prorratear necesita el mes
  anterior. Falla con un mensaje explícito.

## Lo que se sacó del texto: el CER

El código afirmaba usar *"el criterio del coeficiente CER del BCRA"*. **Es falso.**

El CER se calcula con meses **ya publicados**, con un retraso de alrededor de dos
meses (Resolución MECON 47/2002), justamente porque tiene que poder computarse todos
los días sin esperar al INDEC. El sitio hace lo contrario. Lo único que comparten es
que el reparto es geométrico.

Y hay un problema de categoría además del de timing: el CER es una **convención
contractual fijada por decreto**, no un intento de estimar el nivel de precios de un
día. Su autoridad es legal, no estadística.

Invitar a esa comparación era pedir que alguien la hiciera y encontrara que los
números no dan. La página `/datos` ahora explica la diferencia en vez de reclamar el
parentesco.

## Lo que sigue siendo cierto y hay que decir

Ningún reparto por día puede ser exacto, porque el índice mensual no es la foto de un
día. El resultado puede moverse alrededor de medio mes de inflación en cada punta. Por
eso el modo por meses es el default y `/datos` recomienda usarlo si el número tiene
que ser indiscutible.

Las filas de las puntas van marcadas **`prorrateado`** y no con el sello del INDEC: ese
porcentaje no es una cifra que el INDEC haya publicado, es una cuenta nuestra sobre un
dato suyo.

## Lo que se apoyó después en esta convención

Que el dato de un mes valga por **todos los días de ese mes** es lo que permite contestar
un período de 29 días sin publicar con el último mes publicado prorrateado, en vez de ir a
buscar el mismo día del mes unos meses atrás. Ver `0013`.
