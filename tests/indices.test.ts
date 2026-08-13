import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { adjust } from "../src/engine/adjust.js";
import {
  agruparParaSelector,
  buscarIndice,
  SLUG_NACIONAL,
  type CatalogoIndices,
  type EntradaCatalogo,
} from "../src/engine/indices.js";
import { fuenteDe, organismoDeFila, selloDeFila } from "../src/ui/etiquetas.js";
import type { SerieIndice } from "../src/engine/types.js";

const DATOS = resolve(import.meta.dirname, "../public/data");
const leer = <T>(ruta: string): T => JSON.parse(readFileSync(resolve(DATOS, ruta), "utf8")) as T;

const catalogo = leer<CatalogoIndices>("indices.json");
const serieDe = (slug: string): SerieIndice =>
  slug === SLUG_NACIONAL ? leer<SerieIndice>("ipc.json") : leer<SerieIndice>(`indices/${slug}.json`);

/* ------------------------------------------------------------------- catálogo */

describe("buscarIndice", () => {
  it("encuentra un índice por su slug", () => {
    expect(buscarIndice(catalogo, "tucuman").nombre).toBe("Tucumán");
  });

  it("cae al nacional cuando el slug no existe, en vez de romper", () => {
    // Un `?indice=` viejo, mal tipeado o copiado de un fork no puede dejar la página en
    // blanco: se calcula el nacional, que es lo que se habría visto sin el parámetro.
    expect(buscarIndice(catalogo, "atlantida").slug).toBe(SLUG_NACIONAL);
    expect(buscarIndice(catalogo, null).slug).toBe(SLUG_NACIONAL);
  });
});

describe("agruparParaSelector", () => {
  const grupos = agruparParaSelector(catalogo);

  it("saca al nacional de los dos grupos", () => {
    expect(grupos.nacional.slug).toBe(SLUG_NACIONAL);
    expect([...grupos.provincias, ...grupos.regiones].map((i) => i.slug)).not.toContain(
      SLUG_NACIONAL,
    );
  });

  it("ordena por nombre y no por slug", () => {
    // "Ciudad de Buenos Aires" va antes que "Chaco" aunque su slug sea "caba". Ordenar
    // por slug daría una lista cuyo orden nadie puede predecir mirándola.
    const nombres = grupos.provincias.map((i) => i.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, "es-AR")));
    expect(nombres[0]).toBe("Chaco");
    expect(nombres[1]).toBe("Ciudad de Buenos Aires");
  });

  it("ofrece las seis regiones del INDEC", () => {
    // Son las que cubren a las catorce provincias que no miden su propia inflación. Si
    // alguna se cayera del catálogo, esas provincias se quedarían sin ninguna opción.
    expect(grupos.regiones).toHaveLength(6);
  });
});

/* --------------------------------------------------------- los datos publicados */

