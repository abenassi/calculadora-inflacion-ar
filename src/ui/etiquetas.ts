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
 * Quién publica esta serie **de acá en adelante**.
 *
 * Es la fuente del tramo más reciente, y hace falta como concepto propio porque las
 * frases que hablan en futuro —"todavía no publicó julio"— no pueden usar la atribución
 * del período mostrado: en un cálculo del nacional que cruza el empalme ésa dice "el
 * INDEC y el BCRA", y el BCRA no va a publicar julio de 2026.
 */
export function quienPublicaAhora(serie: FuentesDeSerie): string {
  const ultima = serie.fuentes.at(-1);
  if (!ultima) throw new Error("La serie no declara ninguna fuente");
  return ultima.etiqueta.publicadosPor;
}

/**
 * Cómo se nombra la serie **entera**, sin mirar qué período se está mostrando.
 *
 * Es distinto de `fuenteDe()` y la diferencia importa: `fuenteDe()` contesta "quién
 * publicó lo que estás viendo", y ésta contesta "de qué está hecho este índice". La nota
 * legal del pie es del segundo tipo — habla del índice, no del cálculo— así que para el
 * nacional tiene que nombrar al BCRA aunque el período elegido sea de 2024 y no tenga
 * ninguna fila suya.
 */
export function fuenteDeLaSerie(serie: FuentesDeSerie): EtiquetaFuente {
  if (serie.fuentes.length > 1 && serie.etiquetaCombinada) return serie.etiquetaCombinada;
  const primera = serie.fuentes[0];
  if (!primera) throw new Error("La serie no declara ninguna fuente");
  return primera.etiqueta;
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
  if (!llevaSello(fila)) return null;
  return organismoDeFila(fila, serie);
}

/**
 * Si el número que muestra una fila lo publicó un organismo, tal cual.
 *
 * Es el predicado detrás del sello, y vive suelto porque hay tres superficies que tienen
 * que contestarlo igual: la tabla (el sello), el pie ("el resto son datos oficiales") y la
 * referencia del gráfico ("dato oficial"). El gráfico llegó a mostrar esa referencia con
 * su única barra prorrateada, porque preguntaba otra cosa —"¿hay alguna fila que no sea
 * proyección?"— y una fila prorrateada no es proyección pero tampoco es dato publicado.
 */
export function llevaSello(fila: Fila): boolean {
  return !fila.esProyeccion && !fila.esParcial;
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

/**
 * El mes calendario que cubre un tramo: el más viejo de sus dos extremos.
 *
 * Exportada porque el `title` de la fila prorrateada la necesitaba y tenía su propia copia
 * del criterio, hecha con `mesDe(fila.punto)` — el mes del punto **final**. El tramo
 * "2 may → 1 jun" con +2,08% quedaba explicado como "parte proporcional de la inflación de
 * junio", cuando ese número es de mayo y junio está en la fila de abajo con +1,89%.
 */
export function mesDelTramo(desglose: Fila[], i: number): string {
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
