import { describe, expect, it } from "vitest";
import { indice, pesos, pesosRedondo, porcentaje } from "../src/ui/format.js";

/** Normaliza los espacios que Intl mete entre el símbolo y el número (NBSP y afines). */
const limpio = (s: string) => s.replace(/\s/g, " ");

describe("formato de moneda", () => {
  it("usa punto de miles y coma decimal", () => {
    expect(limpio(pesos(553448.55))).toBe("$ 553.448,55");
  });

  it("la cifra protagonista va sin centavos", () => {
    expect(limpio(pesosRedondo(553448.55))).toBe("$ 553.449");
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
    const columna = [0.762457, 1.2321, 98.807, 11826.4103].map(indice);
    for (const celda of columna) {
      expect(celda).toMatch(/,\d+$/); // siempre termina con decimales tras coma
      expect(celda).not.toMatch(/\.\d+$/); // nunca con decimales tras punto
    }
  });
});
