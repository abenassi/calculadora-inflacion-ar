import { describe, expect, it } from "vitest";

import { compararPuntos, restarMesesAFecha } from "../src/engine/mes.js";
import { hoyFecha, mesActual } from "../src/engine/adjust.js";

describe("restarMesesAFecha", () => {
  it("resta meses dentro del mismo año", () => {
    expect(restarMesesAFecha("2026-08-15", 1)).toBe("2026-07-15");
    expect(restarMesesAFecha("2026-08-15", 3)).toBe("2026-05-15");
  });

  it("cruza el año hacia atrás", () => {
    expect(restarMesesAFecha("2026-02-10", 3)).toBe("2025-11-10");
    expect(restarMesesAFecha("2026-01-01", 12)).toBe("2025-01-01");
  });

  it("recorta el día si el mes de destino es más corto: 31 de marzo menos 1 mes es 28 de febrero", () => {
    expect(restarMesesAFecha("2026-03-31", 1)).toBe("2026-02-28");
  });

  it("recorta a 29 en un febrero bisiesto", () => {
    expect(restarMesesAFecha("2024-03-31", 1)).toBe("2024-02-29");
  });

  it("no recorta si el mes de destino tiene suficientes días", () => {
    expect(restarMesesAFecha("2026-05-31", 1)).toBe("2026-04-30");
    expect(restarMesesAFecha("2026-07-31", 1)).toBe("2026-06-30");
  });
});

describe("compararPuntos", () => {
  // Esta función es la que usan tanto `extremoNuevo`/`extremoViejo` en adjust.ts (para
  // decidir qué punta de un período es la más nueva) como los atajos de fecha de
  // main.ts (para no dejar el destino antes del origen ya cargado). Un solo lugar, un
  // solo test: si el criterio se duplicara y se desalineara, el motor y la interfaz
  // podrían terminar en desacuerdo sobre cuál punta es la más nueva.
  it("es negativo cuando el primero es anterior, positivo cuando es posterior, cero en el mismo punto", () => {
    expect(compararPuntos("2026-05", "2026-08")).toBeLessThan(0);
    expect(compararPuntos("2026-08", "2026-05")).toBeGreaterThan(0);
    expect(compararPuntos("2026-08", "2026-08")).toBe(0);
  });

  it("distingue el día, no sólo el mes", () => {
    // Empatar dos días del mismo mes alcanzaba mientras el único uso era ordenar meses,
    // pero deja pasar los dos casos en que el orden importa adentro de un mes: la
    // ventana de referencia por día necesita saber si el período va hacia adelante o
    // deflacta, y el atajo "ahora" se apaga justo cuando dejaría el destino antes de un
    // origen del mismo mes —el 20 de agosto con hoy 15— que a nivel mes no se ve.
    expect(compararPuntos("2026-08-31", "2026-08-01")).toBeGreaterThan(0);
    expect(compararPuntos("2026-07-31", "2026-08-01")).toBeLessThan(0);
  });

  it("un mes vale por su día 1, así que empata con él y va antes que cualquier otro día", () => {
    expect(compararPuntos("2026-08", "2026-08-01")).toBe(0);
    expect(compararPuntos("2026-08", "2026-08-15")).toBeLessThan(0);
  });
});

describe("mesActual y hoyFecha, en hora local", () => {
  // Node relee `process.env.TZ` en cada `new Date`, así que forzar el huso acá hace
  // el test independiente de en qué máquina corra `npm run verificar` (Mac, Raspi,
  // CI en UTC). Sin forzarlo, una corrida en UTC no distinguiría el bug de su arreglo:
  // con TZ=UTC, hora local y UTC son el mismo número por construcción.
  const conHusoDeArgentina = (f: () => void) => {
    const original = process.env.TZ;
    process.env.TZ = "America/Argentina/Buenos_Aires";
    try {
      f();
    } finally {
      process.env.TZ = original;
    }
  };

  it("no adelanta un mes durante la noche en ART, aunque en UTC ya sea otro día", () => {
    conHusoDeArgentina(() => {
      // Medianoche UTC del 1° de septiembre son las 21:00 del 31 de agosto en ART
      // (ART = UTC-3). `getUTCMonth()` daría septiembre; el mes real donde vive
      // quien usa el sitio todavía es agosto.
      const instante = new Date("2026-09-01T00:00:00Z");
      expect(mesActual(instante)).toBe("2026-08");
      expect(hoyFecha(instante)).toBe("2026-08-31");
    });
  });

  it("hoyFecha coincide con mesActual más el día del mes", () => {
    conHusoDeArgentina(() => {
      const instante = new Date("2026-05-07T13:00:00Z"); // 10:00 ART, mismo día en los dos husos
      expect(mesActual(instante)).toBe("2026-05");
      expect(hoyFecha(instante)).toBe("2026-05-07");
    });
  });
});
