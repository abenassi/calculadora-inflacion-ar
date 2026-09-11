import { describe, expect, it } from "vitest";

import { decimales, mismoContenido, mismoNumero } from "../scripts/mismo-contenido.js";

// Los pares de números salen del historial real de `public/data` (commit entre paréntesis),
// salvo donde se dice lo contrario.

describe("decimales", () => {
  it("cuenta los decimales de la representación más corta, también en notación exponencial", () => {
    expect(decimales(1533)).toBe(0);
    expect(decimales(1533.21)).toBe(2);
    expect(decimales(0.016614728801318833)).toBe(18);
    expect(decimales(4.332726297657377e-13)).toBe(28);
    expect(decimales(1e21)).toBe(0);
    expect(decimales(-0.0374205)).toBe(7);
  });
});

describe("mismoNumero: un cambio sólo de precisión no es un cambio", () => {
  it("un valor redondeado a 6 decimales contra el mismo con toda la precisión del float (56a955c)", () => {
    expect(mismoNumero(0.016615, 0.016614728801318833)).toBe(true);
    // El peor caso del historial en términos relativos: 1,77e-5. Una tolerancia relativa que
    // lo absorba se come también el dólar de abajo, que se movió 6,5e-6.
    expect(mismoNumero(0.021458, 0.021457619695164205)).toBe(true);
    // El peor en términos absolutos: 4,992e-7, casi media millonésima.
    expect(mismoNumero(12.058019, 12.05801949924809)).toBe(true);
  });

  it("el MCP no manda los ceros finales: 3.591 es 3.591000 y se compara a seis decimales (56a955c)", () => {
    expect(mismoNumero(3.591, 3.59100034237238)).toBe(true);
    expect(mismoNumero(0.0777, 0.07769956580422707)).toBe(true);
  });

  it("toda la precisión contra 8 decimales, el redondeo de la fuente nueva de Córdoba (0a80c59)", () => {
    expect(mismoNumero(0.03742049881479061, 0.0374205)).toBe(true);
    // A 0,4997 de la última unidad: el caso más ajustado del historial.
    expect(mismoNumero(0.09937464499701665, 0.09937464)).toBe(true);
  });

  it("índices grandes que ganaron decimales (78dabc6)", () => {
    expect(mismoNumero(33052.532399, 33052.5323985753)).toBe(true);
    expect(mismoNumero(101588.668704, 101588.66870379966)).toBe(true);
  });

  it("de 8 a 6 decimales también es sólo precisión (hipotético: la fuente vuelve a cambiar)", () => {
    expect(mismoNumero(0.09937464, 0.099375)).toBe(true);
  });

  it("dos floats vecinos son el mismo número", () => {
    // El float inmediatamente siguiente, sumándole uno a los bits: vecinos de verdad, no
    // dos decimales que casualmente caen cerca.
    const siguienteFloat = (x: number) => {
      const vista = new DataView(new ArrayBuffer(8));
      vista.setFloat64(0, x);
      vista.setBigUint64(0, vista.getBigUint64(0) + 1n);
      return vista.getFloat64(0);
    };
    expect(mismoNumero(0.1 + 0.2, 0.3)).toBe(true);
    for (const x of [0.3, 128.39, 16746051448071.4, 3.5e13]) {
      expect(siguienteFloat(x)).not.toBe(x);
      expect(mismoNumero(x, siguienteFloat(x))).toBe(true);
    }
  });
});

