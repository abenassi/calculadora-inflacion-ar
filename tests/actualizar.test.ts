import { describe, expect, it } from "vitest";

import {
  actualizarSerie,
  actualizarSerieDoble,
  calcularTcrBilateral,
  reescalarCrossCheck,
} from "../src/engine/actualizar.js";
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
    const r = actualizarSerie([{ punto: "2020-04", valor: 133.1 }], "2020-04", ipc);
    expect(r).toHaveLength(1);
    expect(r[0]!.valorActualizado).toBeCloseTo(133.1, 6);
    expect(r[0]!.motivo).toBeNull();
  });

  it("actualiza un punto viejo a un mes más nuevo (dato directo)", () => {
    const r = actualizarSerie([{ punto: "2020-01", valor: 100 }], "2020-04", ipc);
    expect(r[0]!.valorOriginal).toBe(100);
    expect(r[0]!.valorActualizado).toBeCloseTo(133.1, 6);
    expect(r[0]!.esProyeccion).toBe(false);
  });

  it("deflacta cuando el objetivo es anterior al punto", () => {
    const r = actualizarSerie([{ punto: "2020-04", valor: 133.1 }], "2020-01", ipc);
    expect(r[0]!.valorActualizado).toBeCloseTo(100, 6);
  });

  it("acepta una fecha exacta (Punto = día), no sólo un mes", () => {
    // El motor de fechas ya está probado en adjust.test.ts; acá sólo se confirma
    // que actualizarSerie lo deja pasar sin convertirlo a mes primero.
    const conDia = actualizarSerie([{ punto: "2020-02-15", valor: 100 }], "2020-04", ipc);
    const conMes = actualizarSerie([{ punto: "2020-02", valor: 100 }], "2020-04", ipc);
    expect(conDia[0]!.valorActualizado).not.toBeCloseTo(conMes[0]!.valorActualizado!, 2);
    expect(conDia[0]!.valorActualizado).not.toBeNull();
  });

  it("con metodología sin_proyectar (default), marca en vez de descartar un punto que necesitaría estimar", () => {
    const r = actualizarSerie(
      [
        { punto: "2020-01", valor: 100 },
        { punto: "2020-04", valor: 133.1 },
      ],
      "2020-07",
      ipc,
    );
    expect(r).toHaveLength(2); // las dos filas están, ninguna desaparece
    expect(r[0]!.valorActualizado).toBeNull();
    expect(r[0]!.motivo).toBe("ventana_no_cabe");
    expect(r[1]!.valorActualizado).toBeNull();
  });

  it("con metodología repite_ultimo, ese mismo punto SÍ se resuelve, marcado como proyección", () => {
    const r = actualizarSerie(
      [{ punto: "2020-01", valor: 100 }],
      "2020-07",
      ipc,
      { metodologia: "repite_ultimo" },
    );
    expect(r[0]!.valorActualizado).not.toBeNull();
    expect(r[0]!.esProyeccion).toBe(true);
    expect(r[0]!.motivo).toBeNull();
  });

  it("conserva el orden de los puntos de entrada", () => {
    const r = actualizarSerie(
      [
        { punto: "2020-02", valor: 110 },
        { punto: "2020-01", valor: 100 },
      ],
      "2020-04",
      ipc,
    );
    expect(r.map((p) => p.punto)).toEqual(["2020-02", "2020-01"]);
  });

  it("con el objetivo en ultimo_oficial, todos los puntos resuelven directo", () => {
    const puntos = ipc.datos.map((p) => ({ punto: p.mes, valor: p.indice }));
    const r = actualizarSerie(puntos, ipc.ultimo_oficial, ipc);
    expect(r.every((p) => p.valorActualizado !== null && !p.esProyeccion)).toBe(true);
  });
});

