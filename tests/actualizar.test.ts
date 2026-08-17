import { describe, expect, it } from "vitest";

import { actualizarSerie } from "../src/engine/actualizar.js";
import { adjust } from "../src/engine/adjust.js";
import type { SerieIndice } from "../src/engine/types.js";

/**
 * 10% mensual clavado, publicada hasta abril. Índices: ene 100 · feb 110 · mar 121
 * · abr 133,1. Mismo fixture que usa `tests/adjust.test.ts`, reescrito acá para no
 * acoplar los dos archivos de test entre sí.
 */
const ipc: SerieIndice = {
  serie: "test",
  base: "2020-01=100",
  fuentes: [],
  ultimo_oficial: "2020-04",
  actualizado: "2020-06-01T00:00:00Z",
  datos: [
    { mes: "2020-01", indice: 100, origen: "indec" },
    { mes: "2020-02", indice: 110, origen: "indec" },
    { mes: "2020-03", indice: 121, origen: "indec" },
    { mes: "2020-04", indice: 133.1, origen: "indec" },
  ],
};

describe("actualizarSerie", () => {
  it("no cambia el valor de un punto que ya está en el mes objetivo", () => {
    const r = actualizarSerie([{ mes: "2020-04", valor: 133.1 }], "2020-04", ipc);
    expect(r).toHaveLength(1);
    expect(r[0]!.valorActualizado).toBeCloseTo(133.1, 6);
  });

  it("actualiza un punto viejo a un mes más nuevo (dato directo)", () => {
    // 100 de enero, llevado a abril: 100 * (133,1 / 100) = 133,1
    const r = actualizarSerie([{ mes: "2020-01", valor: 100 }], "2020-04", ipc);
    expect(r).toHaveLength(1);
    expect(r[0]!.valorOriginal).toBe(100);
    expect(r[0]!.valorActualizado).toBeCloseTo(133.1, 6);
  });

  it("deflacta cuando el objetivo es anterior al punto", () => {
    // 133,1 de abril, llevado a enero: 133,1 * (100 / 133,1) = 100
    const r = actualizarSerie([{ mes: "2020-04", valor: 133.1 }], "2020-01", ipc);
    expect(r).toHaveLength(1);
    expect(r[0]!.valorActualizado).toBeCloseTo(100, 6);
  });

  it("descarta un punto cuyo objetivo sólo se puede resolver estimando", () => {
    // El objetivo cae 3 meses después del último dato publicado (abr 2020). Para el
    // punto de enero, la ventana de referencia necesitaría retroceder hasta oct
    // 2019, antes de donde arranca la serie: no cabe, y no hay ningún tramo
    // publicado que sirva de referencia sin inventar nada.
    const r = actualizarSerie(
      [
        { mes: "2020-01", valor: 100 },
        { mes: "2020-04", valor: 133.1 },
      ],
      "2020-07",
      ipc,
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.mes).toBe("2020-04");
  });

  it("conserva el orden de los puntos de entrada", () => {
    const r = actualizarSerie(
      [
        { mes: "2020-02", valor: 110 },
        { mes: "2020-01", valor: 100 },
      ],
      "2020-04",
      ipc,
    );
    expect(r.map((p) => p.mes)).toEqual(["2020-02", "2020-01"]);
  });

  it("con el objetivo en ultimo_oficial no descarta ningún punto ni usa ventana_reciente", () => {
    // Ésta es la configuración que corre en producción por default: `/actualizar.html`
    // arranca con el objetivo en `ipc.ultimo_oficial`, nunca en el mes calendario en
    // curso. Con ese objetivo, todo punto entre el primero y el último mes publicado
    // es cálculo directo — nada necesita la ventana de referencia ni se cae por el
    // guard de sesgo. Las cinco pruebas de arriba nunca corrieron con el objetivo
    // pegado al último mes publicado, que es justo el punto donde un desfasaje de un
    // mes (el bug real: default en `mesActual()`) hacía que todo resolviera por
    // `ventana_reciente` y 6 meses se descartaran en silencio.
    const puntos = ipc.datos.map((p) => ({ mes: p.mes, valor: p.indice }));
    const r = actualizarSerie(puntos, ipc.ultimo_oficial, ipc);

    expect(r).toHaveLength(puntos.length);
    for (const punto of puntos) {
      const metodo = adjust(punto.valor, punto.mes, ipc.ultimo_oficial, ipc).metodo;
      expect(metodo.tipo).toBe("directo");
    }
  });
});