describe("cada índice del catálogo", () => {
  for (const entrada of catalogo.indices) {
    describe(entrada.nombre, () => {
      const serie = serieDe(entrada.slug);

      it("tiene el archivo que el catálogo anuncia, con el rango que anuncia", () => {
        // El catálogo es lo que puebla el desplegable. Si anuncia un rango que el archivo
        // no tiene, el selector de años ofrece un mes que el motor va a rechazar.
        expect(serie.datos[0]!.mes).toBe(entrada.primerMes);
        expect(serie.ultimo_oficial).toBe(entrada.ultimoOficial);
      });

      it("no tiene huecos: el motor lee los puntos como meses contiguos", () => {
        const ord = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
        const saltos = serie.datos.filter(
          (p, i) => i > 0 && ord(p.mes) - ord(serie.datos[i - 1]!.mes) !== 1,
        );
        expect(saltos.map((p) => p.mes)).toEqual([]);
      });

      it("no trae ningún índice en cero ni truncado", () => {
        // La columna del MCP es numeric(20,6) y un índice encadenado hacia atrás a través
        // de los cambios de moneda entra como cero. Un cero acá es una división por cero
        // en el único cálculo que hace el sitio.
        const malos = serie.datos.filter((p) => !(p.indice >= 0.01) || !Number.isFinite(p.indice));
        expect(malos.map((p) => `${p.mes}=${p.indice}`)).toEqual([]);
      });

      it("declara la fuente de todos sus puntos", () => {
        // Sin esto una fila se pintaría con el sello vacío: el origen del punto no
        // encontraría a quién nombrar entre las fuentes declaradas.
        const ids = new Set(serie.fuentes.map((f) => f.id));
        expect([...new Set(serie.datos.map((p) => p.origen))].filter((o) => !ids.has(o))).toEqual(
          [],
        );
      });

      it("calcula de punta a punta sin tirar", () => {
        const r = adjust(1000, entrada.primerMes, entrada.ultimoOficial, serie, {
          metodologia: "sin_proyectar",
        });
        expect(r.montoAjustado).toBeGreaterThan(1000);
        expect(Number.isFinite(r.variacionPct)).toBe(true);
      });

      it("rechaza el mes anterior al que el catálogo ofrece", () => {
        // La otra punta del mismo criterio: el desplegable no puede ofrecer un año más y
        // el motor tiene que negarse si igual se lo piden.
        const ord = Number(entrada.primerMes.slice(0, 4)) * 12 + Number(entrada.primerMes.slice(5, 7)) - 1;
        const antes = `${Math.floor((ord - 1) / 12)}-${String(((ord - 1) % 12) + 1).padStart(2, "0")}`;
        expect(() => adjust(1000, antes, entrada.ultimoOficial, serie, {})).toThrow();
      });
    });
  }
});

describe("el REM", () => {
  it("existe sólo para el índice nacional", () => {
    // El Relevamiento de Expectativas de Mercado del BCRA pronostica el IPC nacional del
    // INDEC. No hay uno provincial, y sin este test alcanzaría con que el pipeline lo
    // copiara sin querer para que el sitio ofreciera pronosticar Tucumán con él.
    expect(serieDe(SLUG_NACIONAL).rem).toBeDefined();
    for (const entrada of catalogo.indices.filter((i) => i.slug !== SLUG_NACIONAL)) {
      expect(serieDe(entrada.slug).rem, entrada.nombre).toBeUndefined();
    }
  });
});

/* -------------------------------------------------------------- la atribución */

describe("la atribución de un índice jurisdiccional", () => {
  const serie = serieDe("cordoba");
  const r = adjust(1000, "2024-01", "2024-12", serie, { metodologia: "sin_proyectar" });

  it("nombra al organismo de la provincia y nunca al INDEC", () => {
    const f = fuenteDe(r.desglose, r);
    expect(f.corta).toBe("IPC de Córdoba");
    expect(f.publicadosPor).not.toContain("INDEC");
  });

  it("sella cada fila con la sigla de esa provincia", () => {
    expect(selloDeFila(r.desglose[1]!, r)).toBe("DGEyC Córdoba");
    expect(organismoDeFila(r.desglose[1]!, r)).toBe("DGEyC Córdoba");
  });

  it("no sella las filas estimadas", () => {
    const conEstimacion = adjust(1000, "2026-01", "2026-09", serie, {
      metodologia: "repite_ultimo",
    });
    const estimadas = conEstimacion.desglose.filter((f) => f.esProyeccion);
    expect(estimadas.length).toBeGreaterThan(0);
    expect(estimadas.map((f) => selloDeFila(f, conEstimacion))).toEqual(estimadas.map(() => null));
  });
});

describe("una región del INDEC", () => {
  it("se declara como región y dice a quién cubre, sin prometer ser el índice de nadie", () => {
    // Es la mitad que se olvida de la regla 2: no prometer dato oficial donde no lo hay.
    // Alguien de Formosa que elige "Noreste" tiene que poder leer que eso no es el IPC de
    // Formosa antes de mandarle el número a otra persona.
    const nea = catalogo.indices.find((i) => i.slug === "noreste") as EntradaCatalogo;
    expect(nea.tipo).toBe("region");
    expect(nea.cubre).toContain("Formosa");
    expect(nea.cubre).toContain("No es el índice de ninguna de ellas");
  });
});
