import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MONEDAS } from "../src/engine/moneda.js";
import {
  celdaPartible,
  cifraLarga,
  indice,
  indiceCsv,
  letraDeLaTabla,
  mitadesDeCelda,
  mitadesDeRotulo,
  montoConvertido,
  montoCsv,
  partirEnMiles,
  pesos,
  pesosRedondo,
  porcentaje,
  vaConCifras,
} from "../src/ui/format.js";

/** Normaliza los espacios que Intl mete entre el símbolo y el número (NBSP y afines). */
const limpio = (s: string) => s.replace(/\s/g, " ");

describe("el rótulo de un tramo de días, partido en el celular", () => {
  /**
   * En el modo por día desde junio de 1985, "1 ago 2026 → 10 ago 2026" entero hacía la columna de
   * 179 px a 375 y el monto de las 496 filas quedaba fuera de la pantalla. Dejando partir cualquier
   * rótulo, a 320 px "ene 2024" quedaba "ene" y "2024": se parte sólo después de la flecha.
   */
  it("se parte después de la flecha, y en ningún otro lado", () => {
    expect(mitadesDeRotulo("1 ago 2026 → 10 ago 2026")).toEqual(["1 ago 2026 →", "10 ago 2026"]);
    expect(mitadesDeRotulo("ene 2024")).toBeNull();
    expect(mitadesDeRotulo("20 jun 1985")).toBeNull();
  });

  it("las dos mitades juntas son el rótulo entero", () => {
    // Unidas con el espacio que pone quien las pinta, son el rótulo entero.
    expect(mitadesDeRotulo("20 jun 1985 → 1 jul 1985")!.join(" ")).toBe("20 jun 1985 → 1 jul 1985");
  });
});

describe("formato de moneda", () => {
  it("usa punto de miles y coma decimal", () => {
    expect(limpio(pesos(553448.55))).toBe("$ 553.448,55");
  });

  it("la cifra protagonista va sin centavos", () => {
    expect(limpio(pesosRedondo(553448.55))).toBe("$ 553.449");
  });

  /**
   * Deflactar $1.000.000 de agosto 2026 a enero 1975 con Córdoba da 0,0000000227: la moneda de
   * 1975 tenía once ceros más. Redondeado, el resultado decía "$ 0" y la tabla "$ 0,00", que
   * es afirmar que ese millón no valía nada. El valor de abajo es otro, igual de ilegible
   * redondeado a centavos.
   */
  it("un monto que no es cero nunca se imprime como cero", () => {
    expect(limpio(pesosRedondo(0.00002271))).toBe("$ 0,00002271");
    expect(limpio(pesos(0.00002271))).toBe("$ 0,00002271");
    for (const n of [2.271e-12, 0.004, 0.4]) {
      expect(limpio(pesosRedondo(n)), String(n)).toMatch(/[1-9]/);
      expect(limpio(pesos(n)), String(n)).toMatch(/[1-9]/);
    }
  });

  it("no toca un monto que ya se lee, ni el cero de verdad", () => {
    expect(limpio(pesos(0.5))).toBe("$ 0,50");
    expect(limpio(pesosRedondo(1.4))).toBe("$ 1");
    expect(limpio(pesos(0))).toBe("$ 0,00");
  });
});

describe("la cifra protagonista cuando es muy larga", () => {
  /**
   * Con Córdoba desde 1968, $1.000 de enero de 1970 dan "$ 255.323.213.736.518.400": 25
   * caracteres con el espacio, 24 sin él. Medido con la página sin otro desborde: con la letra
   * de siempre entran 11 caracteres a 320 px; con la chica, 19.
   */
  it("pide la letra chica a partir de 12 caracteres visibles", () => {
    expect(cifraLarga("$ 16.101.575")).toBe(false); // 11: el borde que entra
    expect(cifraLarga("~$ 16.101.575")).toBe(true); // 12: el primero que no
    expect(cifraLarga("$ 161.015.752")).toBe(true);
    expect(cifraLarga("$ 255.323.213.736.518.400")).toBe(true);
    // Sin puntos de miles no tiene dónde cortarse de renglón: con la letra de siempre no entra.
    expect(cifraLarga("$ 0,0000000227")).toBe(true);
  });

  it("cuenta lo que se ve, no los espacios que mete Intl", () => {
    expect(cifraLarga(pesosRedondo(255323213736518400))).toBe(true);
    expect(cifraLarga(pesosRedondo(16101575))).toBe(false);
  });
});

