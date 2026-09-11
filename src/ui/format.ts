/** Formateo para lectores argentinos: punto de miles, coma decimal. */

const PESOS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

const PESOS_REDONDO = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const NUMERO = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Las cifras significativas que se muestran cuando los decimales fijos no alcanzan: un índice
 * menor que uno, o un monto que redondeado se leería como cero.
 *
 * Cuatro, porque es lo que ya mostraba la columna del índice en el rango donde vivía casi todo
 * lo menor que uno (0,7625 del nacional en 1990). Sale de una constante porque la pantalla y
 * el CSV tienen que decir el mismo número.
 */
const CIFRAS_SIGNIFICATIVAS = 4;

const PESOS_CIFRAS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumSignificantDigits: CIFRAS_SIGNIFICATIVAS,
});

/** Si un número ya impreso no muestra ninguna cifra distinta de cero. */
const seLeeCero = (texto: string) => !/[1-9]/.test(texto);

/**
 * Un monto que no es cero nunca se imprime como cero.
 *
 * Con Córdoba desde 1968, deflactar $1.000.000 de agosto 2026 a enero 1975 da 0,0000227: la
 * moneda de 1975 tenía once ceros más que el peso. Redondeado a centavos, el resultado decía
 * "$ 0" y la tabla "$ 0,00", que es afirmar que ese millón no valía nada. Cuando el redondeo
 * se come todas las cifras, se muestran las significativas; en cualquier otro caso el formato
 * es el de siempre.
 */
function sinLeerseCero(n: number, formato: Intl.NumberFormat): string {
  const texto = formato.format(n);
  return n !== 0 && Number.isFinite(n) && seLeeCero(texto) ? PESOS_CIFRAS.format(n) : texto;
}

export function pesos(n: number): string {
  return sinLeerseCero(n, PESOS);
}

/** Para el número protagonista: los centavos son ruido a ese tamaño. */
export function pesosRedondo(n: number): string {
  return sinLeerseCero(n, PESOS_REDONDO);
}

/**
 * El monto en el CSV: dos decimales con punto, como siempre, salvo que se lean como cero. Es el
 * mismo criterio que `pesos()`: `toFixed(2)` escribía "0.00" en las filas de 1975 de una
 * deflación desde 2026, y en una planilla eso es un cero.
 */
export function montoCsv(n: number): string {
  const fijo = n.toFixed(2);
  return n !== 0 && Number.isFinite(n) && seLeeCero(fijo) ? n.toPrecision(CIFRAS_SIGNIFICATIVAS) : fijo;
}

/** Los decimales con los que se imprime un porcentaje de esta magnitud. */
function decimalesDe(n: number): number {
  return Math.abs(n) >= 1000 ? 0 : 2;
}

/**
 * El número tal como queda impreso, ya redondeado.
 *
 * Sirve para razonar sobre lo que la persona ve en lugar de sobre el flotante: qué meses
 * empatan en el máximo, y cuánto da sumar una columna con la calculadora del celular.
 * Sale de acá y no de una constante suelta porque tiene que moverse con `porcentaje()`:
 * si algún día los porcentajes se muestran con otra precisión, el empate y la suma
 * cambian con ellos.
 */
export function comoSeMuestra(n: number): number {
  const paso = Math.pow(10, decimalesDe(n));
  const redondeado = Math.round(n * paso) / paso;
  return redondeado === 0 ? 0 : redondeado; // sin −0
}

/**
 * Porcentajes con signo explícito. La precisión se adapta a la magnitud: 1,89% no
 * se lee igual que 78.603,31%, y la calculadora abarca ambos.
 */
export function porcentaje(n: number, conSigno = true): string {
  const decimales = decimalesDe(n);

  /*
   * Un valor que redondeado a la precisión con la que se muestra da cero se imprime como
   * cero, sin signo. Sin esto, la inflación de 1996 —−0,0056%— salía como `-0,00%`, que
   * se lee "menos cero por ciento" y hace dudar de todo lo que hay alrededor: la revisora
   * lo leyó tres veces antes de preguntar qué significaba. Un signo sobre una cifra que
   * se muestra como cero no informa nada, y confunde.
   */
  const mostrado = comoSeMuestra(n) === 0 ? 0 : n;

  const cuerpo = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(mostrado);
  const signo = conSigno && mostrado > 0 ? "+" : "";
  return `${signo}${cuerpo}%`;
}

