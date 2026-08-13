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
 * BCRA, que releva a consultoras, bancos y centros de investigación todos los meses.
 *
 * Trae dos cosas distintas y conviene no confundirlas:
 *
 * - `senda`: la mediana esperada **para cada mes**, tal como la publica el REM. Es
 *   el dato bueno, pero llega hasta seis meses hacia adelante y no más: el
 *   relevamiento no pronostica mes a mes más allá de eso.
 * - `expectativaAnualPct`: la mediana a doce meses, un solo número. Sirve para
 *   estirar la proyección más allá del horizonte de la senda, repartiéndola pareja.
 *   Ahí sí es un promedio nuestro y no algo que los analistas hayan dicho.
 */
export type ExpectativaRem = {
  /** Mediana esperada mes a mes, ordenada. Cubre unos seis meses hacia adelante. */
  senda: { mes: Mes; tasaPct: number }[];
  /** Mediana de inflación esperada para los próximos 12 meses, en porcentaje. */
  expectativaAnualPct: number;
  /** Mes de la encuesta de la que salen estos números. */
  mes: Mes;
  series: string[];
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
  /**
   * El tramo que representa la fila no cubre un mes calendario entero.
   *
   * Sólo pasa en modo por día, en las puntas del período. Importa porque el número
   * de esas filas **no es un dato que el INDEC haya publicado**: es la parte
   * proporcional que le toca a esos días. Etiquetarlas como oficiales sería
   * atribuirle al INDEC una cuenta nuestra.
   */
  esParcial: boolean;
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
      /**
       * Tasa mensual aplicada, en porcentaje. `null` cuando cambia mes a mes, que
       * es lo que pasa con la senda del REM: ahí el número de cada mes está en su
       * fila del desglose y no hay una tasa única que nombrar.
       */
      tasaMensualPct: number | null;
      /**
       * Los meses sin publicar que se estimaron **y que mueven el resultado**: van desde
       * el extremo más viejo del período pedido, no desde el último mes publicado. Los
       * anteriores hay que estimarlos igual para construir el índice, pero se cancelan
       * en el cociente entre las dos puntas y nombrarlos confundía (ver 0003).
       *
       * Puede venir vacío: pedir una metodología de estimación no obliga a que haya algo
       * que estimar.
       */
      mesesEstimados: Mes[];
      base: BaseProyeccion;
    };

export type BaseProyeccion =
  /** Se repite la última variación mensual publicada por el INDEC. */
  | { fuente: "ultimo_mes"; mes: Mes }
  /**
   * La senda mensual del REM. Los meses que el relevamiento pronostica van con su
   * valor propio; los que quedan más allá de su horizonte se completan repartiendo
   * la expectativa a doce meses, y esos se listan aparte porque son la única parte
   * del cálculo que los analistas no dijeron.
   */
  | {
      fuente: "rem";
      mesEncuesta: Mes;
      expectativaAnualPct: number;
      /** Meses tomados de la senda publicada. */
      mesesDeLaSenda: Mes[];
      /** Meses más allá del horizonte del REM, a tasa pareja. */
      mesesExtrapolados: Mes[];
    };

/**
 * Qué hacer con los meses que el INDEC todavía no publicó. La elige la persona; el
 * default nunca estima nada, que es lo que la mayoría necesita y lo único que se
 * explica sin hablar de métodos.
 */
export type Metodologia = "sin_proyectar" | "repite_ultimo" | "rem";

export type Resultado = {
  /**
   * La metodología que se pidió, que no siempre es la que terminó aplicándose.
   *
   * `sin_proyectar` con un destino futuro es el caso: no existe ningún tramo
   * publicado equivalente, así que hay que estimar igual. Eso ya no se puede pedir
   * desde la interfaz —la opción queda deshabilitada y el selector pasa solo a la
   * metodología en uso—, pero el dato se conserva porque `adjust()` es una API propia
   * que se puede llamar con cualquier combinación, y porque el analytics registra qué
   * se pidió, no qué se terminó aplicando.
   */
  metodologia: Metodologia;
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