describe("la letra de la tabla en pantalla ancha", () => {
  /** Una fila con la celda más larga de cada columna, del ancho que tenía en cada caso medido. */
  const fila = (...anchos: number[]) => anchos.map((n) => "9".repeat(n));

  /**
   * Ahí una celda nunca se parte, así que la tabla tiene que entrar entera. Medido a 1280 px: el
   * modo por día desde el 20 de junio de 1985 medía 885 px en 878 sin ninguna celda de más de 18
   * caracteres, así que no alcanza con mirar una celda sola.
   */
  it("baja la letra según lo ancha que es la fila", () => {
    expect(letraDeLaTabla([fila(7, 7, 7, 9, 13, 5)])).toBe("normal"); // 2024 → 2025
    expect(letraDeLaTabla([fila(7, 8, 15, 18, 13, 11)])).toBe("normal"); // junio 1985 → agosto 2026: 72
    expect(letraDeLaTabla([fila(19, 8, 15, 13, 13, 11)])).toBe("normal"); // agosto 2026 → mayo 1985: 79
    expect(letraDeLaTabla([fila(18, 8, 15, 18, 13, 11)])).toBe("chica"); // por día desde junio 1985: 83
    expect(letraDeLaTabla([fila(19, 8, 23, 14, 13, 17)])).toBe("chica"); // agosto 2026 → enero 1975: 94
    expect(letraDeLaTabla([fila(7, 8, 24, 27, 13, 18)])).toBe("chica"); // enero 1970 → agosto 2026: 97
    expect(letraDeLaTabla([fila(7, 8, 24, 35, 13, 18)])).toBe("minima"); // $1.000.000.000 de enero 1968: 105
  });

  it("suma la celda más larga de cada columna, aunque estén en filas distintas", () => {
    expect(letraDeLaTabla([fila(18, 8, 1, 1, 13, 11), fila(1, 1, 15, 18, 1, 1)])).toBe("chica");
  });

  it("cuenta lo que se ve, no los espacios que mete Intl", () => {
    expect(letraDeLaTabla([[" ".repeat(200), pesos(1206.1)]])).toBe("normal");
  });
});

describe("qué celdas de la tabla se pueden partir en el celular", () => {
  it("desde 15 caracteres visibles", () => {
    // A 375 px "$ 1.000,00" se partía en "$ 1." y "000,00": ningún monto común se puede partir.
    expect(celdaPartible("$ 1.000,00")).toBe(false);
    expect(celdaPartible("$ 16.101.575,20")).toBe(false); // 14: entra entero a 320 px
    expect(celdaPartible("$ 161.015.752,00")).toBe(true); // 15
  });
});

describe("el monto en el CSV", () => {
  it("con dos decimales cuando se leen, y con sus cifras cuando no", () => {
    expect(montoCsv(1234.567)).toBe("1234.57");
    expect(montoCsv(0.00002271)).toBe("0.00002271");
    expect(Number(montoCsv(2.271e-12))).toBeGreaterThan(0);
    expect(montoCsv(0)).toBe("0.00");
  });
});

describe("formato de porcentajes", () => {
  it("marca el signo en las subas", () => {
    expect(porcentaje(1.8869)).toBe("+1,89%");
  });

  it("deja el signo negativo en las bajas", () => {
    expect(porcentaje(-0.4)).toBe("-0,40%");
  });

  it("suelta los decimales cuando el número es enorme", () => {
    // La calculadora llega a +1.550.991% desde 1990: dos decimales ahí no informan.
    expect(porcentaje(1550991.23)).toBe("+1.550.991%");
  });

  it("puede omitir el signo, para cuando el texto ya lo dice", () => {
    expect(porcentaje(2.2067, false)).toBe("2,21%");
  });

  it("lo que redondeado da cero se muestra como cero, sin signo", () => {
    // El promedio mensual de 1996 es −0,00047%: mostrarlo como "-0,00%" se lee "menos
    // cero por ciento" y hace dudar del resto de la página.
    expect(porcentaje(-0.00047)).toBe("0,00%");
    expect(porcentaje(0.0012)).toBe("0,00%");
    expect(porcentaje(-0.00047, false)).toBe("0,00%");
    // Pero no se traga un valor que sí se ve: la inflación de 1996 fue −0,0056%.
    expect(porcentaje(-0.0056)).toBe("-0,01%");
  });
});

