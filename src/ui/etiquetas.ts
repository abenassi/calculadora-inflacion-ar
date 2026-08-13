/**
 * Cómo se nombra cada fila del desglose.
 *
 * Vive fuera de `main.ts` porque la tabla y el gráfico tienen que decir lo mismo: si
 * la fila de la tabla se llama "jun 2026" y la barra del gráfico se llama
 * "1 jul 2026", son la misma fila con dos nombres y nadie las relaciona.
 *
 * El problema que resuelve: en modo por día no alcanza con nombrar el punto final.
 * La fila que termina el 1 de julio cubre el tramo que arranca el 1 de junio, o sea
 * la inflación de junio. Nombrarla "1 jul" invierte la lectura. Los tramos que
 * cubren un mes entero se nombran por ese mes —igual que en modo por meses— y las
 * puntas, que son días sueltos, muestran el rango explícito.
 */

import { abreviarMes, abreviarPunto, compararMeses, esFecha, mesDe } from "../engine/mes.js";
import type { Fila } from "../engine/types.js";

/* ------------------------------------------------------------- de quién es el dato */

/**
 * Qué organismo publicó los datos que se están mostrando.
 *
 * Vive acá, y no copiado en cada lugar que lo afirma, porque **el sitio se contradecía a
 * sí mismo**. El índice de nivel del INDEC arranca en diciembre de 2016; todo lo anterior
 * sale de la serie de variación mensual del BCRA y cada fila lo dice con su sello
 * `BCRA ✓`. Pero el pie de la tabla, el párrafo del resultado y el texto que se copia
 * tenían la palabra "INDEC" escrita a mano, así que un cálculo de 1990 a hoy mostraba
 * "todos los meses son datos publicados por el INDEC" tres líneas arriba de 322 filas
 * selladas `BCRA ✓`. Quien lo notaba no podía saber cuál de las dos era mentira.
 *
 * Es la regla 4 de `AGENTS.md` aplicada a un texto en vez de a un número: si dos partes
 * del sistema tienen que estar de acuerdo, salen de la misma función.
 *
 * Las filas estimadas no cuentan: su `origen` es `proyeccion` y no las publicó nadie.
 */
export type Fuente = {
  hayIndec: boolean;
  hayBcra: boolean;
  /** Para un título o una etiqueta. Sin subordinadas. */
  corta: string;
  /** Entra después de "según". */
  larga: string;
  /** Entra después de "publicados por". */
  publicadosPor: string;
};

/*
 * El BCRA no es una fuente alternativa al INDEC: republica el IPC que el INDEC publicaba,
 * y lo dice la propia serie `bcra:27`. Decirlo importa porque si no la atribución honesta
 * ("esto lo publica el BCRA") deja a la persona preguntándose de dónde salió un índice de
 * precios de un banco central, y peor, sin poder conectar el aviso del INDEC intervenido
 * con la página que le acaba de mostrar puros sellos del BCRA.
 */
const SOLO_INDEC: Omit<Fuente, "hayIndec" | "hayBcra"> = {
  corta: "IPC del INDEC",
  larga: "el IPC Nivel General Nacional del INDEC",
  publicadosPor: "el INDEC",
};

const SOLO_BCRA: Omit<Fuente, "hayIndec" | "hayBcra"> = {
  corta: "serie de inflación mensual del BCRA",
  larga:
    "la serie de inflación mensual del BCRA, que para ese tramo republica el IPC que " +
    "publicaba el INDEC",
  publicadosPor: "el BCRA, que republica el IPC que publicaba el INDEC",
};

const MIXTO: Omit<Fuente, "hayIndec" | "hayBcra"> = {
  corta: "IPC del INDEC y serie del BCRA",
  larga:
    "el IPC Nivel General Nacional del INDEC y, para los meses anteriores a diciembre de " +
    "2016, la serie de inflación mensual del BCRA",
  publicadosPor: "el INDEC y el BCRA",
};

/**
 * Con **ninguna** fila publicada —un período enteramente proyectado, como pedir de
 * diciembre de 2026 a mayo de 2027— la respuesta es el INDEC, y es una decisión, no un
 * default por descarte: los meses que todavía no salieron son todos posteriores a
 * diciembre de 2016, así que el organismo que los va a publicar es el INDEC. Las frases
 * que usan esto en ese caso hablan en futuro ("el INDEC todavía no publicó…"), nunca
 * afirman que haya un dato publicado.
 *
 * Quien necesite distinguir el caso tiene `hayIndec` y `hayBcra`, los dos en `false`.
 */
export function fuenteDe(filas: Fila[]): Fuente {
  const hayIndec = filas.some((f) => f.origen === "indec");
  const hayBcra = filas.some((f) => f.origen === "bcra");
  const cuerpo = hayIndec && hayBcra ? MIXTO : hayBcra ? SOLO_BCRA : SOLO_INDEC;
  return { hayIndec, hayBcra, ...cuerpo };
}

/** El mes calendario que cubre un tramo completo: el más viejo de sus dos extremos. */
function mesDelTramo(desglose: Fila[], i: number): string {
  const anterior = desglose[i - 1]!.punto;
  const actual = desglose[i]!.punto;
  return compararMeses(mesDe(anterior), mesDe(actual)) < 0 ? mesDe(anterior) : mesDe(actual);
}

/**
 * El rótulo de la tabla.
 *
 * `corto` saca los años del rango de las puntas, para el eje del gráfico, donde
 * "15 may 2026 → 1 jun 2026" no entra sin pisarse con la barra vecina.
 */
export function rotularFila(desglose: Fila[], i: number, corto = false): string {
  const fila = desglose[i]!;
  if (i === 0 || !esFecha(fila.punto)) return abreviarPunto(fila.punto);
  if (!fila.esParcial) return abreviarMes(mesDelTramo(desglose, i));

  const anterior = abreviarPunto(desglose[i - 1]!.punto);
  const actual = abreviarPunto(fila.punto);
  const sinAnio = (s: string) => s.replace(/ \d{4}$/, "");
  return corto ? `${sinAnio(anterior)} → ${sinAnio(actual)}` : `${anterior} → ${actual}`;
}