describe("actualizarSerieDoble", () => {
  // Mismo IPC AR de arriba: 10% mensual clavado. ene 100 · feb 110 · mar 121 · abr 133,1.

  /** CPI de EE.UU. sintético, 2% mensual clavado: ene 100 · feb 102 · mar 104,04 · abr 106,1208. */
  const cpiUs: SerieIndice = {
    serie: "test-cpi-us",
    base: "2020-01=100",
    fuentes: [],
    ultimo_oficial: "2020-04",
    actualizado: "2020-06-01T00:00:00Z",
    datos: [
      { mes: "2020-01", indice: 100, origen: "fred" },
      { mes: "2020-02", indice: 102, origen: "fred" },
      { mes: "2020-03", indice: 104.04, origen: "fred" },
      { mes: "2020-04", indice: 106.1208, origen: "fred" },
    ],
  };

  /**
   * Punto de control verificado a mano (misma rigurosidad que `adjust.test.ts` para el
   * motor de un solo índice): dólar blue de $50 en enero de 2020, llevado a abril de
   * 2020 en tipo de cambio real bilateral.
   *
   * `soloBase` es el ajuste puro por IPC AR: 50 × (133,1/100) = 66,55.
   *
   * `factorSecundario` es `adjust(1, "2020-04", "2020-01", cpiUs)`, o sea
   * CPI_US(ene)/CPI_US(abr) = 100/106,1208 = 100/1,02³ = (50/51)³ = 125.000/132.651
   * ≈ 0,9423223.
   *
   * `valorActualizado` = soloBase × factorSecundario = 66,55 × 0,9423223
   * = 6.655/106,1208 ≈ 62,711551 (verificado con una calculadora aparte, no con el
   * motor: 6655 ÷ 106,1208 = 62,711551…).
   */
  it("punto de control: dólar blue de enero a pesos-TCR de abril", () => {
    const r = actualizarSerieDoble(
      [{ mes: "2020-01", valor: 50 }],
      "2020-04",
      ipc,
      cpiUs,
      "multiplicar",
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.valorSoloBase).toBeCloseTo(66.55, 6);
    expect(r[0]!.valorActualizado).toBeCloseTo(62.711551, 4);
  });

  it("con dirección 'dividir' se obtiene el recíproco del factor secundario", () => {
    const r = actualizarSerieDoble(
      [{ mes: "2020-01", valor: 50 }],
      "2020-04",
      ipc,
      cpiUs,
      "dividir",
    );
    // dividir: soloBase / factorSecundario = 66,55 / 0,9423223 ≈ 70,6234…
    expect(r[0]!.valorActualizado).toBeCloseTo(70.6234, 3);
  });

  /**
   * El signo del efecto — la prueba que habría atrapado el bug de dirección que el
   * spec ya encontró en su propio self-review.
   *
   * La derivación (ver `docs/superpowers/specs/2026-08-17-tipo-cambio-real-design.md`,
   * "La cuenta"): `valorActualizado = soloBase × CPI_US(t)/CPI_US(t0)`, con `t =
   * punto.mes` y `t0 = mesObjetivo`. En el caso común del sitio `t` es más viejo que
   * `t0` (una serie histórica reindexada a un mes reciente), así que el factor
   * `CPI_US(t)/CPI_US(t0)` es menor a 1 —y `valorActualizado` menor a `valorSoloBase`—
   * exactamente cuando el CPI de EE.UU. tuvo **inflación neta positiva** en el tramo
   * (el dólar perdió poder de compra real en EE.UU. entre `t` y `t0`), y mayor cuando
   * el CPI de EE.UU. tuvo **deflación neta** en el tramo.
   *
   * Ese signo depende sólo de si el CPI de EE.UU. subió o bajó en el tramo — NO de
   * compararlo contra cuánto subió el IPC argentino en el mismo tramo. Verificado acá
   * con dos escenarios que aíslan la variable: mismo IPC AR (10%/mes) en los dos, y
   * sólo cambia el signo neto del CPI de EE.UU.
   */
  it("es MENOR que valorSoloBase cuando el CPI de EE.UU. tuvo inflación neta en el tramo", () => {
    // cpiUs sube 2%/mes de enero a abril (inflación neta positiva): ya cubierto por
    // el punto de control de arriba, pero se repite acá con la aserción de signo.
    const r = actualizarSerieDoble(
      [{ mes: "2020-01", valor: 50 }],
      "2020-04",
      ipc,
      cpiUs,
      "multiplicar",
    );
    expect(r[0]!.valorActualizado).toBeLessThan(r[0]!.valorSoloBase);
  });

  it("es MAYOR que valorSoloBase cuando el CPI de EE.UU. tuvo deflación neta en el tramo", () => {
    // CPI de EE.UU. que cae 2%/mes en vez de subir: ene 100 · feb 98 · mar 96,04 · abr 94,1192.
    const cpiUsDeflacion: SerieIndice = {
      ...cpiUs,
      datos: [
        { mes: "2020-01", indice: 100, origen: "fred" },
        { mes: "2020-02", indice: 98, origen: "fred" },
        { mes: "2020-03", indice: 96.04, origen: "fred" },
        { mes: "2020-04", indice: 94.1192, origen: "fred" },
      ],
    };
    const r = actualizarSerieDoble(
      [{ mes: "2020-01", valor: 50 }],
      "2020-04",
      ipc,
      cpiUsDeflacion,
      "multiplicar",
    );
    expect(r[0]!.valorActualizado).toBeGreaterThan(r[0]!.valorSoloBase);
  });

  it("descarta un punto si CUALQUIERA de los dos índices necesitaría estimar", () => {
    // El IPC AR sólo llega a abril; pedir un mes objetivo más allá (julio) lo obliga a
    // estimar — mismo caso límite que ya cubre `actualizarSerie` más arriba, pero acá
    // el motivo puede venir del índice base o del secundario.
    const r = actualizarSerieDoble(
      [{ mes: "2020-01", valor: 50 }],
      "2020-07",
      ipc,
      cpiUs,
      "multiplicar",
    );
    expect(r).toHaveLength(0);
  });

  it("valorSoloBase coincide exactamente con lo que da actualizarSerie", () => {
    // Regla 4: el ajuste del índice base no puede ser un cálculo paralelo al de
    // `actualizarSerie` — tiene que ser literalmente el mismo número.
    const datos = [
      { mes: "2020-01", valor: 50 },
      { mes: "2020-02", valor: 55 },
    ];
    const datosConPunto = datos.map((d) => ({ punto: d.mes, valor: d.valor }));
    const doble = actualizarSerieDoble(datos, "2020-04", ipc, cpiUs, "multiplicar");
    const simple = actualizarSerie(datosConPunto, "2020-04", ipc);
    expect(doble.map((p) => p.valorSoloBase)).toEqual(simple.map((p) => p.valorActualizado));
  });

  /**
   * Encontrado por `revisor-codigo` en la vuelta 1 del loop, y reproducido antes de
   * arreglarlo (ver `docs/superpowers/specs/2026-08-17-tipo-cambio-real-design.md` —
   * no está en el spec, es un hallazgo del review): `motivoParaEstimar` sólo mide el
   * borde "todavía no se publicó" (hacia adelante, contra `ultimoOficial`), nunca el
   * de "la serie no llega tan atrás" (contra el primer mes). Sin el chequeo aparte
   * que agrega `fueraDeCobertura`, un punto anterior al piso del índice secundario
   * pasaba el filtro y `adjust()` reventaba con una `RangoError` sin capturar dos
   * líneas después, en vez de descartarse en silencio como cualquier otro punto sin
   * cobertura.
   */
  it("descarta un punto anterior al piso del índice secundario, sin romper (no una RangoError)", () => {
    const cpiUsPisoTardio: SerieIndice = {
      ...cpiUs,
      datos: cpiUs.datos.filter((p) => p.mes >= "2020-02"), // arranca en feb, no en ene
    };
    // "2020-01" es un mes válido para el IPC AR (arranca antes) pero anterior al piso
    // de cpiUsPisoTardio: antes del fix, esto tiraba `RangoError` sin capturar.
    expect(() =>
      actualizarSerieDoble(
        [
          { mes: "2020-01", valor: 50 }, // antes del piso del secundario -> se descarta
          { mes: "2020-02", valor: 55 }, // dentro de rango -> se calcula
        ],
        "2020-04",
        ipc,
        cpiUsPisoTardio,
        "multiplicar",
      ),
    ).not.toThrow();

    const r = actualizarSerieDoble(
      [
        { mes: "2020-01", valor: 50 },
        { mes: "2020-02", valor: 55 },
      ],
      "2020-04",
      ipc,
      cpiUsPisoTardio,
      "multiplicar",
    );
    expect(r.map((p) => p.mes)).toEqual(["2020-02"]);
  });

  /**
   * El caso más directamente alcanzable desde la interfaz real: el selector de mes
   * objetivo de `/actualizar.html` llega hasta 1992 (harcodeado en
   * `actualizar-main.ts`, muy anterior al piso real del CPI de EE.UU., 2002-01 en el
   * snapshot de hoy). Sin el chequeo del mes objetivo contra la cobertura del índice
   * secundario, elegir un mes objetivo así rompía la página entera (mismo hallazgo
   * de arriba, pero disparado por `mesObjetivo` en vez de por un punto de `datos`).
   *
   * Usa `cpiUsPisoTardio` (arranca en feb) y no `cpiUs` (arranca en ene, igual que
   * `ipc`) a propósito: con el mismo piso para los dos índices, un mes objetivo
   * anterior a ambos no aísla si el descarte lo dispara el índice base o el
   * secundario. Acá `mesObjetivo="2020-01"` es válido para `ipc` pero anterior al
   * piso de `cpiUsPisoTardio`, así que el único motivo posible es el secundario.
   */
  it("descarta TODOS los puntos si el mes objetivo es anterior al piso del índice secundario", () => {
    const cpiUsPisoTardio: SerieIndice = {
      ...cpiUs,
      datos: cpiUs.datos.filter((p) => p.mes >= "2020-02"),
    };

    expect(() =>
      actualizarSerieDoble(
        [{ mes: "2020-02", valor: 50 }],
        "2020-01",
        ipc,
        cpiUsPisoTardio,
        "multiplicar",
      ),
    ).not.toThrow();

    const r = actualizarSerieDoble(
      [{ mes: "2020-02", valor: 50 }],
      "2020-01",
      ipc,
      cpiUsPisoTardio,
      "multiplicar",
    );
    expect(r).toEqual([]);
  });
});

