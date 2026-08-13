/**
 * Resumen de la inflación de un año calendario.
 *
 * Existe para las páginas por año (`/inflacion-2024/`), que son lo que la gente
 * busca en Google: "inflación 2024 argentina", "inflación acumulada 2002". Cada
 * página tiene que mostrar el mismo número que da la calculadora si alguien entra a
 * comprobarlo — si no, el sitio se contradice a sí mismo y pierde justamente lo que
 * promete, que es un número defendible.
 *
 * Por eso acá **no hay ninguna cuenta nueva**: todo sale de `adjust()`, el mismo
 * motor que responde el formulario. Este módulo sólo decide **qué período le pide**
 * a cada año y deriva de la respuesta las tres cosas que no están en ella (el mes
 * más alto, el más bajo y el promedio mensual).
 *
 * La consecuencia práctica de esa regla: si mañana cambia el empalme o la
 * interpolación, las páginas por año cambian con la calculadora y nadie tiene que
 * acordarse de sincronizarlas.
 */

import { comoSeMuestra } from "../ui/format.js";
import { adjust, sumaDeVariaciones } from "./adjust.js";
import { aOrdinal, compararMeses } from "./mes.js";
import type { Fila, FuentesDeSerie, Mes, SerieIndice } from "./types.js";

/** Monto de referencia para pedirle el desglose al motor. No se muestra. */
const MONTO_TESTIGO = 100;

export type ResumenAnual = FuentesDeSerie & {
  anio: number;
  /**
   * Punto de partida de la variación: el cierre de diciembre del año anterior.
   *
   * La excepción es el primer año de la serie, que no lo tiene: ahí se arranca del
   * primer mes disponible y `dicADic` queda en `false`.
   */
  desde: Mes;
  /** Último mes del año con dato publicado. */
  hasta: Mes;
  /**
   * `true` si la variación es la anual de verdad, diciembre contra diciembre.
   *
   * `false` significa que el año está medido desde otro punto y que **no se puede
   * llamar "la inflación de ese año" a secas**. Pasa en dos casos: el primer año de
   * la serie (no existe el diciembre anterior) y el año en curso (todavía no llegó
   * su diciembre). Las páginas usan este flag para elegir cómo titular el número, y
   * de eso depende no prometer un dato que no está.
   */
  dicADic: boolean;
  /** `true` si el año tiene sus doce meses publicados y arranca en el diciembre anterior. */
  completo: boolean;
  /** Variación acumulada de `desde` a `hasta`, en porcentaje. */
  variacionPct: number;
  /**
   * Las filas del año, en orden.
   *
   * Cuando `dicADic` es `true` la fila base (diciembre anterior) queda afuera: no es
   * un mes de este año. Cuando es `false` la primera fila **sí** pertenece al año, y
   * va incluida aunque su `varMensualPct` sea `null` — es el punto de partida.
   */
  filas: Fila[];
  /**
   * Las filas que tienen variación propia, que son las que la persona puede contar en la
   * columna «Subió». No siempre son `filas.length`: en el primer año de la serie la fila
   * de partida no tiene variación y muestra un guión.
   */
  conVariacion: Fila[];
  /**
   * Los meses más alto y más bajo del año, **con sus empates**.
   *
   * Son listas y no una fila sola porque en los años de inflación baja los empates son la
   * regla, no la excepción: 2011 tiene seis meses en 0,80%, y mostrar sólo uno hace que
   * quien mira la tabla se pregunte por qué justo ése. Vacías si no hay ningún mes con
   * variación propia.
   *
   * El empate se juzga sobre el valor **redondeado a dos decimales**, que es la precisión
   * con la que el número se muestra: dos meses que en pantalla dicen `0,80%` son un empate
   * para quien lee, aunque sus flotantes difieran en el bit quince.
   */
  mesesMasAltos: Fila[];
  mesesMasBajos: Fila[];
  /**
   * Media geométrica de las variaciones mensuales del año, en porcentaje.
   *
   * Geométrica y no aritmética porque es la única que, repetida los mismos meses,
   * reproduce el acumulado. El promedio aritmético de un año con 25% y 0% no da la
   * tasa que lleva de una punta a la otra, y en este sitio los números tienen que
   * cerrar entre sí.
   */
  promedioMensualPct: number;
  /**
   * La suma llana de las variaciones mensuales, que **no** es la inflación del año.
   *
   * Existe para poder decirlo con números en vez de con un adjetivo. Es la primera cosa
   * que hace cualquiera que desconfía —agarrar la calculadora del celular y sumar la
   * columna— y en 2024 da 81,94% contra un acumulado de 117,76%: llamar a esa brecha
   * "un poco más" es perder a la persona justo cuando estaba comprobando.
   *
   * Ojo con la intuición de que el acumulado siempre es mayor: con meses negativos puede
   * ser menor. En 1996 la suma da −0,00% y el acumulado −0,01%.
   */
  sumaDeVariacionesPct: number;
};

