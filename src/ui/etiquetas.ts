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
import type { EtiquetaFuente, Fila, FuentesDeSerie, FuenteSerie } from "../engine/types.js";

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
 * **Las frases ya no viven acá.** Vienen en el snapshot, en la `etiqueta` de cada fuente,
 * porque desde que se puede calcular con el IPC de una provincia el conjunto de organismos
 * posibles dejó de ser cerrado. Lo que queda acá es la única parte que sigue siendo
 * criterio y no dato: **cuáles de las fuentes declaradas aportaron de verdad alguna fila
 * publicada en este cálculo**.
 *
 * Las filas estimadas no cuentan: su `origen` es `proyeccion` y no las publicó nadie.
 */
export type Fuente = EtiquetaFuente & {
  /**
   * Las fuentes que aportaron al menos una fila publicada, en el orden en que la serie
   * las declara. Vacío cuando el período está enteramente proyectado.
   */
  presentes: FuenteSerie[];
};

/**
 * Con **ninguna** fila publicada —un período enteramente proyectado, como pedir de
 * diciembre de 2026 a mayo de 2027— se contesta con la **última** fuente de la serie, y es
 * una decisión, no un default por descarte: los meses que todavía no salieron son
 * posteriores a todo lo publicado, así que el organismo que los va a publicar es el del
 * tramo más reciente. Las frases que usan esto en ese caso hablan en futuro ("el INDEC
 * todavía no publicó…"), nunca afirman que haya un dato publicado.
 *
 * Quien necesite distinguir el caso tiene `presentes` vacío.
 */
export function fuenteDe(filas: Fila[], serie: FuentesDeSerie): Fuente {
  const presentes = serie.fuentes.filter((f) => filas.some((fila) => fila.origen === f.id));

  if (presentes.length === 1) return { presentes, ...presentes[0]!.etiqueta };
  if (presentes.length === 0) {
    const ultima = serie.fuentes.at(-1);
    if (!ultima) throw new Error("El cálculo no declara ninguna fuente");
    return { presentes, ...ultima.etiqueta };
  }

  // Más de una fuente. La serie nacional trae escrito cómo se nombra su empalme, porque
  // decir dónde corta —"para los meses anteriores a diciembre de 2016"— es justo lo que
  // alguien va a querer verificar, y eso no sale de concatenar las dos etiquetas sueltas.
  // El pegado genérico es el respaldo para una serie futura que empalme sin declararlo:
  // queda largo, pero nombra a los dos organismos y no le atribuye a ninguno lo del otro.
  if (serie.etiquetaCombinada) return { presentes, ...serie.etiquetaCombinada };
  const unir = (partes: string[]) => partes.slice(0, -1).join(", ") + " y " + partes.at(-1);
  return {
    presentes,
    corta: unir(presentes.map((f) => f.etiqueta.corta)),
    larga: unir(presentes.map((f) => f.etiqueta.larga)),
    publicadosPor: unir(presentes.map((f) => f.etiqueta.publicadosPor)),
  };
}

/**
 * El sello que va en la fila: `"INDEC ✓"`, `"IDECBA ✓"`.
 *
 * Sale de la fuente de **la fila** y no de la del índice, porque una serie empalmada tiene
 * filas de dos organismos y cada una tiene que decir cuál la respalda.
 *
 * Devuelve `null` cuando la fila no lleva sello, que son dos casos y los dos importan: la
 * estimada, que no la publicó nadie, y la prorrateada, cuyo número es la parte
 * proporcional que le toca a unos días —una cuenta nuestra sobre un dato ajeno—. Sellarla
 * sería atribuirle al organismo una cifra que nunca publicó.
 */
export function selloDeFila(fila: Fila, serie: FuentesDeSerie): string | null {
  if (fila.esProyeccion || fila.esParcial) return null;
  return organismoDeFila(fila, serie);
}

/**
 * La sigla del organismo que publicó el dato de fondo de una fila, sin el ✓.
 *
 * La necesita el `title` de una fila prorrateada y la línea que esa fila aporta al texto
 * que se copia: las dos hablan del dato sobre el que se prorrateó, que sí tiene dueño.
 */
export function organismoDeFila(fila: Fila, serie: FuentesDeSerie): string | null {
  return serie.fuentes.find((f) => f.id === fila.origen)?.organismoCorto ?? null;
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
