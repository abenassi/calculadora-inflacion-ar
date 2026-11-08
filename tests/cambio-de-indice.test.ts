import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { adjust, hayMesesSinPublicar } from "../src/engine/adjust.js";
import {
  acotarPunto,
  indicesQueCubren,
  periodoAIntentar,
  SLUG_NACIONAL,
  tocaLaSalvedad,
  type CatalogoIndices,
} from "../src/engine/indices.js";
import { comoSujeto } from "../src/engine/sujeto.js";
import { quienPublicaAhora } from "../src/ui/etiquetas.js";
import type { SerieIndice } from "../src/engine/types.js";

// Los cuatro detalles que vio la revisora-usuaria con
// `/?monto=100000&desde=1965-01&hasta=2026-06` antes del arreglo de Chaco.

const DATOS = resolve(import.meta.dirname, "../public/data");
const leer = <T>(ruta: string): T => JSON.parse(readFileSync(resolve(DATOS, ruta), "utf8")) as T;
const catalogo = leer<CatalogoIndices>("indices.json");
const serieDe = (slug: string): SerieIndice =>
  slug === SLUG_NACIONAL ? leer<SerieIndice>("ipc.json") : leer<SerieIndice>(`indices/${slug}.json`);
const chaco = catalogo.indices.find((i) => i.slug === "chaco")!;

describe("volver al mes pedido cuando el índice nuevo sí llega", () => {
  // El formulario sólo guardaba el mes corrido: con el nacional, 1965-01 quedaba en 1990-01
  // y al elegir Chaco el cálculo seguía en 1990 aunque Chaco llega a 1965.
  const corrido = { punta: "desde" as const, pedido: "1965-01", contra: "primero" as const };

  it("devuelve el pedido por encima de lo que muestra el formulario", () => {
    expect(periodoAIntentar({ desde: "1990-01", hasta: "2026-06" }, [corrido])).toEqual({
      desde: "1965-01",
      hasta: "2026-06",
    });
  });

  it("sin nada corrido deja el formulario como está", () => {
    expect(periodoAIntentar({ desde: "1990-01", hasta: "2026-06" }, [])).toEqual({
      desde: "1990-01",
      hasta: "2026-06",
    });
  });

  it("no mezcla un pedido por mes con un formulario por día", () => {
    // Si la persona pasó a fechas exactas después del corrido, el pedido por mes no aplica.
    expect(periodoAIntentar({ desde: "1990-01-15", hasta: "2026-06-01" }, [corrido])).toEqual({
      desde: "1990-01-15",
      hasta: "2026-06-01",
    });
  });

  it("con Chaco, 1965-01 entra entero y el cálculo sale de 1965", () => {
    const periodo = periodoAIntentar({ desde: "1990-01", hasta: "2026-06" }, [corrido]);
    const r = adjust(100000, periodo.desde, periodo.hasta, serieDe("chaco"), {});
    expect(r.desde).toBe("1965-01");
  });
});

describe("el aviso del corrido nombra quién cubre el mes pedido", () => {
  it("1965-01 sólo lo cubre Chaco (Córdoba y Tucumán arrancan en 1968)", () => {
    expect(indicesQueCubren(catalogo, "1965-01", SLUG_NACIONAL).map((i) => i.slug)).toEqual([
      "chaco",
    ]);
  });

  it("no se nombra a sí mismo", () => {
    expect(indicesQueCubren(catalogo, "1965-01", "chaco")).toEqual([]);
  });

  it("1970-01 lo cubren Chaco, Córdoba y Tucumán, en el orden del desplegable", () => {
    expect(indicesQueCubren(catalogo, "1970-01", SLUG_NACIONAL).map((i) => i.slug)).toEqual([
      "chaco",
      "cordoba",
      "tucuman",
    ]);
  });

  it("por día hace falta el mes anterior: el 1 de enero de 1968 no lo cubre Córdoba", () => {
    // Una fecha exacta interpola entre el índice de su mes y el del anterior.
    expect(indicesQueCubren(catalogo, "1968-01-01", SLUG_NACIONAL).map((i) => i.slug)).toEqual([
      "chaco",
    ]);
  });
});

