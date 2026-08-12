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

/**
 * Porcentajes con signo explícito. La precisión se adapta a la magnitud: 1,89% no
 * se lee igual que 78.603,31%, y la calculadora abarca ambos.
 */
export function porcentaje(n: number, conSigno = true): string {
  const abs = Math.abs(n);
  const decimales = abs >= 1000 ? 0 : 2;
  const cuerpo = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n);
  const signo = conSigno && n > 0 ? "+" : "";
  return `${signo}${cuerpo}%`;
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