describe("mismoNumero: una revisión real en los decimales que publica la fuente sí cuenta", () => {
  it("el dólar que se movió un centavo (74dea89): 6,5e-6 relativo", () => {
    expect(mismoNumero(1533.22, 1533.21)).toBe(false);
  });

  it("un cero final que JSON no escribe no vuelve 'redondeo' a una revisión (hipotético)", () => {
    // 1528.6 es 1528.60: si mañana viene 1528.62, son dos centavos, no un decimal más.
    expect(mismoNumero(1528.6, 1528.62)).toBe(false);
  });

  it("una senda del REM que pasa de 1.8 a 1.776388 (78dabc6) es otra encuesta, no más decimales", () => {
    expect(mismoNumero(1.8, 1.776388)).toBe(false);
  });

  it("la última cifra publicada de un índice grande", () => {
    expect(mismoNumero(23127.43, 23127.44)).toBe(false);
    expect(mismoNumero(17104316246676.8, 17104316246676.9)).toBe(false);
  });

  it("un centavo en el último valor de Río Negro, que publica con dos decimales y ronda 1,67e13", () => {
    // Con una holgura de cuatro épsilon (0,015 a esta escala) los dos daban `true`.
    expect(mismoNumero(16746051448071.4, 16746051448071.41)).toBe(false);
    expect(mismoNumero(16746051448071.4, 16746051448071.39)).toBe(false);
  });

  it("una revisión en el octavo decimal de una serie que se publica con ocho", () => {
    expect(mismoNumero(128.39699237, 128.39699251)).toBe(false);
  });

  it("límite conocido: más allá del sexto decimal, un cero final escondido se lee como redondeo", () => {
    // 128.3969924 puede ser 128.39699240 (ocho decimales, con el cero que JSON no escribe) o
    // un redondeo a siete. Desde el número solo no se distingue, y se elige leerlo como
    // redondeo: la revisión que se pierde es de 3e-8 sobre 128 (2e-10 relativo), por debajo de
    // cualquier cifra que alguien vaya a defender. Hasta seis decimales no pasa (ver el dólar).
    expect(mismoNumero(128.39699237, 128.3969924)).toBe(true);
  });

  it("un número entero que cambia en uno", () => {
    expect(mismoNumero(438, 439)).toBe(false);
  });
});

describe("mismoNumero: valores muy chicos", () => {
  // Córdoba viene encadenada desde 1968 a través de cuatro cambios de moneda. Hoy se recorta
  // en 0,01 (`VALOR_MINIMO_REPRESENTABLE`), pero el MCP ya los sirve sin truncar y ese piso
  // puede bajar: la comparación no puede depender de que no lleguen.
  it("un redondeo de un valor chiquísimo es sólo precisión", () => {
    expect(mismoNumero(4.332726297657377e-13, 4.3327263e-13)).toBe(true);
  });

  it("una revisión de un valor chiquísimo cuenta: redondear a seis decimales la borraría", () => {
    expect(mismoNumero(4.332726297657377e-13, 4.4e-13)).toBe(false);
    expect(mismoNumero(3.1e-10, 3.3e-10)).toBe(false);
    expect(mismoNumero(0.0000012, 0.0000013)).toBe(false);
  });

  it("el cero que guardaba la columna de seis decimales es sólo precisión", () => {
    expect(mismoNumero(0, 4.332726297657377e-13)).toBe(true);
    expect(mismoNumero(0.000001, 0.0000012345)).toBe(true);
  });

  it("el signo cuenta", () => {
    expect(mismoNumero(0.5, -0.5)).toBe(false);
  });
});

