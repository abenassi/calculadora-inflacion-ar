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
 * Las cifras significativas que se muestran cuando los decimales fijos no alcanzan.
 *
 * Cuatro, porque es lo que ya mostraba la columna del índice en el rango donde vivía casi todo
 * lo menor que uno (0,7625 del nacional en 1990). Sale de una constante porque la pantalla y
 * el CSV tienen que decir el mismo número.
 */
const CIFRAS_SIGNIFICATIVAS = 4;

/**
 * Si un número se escribe con cifras significativas en vez de decimales fijos: todo lo que no
 * es cero y, redondeado a cuatro cifras, queda entre −1 y 1. Es el único criterio para montos e
 * índices, en la pantalla, en el texto que se copia y en el CSV (regla 4).
 *
 * Antes eran dos criterios, escritos dos veces. El índice cambiaba de formato por debajo de uno
 * y el monto cuando el redondeo se comía todas sus cifras, que no es el mismo borde para la
 * cifra sin centavos que para la tabla: con Córdoba, $1.000.000 de agosto 2026 llevados a mayo
 * de 1985 daban "$ 0,01194" en el resultado y "$ 0,01" en la fila "← el resultado" y en el CSV,
 * y medio peso era "$ 1" arriba y "$ 0,50" abajo.
 *
 * Decide sobre el número redondeado y no sobre el crudo: 0,99995 se imprime 1 con cuatro
 * cifras, y decidiendo sobre el crudo salía "$ 1,0" y "1.0" contra "$ 1,00" y "1.00" para 1.
 */
export function vaConCifras(n: number): boolean {
  if (n === 0 || !Number.isFinite(n)) return false;
  return Math.abs(Number(n.toPrecision(CIFRAS_SIGNIFICATIVAS))) < 1;
}

/**
 * Un monto menor que uno: de dos a cuatro cifras significativas. Dos como mínimo para que medio
 * peso se siga leyendo "$ 0,50", como cualquier monto con centavos; cuatro como máximo, como el
 * índice.
 *
 * Con esto un monto que no es cero nunca se imprime como cero. Con Córdoba desde 1968,
 * deflactar $1.000.000 de agosto 2026 a enero 1975 da 0,0000000227 —la moneda de 1975 tenía
 * once ceros más que el peso—, y redondeado a centavos el resultado decía "$ 0" y la tabla
 * "$ 0,00", que es afirmar que ese millón no valía nada.
 */
const PESOS_CIFRAS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumSignificantDigits: 2,
  maximumSignificantDigits: CIFRAS_SIGNIFICATIVAS,
});

export function pesos(n: number): string {
  return (vaConCifras(n) ? PESOS_CIFRAS : PESOS).format(n);
}

/** Para el número protagonista: los centavos son ruido a ese tamaño, salvo que no haya otra cosa. */
export function pesosRedondo(n: number): string {
  return (vaConCifras(n) ? PESOS_CIFRAS : PESOS_REDONDO).format(n);
}

const CANTIDAD = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

const CANTIDAD_CIFRAS = new Intl.NumberFormat("es-AR", {
  minimumSignificantDigits: 2,
  maximumSignificantDigits: CIFRAS_SIGNIFICATIVAS,
});

/** Un número sin signo `$`, con el criterio de `pesosRedondo`: "100.000.000.000" unidades. */
export function cantidad(n: number): string {
  return (vaConCifras(n) ? CANTIDAD_CIFRAS : CANTIDAD).format(n);
}

/** Intl no acepta más cifras significativas que estas. */
const MAXIMO_DE_INTL = 21;