describe("formato de índices", () => {
  /**
   * El caso que motivó este formateo: el índice de 1990 es menor que 1 y el de 2026
   * pasa los 11.800. Ambos tienen que leerse con coma decimal, porque en Argentina
   * un punto significa miles y "0.7625" se lee como un número grande.
   */
  it("usa coma decimal también en los valores menores que uno", () => {
    expect(indice(0.762457451961255)).toBe("0,7625");
  });

  it("usa punto de miles en los valores grandes", () => {
    expect(indice(11826.4103)).toBe("11.826,41");
  });

  it("nunca mezcla notaciones dentro de la misma columna", () => {
    const columna = [4.332726297657377e-13, 0.01661473, 0.762457, 1.2321, 98.807, 11826.4103].map(indice);
    for (const celda of columna) {
      expect(celda).toMatch(/,\d+$/); // siempre termina con decimales tras coma
      expect(celda).not.toMatch(/\.\d+$/); // nunca con decimales tras punto
      expect(celda).not.toMatch(/e/i); // y nunca en notación exponencial
    }
  });

  /**
   * Córdoba arranca en 1968 con 4,33e-13. Con cuatro decimales fijos esa fila decía
   * "0,0000": un índice en cero es justo lo que haría imposible el cálculo que está al lado,
   * así que la tabla estaría contradiciendo a su propio resultado.
   */
  it("un índice chiquísimo no se lee como cero: muestra sus cifras significativas", () => {
    expect(indice(4.332726297657377e-13)).toBe("0,0000000000004333");
    expect(indice(0.01661473)).toBe("0,01661");
  });

  it("ningún índice positivo se imprime como cero", () => {
    for (const n of [4.332726297657377e-13, 1e-20, 0.000001, 0.00126139]) {
      expect(indice(n), String(n)).not.toMatch(/^0(,0*)?$/);
    }
  });
});

describe("el índice en el CSV", () => {
  it("con punto decimal y las mismas cifras que la pantalla", () => {
    expect(indiceCsv(0.762457451961255)).toBe("0.7625");
    expect(indiceCsv(11826.4103)).toBe("11826.4103");
  });

  it("un índice chiquísimo sale con sus cifras, escrito entero, y se puede volver a leer como número", () => {
    // `toFixed(4)` lo escribía "0.0000": abierto en una planilla, un cero. Y en notación
    // exponencial ("4.333e-13") era el único valor del archivo escrito distinto del resto.
    const celda = indiceCsv(4.332726297657377e-13);
    expect(celda).toBe("0.0000000000004333");
    expect(Number(celda)).toBeGreaterThan(0);
  });
});

describe("un solo criterio para lo que va con cifras significativas", () => {
  it("todo lo distinto de cero menor que uno, y nada más", () => {
    for (const n of [0.5, 2.27e-8, 0.999, -0.3]) expect(vaConCifras(n), String(n)).toBe(true);
    for (const n of [0, 1, 130.7, -2, Number.NaN, Number.POSITIVE_INFINITY]) expect(vaConCifras(n), String(n)).toBe(false);
  });

  it("el resultado y la tabla muestran el mismo monto cuando es menor que uno", () => {
    // `?indice=cordoba&monto=1000000&desde=2026-08&hasta=1985-05`: el resultado decía
    // "$ 0,01194" y la fila "← el resultado" "$ 0,01".
    for (const n of [0.5, 0.01194, 2.27e-8, 0.004]) {
      expect(limpio(pesosRedondo(n)), String(n)).toBe(limpio(pesos(n)));
    }
    expect(limpio(pesos(0.5))).toBe("$ 0,50");
    expect(limpio(pesos(0.01194))).toBe("$ 0,01194");
  });

  /** El número que se ve en pantalla, leído como número: sin signo, sin puntos de miles, coma → punto. */
  const leer = (s: string) => Number(s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));

  it("el CSV dice el mismo número que la pantalla", () => {
    for (const n of [2.27e-8, 0.004, 0.01194, 0.5, 0.123456, 1, 1.005, 1234.567, 255323213736518400, 3.0165118498407226e23]) {
      expect(Number(montoCsv(n)), `monto ${n}`).toBe(leer(pesos(n)));
    }
    for (const n of [4.332726297657377e-13, 5.119e-13, 0.00126139, 0.7624574519612553]) {
      expect(Number(indiceCsv(n)), `índice ${n}`).toBe(leer(indice(n)));
    }
    // De uno para arriba el CSV lleva cuatro decimales y la columna dos: la pantalla es ese
    // mismo número redondeado, nunca otro.
    for (const n of [1.2321, 130.69720219, 12276.766]) {
      expect(leer(indice(n)), `índice ${n}`).toBe(Number(Number(indiceCsv(n)).toFixed(2)));
    }
  });

  it("el CSV nunca usa notación exponencial", () => {
    const valores = [4.332726297657377e-13, 2.27e-8, 0.5, 1, 130.7, 255323213736518400, 3.0165118498407226e23];
    for (const n of valores) {
      expect(montoCsv(n), `monto ${n}`).not.toMatch(/e/i);
      expect(indiceCsv(n), `índice ${n}`).not.toMatch(/e/i);
    }
    expect(montoCsv(3.0165118498407226e23)).toMatch(/^\d+\.\d\d$/);
  });
});