describe("mismoContenido", () => {
  const indice = (datos: { mes: string; indice: number }[], extra: object = {}) => ({
    serie: "cordoba",
    ultimo_oficial: datos.at(-1)!.mes,
    actualizado: "2026-09-07T16:51:00.000Z",
    datos: datos.map((d) => ({ ...d, origen: "cordoba" })),
    ...extra,
  });

  it("un archivo que sólo cambió de precisión no cambió (56a955c, recortado)", () => {
    const antes = indice([
      { mes: "1990-03", indice: 0.016615 },
      { mes: "1990-04", indice: 0.018935 },
    ]);
    const despues = {
      ...indice([
        { mes: "1990-03", indice: 0.016614728801318833 },
        { mes: "1990-04", indice: 0.01893521226423 },
      ]),
      actualizado: "2026-09-10T13:06:00.000Z",
    };
    expect(mismoContenido(antes, despues)).toBe(true);
  });

  it("un mes nuevo cuenta, aunque el resto sólo haya cambiado de precisión", () => {
    const antes = indice([{ mes: "2026-07", indice: 128.396992 }]);
    const despues = indice([
      { mes: "2026-07", indice: 128.39699237 },
      { mes: "2026-08", indice: 130.69720219 },
    ]);
    expect(mismoContenido(antes, despues)).toBe(false);
  });

  it("una revisión de un solo mes cuenta aunque los demás sólo cambien de precisión", () => {
    const antes = indice([
      { mes: "2026-06", indice: 1533.22 },
      { mes: "2026-07", indice: 0.016615 },
    ]);
    const despues = indice([
      { mes: "2026-06", indice: 1533.21 },
      { mes: "2026-07", indice: 0.016614728801318833 },
    ]);
    expect(mismoContenido(antes, despues)).toBe(false);
  });

  it("los campos que no son números se comparan exactos", () => {
    const base = indice([{ mes: "2026-07", indice: 1 }], { rango: "2012-07/2026-07", activo: true, nota: null });
    expect(mismoContenido(base, { ...base, rango: "2012-07/2026-08" })).toBe(false);
    expect(mismoContenido(base, { ...base, activo: false })).toBe(false);
    expect(mismoContenido(base, { ...base, nota: 0 })).toBe(false);
    expect(mismoContenido(base, { ...base, nota: "null" })).toBe(false);
    expect(mismoContenido({ n: 1 }, { n: "1" })).toBe(false);
  });

  it("una clave que aparece o desaparece cuenta; el orden de las claves no", () => {
    expect(mismoContenido({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(mismoContenido({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    expect(mismoContenido({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("recorre objetos y arrays anidados con el mismo criterio", () => {
    const rem = (senda: number[], mes = "2026-08") => ({
      rem: { mes, senda: senda.map((tasaPct, i) => ({ mes: `2026-0${i + 1}`, tasaPct })), series: ["bcra:29"] },
      matriz: [[1.5, [2.25]], { x: [0.016615] }],
    });
    expect(mismoContenido(rem([1.655048, 1.633374]), rem([1.6550480000000001, 1.63337400000002]))).toBe(true);
    expect(mismoContenido(rem([1.8, 1.633374]), rem([1.776388, 1.633374]))).toBe(false);
    expect(mismoContenido(rem([1.8]), rem([1.8], "2026-09"))).toBe(false);
    expect(mismoContenido(rem([1.8]), { ...rem([1.8]), matriz: [[1.5, [2.26]], { x: [0.016615] }] })).toBe(false);
    expect(mismoContenido(rem([1.8]), { ...rem([1.8]), matriz: [[1.5, [2.25]], { x: [0.0166147288] }] })).toBe(true);
    expect(mismoContenido({ a: [1, 2] }, { a: [1, 2, 3] })).toBe(false);
    expect(mismoContenido({ a: [1] }, { a: { 0: 1 } })).toBe(false);
  });

  it("ignora `actualizado` sólo en la raíz", () => {
    expect(mismoContenido({ actualizado: "ayer", v: 1 }, { actualizado: "hoy", v: 1 })).toBe(true);
    expect(mismoContenido({ x: { actualizado: "ayer" } }, { x: { actualizado: "hoy" } })).toBe(false);
  });

  it("con `compararActualizado` la fecha cuenta, que es lo que usa `meta.json`", () => {
    const meta = { actualizado: "2026-09-10T13:06:51.510Z", meses: 439 };
    expect(mismoContenido(meta, { ...meta, actualizado: "2026-09-11T00:56:00.000Z" }, { compararActualizado: true })).toBe(false);
    expect(mismoContenido(meta, { ...meta }, { compararActualizado: true })).toBe(true);
    expect(mismoContenido(meta, { ...meta, meses: 440 }, { compararActualizado: true })).toBe(false);
  });
});
