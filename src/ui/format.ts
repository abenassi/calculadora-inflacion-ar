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

export function pesos(n: number): string {
  return PESOS.format(n);
}

/** Para el número protagonista: los centavos son ruido a ese tamaño. */
export function pesosRedondo(n: number): string {
  return PESOS_REDONDO.format(n);
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

const NUMERO_4 = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

/**
 * Índices de precios.
 *
 * La serie abarca casi seis órdenes de magnitud —el índice retropolado de enero de
 * 1990 vale 0,76 y el de junio de 2026 pasa los 11.800— así que la cantidad de
 * decimales se adapta. Lo que nunca cambia es el separador: siempre coma decimal.
 * Mezclar `0.7625` con `1.234,56` en la misma columna se lee mal en un país donde
 * el punto separa miles.
 */
export function indice(n: number): string {
  return n < 1 ? NUMERO_4.format(n) : NUMERO.format(n);
}

export function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