/**
 * Un monto pasado a la moneda de la otra punta, en el aviso de moneda: "$ 2.553.232", "1,081"
 * australes. Sale de la cifra impresa arriba (`resultadoImpreso`) por el factor entre las dos
 * monedas, que es la cuenta que hace cualquiera con la calculadora del celular.
 *
 * **Nunca con más cifras significativas que esa cifra.** Arriba dice "$ 0,01194", y 0,01194 por
 * 10.000.000 da 119.400: "119.359" no le cerraba a nadie. Pasa lo mismo entre 1 y 999, donde la
 * cifra va redondeada a entero: con "$ 921" arriba el aviso decía 9.209.100 australes, y la
 * calculadora da 9.210.000. Por eso sale del texto impreso y no del resultado sin redondear: con
 * 999,6 arriba dice "$ 1.000", y la cuenta tiene que salir de ese 1.000.
 *
 * Dentro de eso, por debajo de mil hasta cuatro cifras significativas: redondeado a entero,
 * 1,081 australes eran "1 australes" y $ 1,32 era "$ 1", hasta 30% menos, en una frase que
 * existe para decir cuánto es de verdad. De mil para arriba, sin decimales.
 */
export function montoConvertido(
  resultadoImpreso: string,
  factor: number,
  opciones: { enPesos?: boolean } = {},
): string {
  const n = Number(resultadoImpreso.replace(/[^\d,]/g, "").replace(",", ".")) * factor;
  const impresas = resultadoImpreso.replace(/\D/g, "").replace(/^0+/, "").length;
  const delRedondeo = Math.abs(n) >= 1000 ? Math.floor(Math.log10(Math.abs(n))) + 1 : CIFRAS_SIGNIFICATIVAS;
  const maximo = Math.min(Math.max(impresas, 1), delRedondeo, MAXIMO_DE_INTL);
  const numero: Intl.NumberFormatOptions = {
    minimumSignificantDigits: Math.min(vaConCifras(n) ? 2 : 1, maximo),
    maximumSignificantDigits: maximo,
  };
  return new Intl.NumberFormat(
    "es-AR",
    opciones.enPesos ? { style: "currency", currency: "ARS", ...numero } : numero,
  ).format(n);
}

/*
 * Los números del CSV. En `en-US` y sin separador de miles: punto decimal, para que una planilla
 * los lea como números. Salen de Intl, como los de la pantalla, así que redondean igual, y nunca
 * en notación exponencial: `toPrecision` la usaba por debajo de 1e-6 ("4.333e-13") y `toFixed`
 * por encima de 1e21.
 */
