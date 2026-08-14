import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { adjust, motivoParaEstimar, sePuedeEvitarEstimar } from "../src/engine/adjust.js";
import { sumarMeses } from "../src/engine/mes.js";
import {
  agruparParaSelector,
  buscarIndice,
  SLUG_NACIONAL,
  type CatalogoIndices,
  type EntradaCatalogo,
} from "../src/engine/indices.js";
import { fuenteDe, organismoDeFila, selloDeFila } from "../src/ui/etiquetas.js";
import type { SerieIndice } from "../src/engine/types.js";
import { INDICES } from "../scripts/indices-declarados.js";

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

  it("tiene una entrada por cada índice declarado, más el nacional", () => {
    // Todos los demás tests **iteran el catálogo**, así que un catálogo al que se le
    // cayeron cinco provincias los pasa a todos sin una queja: se limita a revisar menos
    // cosas. Este es el único que se entera, y por eso compara contra la lista declarada
    // y no contra un número escrito a mano.
    expect(catalogo.indices.map((i) => i.slug).sort()).toEqual(
      [SLUG_NACIONAL, ...INDICES.map((i) => i.slug)].sort(),
    );
  });

  it("no deja archivos huérfanos en public/data/indices/", () => {
    // El que queda cuando se renombra un slug: sigue en el repo, no lo anuncia nadie y no
    // lo mira ningún test. Es invisible hasta que alguien lo lee creyendo que está vivo.
    const enDisco = readdirSync(resolve(DATOS, "indices"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    expect(enDisco).toEqual(INDICES.map((i) => i.slug).sort());
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
    // `hasta` sale de `serie.ultimo_oficial` y no de un mes fijo: "2026-09" daba por
    // sentado que Córdoba no iba a publicar más allá de agosto. Córdoba ya está en julio
    // al escribir esto — con el literal, dos meses más de publicación y este test deja de
    // tener ninguna fila estimada que revisar, en silencio, en el job diario.
    const hasta = sumarMeses(serie.ultimo_oficial, 2);
    const conEstimacion = adjust(1000, serie.ultimo_oficial, hasta, serie, {
      metodologia: "repite_ultimo",
      hoy: hasta,
    });
    const estimadas = conEstimacion.desglose.filter((f) => f.esProyeccion);
    expect(estimadas.length).toBeGreaterThan(0);
    expect(estimadas.map((f) => selloDeFila(f, conEstimacion))).toEqual(estimadas.map(() => null));
  });
});