describe("reescalarCrossCheck", () => {
  const serie = [
    { mes: "2020-01", valor: 50 },
    { mes: "2020-02", valor: 55 },
    { mes: "2020-03", valor: 60 },
  ];

  it("el mes objetivo siempre queda en exactamente 100, por construcción", () => {
    const r = reescalarCrossCheck(serie, "2020-02");
    expect(r.find((p) => p.mes === "2020-02")!.valor).toBe(100);
  });

  it("reescala el resto proporcional al mes objetivo", () => {
    const r = reescalarCrossCheck(serie, "2020-02");
    // 50/55*100 y 60/55*100
    expect(r.find((p) => p.mes === "2020-01")!.valor).toBeCloseTo((50 / 55) * 100, 6);
    expect(r.find((p) => p.mes === "2020-03")!.valor).toBeCloseTo((60 / 55) * 100, 6);
  });

  it("devuelve vacío si el mes objetivo no está en la serie, en vez de tirar", () => {
    expect(reescalarCrossCheck(serie, "2025-01")).toEqual([]);
  });
});

describe("calcularTcrBilateral", () => {
  // Mismo CPI de EE.UU. sintético que usa el describe de `actualizarSerieDoble` más
  // arriba en este archivo: 2% mensual clavado (ene 100 · feb 102 · mar 104,04 · abr
  // 106,1208). Duplicado a propósito, no importado del otro `describe`, para no
  // acoplar los dos bloques de test entre sí — mismo criterio que ya sigue el resto
  // del archivo con el fixture de `ipc`.
  const cpiUs: SerieIndice = {
    serie: "test-cpi-us",
    base: "2020-01=100",
    fuentes: [],
    ultimo_oficial: "2020-04",
    actualizado: "2020-06-01T00:00:00Z",
    datos: [
      { mes: "2020-01", indice: 100, origen: "fred" },
      { mes: "2020-02", indice: 102, origen: "fred" },
      { mes: "2020-03", indice: 104.04, origen: "fred" },
      { mes: "2020-04", indice: 106.1208, origen: "fred" },
    ],
  };

  it("da exactamente lo mismo que actualizarSerieDoble con dirección 'multiplicar'", () => {
    const datos = [{ mes: "2020-01", valor: 50 }];
    const r = calcularTcrBilateral(datos, "2020-04", ipc, cpiUs);
    const esperado = actualizarSerieDoble(datos, "2020-04", ipc, cpiUs, "multiplicar");
    expect(r).toEqual(esperado);
  });

  it("reproduce el punto de control ya verificado a mano (62,711551)", () => {
    // Mismo punto de control que el describe de `actualizarSerieDoble`: dólar de $50
    // en enero de 2020 a pesos-TCR de abril de 2020.
    const r = calcularTcrBilateral([{ mes: "2020-01", valor: 50 }], "2020-04", ipc, cpiUs);
    expect(r).toHaveLength(1);
    expect(r[0]!.valorSoloBase).toBeCloseTo(66.55, 6);
    expect(r[0]!.valorActualizado).toBeCloseTo(62.711551, 4);
  });
});
