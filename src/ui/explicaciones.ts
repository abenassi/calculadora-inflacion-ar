/**
 * Los textos que explican un resultado.
 *
 * Viven fuera de `main.ts` por una razón concreta: **son la parte del sitio que puede
 * mentir**. Un número mal calculado lo caza un test del motor; una frase que dice "acá no
 * hay nada estimado" sobre una tabla con filas selladas `estimado` pasaba los 105 tests
 * sin despeinarse, porque estaba enterrada en un módulo que ningún test podía importar
 * —`main.ts` toca el DOM apenas se carga—.
 *
 * Acá adentro no hay ni un `document`: todo es `Resultado` entra, string sale. Eso es lo
 * que hace posible `tests/explicaciones.test.ts`, que recorre una matriz de períodos y
 * exige que ninguna de estas frases prometa dato oficial donde hay estimación (regla 2).
 */

import { sumaDeVariaciones, tasaMensualDelRem } from "../engine/adjust.js";
import { diasEntre, esFecha, mesDe, nombrarMes, nombrarPunto, soloMes } from "../engine/mes.js";
import type { Mes, Resultado } from "../engine/types.js";
import { fuenteDe, quienPublicaAhora } from "./etiquetas.js";

/** Para arrancar una oración con el organismo, que viene con el artículo en minúscula. */
export const capitalizar = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
import { comoSeMuestra, pesos, porcentaje } from "./format.js";

/** A partir de cuántos meses proyectados dejamos de tratarlo como una cuenta razonable. */
export const MESES_PROYECCION_LARGA = 4;