describe("la ventana corrida deja de ofrecerse cuando arrastra meses muy distintos", () => {
  /**
   * Series sintéticas, y no la de Neuquén viva, **a propósito**.
   *
   * La primera versión de estos tests pedía "2024-05" → "2026-06" sobre el archivo de
   * Neuquén y daba por sentado que iba a seguir publicado hasta enero de 2026. El día que
   * la DPEyC de Neuquén saque febrero, el desplazamiento baja de cinco meses a cuatro, la
   * ventana deja de tragarse enero de 2024 y el test se pone rojo **sin que nadie haya
   * tocado el código**. Y no se pone rojo en una PR: se pone rojo en el job diario, que
   * corre `verificar` antes de commitear, así que un dato nuevo de Neuquén dejaría de
   * publicar el mes nuevo de los dieciséis índices, el nacional incluido.
   *
   * Con series armadas acá el criterio se prueba entero y el resultado no depende de qué
   * publicó nadie. Abajo queda igual el caso real de Neuquén, pero congelado.
   */
  const sinteticaConAtraso = (variaciones: number[], ultimoOficial: string): SerieIndice => {
    let indice = 100;
    const datos = variaciones.map((v, i) => {
      indice *= 1 + v;
      return {
        mes: `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
        indice,
        origen: "indec",
      };
    });
    return {
      serie: "test",
      base: "2020-01=100",
      fuentes: [],
      ultimo_oficial: ultimoOficial,
      actualizado: "2024-06-01T00:00:00Z",
      datos,
    } as SerieIndice;
  };

  // 44 meses parejos al 2%: de 2020-01 a 2023-08. Pedir hasta 2024-01 corre la ventana
  // cinco meses, que es exactamente el atraso de Neuquén cuando apareció el problema.
  const parejos = Array.from({ length: 44 }, () => 0.02);
  const suave = sinteticaConAtraso(parejos, "2023-08");
  // La misma serie con un solo mes de +60% adentro del tramo que la ventana arrastra.
  const conSalto = sinteticaConAtraso(
    parejos.map((v, i) => (i === 14 ? 0.6 : v)),
    "2023-08",
  );
  const HOY = "2024-06";

  it("sigue ofreciendo «sin estimar» cuando la ventana corrida arrastra meses parecidos", () => {
    // La mitad que importa para no romper lo que funcionaba: el criterio es la distorsión
    // que arrastra la ventana, **no** cuántos meses se corre. Acá se corre cinco meses,
    // igual que en el caso que falla, y tiene que seguir ofreciéndose.
    expect(sePuedeEvitarEstimar("2021-06", "2024-01", suave, HOY)).toBe(true);
    expect(motivoParaEstimar("2021-06", "2024-01", suave, HOY)).toBe(null);
  });

  it("deja de ofrecerlo cuando esos meses no se parecen en nada", () => {
    expect(sePuedeEvitarEstimar("2021-06", "2024-01", conSalto, HOY)).toBe(false);
    expect(motivoParaEstimar("2021-06", "2024-01", conSalto, HOY)).toBe("ventana_sesgada");
  });

  it("el umbral cae justo entre estos dos, y no en cualquier lado de 0,02 a 0,57", () => {
    // `suave` (sesgo ≈ 0) y `conSalto` (sesgo ≈ 0,57) prueban que el criterio distingue
    // "nada" de "muchísimo", pero no dónde está el corte: mutando el umbral, las 273
    // pruebas de entonces pasaban con cualquier valor entre 0,02 y 0,57 — seis veces más
    // laxo de lo que el commit decía. Estos dos saltos —hallados por bisección sobre el
    // mismo caso, en el mismo mes— caen a un lado y otro de la frontera real, que hoy está
    // en 0,122: uno pasa, el otro no, y a ninguno de los dos le sobra margen.
    expect(motivoParaEstimar("2021-06", "2024-01", sinteticaConAtraso(
      parejos.map((v, i) => (i === 14 ? 0.115 : v)),
      "2023-08",
    ), HOY)).toBe(null);
    expect(motivoParaEstimar("2021-06", "2024-01", sinteticaConAtraso(
      parejos.map((v, i) => (i === 14 ? 0.13 : v)),
      "2023-08",
    ), HOY)).toBe("ventana_sesgada");
  });

  it("tampoco lo ofrece deflactando, que es el mismo caso al revés", () => {
    // El guard se anclaba en `desde`, y yendo hacia atrás `desde` es el extremo NUEVO: no
    // tiene dato publicado, así que el guard no podía medir y se daba por vencido. Los
    // meses que la ventana arrastra son siempre los previos al extremo viejo, vaya el
    // cálculo en la dirección que vaya.
    expect(sePuedeEvitarEstimar("2024-01", "2021-06", conSalto, HOY)).toBe(false);
    expect(sePuedeEvitarEstimar("2024-01", "2021-06", suave, HOY)).toBe(true);
  });

  it("y el motor hace lo mismo que dice el desplegable", () => {
    // La regla 4 en su forma más concreta: si el predicado dice que no se puede evitar
    // estimar, pedir «sin estimar» tiene que terminar estimando de verdad.
    const r = adjust(1000, "2021-06", "2024-01", conSalto, {
      metodologia: "sin_proyectar",
      hoy: HOY,
    });
    expect(r.metodo.tipo).toBe("proyeccion");
  });

  it("no bloquea de más un desplazamiento chico, en ninguno de los dieciséis", () => {
    // De punta a punta de cada archivo el desplazamiento YA da cero — `evaluarPeriodo`
    // corta ahí antes de llegar a `sesgoDeLaVentana` — así que ese pedido no ejercita el
    // guard para nada: pasa con cualquier umbral, cualquier serie y cualquier cambio a la
    // fórmula. Acá se pide con un desplazamiento real de 3 meses, anclado al
    // `ultimoOficial` de cada índice y no a una fecha fija, así que no depende de qué
    // publicó nadie hoy. Tres meses corridos sobre un tramo largo es el caso normal —el de
    // Neuquén y Río Negro entre ellos, sin ir a un caso patológico— y un falso positivo acá
    // sería el guard tapando cálculos que no deberían estar tapados.
    // El desplazamiento tiene que ser CHICO y no cualquiera: a 3 meses de cualquier
    // `ultimoOficial` reciente, medio catálogo bloquea de verdad —2023/2024 tuvo el salto
    // real más grande de las series, y arrastrarlo no es un falso positivo, es el caso que
    // el guard existe para atrapar—. Probado y descartado: con `desde` en `primerMes` el
    // mes que se arrastra cae antes del arranque de la serie y el guard no llega a medir
    // nada; con `desde` dos años después de `primerMes`, Chaco y Tucumán caen sobre la
    // hiperinflación de 1989/90, otro bloqueo legítimo. Dos meses de desplazamiento —el
    // borde de `MESES_DE_ATRASO_TOLERADOS`, el atraso que la interfaz todavía no avisa— es
    // el que separa "atraso normal, no bloquea" (acá) de "atraso real, si bloquea" (el
    // caso de Neuquén, de sobra, en el describe de abajo).
    const bloqueados = catalogo.indices
      .filter((i) => i.slug !== "neuquen")
      .filter((i) => {
        const desde = sumarMeses(i.ultimoOficial, -24);
        const hasta = sumarMeses(i.ultimoOficial, 2);
        return !sePuedeEvitarEstimar(desde, hasta, serieDe(i.slug), hasta);
      });
    expect(bloqueados.map((i) => i.slug)).toEqual([]);
  });
});

describe("el caso real que lo destapó, con los datos de Neuquén congelados", () => {
  /**
   * Neuquén tal como estaba cuando apareció el problema: publicado hasta enero de 2026.
   *
   * Se recorta el archivo vivo en vez de leerlo entero para que el test no cambie de
   * sentido cuando Neuquén publique febrero. Los números son los reales —el bug no fue
   * teórico— pero la ventana sobre la que se miden queda fija.
   */
  const vivo = serieDe("neuquen");
  const CONGELADO = "2026-01";
  const neuquen: SerieIndice = {
    ...vivo,
    ultimo_oficial: CONGELADO,
    datos: vivo.datos.filter((p) => p.mes <= CONGELADO),
  };
  const HOY = "2026-08";

  it("el archivo llega al menos hasta el mes congelado", () => {
    // Si el pipeline dejara de traer enero de 2026, el recorte de arriba se quedaría corto
    // y los tres tests de abajo pasarían a medir otra cosa en silencio.
    expect(neuquen.datos.at(-1)!.mes).toBe(CONGELADO);
  });

  it("no ofrece «sin estimar» en el caso que la rompía", () => {
    // Un pedido a junio de 2026 corre la ventana cinco meses hasta diciembre de 2023 y se
    // traga enero de 2024 (+24,50%). Contestaba +238,77% cuando la inflación de Neuquén en
    // el tramo que sí existe fue +90,29%, y lo hacía desde la opción «(recomendado)».
    expect(sePuedeEvitarEstimar("2024-05", "2026-06", neuquen, HOY)).toBe(false);
  });

  it("tampoco deflactando: contestaba −70,48% cuando lo real es −44%", () => {
    expect(sePuedeEvitarEstimar("2026-06", "2024-05", neuquen, HOY)).toBe(false);
  });

  it("estimando da un número de la familia del nacional y no el triple", () => {
    const r = adjust(520000, "2024-05", "2026-06", neuquen, {
      metodologia: "sin_proyectar",
      hoy: HOY,
    });
    expect(r.metodo.tipo).toBe("proyeccion");
    expect(r.montoAjustado).toBeLessThan(1_300_000);
  });
});

describe("las fechas que las preguntas frecuentes dicen a mano", () => {
  // El FAQ de `index.html` —y su copia en el JSON-LD, y dos párrafos de `datos.html`—
  // nombra fechas de arranque: "Chaco en 1988, Santa Fe en diciembre de 2013, las seis
  // regiones en diciembre de 2016". Son texto estático, así que si el arranque de una
  // serie cambia, la página sigue afirmando lo viejo y nadie se entera. Ya pasó adentro de
  // este mismo cambio: el recorte por huecos movió a Mendoza de 1968 a 2016.
  //
  // Este test SÍ tiene que frenar el pipeline si se pone rojo, al revés que los de la
  // ventana corrida. Que un índice publique un mes nuevo es lo normal y no puede bloquear
  // nada; que **cambie dónde arranca** es raro, y mientras no se arregle el texto la
  // página estaría afirmando algo falso.
  const arranque = (slug: string) =>
    catalogo.indices.find((i) => i.slug === slug)?.primerMes ?? "(no está en el catálogo)";
  const anioDe = (slug: string) => arranque(slug).slice(0, 4);

  it("siguen siendo verdad", () => {
    // El nacional y Santa Fe llevan mes en la página ("desde enero de 1990", "Santa Fe en
    // diciembre de 2013") y se comparan al mes. Chaco y Córdoba sólo llevan el año ("Chaco
    // en 1988", "Córdoba arranca en 1990" en `datos.html`) y se comparan sólo al año: si se
    // compararan al mes, bajar el umbral de cifras significativas —el cambio que ya quedó
    // anotado como pendiente— podría mover el arranque de Chaco unos meses adentro de 1988
    // sin volver falso ningún texto, y este test frenaría el pipeline igual.
    expect({
      nacional: arranque(SLUG_NACIONAL),
      santaFe: arranque("santa-fe"),
    }).toEqual({
      nacional: "1990-01",
      santaFe: "2013-12",
    });
    expect({ chaco: anioDe("chaco"), cordoba: anioDe("cordoba") }).toEqual({
      chaco: "1988",
      cordoba: "1990",
    });
  });

  it("y las seis regiones siguen arrancando todas en el mismo mes", () => {
    const regiones = catalogo.indices.filter((i) => i.tipo === "region");
    expect([...new Set(regiones.map((i) => i.primerMes))]).toEqual(["2016-12"]);
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
