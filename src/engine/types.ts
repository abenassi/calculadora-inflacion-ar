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

/**
 * Expectativa de inflación del REM (Relevamiento de Expectativas de Mercado) del
 * BCRA, que releva a consultoras y bancos todos los meses.
 *
 * OJO con qué es este número: el REM completo publica una senda mes a mes, pero la
 * única serie del relevamiento que expone el catálogo es la **mediana de la
 * variación interanual esperada para los próximos 12 meses**. O sea, un solo número
 * por encuesta. Todo lo que el sitio puede hacer con eso es repartirlo parejo entre
 * los doce meses; no hay forma de saber cuánto de ese total esperan los analistas
 * para cada mes en particular. La interfaz tiene que decirlo.
 */
export type ExpectativaRem = {
  /** Mediana de inflación esperada para los próximos 12 meses, en porcentaje. */
  expectativaAnualPct: number;
  /** Mes de la encuesta de la que sale el número. */
  mes: Mes;
  serie: string;
  organismo: string;
};

export type SerieIndice = {
  serie: string;
  base: string;
  fuentes: FuenteSerie[];
  /** Ausente si el pipeline no pudo traer el REM; el sitio esconde esa opción. */
  rem?: ExpectativaRem;
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

/**
 * Cómo se resolvió el cálculo.
 *
 * El IPC se publica con semanas de retraso, así que el mes en curso —y a veces el
 * anterior— nunca tienen dato. Como el uso dominante es justamente traer un monto
 * del pasado al presente, el método tiene que resolver ese hueco de una forma que
 * se pueda explicar en una oración.
 */
export type Metodo =
  /** Todo el período está publicado. No hace falta ningún artilugio. */
  | { tipo: "directo" }
  /**
   * El destino todavía no se publicó, pero no es futuro: ya pasó o está pasando.
   *
   * En vez de inventar los meses que faltan, se corre la ventana hacia atrás y se
   * usa la inflación de los últimos N meses publicados, con N igual a la cantidad
   * de meses del período pedido. Todos los números son del INDEC.
   *
   * Sigue siendo una aproximación —no es la inflación del período pedido, sino la
   * del período publicado más reciente de igual duración— y por eso la interfaz
   * nombra siempre los meses concretos que se usaron.
   */
  | {
      tipo: "ventana_reciente";
      /** Cuántos meses abarca el período pedido. */
      mesesDelPeriodo: number;
      /** Cuántos meses hacia atrás se corrió la ventana. */
      desplazamiento: number;
      /** Los meses del período pedido que el INDEC todavía no publicó. */
      mesesSinPublicar: Mes[];
    }
  /**
   * Los meses que faltan se estiman con una tasa mensual constante, y el desglose
   * muestra los meses que se pidieron de verdad.
   *
   * De dónde sale la tasa lo dice `base`. Las dos variantes comparten toda la
   * maquinaria porque la diferencia entre ellas es un número: qué tasa se repite.
   * Lo que cambia de una a otra es cómo se explica, y eso vive en la interfaz.
   */
  | {
      tipo: "proyeccion";
      /** Tasa mensual aplicada a cada mes estimado, en porcentaje. */
      tasaMensualPct: number;
      /** Los meses sin publicar que se estimaron. */
      mesesEstimados: Mes[];
      base: BaseProyeccion;
    };

export type BaseProyeccion =
  /** Se repite la última variación mensual publicada por el INDEC. */
  | { fuente: "ultimo_mes"; mes: Mes }
  /**
   * Se reparte la expectativa del REM en doce meses iguales. `tasaMensualPct` es
   * la tasa mensual equivalente, no un dato que el REM publique por separado.
   */
  | { fuente: "rem"; mesEncuesta: Mes; expectativaAnualPct: number };

/**
 * Qué hacer con los meses que el INDEC todavía no publicó. La elige la persona; el
 * default nunca estima nada, que es lo que la mayoría necesita y lo único que se
 * explica sin hablar de métodos.
 */
export type Metodologia = "sin_proyectar" | "repite_ultimo" | "rem";

export type Resultado = {
  monto: number;
  desde: Punto;
  hasta: Punto;
  montoAjustado: number;
  variacionPct: number;
  metodo: Metodo;
  /**
   * El cálculo mostrado paso a paso.
   *
   * Con `ventana_reciente`, las filas son los meses publicados que se usaron, no
   * los del período pedido: son esos los que hay que poder mostrar cuando alguien
   * pregunta de dónde sale el número.
   */
  desglose: Fila[];
};
