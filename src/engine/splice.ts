/**
 * Empalme de las dos series que componen el índice de precios usado por la
 * calculadora.
 *
 * El INDEC publica un índice de nivel sólo desde diciembre de 2016. Para atrás, lo
 * que hay es la serie de variación mensual del BCRA (`bcra:27`), que arranca en
 * enero de 1990. Este módulo retropola: parte del ancla dic-2016 = 100 y camina
 * hacia atrás dividiendo por cada variación mensual, reconstruyendo un índice único
 * y continuo.
 *
 * Es el mismo empalme que `ajuste_por_inflacion` hace del lado del servidor. No
 * inventamos metodología propia: el objetivo es que el sitio y el MCP coincidan.
 *
 * Corre en el pipeline, no en el browser. El browser recibe el resultado ya armado.
 */

import type { PuntoIndice } from "./types.js";
import { aOrdinal, compararMeses, deOrdinal, nombrarMes } from "./mes.js";
import type { Mes } from "./types.js";

export type PuntoCrudo = { mes: Mes; valor: number };

export class EmpalmeError extends Error {}

/** Verifica que una serie mensual esté ordenada y no tenga huecos. */
function verificarContinuidad(puntos: PuntoCrudo[], nombre: string): void {
  if (puntos.length === 0) throw new EmpalmeError(`La serie ${nombre} vino vacía`);
  for (let i = 1; i < puntos.length; i++) {
    const esperado = aOrdinal(puntos[i - 1]!.mes) + 1;
    const real = aOrdinal(puntos[i]!.mes);
    if (real !== esperado) {
      throw new EmpalmeError(
        `La serie ${nombre} tiene un hueco: después de ${puntos[i - 1]!.mes} ` +
          `viene ${puntos[i]!.mes} (se esperaba ${deOrdinal(esperado)})`,
      );
    }
  }
}

/**
 * @param varMensualBcra Variación mensual en porcentaje (`bcra:27`), mensual y continua.
 * @param indiceIndec    Índice de nivel del IPC nacional, mensual y continuo.
 * @returns Índice único base dic-2016 = 100, ordenado, sin huecos, con el origen de cada punto.
 */
export function empalmar(varMensualBcra: PuntoCrudo[], indiceIndec: PuntoCrudo[]): PuntoIndice[] {
  verificarContinuidad(varMensualBcra, "bcra:27");
  verificarContinuidad(indiceIndec, "IPC INDEC");

  const ancla = indiceIndec[0]!;
  if (ancla.valor <= 0) {
    throw new EmpalmeError(`El primer valor del IPC INDEC no es positivo: ${ancla.valor}`);
  }

  // Reescalar el índice del INDEC para que su primer mes valga exactamente 100.
  // La serie ya viene en base dic-2016=100, así que en la práctica el factor es 1;
  // normalizamos igual para no depender de que la fuente no cambie de base.
  const factor = 100 / ancla.valor;
  const tramoIndec: PuntoIndice[] = indiceIndec.map((p) => ({
    mes: p.mes,
    indice: p.valor * factor,
    origen: "indec" as const,
  }));

  // Retropolación: idx(m) = idx(m+1) / (1 + v(m+1)/100), donde v(m+1) es la
  // inflación DEL mes m+1, o sea la variación de m a m+1.
  const varPorMes = new Map(varMensualBcra.map((p) => [p.mes, p.valor]));
  const tramoBcra: PuntoIndice[] = [];
  const primerMesBcra = varMensualBcra[0]!.mes;

  let indiceSiguiente = 100;
  let mesSiguiente = ancla.mes;

  while (compararMeses(mesSiguiente, primerMesBcra) > 0) {
    const variacion = varPorMes.get(mesSiguiente);
    if (variacion === undefined) {
      // Pasa si bcra:27 no llega a cubrir el ancla. Cortamos acá en vez de
      // extrapolar: preferimos una serie más corta que una inventada.
      break;
    }
    if (variacion <= -100) {
      throw new EmpalmeError(
        `Variación imposible en ${nombrarMes(mesSiguiente)}: ${variacion}% implicaría precios nulos o negativos`,
      );
    }
    const mesActual = deOrdinal(aOrdinal(mesSiguiente) - 1);
    const indiceActual = indiceSiguiente / (1 + variacion / 100);
    tramoBcra.push({ mes: mesActual, indice: indiceActual, origen: "bcra" });
    indiceSiguiente = indiceActual;
    mesSiguiente = mesActual;
  }

  tramoBcra.reverse();
  const empalmado = [...tramoBcra, ...tramoIndec];

  verificarContinuidad(
    empalmado.map((p) => ({ mes: p.mes, valor: p.indice })),
    "índice empalmado",
  );
  for (const p of empalmado) {
    if (!Number.isFinite(p.indice) || p.indice <= 0) {
      throw new EmpalmeError(`Índice inválido en ${p.mes}: ${p.indice}`);
    }
  }

  return empalmado;
}
