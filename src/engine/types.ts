/**
 * Tipos compartidos entre el pipeline de datos y el motor de cálculo.
 *
 * El motor no sabe nada de HTTP, del DOM ni de Argentina Data MCP: recibe una
 * `SerieIndice` ya armada y devuelve números. Eso lo hace testeable en aislamiento,
 * que importa porque acá vive toda la lógica delicada (el empalme de series y la
 * proyección de meses sin publicar).
 */

/** Un mes calendario en formato `YYYY-MM`. Es la unidad de tiempo por defecto. */
export type Mes = string;

/** Un día concreto en formato `YYYY-MM-DD`. Sólo aparece en el modo por día. */
export type Fecha = string;

/**
 * Un extremo del período a ajustar. Puede ser un mes entero o un día puntual: el
 * motor acepta los dos y los mezcla sin problema (por ejemplo, de un día de mayo a
 * todo agosto).
 */
export type Punto = Mes | Fecha;

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

/** Una fila del desglose: el cálculo mostrado, no solo el resultado. */
export type Fila = {
  punto: Punto;
  indice: number;
  /** Variación respecto de la fila anterior. `null` en la fila de origen. */
  varMensualPct: number | null;
  /** Variación acumulada desde el origen. `null` en la fila de origen. */
  acumuladoPct: number | null;
  monto: number;
  esProyeccion: boolean;
  origen: Origen;
};

export type Tramo = {
  hasta: Punto;
  monto: number;
  variacionPct: number;
};

/** Un mes publicado que entra en el promedio de la proyección. */
export type MesBase = {
  mes: Mes;
  varMensualPct: number;
};

export type TramoEstimado = Tramo & {
  /** Los meses concretos que el INDEC todavía no publicó y hubo que estimar. */
  mesesFaltantes: Mes[];
  /** Tasa mensual usada para proyectar, en porcentaje. */
  tasaMensualPct: number;
  /**
   * Los meses publicados cuyo promedio da `tasaMensualPct`.
   *
   * Se expone para que la interfaz pueda mostrarlos: sin esto, la tasa de
   * proyección es un número que aparece de la nada, y alguien que tiene que
   * justificar el resultado ante otra persona no puede explicar de dónde salió.
   */
  base: MesBase[];
};

export type Resultado = {
  monto: number;
  desde: Punto;
  hasta: Punto;
  /**
   * Resultado usando exclusivamente datos oficiales publicados.
   *
   * **Ausente** cuando el propio punto de origen cae en un mes sin publicar: en ese
   * caso el cociente de índices tiene una proyección en el denominador y no queda
   * ningún número que se pueda llamar oficial. Marcarlo como oficial sería mentir
   * justo sobre la procedencia del dato, que es lo único que este sitio promete.
   */
  oficial?: Tramo;
  /**
   * Presente sólo si el período toca meses sin publicar. Cuando falta, la UI
   * muestra un único resultado y no hay nada que aclarar.
   */
  estimado?: TramoEstimado;
  desglose: Fila[];
};