describe("partirEnMiles", () => {
  it("corta sólo después de cada punto de miles, sin perder ni agregar nada", () => {
    expect(partirEnMiles("$ 255.323.213.736.518.400")).toEqual(["$ 255.", "323.", "213.", "736.", "518.", "400"]);
    expect(partirEnMiles("+25.532.321.373.651.740%")).toEqual(["+25.", "532.", "321.", "373.", "651.", "740%"]);
    expect(partirEnMiles("$ 1.000,00")).toEqual(["$ 1.", "000,00"]);
    expect(partirEnMiles("0,0000000000004333")).toEqual(["0,0000000000004333"]);
    for (const t of ["$ 255.323.213.736.518.400", "~$ 1.610.057.520", "+1,79%", "", "1."]) {
      expect(partirEnMiles(t).join("")).toBe(t);
    }
  });
});

describe("el código que corre en el browser", () => {
  /**
   * `partirEnMiles` se escribió con un lookbehind, que Safari no entiende hasta la 16.4. Vite
   * apunta por defecto a safari14 y no reescribe expresiones regulares: en un iPhone viejo el
   * módulo entero tira un error de sintaxis y la calculadora no carga. Era el único del repo.
   */
  it("no usa lookbehind en ninguna expresión regular", () => {
    const dir = resolve(import.meta.dirname, "../src");
    const archivos = (readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.endsWith(".ts"));
    expect(archivos.length).toBeGreaterThan(10);
    const conLookbehind = archivos.filter((f) => /\(\?<[=!]/.test(readFileSync(resolve(dir, f), "utf8")));
    expect(conLookbehind).toEqual([]);
  });
});

describe("vaConCifras decide sobre el número ya redondeado", () => {
  it("0,99995 se imprime 1 con cuatro cifras: va con decimales fijos, igual que 1", () => {
    // Decidiendo sobre el valor crudo salía "$ 1,0" y "1.0", contra "$ 1,00" para 1.
    expect(vaConCifras(0.99995)).toBe(false);
    expect(vaConCifras(0.99994)).toBe(true);
    expect(limpio(pesos(0.99995))).toBe("$ 1,00");
    expect(montoCsv(0.99995)).toBe("1.00");
    expect(indice(0.99995)).toBe("1,00");
    expect(indiceCsv(0.99995)).toBe("1.0000");
  });
});

describe("una celda de la tabla, partida en el celular", () => {
  /**
   * Con un <wbr> después de cada punto de miles quedaban pedacitos que se leían como otro número:
   * "$ 101.002." y "669,28" (cien mil), "+6.899.750." y "041%" (41%), y pasaba también a 1280 px
   * en el modo por día. Ahora es un solo corte, en el punto de miles más cercano a la mitad.
   */
  it("un solo corte, en el punto de miles más cercano a la mitad", () => {
    expect(mitadesDeCelda("$ 68.997.501.409,62")).toEqual(["$ 68.997.", "501.409,62"]);
    expect(mitadesDeCelda("+6.899.750.041%")).toEqual(["+6.899.", "750.041%"]);
    expect(mitadesDeCelda("$ 1.060.117.079,89")).toEqual(["$ 1.060.", "117.079,89"]);
    expect(mitadesDeCelda("$ 61.197.736.015,20")).toEqual(["$ 61.197.", "736.015,20"]);
    expect(mitadesDeCelda("+25.532.321.373.651.740%")).toEqual(["+25.532.321.", "373.651.740%"]);
    expect(mitadesDeCelda("$ 301.651.184.984.072.300.000.000,00")).toEqual([
      "$ 301.651.184.984.",
      "072.300.000.000,00",
    ]);
  });

  it("arriba y abajo quedan siempre al menos dos grupos, o no se parte", () => {
    // Con tres grupos "$ 101." arriba se leía "101 pesos", y la tabla se desplazaba igual.
    expect(mitadesDeCelda("$ 101.002.669,28")).toBeNull();
    expect(mitadesDeCelda("+6.899.750,04%")).toBeNull();
  });

  it("no parte un monto común, ni uno sin dos grupos para dejar abajo", () => {
    expect(mitadesDeCelda("$ 1.000,00")).toBeNull();
    expect(mitadesDeCelda("$ 16.101.575,20")).toBeNull(); // 14 caracteres: entra entero a 320 px
    expect(mitadesDeCelda("$ 0,0000000000227")).toBeNull(); // sin puntos de miles
  });

  it("las dos mitades juntas son el número entero, que es lo que se copia", () => {
    for (const t of ["$ 68.997.501.409,62", "+25.532.321.373.651.740%", pesos(63415892293), pesos(3.0165118498407e23)]) {
      expect(mitadesDeCelda(t)!.join("")).toBe(t);
    }
  });
});

describe("un monto convertido a otra moneda", () => {
  /** El número de un texto impreso, como lo tipea alguien en la calculadora del celular. */
  const leer = (impreso: string) => Number(impreso.replace(/[^\d,]/g, "").replace(",", "."));

  it("por debajo de mil lleva hasta cuatro cifras significativas, en pesos y en otra moneda", () => {
    // Redondeado a entero, 1,081 australes eran "1 australes" y $ 1,32 era "$ 1": hasta 30% menos.
    expect(montoConvertido("$ 1.081", 1e-3)).toBe("1,081");
    expect(limpio(montoConvertido("$ 1.321", 1e-3, { enPesos: true }))).toBe("$ 1,321");
    expect(montoConvertido("$ 10.130", 1e-3)).toBe("10,13");
    expect(limpio(montoConvertido("$ 1.000.000", 1e-7, { enPesos: true }))).toBe("$ 0,10");
    expect(montoConvertido("$ 1.000", 1e-3)).toBe("1");
    expect(limpio(montoConvertido("$ 1.000.000", 1e-4, { enPesos: true }))).toBe("$ 100");
  });

  it("de mil para arriba, sin decimales", () => {
    expect(limpio(montoConvertido("$ 63.415.892.293", 1e-7, { enPesos: true }))).toBe("$ 6.342");
    expect(montoConvertido("$ 255.323.213.736.518.400", 1e-11)).toBe("2.553.232");
  });

  it("nunca con más cifras que la cifra impresa arriba", () => {
    // Arriba "$ 0,01194": por 10.000.000 son 119.400 con la calculadora; decía 119.359.
    expect(montoConvertido("$ 0,01194", 1e7)).toBe("119.400");
    expect(montoConvertido("$ 0,0000000227", 1e11)).toBe("2.270");
    // También entre 1 y 999, donde la cifra va redondeada a entero.
    expect(montoConvertido("$ 921", 1e4)).toBe("9.210.000"); // decía 9.209.100
    expect(montoConvertido("$ 40", 1e4)).toBe("400.000"); // decía 404.165
    expect(montoConvertido("$ 925", 1e3)).toBe("925.000"); // decía 924.854
    expect(montoConvertido("~$ 2.553.232", 1e-4)).toBe("255,3");
  });

  /**
   * La regla y no un ejemplo: para cualquier cifra impresa y cualquier par de monedas, la
   * conversión es lo que da la calculadora con el número de arriba, redondeado a no más cifras
   * significativas que las que tiene ese número. Con 999,6 arriba dice "$ 1.000": la conversión
   * sale de ese 1.000 y no de 999,6, que nadie ve.
   */
  it("es la cifra impresa por el factor, redondeada a no más cifras que ella", () => {
    const cifras = (impreso: string) => impreso.replace(/\D/g, "").replace(/^0+/, "").length;
    const factores = MONEDAS.flatMap((de) => MONEDAS.filter((a) => a !== de).map((a) => de.unidad / a.unidad));
    const resultados = [
      2.27e-8, 1.577e-5, 0.0119357, 0.1, 0.5, 0.99994, 0.99996, 1.0809, 1.4, 9.87654, 40.4165, 920.91, 924.854,
      999.4, 999.6, 1080.9, 1321.3, 6341.589, 16101575.2, 1e6, 63415892293.4, 2.553232137365184e17, 3.0165118498407e23,
    ];
    for (const m of resultados) {
      for (const impreso of [pesosRedondo(m), `~${pesosRedondo(m)}`]) {
        for (const f of factores) {
          for (const enPesos of [false, true]) {
            const mostrado = montoConvertido(impreso, f, { enPesos });
            const calculadora = leer(impreso) * f;
            const redondeos = Array.from({ length: cifras(impreso) }, (_, i) => Number(calculadora.toPrecision(i + 1)));
            const cierra = redondeos.some((v) => Math.abs(v - leer(mostrado)) <= Math.abs(v) * 1e-9);
            expect(cierra, `${limpio(impreso)} × ${f} → ${limpio(mostrado)}`).toBe(true);
          }
        }
      }
    }
  });
});
