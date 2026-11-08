/**
 * Un `publicadosPor` puesto de sujeto, con la aposición cerrada.
 *
 * Varios organismos se nombran con una aposición —"el IDECBA, la dirección de estadística
 * de la Ciudad"— que queda bien al final de una oración ("publicados por el IDECBA, la
 * dirección…") y mal en el medio: "Meses que el IDECBA, la dirección de estadística de la
 * Ciudad todavía no publicó" pide una coma antes del verbo. Toda frase que sigue después
 * del organismo pasa por acá, y no cada una con su coma a mano: la etiqueta la elige el
 * snapshot, y la frase no sabe si le va a tocar una con aposición o "el INDEC" a secas.
 */
export function comoSujeto(publicadosPor: string): string {
  return publicadosPor.includes(",") ? `${publicadosPor},` : publicadosPor;
}
