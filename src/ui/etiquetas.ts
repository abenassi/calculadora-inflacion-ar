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

import {
  abreviarMes,
  abreviarPunto,
  comoInstante,
  esFecha,
  mesDe,
  ordenReal,
  restarDias,
} from "../engine/mes.js";
import type {
  EtiquetaFuente,
  Fila,
  FuentesDeSerie,
  FuenteSerie,
  Mes,
  Punto,
} from "../engine/types.js";

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
 * Si alguna de las filas que muestran un porcentaje es un tramo de días.
 *
 * Es la pregunta que separa "Inflación mensual" de "Inflación de cada tramo", y la
 * contestan cuatro superficies: el título del gráfico, su `aria-label`, el encabezado del
 * texto que se copia y el tooltip de la barra. Estaba deletreada de dos formas distintas
 * —una miraba la fila de partida, la otra estaba cableada— y el tooltip contestaba "del
 * mes" arriba de un tramo de 15 días cuyo porcentaje no es el del mes.
 *
 * Mira `slice(1)` porque la fila de partida no muestra ningún porcentaje, y `esParcial`
 * porque es lo que separa un tramo de días de un mes calendario: una fila `1 jun → 1 jul`
 * cubre un mes entero y se rotula "jun 2026" aunque el período se haya pedido con fechas
 * exactas.
 *
 * Vuelve a coincidir con `rotularFila`: la flecha sale exactamente cuando la fila es parcial.
 * Hubo un rato en que no —la 0014 le agregó a `rotularFila` una rama para un choque de nombres
 * que el recorrido cronológico terminó volviendo imposible— y en ese rato el texto que se
 * copia podía decir "Mes a mes:" arriba de una línea con flecha. Barrido de 720 consultas: hoy
 * son cero.
 *
 * Queda una diferencia chica y a propósito: `rotularFila` exige además `esFecha(fila.punto)`,
 * así que una fila parcial cuyo punto sea un mes cae del lado de las puntas mixtas, que son el
 * caso diferido.
 */
export function hayTramosDeDias(desglose: Fila[]): boolean {
  return desglose.slice(1).some((f) => f.esParcial);
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
 * El mes calendario cuya inflación muestra un tramo.
 *
 * No es "el mes del punto de llegada" ni "el más viejo de los dos extremos": las dos reglas
 * anteriores acertaban en un caso y erraban en el otro, porque un punto puede ser un mes o
 * un día y significan cosas distintas. Un mes vale por su **cierre** (0004) y un día 1 es,
 * por construcción, el cierre del mes anterior. Así que el criterio único es: se toma el
 * extremo cronológicamente más nuevo como instante, y se nombra el mes que termina ahí.
 *
 * | tramo | instante nuevo | mes |
 * |---|---|---|
 * | `2026-02` → `2026-03` | 1 abr | marzo |
 * | `2026-07` → `2026-06` (deflactando) | 1 ago | **julio** |
 * | `2 may` → `1 jun` | 1 jun | mayo |
 * | `15 jul` → `20 jul` | 20 jul | julio |
 *
 * La regla vieja para meses —el punto de llegada— acertaba yendo para adelante y erraba
 * deflactando: la fila "jun 2026" mostraba el +2,11% de julio invertido. La regla vieja para
 * días —el más viejo— acertaba siempre pero no servía para meses.
 */
export function mesDelTramo(desglose: Fila[], i: number): Mes {
  // `ordenReal` y no `compararPuntos`: con un mes y un día de ese mismo mes los dos empatan
  // bajo `compararPuntos`, y esto acertaba por la **estabilidad** del `sort` —el array ya
  // venía ordenado por el motor— y no por el criterio. Un acierto que depende de algo que
  // nadie escribió es un acierto prestado.
  const [, nuevo] = [desglose[i - 1]!.punto, desglose[i]!.punto].sort(ordenReal);
  return mesDe(restarDias(comoInstante(nuevo!), 1));
}

/**
 * El rótulo de la tabla.
 *
 * `corto` saca los años del rango de las puntas, para el eje del gráfico, donde
 * "15 may 2026 → 1 jun 2026" no entra sin pisarse con la barra vecina.
 */
export function rotularFila(desglose: Fila[], i: number, corto = false): string {
  const fila = desglose[i]!;
  if (i === 0) return abreviarPunto(fila.punto);

  const sinAnio = (s: string) => s.replace(/ \d{4}$/, "");
  // Las dos puntas ya vienen cronológicas: el desglose se recorre siempre del mes más viejo al
  // más nuevo (0014). Antes no, y la flecha salía "15 jul 2026 → 1 jul 2026", apuntando para
  // atrás en el tiempo cuando una flecha se lee "de acá hasta acá". Acá hubo un `sort` de red
  // por si acaso; se sacó porque medido daba 912 llamadas y **cero** intercambios, y una rama
  // que no se ejecuta nunca hace creer que el desglose puede venir en cualquier orden.
  const comoRango = (a: Punto, b: Punto) => {
    const [ini, fin] = [abreviarPunto(a), abreviarPunto(b)];
    return corto ? `${sinAnio(ini)} → ${sinAnio(fin)}` : `${ini} → ${fin}`;
  };

  if (fila.esParcial && esFecha(fila.punto)) {
    return comoRango(desglose[i - 1]!.punto, fila.punto);
  }

  // El tramo se nombra por el mes de su inflación, que es el número que la fila muestra.
  //
  // Hubo una rama más acá: deflactando, el primer tramo sacaba la inflación del mes en el que
  // arrancaba el período y su rótulo repetía el de la fila de partida, así que se nombraba por
  // sus dos puntas. Murió con el desglose cronológico de la 0014 —ahora ninguna fila puede
  // repetir a la de arriba— y la revisora usuaria tenía razón sobre ella: dejaba dos renglones
  // seguidos empezando con "jun" y queriendo decir meses distintos, en la tabla y en el gráfico.
  return abreviarMes(mesDelTramo(desglose, i));
}
