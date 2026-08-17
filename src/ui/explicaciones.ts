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
import {
  comoInstante,
  compararPuntos,
  conPreposicion,
  diasEnMes,
  diasEntre,
  esFecha,
  largoEnDias,
  mesConAnio,
  mesDe,
  nombrarMes,
  soloMes,
} from "../engine/mes.js";
import type { Mes, Resultado } from "../engine/types.js";
import { fuenteDe, llevaSello, mesDelTramo, quienPublicaAhora } from "./etiquetas.js";

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

/**
 * El resultado dicho en una línea, antes de explicar de dónde sale.
 *
 * Deflactando no dice "una baja de 11,28%". Es cierto del monto y falso de los precios, y
 * arriba de una tabla en la que ahora todos los porcentajes son positivos se leía como una
 * contradicción. Lo que pasó entre las dos fechas es que hubo inflación, y el resultado más
 * chico ya está en el número grande, dos renglones arriba.
 */
export function resumir(r: Resultado): string {
  const conQue =
    comoSeMuestra(r.inflacionPct) === comoSeMuestra(r.variacionPct)
      ? frasearVariacion(r.variacionPct)
      : `${porcentaje(r.inflacionPct, false)} de inflación en el medio`;
  return `${pesos(r.monto)} ${conPreposicion("de", r.desde)}, con ${conQue}.`;
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
      const { mesesDelPeriodo, mesesSinPublicar, ultimoPublicado } = r.metodo;
      // Con fechas exactas el período casi nunca son meses redondos: del 15 de mayo
      // al 10 de agosto no pasaron 3 meses, pasaron 87 días. Decir "3 meses" es
      // falso y lo detecta cualquiera que mire el calendario.
      const largo = esFecha(r.desde) || esFecha(r.hasta)
        ? `pasaron ${largoEnDias(r.desde, r.hasta)} días`
        : plural(mesesDelPeriodo, "pasó 1 mes", `pasaron ${mesesDelPeriodo} meses`);
      const contexto =
        `${capitalizar(conPreposicion("de", r.desde))} ${conPreposicion("a", r.hasta)} ` +
        `${largo}, y ${quienPublicaAhora(r)} todavía no publicó ` +
        `${frasearMeses(mesesSinPublicar, "ni")}. `;
      // El orden importa más que las palabras. "Son todos datos publicados por el INDEC; el ~
      // está porque el tramo no es el tuyo" pone la tranquilidad primero y la salvedad
      // después, y la revisora usuaria leyó las dos mitades como si se anularan: se llevaba
      // "es un dato oficial" de un número que no es el de su período. Peor todavía, con un
      // período que arranca en el último mes publicado la metodología que **sí** estima puede
      // dar exactamente el mismo número —repite la tasa de ese mes, y prorratear es
      // geométrico—, así que la misma cifra al centavo aparecía una vez sellada "datos
      // oficiales" y otra bajo un "OJO: esto es una estimación".
      //
      // La salvedad va primero, entonces, y la atribución después y acotada a lo que de
      // verdad cubre: los meses de los que sale el número, no el número.
      const cierre =
        `Ojo: no es la inflación de tu período —ésa todavía no se puede saber—, es la del tramo ` +
        `de referencia, y por eso el resultado va con ~. Ninguno de estos porcentajes es una ` +
        `estimación: los meses de los que salen ya los publicó ` +
        `${fuenteDe(r.desglose, r).publicadosPor}.`;

      // En modo por día las filas son fechas, no meses: enumerar sus meses
      // duplicaría el del extremo. Se nombra el tramo por sus puntas, que además
      // es lo que efectivamente se calculó.
      if (esFecha(r.desglose[0]!.punto)) {
        // Cronológico, no en el orden de las filas: deflactando el desglose va del punto
        // nuevo al viejo, y "del 31 de julio al 2 de julio" se lee como un error.
        const [ini, fin] = [r.desglose[0]!.punto, r.desglose.at(-1)!.punto].sort(compararPuntos);
        const dias = diasEntre(ini!, fin!);
        const ultimo = `${mesConAnio(ultimoPublicado)}, el último mes con dato`;

        // La ventana casi siempre entra entera en el último mes publicado, y ése es el
        // caso que se puede decir en los términos de la persona: un mes que conoce, una
        // regla de tres que puede rehacer. Nombrarlo por las puntas —"del 2 al 31 de
        // julio"— obliga a preguntarse de dónde salió el 2.
        const tramo =
          mesDe(ini!) === mesDe(fin!)
            ? `la inflación de ${ultimo}, prorrateada a ${dias} de sus ${diasEnMes(mesDe(fin!))} días`
            : `el tramo que va ${conPreposicion("de", ini!)} ${conPreposicion("a", fin!)}, ` +
              `que termina con ${ultimo}`;

        // "los últimos N días publicados" sonaba a que existe un dato diario en algún lado.
        // El INDEC publica meses, y eso lo explica el propio sitio dos secciones más abajo.
        return (
          `${contexto}Así que usamos el tramo de ${dias} días más reciente que cae adentro de ` +
          `lo publicado: ${tramo}. ${cierre}`
        );
      }

      const usados = frasearMeses(mesesConPorcentaje(r));
      // "de" + "el" es "del". Con un período de un solo mes la frase salía "usamos la
      // inflación de el último mes publicado": la contracción no se puede dejar armada
      // afuera cuando la parte que sigue cambia de número.
      return (
        `${contexto}Así que usamos la inflación ` +
        `${plural(mesesDelPeriodo, "del último mes publicado", `de los últimos ${mesesDelPeriodo} meses publicados`)} ` +
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
  // La fila de partida no muestra ningún porcentaje —muestra un índice interpolado—, así
  // que "es un tramo de días sueltos" no la describe. La frase habla de lo único que las
  // dos clases tienen en común y que es lo que importa: el número que muestran lo sacamos
  // nosotros repartiendo un dato del organismo entre los días de su mes.
  return (
    ` ${plural(parciales, "La fila marcada como prorrateada no es un mes entero", "Las filas marcadas como prorrateadas no son meses enteros")}: ` +
    `${plural(parciales, "su número sale", "sus números salen")} de repartir la inflación de ` +
    `su mes entre los días, que es una cuenta nuestra sobre un dato publicado.`
  );
}

/**
 * Si algún **porcentaje** de la tabla es un dato publicado que se pueda señalar con el dedo.
 *
 * Mira `slice(1)`, sin la fila de partida, y ésa es toda la gracia. Las tres superficies que
 * cuelgan de acá —"Todas las filas salen de datos oficiales", "El resto son datos oficiales"
 * y la referencia "dato oficial" del gráfico— hablan de los porcentajes, y la fila de partida
 * no muestra ninguno: sólo fija el monto inicial, y el gráfico ni siquiera la dibuja.
 *
 * Mirando la tabla entera, un período por día que arranca el 1 de un mes publicado —la fila
 * de partida lleva sello, el único porcentaje es un prorrateo— contestaba que sí, y el pie
 * decía "Todas las filas salen de datos oficiales publicados por el INDEC" arriba de una
 * tabla cuya única fila con porcentaje dice `prorrateado`. En la misma pantalla el gráfico
 * contestaba lo contrario, porque él sí preguntaba por `slice(1)`.
 *
 * Pregunta por el **sello**, no por "que no sea proyección". Una fila prorrateada no es una
 * proyección y tampoco es un dato publicado: preguntando lo segundo, una tabla con todas las
 * filas prorrateadas contestaba que sí había dato oficial. Sale de `llevaSello`, el mismo
 * criterio del sello impreso (regla 4).
 */
export function hayTramoOficial(r: Resultado): boolean {
  return r.desglose.slice(1).some(llevaSello);
}

/**
 * Si alguna fila descansa sobre un mes que el organismo ya publicó.
 *
 * Es más débil que `hayDatoOficial` a propósito, y la diferencia son justo las filas
 * prorrateadas: su número no lo publicó nadie, pero el mes del que sale sí está publicado.
 * Entre las dos preguntas está la única frase que se puede decir sin mentir cuando la
 * tabla no tiene ninguna fila sellada y aun así no hay nada estimado en el fondo.
 */
export function hayMesPublicado(r: Resultado): boolean {
  return r.desglose.some((f) => !f.esProyeccion);
}

/**
 * Los meses que aportan un porcentaje a la tabla, en el orden en que se muestran.
 *
 * Sale de `mesDelTramo` y no de `mesDe(f.punto)`, que es lo mismo yendo para adelante y está
 * corrido un mes yendo para atrás: deflactando de agosto a marzo, la frase decía "los 5 meses
 * que van de junio 2026 a febrero 2026" mientras la tabla mostraba julio, junio, mayo, abril y
 * marzo. La regla 2 pide que lo que se nombra se pueda contar en pantalla, y acá no coincidía
 * ni una de las dos puntas.
 */
function mesesConPorcentaje(r: Resultado): Mes[] {
  return r.desglose.slice(1).map((_, i) => mesDelTramo(r.desglose, i + 1));
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

/**
 * El aviso que va **arriba** de la tabla cuando las filas no son el período pedido.
 *
 * Vive arriba y no en el pie por una razón que la revisora usuaria dijo mejor que nadie:
 * *"el pie lo leo yo, que estoy buscando el problema; la clienta mira la tabla"*. Con
 * fechas exactas el salto es más violento que con meses —pidió del 17 de julio al 15 de
 * agosto y la tabla habla del 2 al 31 de julio, y **ninguna** de sus dos fechas aparece en
 * ningún lado—, así que el aviso nombra las dos cosas: lo que pidió y lo que se usó.
 *
 * Devuelve `""` cuando las filas sí son el período pedido, y entonces el elemento se
 * esconde: un aviso permanente deja de leerse.
 */
export function avisarTramoAjeno(r: Resultado): string {
  if (r.metodo.tipo !== "ventana_reciente") return "";
  const porDia = esFecha(r.desglose[0]!.punto);

  // Con meses el tramo se nombra por los meses que aportan un porcentaje, no por las
  // puntas. Nombrado por las puntas decía "de abril 2026 a julio 2026" mientras el
  // párrafo de arriba decía "los últimos 3 meses publicados (mayo, junio y julio)":
  // cuatro contra tres, y la fila de abril no lleva ningún porcentaje porque es la de
  // partida. La regla 2 pide que lo que se nombra se pueda contar en pantalla.
  const [ini, fin] = [r.desglose[0]!.punto, r.desglose.at(-1)!.punto].sort(compararPuntos);
  const tramo = porDia
    ? `${conPreposicion("de", ini!)} ${conPreposicion("a", fin!)}`
    : `la inflación de ${frasearMeses(mesesConPorcentaje(r))}`;

  // Ni "Pediste" ni "Abajo no vas a encontrar esos meses". Lo primero porque el aviso
  // encabeza el texto que se copia y se manda, y quien lo recibe no pidió nada: lee
  // "pediste" como si le hablaran a ella. Lo segundo porque era **falso** apenas los dos
  // períodos se pisan: pidiendo de mayo a agosto, la ventana son mayo, junio y julio, y
  // mayo está abajo. Lo único que no está es lo que no se publicó.
  return (
    `El período que pediste, ${conPreposicion("de", r.desde)} ${conPreposicion("a", r.hasta)}, ` +
    `todavía no está publicado entero. Estos números son ${tramo}, el tramo publicado más ` +
    `reciente del mismo largo.`
  );
}

/**
 * De dónde salen las filas que no son una estimación, dicho sin prometer de más.
 *
 * Las tres frases hablan de los **porcentajes**, así que las tres preguntan por `slice(1)`:
 * la fila de partida no muestra ninguno. Y hay **tres** casos y no dos, que es lo que este
 * pie fue aprendiendo a los golpes:
 *
 * 1. Algún tramo lleva sello — se puede decir "el resto son datos oficiales" y señalarlo.
 * 2. Ningún tramo lleva sello, pero los que no son estimación reparten meses publicados.
 *    Es el caso más común del producto: un período por día que arranca dentro del último
 *    mes publicado. Preguntando sólo por el sello, el pie decía "el INDEC todavía no
 *    publicó ninguno de estos meses" dos renglones abajo de citar la inflación de julio, y
 *    el texto que se copia —que viaja sin el sitio al lado— cerraba con "son todas
 *    estimaciones" sobre un cálculo cuya mitad es dato publicado.
 * 3. Todos los tramos son estimación. Acá la frase **no puede** hablar de "estos meses":
 *    con el origen en un mes publicado —"de julio a hoy", la consulta insignia— julio está
 *    publicado y su fila lo muestra sellado, aunque el único porcentaje sea el estimado.
 */
function deDondeSalenLasFilas(r: Resultado): string {
  const organismo = fuenteDe(r.desglose, r).publicadosPor;
  const tramos = r.desglose.slice(1);
  if (tramos.some(llevaSello)) return ` El resto son datos oficiales.`;
  if (tramos.some((f) => !f.esProyeccion)) {
    return (
      ` Ningún porcentaje de esta tabla es un número que haya publicado ${organismo} tal ` +
      `cual: los que no son estimación reparten entre los días meses que sí publicó.`
    );
  }
  return ` Ningún porcentaje de esta tabla es un dato publicado: son todos estimaciones.`;
}

/**
 * Deflactando, la tabla arranca en la respuesta y termina en el monto que la persona escribió.
 *
 * Es la contracara de leer siempre del mes más viejo al más nuevo (0014). La tabla es la misma
 * que la de la consulta al derecho —los mismos meses, los mismos porcentajes, los mismos
 * sellos— y lo único que se mueve es dónde se apoya el monto: abajo de todo, en vez de arriba.
 * Sin decirlo, la primera fila muestra un número que nadie tipeó.
 */
function aclararDeflacion(r: Resultado): string {
  if (comoInstante(r.hasta) >= comoInstante(r.desde)) return "";
  return (
    ` La tabla va del mes más viejo al más nuevo, así que el monto que pediste ajustar está ` +
    `en la última fila y el resultado, en la primera.`
  );
}

/** El pie de la tabla, que dice qué está mirando el lector. */
export function explicarTabla(r: Resultado): string {
  switch (r.metodo.tipo) {
    case "directo":
      // Un período corto por día puede tener TODAS las filas prorrateadas —del 10 al 20 de
      // junio son dos filas y ninguna cubre un mes— y aun así no tener nada estimado. La
      // frase de siempre prometía filas oficiales que ahí no se pueden señalar.
      return hayTramoOficial(r)
        ? `Todas las filas salen de datos oficiales publicados por ${fuenteDe(r.desglose, r).publicadosPor}. ` +
            `Acá no hay nada estimado.` + aclararParciales(r) + aclararDeflacion(r)
        : `Acá no hay nada estimado: todo sale de meses que ${fuenteDe(r.desglose, r).publicadosPor} ` +
            `ya publicó.` + aclararParciales(r) + aclararDeflacion(r);
    case "ventana_reciente":
      // Qué se está mirando lo dice `avisarTramoAjeno`, arriba de la tabla. Acá abajo queda
      // lo que sólo se puede decir habiendo visto las filas: de dónde salió cada número.
      return (
        `Es el tramo publicado más reciente del mismo largo que el que pediste, y por eso ` +
        `sirve de referencia. Ningún porcentaje de esta tabla es una estimación: los meses ` +
        `de los que salen ya los publicó ${fuenteDe(r.desglose, r).publicadosPor}.` +
        aclararParciales(r) +
        aclararDeflacion(r)
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
          : `El período que pediste ya está publicado entero, así que no hubo nada que ` +
              `estimar.${deDondeSalenLasFilas(r)}` + aclararParciales(r) + aclararDeflacion(r);
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
      //
      // Y "ninguno de estos meses" no es lo mismo que "ninguna fila sellada". Con el
      // origen en un día del último mes publicado, la tabla no tiene ninguna fila con
      // sello —son todas prorrateadas o estimadas— pero julio sí está publicado, y de
      // hecho es de donde sale la tasa que se nombra dos renglones antes. El pie decía
      // "el INDEC todavía no publicó ninguno de estos meses" arriba de un párrafo que
      // acababa de citar la inflación de julio.
      const cierre = deDondeSalenLasFilas(r);
      return (
        `Estos son los meses que pediste. ${plural(proyectadas, "El porcentaje resaltado", `Los ${proyectadas} porcentajes resaltados`)} ` +
        `${plural(proyectadas, "es un tramo proyectado", "son tramos proyectados")}, que ` +
        `${quienPublicaAhora(r)} todavía no publicó: ` +
        `${plural(proyectadas, "se estimó", "se estimaron")} con ${de}` +
        `${aQueTasa}.${cierre}` + aclararParciales(r) + aclararDeflacion(r)
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
  // Contra `inflacionPct` y no contra `variacionPct`: la columna suma inflación, así que el
  // número con el que hay que compararla es la inflación acumulada. Deflactando, comparar
  // contra el cambio del monto daba "te va a dar 12,11%, no −11,28%", dos números de signo
  // distinto presentados como si uno fuera la versión bien hecha del otro.
  return (
    `Si sumás la columna Subió te va a dar ${porcentaje(sumaDeVariaciones(r.desglose), false)}, ` +
    `no ${porcentaje(r.inflacionPct, false)}. No es un error de la tabla: los porcentajes ` +
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
  // Cuelga de `hayMesPublicado` y no del sello: la línea que sigue dice "son todas
  // estimaciones", y eso es falso en cuanto un solo mes del cálculo esté publicado, aunque
  // su fila muestre un prorrateo. Con el sello, un período que arranca dentro del último
  // mes publicado le sacaba al INDEC la atribución de la mitad del número —y con el REM
  // elegido se la daba al BCRA— en el texto que se manda por mensaje.
  if (hayMesPublicado(r) || r.metodo.tipo !== "proyeccion") return fuenteDe(r.desglose, r).larga;

  const { base } = r.metodo;
  const origen =
    base.fuente === "rem"
      ? `el REM del BCRA (encuesta de ${nombrarMes(base.mesEncuesta)})`
      : `la inflación de ${nombrarMes(base.mes)}, publicada por ${fuenteDe(r.desglose, r).publicadosPor}, repetida hacia adelante`;
  return `${origen}. Ningún mes de este cálculo está publicado todavía: son todas estimaciones`;
}