export function listar(nombres: string[], union = "y"): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} ${union} ${nombres.at(-1)}`;
}

/**
 * Nombra una lista de meses en castellano legible: hasta tres los enumera
 * colapsando el año repetido ("julio y agosto de 2026"); de ahí en más los resume
 * como rango, porque enumerar doce meses produce una oración que nadie lee.
 */
export function frasearMeses(meses: Mes[], union = "y"): string {
  if (meses.length === 0) return "";
  if (meses.length > 3) {
    return `los ${meses.length} meses que van de ${nombrarMes(meses[0]!)} a ${nombrarMes(meses.at(-1)!)}`;
  }
  const anios = new Set(meses.map((m) => m.slice(0, 4)));
  if (anios.size === 1) {
    return `${listar(meses.map(soloMes), union)} de ${meses[0]!.slice(0, 4)}`;
  }
  return listar(meses.map(nombrarMes), union);
}

/**
 * "un aumento de 11,53%" / "una baja de 10,34%". El signo no se lee en una frase.
 *
 * Con una variación que se imprime como cero no hay dirección que nombrar: "un aumento de
 * 0,00%" es la frase que salía al pedir un mes contra sí mismo, y afirma un movimiento que
 * el propio número desmiente.
 */
export function frasearVariacion(pct: number): string {
  if (comoSeMuestra(pct) === 0) return "el mismo poder de compra";
  return `${pct < 0 ? "una baja" : "un aumento"} de ${porcentaje(Math.abs(pct), false)}`;
}

export function plural(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

/** El resultado dicho en una línea, antes de explicar de dónde sale. */
export function resumir(r: Resultado): string {
  return `${pesos(r.monto)} de ${nombrarPunto(r.desde)}, con ${frasearVariacion(r.variacionPct)}.`;
}

/**
 * Por qué el número es ese y con qué meses se calculó.
 *
 * Es lo único que separa un resultado defendible de un número que apareció solo.
 * Tiene que nombrar los meses concretos que se usaron, siempre.
 *
 * Va separado de `resumir` porque el texto que se copia ya trae el monto y el
 * porcentaje en sus primeras dos líneas: repetirlos ahí lee como un error.
 */
export function explicarMetodo(r: Resultado): string {
  switch (r.metodo.tipo) {
    case "directo":
      return `Todos los meses del cálculo son datos oficiales ya publicados por ${fuenteDe(r.desglose, r).publicadosPor}.`;

    case "ventana_reciente": {
      const { mesesDelPeriodo, mesesSinPublicar } = r.metodo;
      // Con fechas exactas el período casi nunca son meses redondos: del 15 de mayo
      // al 10 de agosto no pasaron 3 meses, pasaron 87 días. Decir "3 meses" es
      // falso y lo detecta cualquiera que mire el calendario.
      const largo = esFecha(r.desde) || esFecha(r.hasta)
        ? `pasaron ${diasEntre(r.desde, r.hasta)} días`
        : plural(mesesDelPeriodo, "pasó 1 mes", `pasaron ${mesesDelPeriodo} meses`);
      const contexto =
        `De ${nombrarPunto(r.desde)} a ${nombrarPunto(r.hasta)} ${largo}, y ` +
        `${quienPublicaAhora(r)} todavía no publicó ${frasearMeses(mesesSinPublicar, "ni")}. `;
      // El resultado se muestra con "~" y antes esta frase decía que no había
      // ninguna estimación. Las dos cosas son ciertas y juntas se contradicen, así
      // que la aproximación tiene que quedar atribuida a su causa real.
      const cierre =
        `Son todos datos publicados por ${fuenteDe(r.desglose, r).publicadosPor}; el ~ está porque ` +
        `el tramo que se usó no es exactamente el tuyo.`;

      // En modo por día las filas son fechas, no meses: enumerar sus meses
      // duplicaría el del extremo. Se nombra el tramo por sus puntas, que además
      // es lo que efectivamente se calculó.
      if (esFecha(r.desglose[0]!.punto)) {
        return (
          `${contexto}Así que usamos el tramo equivalente más reciente que sí está publicado: ` +
          `del ${nombrarPunto(r.desglose[0]!.punto)} al ${nombrarPunto(r.desglose.at(-1)!.punto)} ` +
          `(${diasEntre(r.desglose[0]!.punto, r.desglose.at(-1)!.punto)} días). ${cierre}`
        );
      }

      const usados = frasearMeses(r.desglose.slice(1).map((f) => mesDe(f.punto)));
      return (
        `${contexto}Así que usamos la inflación de ` +
        `${plural(mesesDelPeriodo, "el último mes publicado", `los últimos ${mesesDelPeriodo} meses publicados`)} ` +
        `(${usados}). ${cierre}`
      );
    }

    case "proyeccion": {
      const { mesesEstimados, tasaMensualPct, base } = r.metodo;
      const n = mesesEstimados.length;

      // Se puede pedir una metodología de estimación sobre un período que ya está
      // publicado entero: no queda nada que estimar y la frase salía con la lista de
      // meses vacía — "El INDEC todavía no publicó ," con la coma colgando.
      //
      // "Ningún mes estimado" no es lo mismo que "ninguna fila estimada": pidiendo
      // agosto de 2026 contra agosto de 2026 no hay ningún tramo que proyectar, pero la
      // única fila de la tabla sale sellada `estimado` porque ese índice todavía no se
      // publicó. La pregunta la contesta `hayAlgoEstimado`, que es la misma que decide
      // el chip y las leyendas: contestarla dos veces es cómo el cartel y el texto
      // terminaron diciendo cosas opuestas sobre la misma tabla.
      if (n === 0) {
        return hayAlgoEstimado(r)
          ? `El período empieza y termina en el mismo punto, así que el monto no cambia. ` +
              `La fila igual queda marcada como estimada: ${quienPublicaAhora(r)} todavía no ` +
              `publicó ese mes.`
          : `Todos los meses del cálculo son datos oficiales ya publicados por ${fuenteDe(r.desglose, r).publicadosPor}.`;
      }

      // Acá había una aclaración para el caso "elegiste no estimar ninguno y aun así
      // estás viendo filas estimadas". Ya no puede pasar: cuando el período obliga a
      // proyectar, esa opción queda deshabilitada en el selector y el desplegable pasa
      // solo a la metodología que se está usando. El motivo se explica al lado del
      // control, que es donde se toma la decisión, en vez de acá abajo.
      const faltan =
        `${capitalizar(quienPublicaAhora(r))} todavía no publicó ` +
        `${frasearMeses(mesesEstimados, "ni")}, así que ` +
        `${plural(n, "ese mes se estima", "esos meses se estiman")} `;

      if (base.fuente === "rem") {
        const { mesesDeLaSenda, mesesExtrapolados } = base;
        const rem = `REM del BCRA (encuesta de ${nombrarMes(base.mesEncuesta)})`;

        // La senda llega hasta unos seis meses; más allá no hay pronóstico mes a mes
        // y hay que repartir el número a doce meses. Esa parte es una cuenta
        // nuestra, no algo que los analistas hayan dicho, así que va nombrada aparte.
        if (mesesExtrapolados.length === 0) {
          return (
            `${faltan}con el ${rem}: los analistas pronosticaron un valor para cada uno de ` +
            `esos meses, y son los que ves en la columna Subió.`
          );
        }
        if (mesesDeLaSenda.length === 0) {
          return (
            `${faltan}con el ${rem}. Su pronóstico mes a mes no llega tan lejos, así que se ` +
            `reparte pareja su expectativa a doce meses ` +
            `(${porcentaje(base.expectativaAnualPct, false)}), o sea ` +
            `${porcentaje(tasaMensualDelRem(base.expectativaAnualPct))} por mes.`
          );
        }
        return (
          `${capitalizar(quienPublicaAhora(r))} todavía no publicó ` +
          `${frasearMeses(mesesEstimados, "ni")}. Hasta ` +
          `${nombrarMes(mesesDeLaSenda.at(-1)!)} se usa el pronóstico mes a mes del ${rem}. ` +
          `De ahí en adelante el REM mensual ya no llega, así que ${frasearMeses(mesesExtrapolados)} ` +
          `${plural(mesesExtrapolados.length, "sale", "salen")} de repartir pareja su expectativa ` +
          `a doce meses (${porcentaje(base.expectativaAnualPct, false)}), o sea ` +
          `${porcentaje(tasaMensualDelRem(base.expectativaAnualPct))} por mes.`
        );
      }

      return (
        `${faltan}repitiendo la última inflación publicada, la de ` +
        `${nombrarMes(base.mes)} (${porcentaje(tasaMensualPct ?? 0)}).`
      );
    }
  }
}

/** El párrafo completo de la tarjeta: el resultado más su justificación. */
export function explicar(r: Resultado): string {
  return `${resumir(r)} ${explicarMetodo(r)}`;
}

/**
 * Las filas de las puntas, en modo por día, son días sueltos: llevan la parte
 * proporcional de la inflación de su mes, no un número que el INDEC haya publicado.
 * Mezcladas con meses completos en la misma columna, hay que decirlo.
 */
export function aclararParciales(r: Resultado): string {
  // Sólo las que **se ven** prorrateadas. El sello de una fila estimada dice `estimado`,
  // no `prorrateado`: contando esas, el pie mandaba a buscar dos filas prorrateadas en una
  // tabla donde las nueve decían `estimado`.
  const parciales = r.desglose.filter((f) => f.esParcial && !f.esProyeccion).length;
  if (parciales === 0) return "";
  return (
    ` ${plural(parciales, "La fila marcada como prorrateada no es un mes entero", "Las filas marcadas como prorrateadas no son meses enteros")}: ` +
    `${plural(parciales, "es un tramo", "son tramos")} de días sueltos, y ` +
    `${plural(parciales, "le toca", "les toca")} la parte proporcional de la inflación de su mes.`
  );
}

/**
 * Si en la tabla hay algún dato oficial que la persona pueda señalar con el dedo.
 *
 * Mira **todas** las filas, incluida la de partida: con un origen ya publicado, esa fila
 * lleva su sello del INDEC impreso, así que decir "acá no hay ningún dato oficial" la
 * contradice a dos centímetros. Y sale de una sola función porque el pie de la tabla y la
 * referencia del gráfico afirman lo mismo y se leen juntos: dos copias del predicado es
 * exactamente cómo terminan diciendo cosas distintas (regla 4).
 */
export function hayDatoOficial(r: Resultado): boolean {
  return r.desglose.some((f) => !f.esProyeccion);
}

/** Si algo de lo que se muestra es efectivamente una estimación. */
export function hayAlgoEstimado(r: Resultado): boolean {
  return r.desglose.some((f) => f.esProyeccion);
}

/**
 * Si el resultado se muestra con `~`.
 *
 * Con `ventana_reciente` el `~` no es por estimar —son todos datos publicados— sino
 * porque el tramo que se usó no es exactamente el pedido. Con `proyeccion` es por
 * estimar, y entonces depende de que haya algo estimado de verdad.
 */
export function esAproximado(r: Resultado): boolean {
  return r.metodo.tipo === "ventana_reciente" || hayAlgoEstimado(r);
}

/** El pie de la tabla, que dice qué está mirando el lector. */
export function explicarTabla(r: Resultado): string {
  switch (r.metodo.tipo) {
    case "directo":
      return (
        `Todas las filas salen de datos oficiales publicados por ${fuenteDe(r.desglose, r).publicadosPor}. ` +
        `Acá no hay nada estimado.` + aclararParciales(r)
      );
    case "ventana_reciente":
      return (
        `Este es el tramo publicado más reciente del mismo largo que el que pediste. Lo usamos ` +
        `como referencia porque los últimos meses del tuyo todavía no salieron.` +
        aclararParciales(r)
      );
    case "proyeccion": {
      const { base, tasaMensualPct } = r.metodo;
      // Se cuentan los tramos, no las filas. La fila de partida también sale resaltada
      // —su índice está estimado— pero no muestra ningún porcentaje, así que llamarla
      // "tramo proyectado" daba un número que no coincidía con lo que se puede contar
      // en la tabla: decía 8 donde había 7 porcentajes.
      const tramos = r.desglose.slice(1);
      const proyectadas = tramos.filter((f) => f.esProyeccion).length;
      // Pedir una metodología de estimación no obliga a que haya algo estimado: si el
      // período pedido está enteramente publicado, no hay ningún tramo proyectado y el
      // pie decía "Los 0 porcentajes resaltados son tramos proyectados" sobre una tabla
      // con todas las filas selladas por el INDEC.
      if (proyectadas === 0) {
        // Cero tramos proyectados no quiere decir cero filas estimadas: ver la nota de
        // `explicarMetodo`. La única tabla que llega acá con algo estimado es la de un
        // período que empieza y termina en el mismo punto, que tiene una sola fila.
        return hayAlgoEstimado(r)
          ? `La tabla tiene una sola fila y su índice todavía no está publicado, así que ` +
              `sale marcada como estimada. Como el período empieza y termina en el mismo ` +
              `punto, el monto no cambia y esa estimación no entra en ninguna cuenta.`
          : `Todas las filas salen de datos oficiales publicados por ${fuenteDe(r.desglose, r).publicadosPor}: ` +
              `el período que pediste ya está publicado entero, así que no hubo nada que estimar.` +
              aclararParciales(r);
      }
      const de =
        base.fuente === "rem"
          ? `el REM del BCRA de ${nombrarMes(base.mesEncuesta)}`
          : `la inflación de ${nombrarMes(base.mes)}`;
      // Con la senda del REM cada mes tiene su propia tasa y está en su fila, así
      // que nombrar "una" tasa sería inventar un promedio que no se usó.
      const aQueTasa = tasaMensualPct === null ? "" : `, a ${porcentaje(tasaMensualPct)} por mes`;
      // "El resto son datos oficiales" prometía una parte oficial que muchas veces no
      // existe: cuando el destino todavía no llegó, la tabla entera está estimada y esa
      // frase mandaba a buscar un dato del INDEC que no se puede señalar en ningún lado.
      const cierre = hayDatoOficial(r)
        ? " El resto son datos oficiales."
        : ` En esta tabla no hay ningún dato oficial: ${quienPublicaAhora(r)} todavía no ` +
          `publicó ninguno de estos meses.`;
      return (
        `Estos son los meses que pediste. ${plural(proyectadas, "El porcentaje resaltado", `Los ${proyectadas} porcentajes resaltados`)} ` +
        `${plural(proyectadas, "es un tramo proyectado", "son tramos proyectados")}, que ` +
        `${quienPublicaAhora(r)} todavía no publicó: ` +
        `${plural(proyectadas, "se estimó", "se estimaron")} con ${de}` +
        `${aQueTasa}.${cierre}` + aclararParciales(r)
      );
    }
  }
}

/**
 * La nota de abajo de la tabla, con los dos números en vez de una relación entre ellos.
 *
 * Decía "el acumulado siempre da un poco más que la suma". Las dos mitades eran
 * problemáticas: "un poco" son 36 puntos en 2024, y "siempre" es falso —de enero de 1999
 * a diciembre de 2001 el acumulado da menos que la suma, porque hay meses negativos—.
 * Decir los dos números no requiere que la relación entre ellos sea siempre la misma.
 */
export function explicarCompuesto(r: Resultado): string {
  return (
    `Si sumás la columna Subió te va a dar ${porcentaje(sumaDeVariaciones(r.desglose), false)}, ` +
    `no ${porcentaje(r.variacionPct, false)}. No es un error de la tabla: los porcentajes ` +
    `mensuales no se suman entre sí, porque cada mes se aplica sobre el monto que dejó el ` +
    `anterior. El número que vale es el acumulado.`
  );
}

/**
 * La línea "Fuente:" del texto que se copia y se manda por mensaje.
 *
 * No siempre es la fuente de las filas. Con un período enteramente sin publicar no hay
 * ninguna fila publicada, y `fuenteDe()` contesta INDEC a propósito —es el organismo que
 * va a publicar esos meses—: eso sirve para frases en futuro, pero acá quedaba
 * "Fuente: el IPC Nivel General Nacional del INDEC" al pie de un texto cuyos números
 * salieron todos del REM del BCRA, tres renglones abajo de "en esta tabla no hay ningún
 * dato oficial". El texto copiado sale del sitio y se lee sin el sitio al lado, así que es
 * el lugar donde una atribución equivocada más caro sale.
 */
export function fuenteDelTexto(r: Resultado): string {
  if (hayDatoOficial(r) || r.metodo.tipo !== "proyeccion") return fuenteDe(r.desglose, r).larga;

  const { base } = r.metodo;
  const origen =
    base.fuente === "rem"
      ? `el REM del BCRA (encuesta de ${nombrarMes(base.mesEncuesta)})`
      : `la inflación de ${nombrarMes(base.mes)}, publicada por ${fuenteDe(r.desglose, r).publicadosPor}, repetida hacia adelante`;
  return `${origen}. Ningún mes de este cálculo está publicado todavía: son todas estimaciones`;
}