describe("lo que el aviso sugiere es lo que el acotado deja pasar", () => {
  // Las dos cuentas medían el piso distinto: el aviso exigía el mes anterior de una fecha
  // y el acotado no. Con el 15 de enero de 1968 el aviso sugería sólo Chaco, pero al elegir
  // Córdoba el formulario volvía a 1968-01-15 y el motor lo rechazaba.
  const pedidos = ["1960-01", "1960-01-15", "1960-02-01", "1965-01", "1968-01", "1968-01-15", "1990-01", "1990-01-01"];
  for (const pedido of pedidos) {
    it(`${pedido}: los índices sugeridos lo dejan intacto, y los demás lo corren`, () => {
      const sugeridos = new Set(indicesQueCubren(catalogo, pedido, "ninguno").map((i) => i.slug));
      for (const entrada of catalogo.indices) {
        const { escribir, contra } = acotarPunto(pedido, serieDe(entrada.slug), pedido.length === 10);
        if (sugeridos.has(entrada.slug)) {
          expect({ slug: entrada.slug, escribir, contra }).toEqual({ slug: entrada.slug, escribir: pedido, contra: null });
        } else {
          expect({ slug: entrada.slug, contra }).toEqual({ slug: entrada.slug, contra: "primero" });
        }
      }
    });
  }

  it("por día, lo corrido se puede calcular: el nacional va al 1 de febrero de 1990", () => {
    const nacional = serieDe(SLUG_NACIONAL);
    const { escribir } = acotarPunto("1965-03-15", nacional, true);
    expect(escribir).toBe("1990-02-01");
    expect(() => adjust(1000, escribir, "2026-06-01", nacional, {})).not.toThrow();
  });

  it("y Córdoba con el 15 de enero de 1968 va al 1 de febrero, que calcula", () => {
    const cordoba = serieDe("cordoba");
    const { escribir } = acotarPunto("1968-01-15", cordoba, true);
    expect(escribir).toBe("1968-02-01");
    expect(() => adjust(1000, escribir, "2026-06-01", cordoba, {})).not.toThrow();
  });
});

describe("una aposición de sujeto cierra con coma", () => {
  it("«el IDECBA, la dirección de estadística de la Ciudad,» todavía no publicó", () => {
    expect(comoSujeto("el IDECBA, la dirección de estadística de la Ciudad")).toBe(
      "el IDECBA, la dirección de estadística de la Ciudad,",
    );
  });

  it("sin aposición no agrega nada", () => {
    expect(comoSujeto("el INDEC")).toBe("el INDEC");
  });

  it("la etiqueta de CABA sale con la coma", () => {
    expect(quienPublicaAhora(serieDe("caba"))).toBe(
      "el IDECBA, la dirección de estadística de la Ciudad,",
    );
  });
});

describe("el bloque de meses sin publicar", () => {
  const caba = serieDe("caba");
  const ultimo = catalogo.indices.find((i) => i.slug === "caba")!.ultimoOficial;

  it("no aparece si el período ya está publicado entero", () => {
    expect(hayMesesSinPublicar("2020-01", ultimo, caba)).toBe(false);
  });

  it("aparece si el período termina en un mes que la fuente todavía no publicó", () => {
    const neuquen = serieDe("neuquen");
    const ultimoNeuquen = catalogo.indices.find((i) => i.slug === "neuquen")!.ultimoOficial;
    const despues = `${Number(ultimoNeuquen.slice(0, 4)) + 1}${ultimoNeuquen.slice(4)}`;
    expect(hayMesesSinPublicar("2020-01", despues, neuquen, despues)).toBe(true);
  });
});

describe("la salvedad de Chaco 1960-1988", () => {
  it("la lleva el catálogo publicado", () => {
    expect(chaco.salvedad?.hasta).toBe("1988-12");
  });

  it("se muestra si el período toca esos años, por cualquier punta", () => {
    expect(tocaLaSalvedad(chaco, "1965-01", "2026-06")).toBe(true);
    expect(tocaLaSalvedad(chaco, "2026-06", "1988-12")).toBe(true);
    expect(tocaLaSalvedad(chaco, "1988-12-31", "2000-01-01")).toBe(true);
  });

  it("no se muestra de 1989 en adelante, ni en un índice sin salvedad", () => {
    expect(tocaLaSalvedad(chaco, "1989-01", "2026-06")).toBe(false);
    expect(tocaLaSalvedad({}, "1965-01", "2026-06")).toBe(false);
  });
});
