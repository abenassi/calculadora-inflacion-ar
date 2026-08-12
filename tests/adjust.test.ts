import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { adjust, RangoError, tasaMensualDelRem } from "../src/engine/adjust.js";
import type { SerieIndice } from "../src/engine/types.js";

const serie = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../public/data/ipc.json"), "utf8"),
) as SerieIndice;

/**
 * Serie sintética con 10% mensual clavado, publicada hasta abril.
 * Índices: ene 100 · feb 110 · mar 121 · abr 133,1
 */
const sintetica: SerieIndice = {
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

/** Serie con variaciones distintas mes a mes, para poder distinguir métodos. */
const irregular: SerieIndice = {
  ...sintetica,
  datos: [
    { mes: "2020-01", indice: 100, origen: "indec" },
    { mes: "2020-02", indice: 105, origen: "indec" }, // +5%
    { mes: "2020-03", indice: 107.1, origen: "indec" }, // +2%
    { mes: "2020-04", indice: 110.313, origen: "indec" }, // +3%
  ],
};

describe("método directo — todo el período está publicado", () => {
  it("ajusta hacia adelante componiendo las variaciones", () => {
    const r = adjust(1000, "2020-01", "2020-03", sintetica, { hoy: "2020-06" });
    expect(r.metodo.tipo).toBe("directo");
    expect(r.montoAjustado).toBeCloseTo(1210, 6);
    expect(r.variacionPct).toBeCloseTo(21, 6);
  });

  it("mes de origen igual al de destino devuelve el monto intacto", () => {
    const r = adjust(1000, "2020-02", "2020-02", sintetica, { hoy: "2020-06" });
    expect(r.montoAjustado).toBe(1000);
    expect(r.variacionPct).toBe(0);
    expect(r.desglose).toHaveLength(1);
  });

  it("deflacta yendo hacia atrás", () => {
    const r = adjust(1210, "2020-03", "2020-01", sintetica, { hoy: "2020-06" });
    expect(r.metodo.tipo).toBe("directo");
    expect(r.montoAjustado).toBeCloseTo(1000, 6);
    expect(r.desglose.map((f) => f.punto)).toEqual(["2020-03", "2020-02", "2020-01"]);
  });

  it("ninguna fila queda marcada como proyección", () => {
    const r = adjust(1000, "2020-01", "2020-04", sintetica, { hoy: "2020-06" });
    expect(r.desglose.every((f) => !f.esProyeccion)).toBe(true);
  });
});

describe("ventana reciente — el destino ya pasó pero no se publicó", () => {
  /**
   * El caso dominante: traer un monto al presente. El mes en curso nunca tiene IPC
   * publicado, así que en vez de inventarlo se usa la inflación de los últimos N
   * meses publicados, con N igual a la duración del período pedido.
   */
  it("corre la ventana hacia atrás en vez de estimar", () => {
    // Marzo→junio son 3 meses; publicado hasta abril, así que se corren 2 y la
    // ventana usada pasa a ser enero→abril.
    const r = adjust(1000, "2020-03", "2020-06", sintetica, { hoy: "2020-06" });

    expect(r.metodo.tipo).toBe("ventana_reciente");
    if (r.metodo.tipo !== "ventana_reciente") throw new Error("tipo inesperado");
    expect(r.metodo.mesesDelPeriodo).toBe(3);
    expect(r.metodo.desplazamiento).toBe(2);
    expect(r.metodo.mesesSinPublicar).toEqual(["2020-05", "2020-06"]);

    expect(r.desglose.map((f) => f.punto)).toEqual(["2020-01", "2020-02", "2020-03", "2020-04"]);
    expect(r.variacionPct).toBeCloseTo(33.1, 6);
    expect(r.montoAjustado).toBeCloseTo(1331, 6);
  });

  it("no marca nada como proyección: todos los datos son publicados", () => {
    const r = adjust(1000, "2020-03", "2020-06", sintetica, { hoy: "2020-06" });
    expect(r.desglose.every((f) => !f.esProyeccion)).toBe(true);
    expect(r.desglose.every((f) => f.origen === "indec")).toBe(true);
  });

  it("usa los últimos meses publicados tal cual, no un promedio", () => {
    // Febrero→mayo son 3 meses; publicado hasta abril → se corre 1.
    // Ventana usada: enero→abril, o sea +5%, +2%, +3% compuestos.
    const r = adjust(1000, "2020-02", "2020-05", irregular, { hoy: "2020-05" });
    expect(r.metodo.tipo).toBe("ventana_reciente");
    expect(r.desglose.map((f) => f.punto)).toEqual(["2020-01", "2020-02", "2020-03", "2020-04"]);
    expect(r.variacionPct).toBeCloseTo((1.05 * 1.02 * 1.03 - 1) * 100, 6);
  });

  it("también corre la ventana yendo hacia atrás desde un mes sin publicar", () => {
    // "Cobré esto en junio, ¿cuánto era en marzo?", publicado hasta abril.
    const r = adjust(1331, "2020-06", "2020-03", sintetica, { hoy: "2020-06" });
    expect(r.metodo.tipo).toBe("ventana_reciente");
    expect(r.desglose.map((f) => f.punto)).toEqual(["2020-04", "2020-03", "2020-02", "2020-01"]);
    expect(r.montoAjustado).toBeCloseTo(1000, 6);
  });

  it("el desplazamiento es el mínimo que hace entrar la ventana", () => {
    const r = adjust(1000, "2020-04", "2020-05", sintetica, { hoy: "2020-05" });
    if (r.metodo.tipo !== "ventana_reciente") throw new Error("tipo inesperado");
    expect(r.metodo.desplazamiento).toBe(1);
    expect(r.desglose.map((f) => f.punto)).toEqual(["2020-03", "2020-04"]);
  });
});

describe("proyección — el destino es un mes futuro", () => {
  /**
   * Más allá del mes en curso no hay ninguna ventana publicada equivalente que
   * sirva de referencia, así que hay que estimar. Se hace repitiendo la última
   * variación publicada: la proyección más simple que existe y la única que se
   * explica sin describir un modelo.
   */
  it("proyecta repitiendo la última variación publicada", () => {
    const r = adjust(1000, "2020-04", "2020-06", sintetica, { hoy: "2020-05" });
    expect(r.metodo.tipo).toBe("proyeccion");
    if (r.metodo.tipo !== "proyeccion") throw new Error("tipo inesperado");
    expect(r.metodo.tasaMensualPct).toBeCloseTo(10, 6);
    expect(r.metodo.base).toEqual({ fuente: "ultimo_mes", mes: "2020-04" });
    expect(r.metodo.mesesEstimados).toEqual(["2020-05", "2020-06"]);
    expect(r.montoAjustado).toBeCloseTo(1000 * 1.1 * 1.1, 6);
  });

  it("repite el último valor, no el promedio de varios", () => {
    // Últimas variaciones: +5%, +2%, +3%. Repetir el último da 3%, no 3,33%.
    const r = adjust(1000, "2020-04", "2020-05", irregular, { hoy: "2020-04" });
    if (r.metodo.tipo !== "proyeccion") throw new Error("tipo inesperado");
    expect(r.metodo.tasaMensualPct).toBeCloseTo(3, 6);
    expect(r.montoAjustado).toBeCloseTo(1030, 6);
  });

  it("marca como proyección sólo las filas posteriores a lo publicado", () => {
    const r = adjust(1000, "2020-02", "2020-06", sintetica, { hoy: "2020-05" });
    expect(r.desglose.map((f) => f.esProyeccion)).toEqual([false, false, false, true, true]);
  });

  /** La frontera entre los dos métodos es exactamente el mes en curso. */
  it("el mes en curso usa ventana reciente; el siguiente ya proyecta", () => {
    const enCurso = adjust(1000, "2020-04", "2020-05", sintetica, { hoy: "2020-05" });
    const futuro = adjust(1000, "2020-04", "2020-05", sintetica, { hoy: "2020-04" });
    expect(enCurso.metodo.tipo).toBe("ventana_reciente");
    expect(futuro.metodo.tipo).toBe("proyeccion");
  });

  it("cae en proyección si correr la ventana se sale del inicio de la serie", () => {
    // Origen en el primer mes de la serie: no hay lugar para correr nada hacia atrás.
    const r = adjust(1000, "2020-01", "2020-06", sintetica, { hoy: "2020-06" });
    expect(r.metodo.tipo).toBe("proyeccion");
    expect(r.desglose.map((f) => f.punto)).toEqual([
      "2020-01",
      "2020-02",
      "2020-03",
      "2020-04",
      "2020-05",
      "2020-06",
    ]);
  });
});

describe("metodologías elegibles", () => {
  /** Serie de test con REM: 21,8% esperado a 12 meses. */
  const conRem: SerieIndice = {
    ...irregular,
    rem: {
      // Senda de dos meses: alcanza para distinguir el tramo pronosticado del
      // tramo que hay que extrapolar.
      senda: [
        { mes: "2020-05", tasaPct: 1.2 },
        { mes: "2020-06", tasaPct: 1.4 },
      ],
      expectativaAnualPct: 21.8,
      mes: "2020-04",
      series: ["bcra:29", "rem:ipc_mensual"],
      organismo: "BCRA",
    },
  };

  /**
   * La diferencia entre las metodologías sólo aparece cuando el destino no está
   * publicado pero tampoco es futuro. Es el caso dominante del sitio, así que es
   * donde importa que elegir cambie algo de verdad.
   */
  it("las tres dan resultados distintos en el mes en curso", () => {
    const opciones = { hoy: "2020-05" } as const;
    const sin = adjust(1000, "2020-03", "2020-05", conRem, opciones);
    const ultimo = adjust(1000, "2020-03", "2020-05", conRem, {
      ...opciones,
      metodologia: "repite_ultimo",
    });
    const rem = adjust(1000, "2020-03", "2020-05", conRem, { ...opciones, metodologia: "rem" });

    expect(sin.metodo.tipo).toBe("ventana_reciente");
    expect(ultimo.metodo.tipo).toBe("proyeccion");
    expect(rem.metodo.tipo).toBe("proyeccion");
    expect(ultimo.montoAjustado).not.toBeCloseTo(sin.montoAjustado, 6);
    expect(rem.montoAjustado).not.toBeCloseTo(ultimo.montoAjustado, 6);
  });

  /**
   * Con la ventana corrida el desglose muestra meses publicados; proyectando
   * muestra los meses que se pidieron. Esa diferencia es la que la interfaz tiene
   * que dejar clarísima, porque son las mismas filas diciendo cosas distintas.
   */
  it("proyectar usa los meses pedidos, no una ventana corrida", () => {
    const opciones = { hoy: "2020-05" } as const;
    const sin = adjust(1000, "2020-03", "2020-05", conRem, opciones);
    const proyectada = adjust(1000, "2020-03", "2020-05", conRem, {
      ...opciones,
      metodologia: "repite_ultimo",
    });

    expect(sin.desglose.map((f) => f.punto)).toEqual(["2020-02", "2020-03", "2020-04"]);
    expect(sin.desglose.every((f) => !f.esProyeccion)).toBe(true);
    expect(proyectada.desglose.map((f) => f.punto)).toEqual(["2020-03", "2020-04", "2020-05"]);
    expect(proyectada.desglose.map((f) => f.esProyeccion)).toEqual([false, false, true]);
  });

  /**
   * Lo que el REM efectivamente pronostica para cada mes, no un promedio nuestro.
   * Hasta 2026-08 el catálogo sólo tenía el número a doce meses y había que
   * repartirlo parejo; la senda mensual se indexó para poder dejar de hacer eso.
   */
  it("usa el valor que el REM pronosticó para cada mes", () => {
    const r = adjust(1000, "2020-04", "2020-06", conRem, { hoy: "2020-06", metodologia: "rem" });
    if (r.metodo.tipo !== "proyeccion") throw new Error("tipo inesperado");
    expect(r.metodo.tasaMensualPct).toBeNull(); // cambia mes a mes
    expect(r.desglose.slice(1).map((f) => f.varMensualPct)).toEqual([
      expect.closeTo(1.2, 6),
      expect.closeTo(1.4, 6),
    ]);
    expect(r.montoAjustado).toBeCloseTo(1000 * 1.012 * 1.014, 6);
  });

  it("más allá del horizonte de la senda reparte la expectativa a doce meses", () => {
    const r = adjust(1000, "2020-04", "2020-08", conRem, { hoy: "2020-08", metodologia: "rem" });
    if (r.metodo.tipo !== "proyeccion") throw new Error("tipo inesperado");
    if (r.metodo.base.fuente !== "rem") throw new Error("base inesperada");
    expect(r.metodo.base.mesesDeLaSenda).toEqual(["2020-05", "2020-06"]);
    expect(r.metodo.base.mesesExtrapolados).toEqual(["2020-07", "2020-08"]);

    // 1,218^(1/12) − 1 = 1,657% mensual, y doce de esos meses reconstruyen el 21,8%.
    const pareja = tasaMensualDelRem(21.8);
    expect(pareja).toBeCloseTo(1.657, 3);
    expect(Math.pow(1 + pareja / 100, 12)).toBeCloseTo(1.218, 6);
    expect(r.montoAjustado).toBeCloseTo(
      1000 * 1.012 * 1.014 * Math.pow(1 + pareja / 100, 2),
      6,
    );
  });

  it("pedir el REM sin datos del REM falla y no inventa una tasa", () => {
    expect(() =>
      adjust(1000, "2020-04", "2020-05", irregular, { hoy: "2020-05", metodologia: "rem" }),
    ).toThrow(RangoError);
  });

  /**
   * Para un mes futuro no hay ventana publicada equivalente, así que la
   * metodología que "no estima nada" tiene que estimar igual. Es la única
   * excepción, y coincide exactamente con repetir el último mes.
   */
  it("con destino futuro, no proyectar y repetir el último coinciden", () => {
    const opciones = { hoy: "2020-04" } as const;
    const sin = adjust(1000, "2020-03", "2020-06", conRem, opciones);
    const ultimo = adjust(1000, "2020-03", "2020-06", conRem, {
      ...opciones,
      metodologia: "repite_ultimo",
    });
    expect(sin.metodo).toEqual(ultimo.metodo);
    expect(sin.montoAjustado).toBeCloseTo(ultimo.montoAjustado, 9);
  });

  /**
   * Con un período de un solo mes, correr la ventana hacia atrás devuelve
   * justamente el último mes publicado, que es la misma tasa que se repetiría al
   * proyectar. Coinciden por construcción, no por casualidad, y conviene que
   * quede fijado: si alguna vez dejan de coincidir, algo cambió de método.
   */
  it("en un período de un mes, no proyectar y repetir el último dan lo mismo", () => {
    const opciones = { hoy: "2020-05" } as const;
    const sin = adjust(1000, "2020-04", "2020-05", conRem, opciones);
    const ultimo = adjust(1000, "2020-04", "2020-05", conRem, {
      ...opciones,
      metodologia: "repite_ultimo",
    });
    expect(sin.metodo.tipo).toBe("ventana_reciente");
    expect(ultimo.metodo.tipo).toBe("proyeccion");
    expect(sin.montoAjustado).toBeCloseTo(ultimo.montoAjustado, 9);
  });

  it("sin meses faltantes las tres metodologías coinciden", () => {
    const opciones = { hoy: "2020-04" } as const;
    const montos = (["sin_proyectar", "repite_ultimo", "rem"] as const).map(
      (metodologia) => adjust(1000, "2020-02", "2020-04", conRem, { ...opciones, metodologia }),
    );
    expect(montos.every((r) => r.metodo.tipo === "directo")).toBe(true);
    expect(new Set(montos.map((r) => r.montoAjustado)).size).toBe(1);
  });

  it("tasaMensualDelRem compone de vuelta la expectativa anual", () => {
    for (const anual of [0, 5.5, 21.8, 300]) {
      expect(Math.pow(1 + tasaMensualDelRem(anual) / 100, 12)).toBeCloseTo(1 + anual / 100, 9);
    }
  });
});

describe("modo por día", () => {
  /**
   * El índice de un mes es el nivel al que se llega al terminarlo, así que el 1 de
   * un mes y el cierre del anterior son el mismo punto. De ahí sale todo lo demás.
   */
  it("el día 1 de un mes vale igual que el mes anterior entero", () => {
    const porMes = adjust(1000, "2020-01", "2020-03", irregular, { hoy: "2020-06" });
    const porDia = adjust(1000, "2020-02-01", "2020-04-01", irregular, { hoy: "2020-06" });
    expect(porDia.montoAjustado).toBeCloseTo(porMes.montoAjustado, 10);
  });

  /**
   * Lo que hace legible la tabla: el tramo del 1 de marzo al 1 de abril contiene la
   * inflación de marzo. Con el anclaje anterior contenía la de abril, que es
   * contraintuitivo hasta el ridículo.
   */
  it("el tramo de 1 a 1 contiene la inflación del mes que abarca", () => {
    const r = adjust(1000, "2020-03-01", "2020-04-01", irregular, { hoy: "2020-06" });
    expect(r.variacionPct).toBeCloseTo(2, 8); // marzo, no abril
  });

  it("prorratea la inflación del propio mes, no la del siguiente", () => {
    // Marzo tiene 31 días y subió 2%: el 15 lleva 14/31 de ese 2%.
    const r = adjust(1000, "2020-03-01", "2020-03-15", irregular, { hoy: "2020-06" });
    expect(r.montoAjustado).toBeCloseTo(1000 * Math.pow(1.02, 14 / 31), 8);
  });

  /**
   * Las puntas son tramos de días sueltos y las del medio meses completos. La
   * distinción tiene que salir del motor: la interfaz no puede etiquetar como dato
   * oficial del INDEC un número que es un prorrateo nuestro.
   */
  it("marca como parciales sólo las filas de las puntas", () => {
    const r = adjust(1000, "2020-02-15", "2020-04-05", irregular, { hoy: "2020-06" });
    expect(r.desglose.map((f) => f.esParcial)).toEqual([false, true, false, true]);
  });

  it("con meses enteros ninguna fila es parcial", () => {
    const r = adjust(1000, "2020-01", "2020-04", irregular, { hoy: "2020-06" });
    expect(r.desglose.every((f) => !f.esParcial)).toBe(true);
  });

  it("ninguna fila abarca más de un mes", () => {
    const r = adjust(1000, "2020-02-15", "2020-04-05", irregular, { hoy: "2020-06" });
    expect(r.desglose.map((f) => f.punto)).toEqual([
      "2020-02-15",
      "2020-03-01",
      "2020-04-01",
      "2020-04-05",
    ]);
  });

  /**
   * Con el anclaje al día 1, un día suelto necesitaba el índice del mes siguiente y
   * la ventana tenía que correrse un mes de más. Ese costo desapareció: días y
   * meses piden exactamente lo mismo.
   */
  it("un día del último mes publicado ya no obliga a correr la ventana", () => {
    // Antes, el 20 de abril necesitaba el índice de mayo y esto era
    // `ventana_reciente`. Ese mes de frescura es lo que se gana con el cambio.
    const r = adjust(1000, "2020-02-10", "2020-04-20", irregular, { hoy: "2020-05" });
    expect(r.metodo.tipo).toBe("directo");
  });

  it("cuando hay que correr la ventana, días y meses corren lo mismo", () => {
    const porDia = adjust(1000, "2020-03-10", "2020-05-20", irregular, { hoy: "2020-05" });
    const porMes = adjust(1000, "2020-03", "2020-05", irregular, { hoy: "2020-05" });
    if (porDia.metodo.tipo !== "ventana_reciente") throw new Error("tipo inesperado");
    if (porMes.metodo.tipo !== "ventana_reciente") throw new Error("tipo inesperado");
    expect(porDia.metodo.desplazamiento).toBe(porMes.metodo.desplazamiento);
    expect(porDia.desglose[0]!.punto).toBe("2020-02-10");
    expect(porDia.desglose.at(-1)!.punto).toBe("2020-04-20");
  });

  it("ida y vuelta con días devuelve el monto original", () => {
    const ida = adjust(1000, "2020-02-10", "2020-04-20", irregular, { hoy: "2020-06" });
    const vuelta = adjust(ida.montoAjustado, "2020-04-20", "2020-02-10", irregular, {
      hoy: "2020-06",
    });
    expect(vuelta.montoAjustado).toBeCloseTo(1000, 8);
  });

  /**
   * Prorratear un día necesita el mes anterior, así que el primer mes de la serie no
   * admite fechas. Tiene que fallar con un mensaje que se entienda, no con un NaN.
   */
  it("una fecha del primer mes de la serie falla explícitamente", () => {
    expect(() => adjust(1000, "2020-01-15", "2020-03-01", irregular, { hoy: "2020-06" })).toThrow(
      RangoError,
    );
  });

  /**
   * El desfasaje que tenía el método de proyección: la última fila interpolaba con
   * el mes siguiente, así que usaba un mes estimado más de los que declaraba.
   */
  /**
   * El 1 de un mes es el cierre del anterior, así que el tramo que va del 1 de abril
   * al 1 de mayo contiene la inflación de **abril**, que está publicada. Marcarlo
   * como estimado porque su etiqueta cae en mayo sería mentir sobre un dato oficial,
   * justo en la columna que existe para no mentir sobre eso.
   */
  it("declara como estimados exactamente los tramos que necesitan un mes sin publicar", () => {
    const r = adjust(1000, "2020-03-10", "2020-05-20", irregular, {
      hoy: "2020-05",
      metodologia: "repite_ultimo",
    });
    if (r.metodo.tipo !== "proyeccion") throw new Error("tipo inesperado");
    expect(r.metodo.mesesEstimados).toEqual(["2020-05"]);
    expect(r.desglose.map((f) => f.punto)).toEqual([
      "2020-03-10",
      "2020-04-01",
      "2020-05-01",
      "2020-05-20",
    ]);
    expect(r.desglose.map((f) => f.esProyeccion)).toEqual([false, false, false, true]);
  });
});


describe("bordes y errores", () => {
  it("rechaza meses anteriores al inicio de la serie", () => {
    expect(() => adjust(1000, "1989-12", "2020-01", sintetica, { hoy: "2020-06" })).toThrow(
      /No hay datos de inflación/,
    );
  });

  it("rechaza un monto no numérico en vez de devolver NaN", () => {
    expect(() => adjust(Number.NaN, "2020-01", "2020-02", sintetica)).toThrow(RangoError);
  });

  it("rechaza un mes con formato inválido", () => {
    expect(() => adjust(1000, "2020-13", "2020-01", sintetica)).toThrow(RangeError);
  });
});

describe("contra la serie real", () => {
  const hoy = "2026-08";

  /**
   * El caso testigo del proyecto, con la metodología nueva: $520.000 de mayo a
   * agosto 2026, con el INDEC publicado hasta junio.
   *
   * Mayo→agosto son 3 meses. Julio y agosto no salieron, así que la ventana se
   * corre 2 meses y se usa abril→junio: la inflación de los últimos 3 meses
   * publicados. Ningún número inventado.
   */
  it("resuelve el caso testigo con los últimos 3 meses publicados", () => {
    const r = adjust(520000, "2026-05", "2026-08", serie, { hoy });

    expect(r.metodo.tipo).toBe("ventana_reciente");
    if (r.metodo.tipo !== "ventana_reciente") throw new Error("tipo inesperado");
    expect(r.metodo.mesesDelPeriodo).toBe(3);
    expect(r.metodo.mesesSinPublicar).toEqual(["2026-07", "2026-08"]);

    expect(r.desglose.map((f) => f.punto)).toEqual(["2026-03", "2026-04", "2026-05", "2026-06"]);
    expect(r.desglose.every((f) => !f.esProyeccion)).toBe(true);

    // abril +2,58% · mayo +2,15% · junio +1,89% compuestos.
    expect(r.variacionPct).toBeCloseTo(6.76, 1);
  });

  it("atraviesa la hiperinflación de 1990 sin perder precisión", () => {
    const r = adjust(1, "1990-01", "1990-04", serie, { hoy });
    expect(r.montoAjustado).toBeCloseTo(1.616 * 1.955 * 1.114, 6);
    expect(r.desglose[1]!.varMensualPct).toBeCloseTo(61.6, 6);
  });

  it("el empalme no deja escalón en el borde dic-2016", () => {
    const r = adjust(100, "2016-09", "2017-03", serie, { hoy });
    for (const f of r.desglose.slice(1)) {
      expect(f.varMensualPct!).toBeGreaterThan(0);
      expect(f.varMensualPct!).toBeLessThan(10);
    }
  });

  it("preserva los meses de deflación de la convertibilidad", () => {
    const r = adjust(1000, "1996-01", "1996-12", serie, { hoy });
    expect(r.desglose.slice(1).some((f) => f.varMensualPct! < 0)).toBe(true);
    expect(r.variacionPct).toBeLessThan(0);
  });

  it("todos los puntos del índice son finitos y positivos", () => {
    for (const p of serie.datos) {
      expect(Number.isFinite(p.indice)).toBe(true);
      expect(p.indice).toBeGreaterThan(0);
    }
  });

  it("la serie no tiene huecos y termina en ultimo_oficial", () => {
    const meses = serie.datos.map((p) => p.mes);
    expect(new Set(meses).size).toBe(meses.length);
    expect(meses).toEqual([...meses].sort());
    expect(meses.at(-1)).toBe(serie.ultimo_oficial);
  });
});
