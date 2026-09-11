import { describe, expect, it } from "vitest";
import { cifraLarga, indice, indiceCsv, montoCsv, pesos, pesosRedondo, porcentaje } from "../src/ui/format.js";

/** Normaliza los espacios que Intl mete entre el símbolo y el número (NBSP y afines). */
const limpio = (s: string) => s.replace(/\s/g, " ");

describe("formato de moneda", () => {
  it("usa punto de miles y coma decimal", () => {
    expect(limpio(pesos(553448.55))).toBe("$ 553.448,55");
  });

  it("la cifra protagonista va sin centavos", () => {
    expect(limpio(pesosRedondo(553448.55))).toBe("$ 553.449");
  });

  /**
   * Deflactar $1.000.000 de agosto 2026 a enero 1975 con Córdoba da 0,0000227: la moneda de
   * 1975 tenía once ceros más. Redondeado, el resultado decía "$ 0" y la tabla "$ 0,00", que
   * es afirmar que ese millón no valía nada.
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
   * caracteres sin un espacio donde cortar. A 2rem, en un celular de 375 px, empujaba la página
   * a 533 px de ancho. Hasta 15 caracteres entra en esa pantalla con la letra de siempre.
   */
  it("pide la letra chica a partir de 16 caracteres", () => {
    expect(cifraLarga("$ 16.101.575")).toBe(false);
    expect(cifraLarga("~$ 1.610.057.520")).toBe(false);
    expect(cifraLarga("$ 255.323.213.736.518.400")).toBe(true);
    expect(cifraLarga("$ 0,0000000227")).toBe(false);
  });

  it("cuenta lo que se ve, no los espacios que mete Intl", () => {
    expect(cifraLarga(pesosRedondo(255323213736518400))).toBe(true);
    expect(cifraLarga(pesosRedondo(16101575))).toBe(false);
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

  it("un índice chiquísimo sale con sus cifras y se puede volver a leer como número", () => {
    // `toFixed(4)` lo escribía "0.0000": abierto en una planilla, un cero.
    const celda = indiceCsv(4.332726297657377e-13);
    expect(celda).toBe("4.333e-13");
    expect(Number(celda)).toBeGreaterThan(0);
  });
});