/**
 * ¿Dos porcentajes se ven distintos, ya redondeados a como se muestran?
 *
 * Existe porque la nota del interés compuesto contrapone dos cifras —la suma de la columna
 * y el acumulado— y en tramos cortos las dos caen en el mismo redondeo: de enero a marzo de
 * 1996 la nota decía "te va a dar -0,80%, no -0,80%". La diferencia existe en el sexto
 * decimal, pero una frase que enfrenta dos números idénticos no explica nada; hace dudar de
 * la tabla, que es justo lo contrario de lo que la nota busca.
 *
 * Compara los strings formateados, no los números, porque lo que importa es lo que la
 * persona ve: `porcentaje()` cambia de decimales según la magnitud, así que la tolerancia
 * no es una constante que se pueda escribir acá.
 */
export function seVenDistintos(a: number, b: number): boolean {
  return porcentaje(a, false) !== porcentaje(b, false);
}

const NUMERO_CIFRAS = new Intl.NumberFormat("es-AR", {
  minimumSignificantDigits: CIFRAS_SIGNIFICATIVAS,
  maximumSignificantDigits: CIFRAS_SIGNIFICATIVAS,
});

/**
 * Índices de precios.
 *
 * La serie abarca veinte órdenes de magnitud —Córdoba vale 4,33e-13 en enero de 1968 y
 * Río Negro pasa los 16 billones— así que por debajo de uno se imprimen **cifras
 * significativas y no decimales fijos**. Con cuatro decimales fijos la fila de 1968 decía
 * "0,0000": un índice en cero es justo lo que haría imposible la cuenta que está al lado, así
 * que la tabla contradecía a su propio resultado.
 *
 * Sin notación exponencial, aunque la cifra quede larga: "4,333e-13" se lee como un número de
 * cuatro mil a alguien que no la usa, y "0,0000000000004333" no se puede leer como nada
 * distinto de lo que es. Lo que nunca cambia es el separador: siempre coma decimal. Mezclar
 * `0.7625` con `1.234,56` en la misma columna se lee mal en un país donde el punto separa
 * miles.
 */
export function indice(n: number): string {
  return n < 1 ? NUMERO_CIFRAS.format(n) : NUMERO.format(n);
}

/**
 * El índice en el CSV: punto decimal, para que una planilla lo lea como número, y las mismas
 * cifras que la pantalla por debajo de uno.
 *
 * `toFixed(4)` escribía "0.0000" en las filas de Córdoba anteriores a 1990, que abierto en
 * una planilla es un cero. Acá sí va la notación exponencial (`4.333e-13`): el archivo lo lee
 * un programa, y es la forma en que cualquier planilla lo interpreta como número.
 */
export function indiceCsv(n: number): string {
  return n < 1 ? n.toPrecision(CIFRAS_SIGNIFICATIVAS) : n.toFixed(4);
}

/**
 * Cuántos caracteres visibles entran en la cifra protagonista con la letra de siempre.
 *
 * Medido en un browser a 375 px de ancho, sobre el índice nacional (que en ese ancho no
 * desborda por otra cosa): con 2rem entran 15 caracteres —"~$ 1.610.057.520"— y con 16 la
 * cifra ya empuja la página hacia el costado. Con Córdoba desde 1968, $1.000 de enero de
 * 1970 dan "$ 255.323.213.736.518.400", 24 caracteres sin un espacio donde cortar, y la
 * página pasaba a medir 533 px.
 */
const CARACTERES_DE_LA_CIFRA_NORMAL = 15;

/**
 * Si la cifra protagonista necesita la letra chica (`.resultado__cifra--larga`) para entrar
 * en un celular. Cuenta lo que se ve: los espacios que Intl mete después del signo no ocupan
 * lo que ocupa un dígito.
 */
export function cifraLarga(texto: string): boolean {
  return texto.replace(/\s/g, "").length > CARACTERES_DE_LA_CIFRA_NORMAL;
}

export function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