/** El año calendario de un mes `YYYY-MM`. */
function anioDe(mes: Mes): number {
  return Number(mes.slice(0, 4));
}

/**
 * Los años que la serie puede resumir, del más viejo al más nuevo.
 *
 * Incluye el año en curso: tiene meses publicados y es el que más se busca. Deja
 * afuera el año que no tiene ni una variación propia, que es el caso del año del
 * primer mes de la serie cuando ese mes es diciembre: ese diciembre es el ancla del
 * año siguiente, no un año que se pueda contar. Todo lo que devuelve esta función
 * tiene que poder pasar por `resumenAnual` sin explotar — de eso depende que el
 * generador de páginas no tenga que atajar excepciones.
 */
export function aniosDisponibles(serie: SerieIndice): number[] {
  const primero = serie.datos[0];
  if (!primero) return [];
  const anios: number[] = [];
  for (let a = anioDe(primero.mes); a <= anioDe(serie.ultimo_oficial); a++) {
    // El año necesita al menos un mes cuyo mes anterior también esté en la serie.
    const ultimoDelAnio = Math.min(aOrdinal(`${a}-12`), aOrdinal(serie.ultimo_oficial));
    if (ultimoDelAnio > aOrdinal(primero.mes)) anios.push(a);
  }
  return anios;
}

export class AnioSinDatos extends RangeError {}

/**
 * @param anio Año calendario. Tiene que estar en `aniosDisponibles(serie)`.
 */
export function resumenAnual(serie: SerieIndice, anio: number): ResumenAnual {
  const primerMesSerie = serie.datos[0]?.mes;
  if (!primerMesSerie) throw new AnioSinDatos("La serie vino vacía");

  const diciembreAnterior: Mes = `${anio - 1}-12`;
  const dicADic = compararMeses(diciembreAnterior, primerMesSerie) >= 0;
  const desde: Mes = dicADic ? diciembreAnterior : primerMesSerie;

  const finDeAnio: Mes = `${anio}-12`;
  const hasta: Mes =
    compararMeses(finDeAnio, serie.ultimo_oficial) <= 0 ? finDeAnio : serie.ultimo_oficial;

  if (anioDe(hasta) !== anio || compararMeses(hasta, desde) <= 0) {
    throw new AnioSinDatos(`${anio} no tiene meses publicados en esta serie`);
  }

  /*
   * `sin_proyectar` explícito y las dos puntas dentro de lo publicado: el motor resuelve
   * por el camino `directo` y no hay ni un número estimado en el resumen.
   *
   * Esa afirmación descansa entera en que `hasta <= ultimo_oficial`, tres líneas más
   * arriba. El chequeo de abajo es un cable trampa para quien mueva ese tope: hoy es
   * inalcanzable —y hay un test que lo comprueba sobre los 37 años— pero es la única
   * cosa que separa "ninguna página estima nada" de publicarlo sin darse cuenta.
   */
  const resultado = adjust(MONTO_TESTIGO, desde, hasta, serie, { metodologia: "sin_proyectar" });
  if (resultado.metodo.tipo !== "directo") {
    throw new AnioSinDatos(
      `${anio} no se puede resumir sin estimar: el motor resolvió por "${resultado.metodo.tipo}"`,
    );
  }

  const filas = dicADic ? resultado.desglose.slice(1) : resultado.desglose;
  const conVariacion = filas.filter((f) => f.varMensualPct !== null);
  if (conVariacion.length === 0) {
    throw new AnioSinDatos(`${anio} no tiene ningún mes con variación propia`);
  }

  // El empate se juzga sobre el número impreso, no sobre el flotante. Ver `mesesMasAltos`.
  const impreso = (f: Fila) => comoSeMuestra(f.varMensualPct!);
  const valores = conVariacion.map(impreso);
  const alto = Math.max(...valores);
  const bajo = Math.min(...valores);
  const factor = 1 + resultado.variacionPct / 100;

  return {
    anio,
    desde,
    hasta,
    dicADic,
    completo: dicADic && hasta === finDeAnio,
    variacionPct: resultado.variacionPct,
    filas,
    conVariacion,
    // Las páginas por año también nombran a su fuente, y las arma un script que sólo
    // recibe el resumen. Viajan acá por lo mismo que en `Resultado`.
    fuentes: serie.fuentes,
    ...(serie.etiquetaCombinada ? { etiquetaCombinada: serie.etiquetaCombinada } : {}),
    mesesMasAltos: conVariacion.filter((f) => impreso(f) === alto),
    mesesMasBajos: conVariacion.filter((f) => impreso(f) === bajo),
    promedioMensualPct: (Math.pow(factor, 1 / conVariacion.length) - 1) * 100,
    sumaDeVariacionesPct: sumaDeVariaciones(conVariacion),
  };
}
