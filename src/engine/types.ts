/**
 * Tipos compartidos entre el pipeline de datos y el motor de cálculo.
 *
 * El motor no sabe nada de HTTP, del DOM ni de Argentina Data MCP: recibe una
 * `SerieIndice` ya armada y devuelve números. Eso lo hace testeable en aislamiento,
 * que importa porque acá vive toda la lógica delicada (el empalme de series y la
 * proyección de meses sin publicar).
 */

/** Un mes calendario en formato `YYYY-MM`. Es la unidad de tiempo de todo el sistema. */
export type Mes = string;

/** De dónde salió el valor del índice de un mes dado. */
export type Origen = "indec" | "bcra" | "proyeccion";

export type PuntoIndice = {
  mes: Mes;
  /** Índice de precios, base dic-2016 = 100. */
  indice: number;
  origen: Exclude<Origen, "proyeccion">;
};

export type FuenteSerie = {
  id: string;
  organismo: string;
  /** Rango que aporta esta fuente al empalme, `YYYY-MM/YYYY-MM`. */
  rango: string;
};

export type SerieIndice = {
  serie: string;
  base: string;
  fuentes: FuenteSerie[];
  /** Último mes con dato oficial publicado. Todo lo posterior es proyección. */
  ultimo_oficial: Mes;
  /** ISO 8601 de cuándo corrió el pipeline. */
  actualizado: string;
  /** Ordenados cronológicamente, sin huecos. */
  datos: PuntoIndice[];
};

/** Una fila del desglose mes a mes: el cálculo mostrado, no solo el resultado. */
export type Fila = {
  mes: Mes;
  indice: number;
  /** Variación respecto del mes anterior. `null` en la fila de origen. */
  varMensualPct: number | null;
  /** Variación acumulada desde el mes de origen. `null` en la fila de origen. */
  acumuladoPct: number | null;
  monto: number;
  esProyeccion: boolean;
  origen: Origen;
};

export type Tramo = {
  hasta: Mes;
  monto: number;
  variacionPct: number;
};

export type TramoEstimado = Tramo & {
  mesesProyectados: number;
  /** Tasa mensual usada para proyectar, en porcentaje. */
  tasaMensualPct: number;
};

export type Resultado = {
  monto: number;
  desde: Mes;
  hasta: Mes;
  /** Resultado usando exclusivamente datos oficiales publicados. Siempre presente. */
  oficial: Tramo;
  /**
   * Presente sólo si `hasta` supera el último mes oficial. Cuando falta, la UI
   * muestra un único resultado y no hay nada que aclarar.
   */
  estimado?: TramoEstimado;
  desglose: Fila[];
};