const CSV_MONTO = new Intl.NumberFormat("en-US", {
  useGrouping: false,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const CSV_MONTO_CIFRAS = new Intl.NumberFormat("en-US", {
  useGrouping: false,
  minimumSignificantDigits: 2,
  maximumSignificantDigits: CIFRAS_SIGNIFICATIVAS,
});

const CSV_INDICE = new Intl.NumberFormat("en-US", {
  useGrouping: false,
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const CSV_INDICE_CIFRAS = new Intl.NumberFormat("en-US", {
  useGrouping: false,
  minimumSignificantDigits: CIFRAS_SIGNIFICATIVAS,
  maximumSignificantDigits: CIFRAS_SIGNIFICATIVAS,
});

/**
 * El monto en el CSV: el mismo número que la columna Monto, con punto decimal y sin separador de
 * miles. `toFixed(2)` escribía "0.00" en las filas de 1975 de una deflación desde 2026, y en una
 * planilla eso es un cero.
 */
export function montoCsv(n: number): string {
  return (vaConCifras(n) ? CSV_MONTO_CIFRAS : CSV_MONTO).format(n);
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
 * significativas y no decimales fijos** (`vaConCifras`). Con cuatro decimales fijos la fila de
 * 1968 decía "0,0000": un índice en cero es justo lo que haría imposible la cuenta que está al
 * lado, así que la tabla contradecía a su propio resultado.
 *
 * Sin notación exponencial, aunque la cifra quede larga: "4,333e-13" se lee como un número de
 * cuatro mil a alguien que no la usa, y "0,0000000000004333" no se puede leer como nada
 * distinto de lo que es. Lo que nunca cambia es el separador: siempre coma decimal. Mezclar
 * `0.7625` con `1.234,56` en la misma columna se lee mal en un país donde el punto separa
 * miles.
 */
export function indice(n: number): string {
  return (vaConCifras(n) ? NUMERO_CIFRAS : NUMERO).format(n);
}

/**
 * El índice en el CSV: punto decimal, y las mismas cifras que la pantalla por debajo de uno.
 * De uno para arriba lleva cuatro decimales y la columna dos, como siempre.
 *
 * `toFixed(4)` escribía "0.0000" en las filas de Córdoba anteriores a 1990, que abierto en una
 * planilla es un cero. Después se escribió con `toPrecision`, que por debajo de 1e-6 pasa a
 * notación exponencial ("4.333e-13"): era el único número del archivo escrito distinto del
 * resto. Va entero, "0.0000000000004333", como en la pantalla.
 */
export function indiceCsv(n: number): string {
  return (vaConCifras(n) ? CSV_INDICE_CIFRAS : CSV_INDICE).format(n);
}

/** Los caracteres que ocupan lugar: los espacios que Intl mete después del signo no ocupan lo que un dígito. */
function visibles(texto: string): number {
  return texto.replace(/\s/g, "").length;
}

/**
 * Cuántos caracteres visibles entran en una línea de la cifra protagonista con la letra de
 * siempre.
 *
 * Medido en un browser con la página sin ningún otro desborde (el desplegable de metodología
 * la ensanchaba a 469 px con cualquier índice provincial, y eso falseó la medición anterior):
 * con 2rem entran 11 caracteres a 320 px y 14 a 375. Con la letra chica
 * (`.resultado__cifra--larga`, 20 px en esos anchos) entran 19 en una línea en los dos. Lo
 * que no entra se parte en renglones, pero sólo después de un punto de miles
 * (`partirEnMiles`), y parejos (`text-wrap: balance`): con Córdoba, $1.000 de enero de 1970 dan
 * "$ 255.323.213.736.518.400", 25 caracteres con el espacio y 24 sin él, que a la letra de
 * siempre se partía en "$ 255.323.213.736.518.40" y "0", y con los cortes en los miles dejaba
 * un "400" suelto que parecía otro número.
 */
const CARACTERES_DE_LA_CIFRA_NORMAL = 11;

/**
 * Si la cifra protagonista necesita la letra chica (`.resultado__cifra--larga`) para entrar
 * en un celular. Cuenta lo que se ve: los espacios que Intl mete después del signo no ocupan
 * lo que ocupa un dígito.
 */
export function cifraLarga(texto: string): boolean {
  return visibles(texto) > CARACTERES_DE_LA_CIFRA_NORMAL;
}

/**
 * Hasta cuántos caracteres visibles, sumando la celda más larga de cada columna, entra la tabla
 * con cada letra en pantalla ancha.
 *
 * Ahí una celda nunca se parte (ver `mitadesDeCelda`), así que la tabla entra entera o se
 * desplaza. Medido a 1280 px, con la tabla de 878 px y ninguna celda partida:
 * - con la letra de siempre entran junio 1985 → agosto 2026 en Córdoba (72) y $1.000.000 de
 *   agosto 2026 → mayo 1985 (79). El modo por día desde el 20 de junio de 1985 (83) medía 885
 *   px, sin ninguna celda de más de 18 caracteres: por eso cuenta la fila y no una celda sola;
 * - con la chica entran ése, $1.000.000 de agosto 2026 → enero 1975 (94) y $1.000 de enero de
 *   1970 (97, justo: 960 px con la de siempre);
 * - $1.000.000.000 de enero de 1968 (105) medía 910 px con la chica y entra con la mínima.
 * Una tabla más ancha que eso se desplaza, igual que todas por debajo de 1280 px.
 */
const CARACTERES_CON_LA_LETRA_NORMAL = 80;
const CARACTERES_CON_LA_LETRA_CHICA = 97;

export type LetraDeLaTabla = "normal" | "chica" | "minima";

/** La letra de la tabla, para las celdas de cada fila tal como se imprimen. */
export function letraDeLaTabla(filas: readonly (readonly string[])[]): LetraDeLaTabla {
  const anchos: number[] = [];
  for (const fila of filas) {
    fila.forEach((celda, i) => {
      anchos[i] = Math.max(anchos[i] ?? 0, visibles(celda));
    });
  }
  const total = anchos.reduce((suma, ancho) => suma + ancho, 0);
  if (total <= CARACTERES_CON_LA_LETRA_NORMAL) return "normal";
  if (total <= CARACTERES_CON_LA_LETRA_CHICA) return "chica";
  return "minima";
}

/**
 * Hasta cuántos caracteres visibles un monto o un acumulado de la tabla nunca se parte, ni en
 * el celular. Medido a 320 px: con el nacional desde 1990 el monto más largo, "$ 16.101.575,20"
 * (14), entra entero.
 */
const CARACTERES_DE_UNA_CELDA_ENTERA = 14;

/** Si esta celda es lo bastante larga como para partirse en el celular. */
export function celdaPartible(texto: string): boolean {
  return visibles(texto) > CARACTERES_DE_UNA_CELDA_ENTERA;
}

/**
 * Las dos mitades en que se puede partir una celda de la tabla en el celular, o `null` si no se
 * parte: un solo corte, en el punto de miles más cercano a la mitad, y sólo si arriba y abajo
 * quedan al menos dos grupos. Con tres grupos "$ 101." arriba se leía "101 pesos", y partirlo no
 * alcanzaba para que la tabla dejara de desplazarse: mejor el número entero.
 *
 * Antes iba un <wbr> después de cada punto de miles, y quedaban pedacitos que se leían como otro
 * número: "$ 101.002." y "669,28" (se lee cien mil), "+6.899.750." y "041%" (se lee 41%). Y como
 * Chromium corta en un <wbr> aunque la celda diga `nowrap`, pasaba también a 1280 px. Las dos
 * mitades van en dos elementos que no se parten por adentro, y entre ellos sólo se corta en el
 * celular (ver `.mitad` en `styles.css`); lo que se copia sigue siendo el número entero.
 */
export function mitadesDeCelda(texto: string): [string, string] | null {
  if (!celdaPartible(texto)) return null;
  const partes = partirEnMiles(texto);
  let mejor: [string, string] | null = null;
  for (let arriba = 2; arriba <= partes.length - 2; arriba++) {
    const par: [string, string] = [partes.slice(0, arriba).join(""), partes.slice(arriba).join("")];
    if (mejor === null || Math.max(...par.map(visibles)) < Math.max(...mejor.map(visibles))) mejor = par;
  }
  return mejor;
}

/**
 * Las dos mitades de un rótulo de tramo de días ("1 ago 2026 → 10 ago 2026"), partido después de
 * la flecha, o `null` si no es un tramo. Entero, en el modo por día desde junio de 1985 hacía la
 * columna de 179 px a 375 y el monto de todas las filas quedaba fuera de la pantalla; y dejando
 * partir cualquier rótulo, a 320 px "ene 2024" quedaba "ene" y "2024".
 *
 * Sin el espacio que va entre las dos: al final de un elemento `inline-block` se come, y a 1280 px
 * se leía "20 jun 1985 →1 jul 1985". Quien las pinta pone el espacio entre las dos.
 */
export function mitadesDeRotulo(rotulo: string): [string, string] | null {
  const flecha = rotulo.indexOf(" → ");
  if (flecha === -1) return null;
  const corte = flecha + " →".length;
  return [rotulo.slice(0, corte), rotulo.slice(corte + 1)];
}

/**
 * Un número partido después de cada punto de miles: son los lugares donde se puede cortar la
 * cifra protagonista (con un `<wbr>` entre las partes, que no agrega texto: lo que se copia es
 * el número entero) y de donde `mitadesDeCelda` elige su único corte. Un número sin puntos de
 * miles vuelve entero.
 *
 * Con `split` y no con una expresión regular que mire para atrás: Safari no las entiende hasta
 * la 16.4, y en un iPhone viejo el módulo entero no cargaba (hay un test que lo vigila).
 */
export function partirEnMiles(texto: string): string[] {
  const partes = texto.split(".");
  return partes.map((parte, i) => (i < partes.length - 1 ? `${parte}.` : parte));
}

export function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
