/**
 * Genera las páginas por año que se publican junto con la calculadora.
 *
 * POR QUÉ EXISTEN
 *
 * La calculadora contesta una pregunta que hay que saber formular: "cuánto es tal
 * monto de tal fecha en tal otra". Pero lo que la gente escribe en Google es más
 * chato: "inflación 2024 argentina", "inflación acumulada 2002", "cuánto fue la
 * inflación de 2016". Ese tráfico no lo captura un formulario, porque el formulario
 * está vacío hasta que alguien lo completa: para un buscador, la home es un puñado
 * de `<select>` sin contenido. Cada página de año, en cambio, es una respuesta
 * escrita a una pregunta concreta, y desde ahí se entra a la calculadora.
 *
 * CÓMO NO SE CONTRADICEN CON LA CALCULADORA
 *
 * Los números salen de `resumenAnual()`, que por dentro llama al mismo `adjust()`
 * que responde el formulario. Si alguien lee "la inflación de 2024 fue 117,76%" y va
 * a comprobarlo, ve 117,76%. No hay una segunda aritmética que mantener sincronizada.
 * La atribución de fuente sale de `fuenteDe()`, que también comparte con la
 * calculadora: si la tabla sella `BCRA ✓`, ningún texto de ninguna de las dos puede
 * decir INDEC.
 *
 * Y no hay ni un número estimado: todas las páginas terminan en el último mes que
 * publicó el INDEC. La proyección es una decisión que toma quien usa la calculadora,
 * no algo que se deje escrito en una página que Google va a cachear por meses.
 *
 * CUÁNDO CORRE
 *
 * Después de `vite build`, sobre `dist/`. El Action de deploy reconstruye en cada
 * push a `main`, y el Action del snapshot commitea los datos nuevos: o sea que las
 * páginas se regeneran solas el día que el INDEC publica.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { adjust } from "../src/engine/adjust.js";
import { aniosDisponibles, resumenAnual, type ResumenAnual } from "../src/engine/anual.js";
import { compararMeses, mesConAnio, mesDe, soloMes } from "../src/engine/mes.js";
import type { Fila, Mes, SerieIndice } from "../src/engine/types.js";
import { fuenteDe } from "../src/ui/etiquetas.js";
import {
  comoSeMuestra,
  indice as fIndice,
  pesosRedondo,
  porcentaje,
  seVenDistintos,
} from "../src/ui/format.js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(RAIZ, "dist");

/** Dominio propio del sitio. Las URLs absolutas (canonical, OG, sitemap) tienen que serlo. */
const SITIO = "https://inflacion.mymcps.dev";

/** Monto de ejemplo del bloque "cuánto vale hoy". Redondo a propósito: se lee de un vistazo. */
const MONTO_EJEMPLO = 100_000;

/**
 * Primer año en el que la moneda ya es el peso.
 *
 * El peso convertible reemplaza al austral el 1 de enero de 1992, a razón de 1 peso =
 * 10.000 australes (Ley 23.928). El índice de precios es continuo a través de esa
 * redenominación —mide precios, no billetes— pero **los montos no lo son**: escribir
 * "$100.000 de enero de 1990" pone un signo peso sobre una cantidad que en esa fecha
 * era de australes, y el resultado queda cuatro órdenes de magnitud fuera de escala.
 * Por eso el bloque de equivalencia no se dibuja para años anteriores.
 */
const PRIMER_ANIO_EN_PESOS = 1992;

/**
 * Años del IPC oficial intervenido.
 *
 * Entre 2007 y 2015 el INDEC estuvo intervenido, y en 2016 el Poder Ejecutivo declaró
 * por Decreto 55/2016 la emergencia administrativa del Sistema Estadístico Nacional.
 * Los números de esos años son los que publica la serie oficial —y son los que usa la
 * calculadora, porque son los que existen— pero están cuestionados y en general se los
 * considera por debajo de la inflación real.
 *
 * Una página que titula "la inflación de 2011 fue 9,16%" y no dice esto le está
 * mintiendo a alguien que probablemente vivió ese año. Es exactamente el modo de
 * falla que el sitio existe para no cometer: dar un número que no se puede defender.
 */
const INTERVENIDOS = { desde: 2007, hasta: 2015 };

/** El año del apagón estadístico: enero a mayo de 2016 no tienen IPC nacional del INDEC. */
const APAGON = 2016;

/* ------------------------------------------------------------------- helpers */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ESCAPES[c]!);
}

/**
 * Porcentaje sin el `+`: en un titular el signo positivo es ruido.
 *
 * Acá había además una guarda contra el cero negativo, porque `porcentaje(-0.004)`
 * imprimía `-0,00%` —"los precios bajaron un menos cero por ciento"—, que fue lo que la
 * revisora leyó tres veces en la página de 1996 antes de preguntar qué significaba. Ya no
 * hace falta: el colapso vive adentro de `porcentaje()`, o sea que vale también para la
 * calculadora, que tenía el mismo problema y ninguna guarda.
 */
function pct(n: number): string {
  return porcentaje(n, false);
}

/**
 * El porcentaje de una frase que ya trae el verbo con el signo adentro.
 *
 * "los precios bajaron un -1,89%" es una doble negación que aparecía en las cuatro
 * páginas de años con deflación. Si el verbo dice "bajaron", el número va en positivo.
 */
function pctSinSigno(n: number): string {
  return pct(Math.abs(n));
}

/** El mes de una fila del desglose. En estas páginas los puntos siempre son meses. */
function mesDeFila(f: Fila): Mes {
  return mesDe(String(f.punto));
}

/**
 * La nota que acompaña al promedio mensual: la cuenta que lo vuelve comprobable.
 *
 * Con la inflación en cero esa cuenta no cierra: 1996 muestra un promedio de 0,00% y el
 * año dio −0,01%, así que "repetido 12 meses da −0,01%" invita a una verificación que
 * falla. Cuando el promedio se imprime como cero, la nota dice el dato del año en vez de
 * proponer una multiplicación imposible.
 */
function notaDelPromedio(r: ResumenAnual, cifra: string): string {
  if (comoSeMuestra(r.promedioMensualPct) === 0) return `el año entero dio ${cifra}`;
  const n = r.conVariacion.length;
  return `repetido ${n} ${n === 1 ? "mes" : "meses"} da ${cifra}`;
}

/** "marzo", "marzo y abril", "marzo y 4 meses más". Para los empates de los extremos. */
function nombrarEmpate(filas: Fila[]): string {
  const meses = filas.map((f) => soloMes(mesDeFila(f)));
  if (meses.length === 1) return meses[0]!;
  if (meses.length === 2) return `${meses[0]} y ${meses[1]}`;
  return `${meses[0]} y ${meses.length - 1} meses más`;
}

/* --------------------------------------------------------- assets del build */

type Assets = { css: string[]; js: string };

/**
 * Saca del manifest de Vite los nombres con hash que las páginas tienen que enlazar.
 *
 * Se lee el manifest y no se adivinan los nombres porque el hash cambia en cada build.
 * Y se leen **las hojas que declara el entry**, respetando su orden, en vez de juntar
 * todos los `.css` del manifest: juntarlos obligaba a ordenarlos por nombre, o sea por
 * hash, o sea por contenido. Con una sola hoja daba igual; con dos, el orden en que se
 * cargan cambiaría solo al editar cualquiera de las dos, y dos reglas que se pisan
 * renderizarían distinto entre builds sin que nadie toque el CSS.
 *
 * Que el entry declare la hoja es lo que hace que esto funcione: `src/ui/paginas.ts`
 * importa `styles.css` a propósito, para que la dependencia esté declarada y no sea
 * incidental.
 */
const ENTRY = "src/ui/paginas.ts";

type EntradaManifest = { file?: string; css?: string[]; imports?: string[] };

function leerAssets(): Assets {
  const manifest = JSON.parse(
    readFileSync(resolve(DIST, ".vite/manifest.json"), "utf8"),
  ) as Record<string, EntradaManifest>;

  const entry = manifest[ENTRY];
  if (!entry?.file) {
    throw new Error(`El manifest no trae \`${ENTRY}\`. ¿Se sacó el entry de vite.config.ts?`);
  }

  /*
   * Se recorre el grafo de imports del entry, en profundidad y en el orden declarado,
   * que es lo mismo que hace Vite para inyectar los `<link>` en un HTML propio. No
   * alcanza con mirar `entry.css`: Rollup puede mover la hoja al chunk compartido que
   * el entry importa —hoy la tiene `_mes-*.js`— y ahí el entry queda sin `css` propio.
   */
  const css: string[] = [];
  const vistos = new Set<string>();
  (function recorrer(clave: string): void {
    if (vistos.has(clave)) return;
    vistos.add(clave);
    const nodo = manifest[clave];
    if (!nodo) return;
    for (const dep of nodo.imports ?? []) recorrer(dep);
    for (const hoja of nodo.css ?? []) if (!css.includes(hoja)) css.push(hoja);
  })(ENTRY);

  if (css.length === 0) {
    throw new Error(
      `El grafo de \`${ENTRY}\` no declara ninguna hoja de estilos. ` +
        '¿Se sacó el `import "../styles.css"`?',
    );
  }

  return { css, js: entry.file };
}

/* ------------------------------------------------------------------ plantilla */

type Pagina = {
  /** Ruta del sitio, con las dos barras: `/inflacion-2024/`. */
  ruta: string;
  title: string;
  description: string;
  h1: string;
  bajada: string;
  /** Migas de pan, sin incluir la página actual. */
  migas: { nombre: string; ruta: string }[];
  /** El nodo de schema.org que describe la página. La plantilla le suma las migas. */
  jsonLd: Record<string, unknown>;
  cuerpo: string;
};

/**
 * El armazón HTML compartido.
 *
 * Las páginas generadas viven un nivel abajo de la raíz (`/inflacion-2024/`), así que
 * todo lo relativo lleva `../`. Es la misma razón por la que `vite.config.ts` usa
 * `base: "./"`: el sitio tiene que servirse igual desde el dominio propio y desde el
 * subpath de github.io, y una ruta absoluta rompería el segundo.
 */
function plantilla(p: Pagina, assets: Assets, serie: SerieIndice): string {
  const hojas = assets.css
    .map((h) => `    <link rel="stylesheet" href="../${h}" />`)
    .join("\n");

  const migas = [...p.migas, { nombre: p.h1, ruta: p.ruta }];
  const rastro = migas
    .map((m, i) =>
      i === migas.length - 1
        ? `<span aria-current="page">${esc(m.nombre)}</span>`
        : `<a href="..${m.ruta}">${esc(m.nombre)}</a>`,
    )
    .join(' <span aria-hidden="true">›</span> ');

  /*
   * Las migas van en el mismo `@graph` que el nodo de la página: separadas en dos
   * `<script>` funcionan igual, pero así queda un solo bloque que revisar cuando
   * algo no valida.
   */
  const jsonLd = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        p.jsonLd,
        {
          "@type": "BreadcrumbList",
          itemListElement: migas.map((m, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: m.nombre,
            item: `${SITIO}${m.ruta}`,
          })),
        },
      ],
    },
    null,
    2,
  );

  return `<!doctype html>
<html lang="es-AR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(p.title)}</title>
    <meta name="description" content="${esc(p.description)}" />
    <link rel="canonical" href="${SITIO}${p.ruta}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Calculadora de inflación de Argentina" />
    <meta property="og:locale" content="es_AR" />
    <meta property="og:url" content="${SITIO}${p.ruta}" />
    <meta property="og:title" content="${esc(p.title)}" />
    <meta property="og:description" content="${esc(p.description)}" />
    <meta property="og:image" content="${SITIO}/img/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Calculadora de inflación de Argentina" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(p.title)}" />
    <meta name="twitter:description" content="${esc(p.description)}" />
    <meta name="twitter:image" content="${SITIO}/img/og.png" />
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
${hojas}
    <script type="application/ld+json">
${jsonLd}
    </script>
  </head>
  <body>
    <header class="cabecera">
      <div class="contenido">
        <nav class="migas" aria-label="Ruta">${rastro}</nav>
        <h1>${esc(p.h1)}</h1>
        <p class="bajada">${p.bajada}</p>
      </div>
    </header>

    <main class="contenido">
${p.cuerpo}
    </main>

    <footer class="pie">
      <div class="contenido">
        <p>
          Cálculo orientativo basado en índices oficiales de precios: el IPC del INDEC y, para lo
          anterior a diciembre de 2016, la serie de inflación mensual del BCRA. No constituye
          asesoramiento contable, financiero ni legal.
        </p>
        <p>
          Datos vía <a href="https://argentinadata.mymcps.dev" rel="noopener">Argentina Data MCP</a>
          · último dato oficial: ${esc(mesConAnio(serie.ultimo_oficial))} ·
          <a href="../datos.html">Fuentes y metodología</a> ·
          <a href="https://github.com/abenassi/calculadora-inflacion-ar" rel="noopener">Código en GitHub</a>
        </p>
      </div>
    </footer>

    <script type="module" src="../${assets.js}"></script>
  </body>
</html>
`;
}

/* -------------------------------------------------------------- página de año */

/**
 * El sello de origen de una fila, igual que en la tabla de la calculadora.
 *
 * Corta con un origen que no conozca en vez de sellarlo como BCRA por descarte: un
 * tercer origen apareciendo en el snapshot se publicaría con la atribución equivocada
 * en las 36 páginas, que es peor que no publicar. Y el valor va escapado porque acá el
 * dato entra al markup como texto: la calculadora se protege armando nodos del DOM
 * (regla 9), y ese camino no existe cuando el HTML se escribe a un archivo.
 */
function sello(f: Fila): string {
  if (f.origen !== "indec" && f.origen !== "bcra") {
    throw new Error(
      `Origen desconocido en ${String(f.punto)}: "${f.origen}". ` +
        "El generador sólo sabe sellar datos publicados por INDEC o BCRA.",
    );
  }
  const texto = f.origen === "indec" ? "INDEC ✓" : "BCRA ✓";
  return `<span class="origen origen--${esc(f.origen)}">${texto}</span>`;
}

function tablaDelAnio(r: ResumenAnual, fuenteLarga: string): string {
  const filas = r.filas
    .map((f) => {
      const sub = f.varMensualPct === null ? "—" : porcentaje(f.varMensualPct);
      const acum = f.acumuladoPct === null ? "—" : porcentaje(f.acumuladoPct);
      return `            <tr>
              <th scope="row">${esc(soloMes(mesDeFila(f)))}</th>
              <td>${esc(sub)}</td>
              <td>${esc(acum)}</td>
              <td class="col-tecnica">${esc(fIndice(f.indice))}</td>
              <td>${sello(f)}</td>
            </tr>`;
    })
    .join("\n");

  return `        <div class="tabla-scroll">
          <table class="desglose">
            <caption class="sr-solo">Inflación mensual de ${r.anio}, según ${esc(fuenteLarga)}</caption>
            <thead>
              <tr>
                <th scope="col">Mes</th>
                <th scope="col">Subió</th>
                <th scope="col">Acumulado</th>
                <th scope="col" class="col-tecnica">Índice IPC</th>
                <th scope="col">Origen</th>
              </tr>
            </thead>
            <tbody>
${filas}
            </tbody>
          </table>
        </div>`;
}

/** Cómo se llama el número protagonista. De acá depende no prometer lo que no hay. */
function rotuloDelNumero(r: ResumenAnual): string {
  return r.completo
    ? `Inflación de ${r.anio}, de diciembre a diciembre`
    : `Inflación acumulada de ${r.anio}, hasta ${soloMes(r.hasta)}`;
}

/**
 * Los avisos que van pegados al número, antes de las cifras y de la tabla.
 *
 * Van arriba y no al pie porque quien llega de Google lee el número grande y se va.
 * Una salvedad que aparece después de doce filas de tabla, para esa persona, no existe.
 */
function avisosDelAnio(anio: number): string {
  const bloques: string[] = [];

  if (anio >= INTERVENIDOS.desde && anio <= INTERVENIDOS.hasta) {
    bloques.push(`
      <section class="tarjeta aviso-serie">
        <h2>Sobre el dato oficial de ${anio}</h2>
        <p>
          El INDEC estuvo intervenido entre 2007 y 2015, y en 2016 el Poder Ejecutivo declaró por
          Decreto 55/2016 la emergencia administrativa del Sistema Estadístico Nacional. El número
          de esta página es el que publica la serie oficial —es el que existe y es el que usa la
          calculadora— pero está cuestionado: en general se lo considera bastante por debajo de la
          inflación que se vivió esos años.
        </p>
        <p>
          En la tabla de abajo cada mes dice <strong>BCRA ✓</strong>. El tilde significa que es un
          dato publicado y no una cuenta nuestra, y eso es cierto: acá nadie estimó nada. Lo que
          está en discusión es el número que se publicó, no quién lo publicó. Y el BCRA no es una
          fuente alternativa al INDEC: republica en su serie mensual el mismo IPC que el INDEC
          publicaba.
        </p>
        <p>
          Lo decimos acá y no en letra chica porque el sitio existe para dar un número que puedas
          defender ante otra persona, y este es un número que te van a discutir. Si lo necesitás
          para algo que se firma, contá de dónde sale.
        </p>
      </section>`);
  }

  if (anio === APAGON) {
    bloques.push(`
      <section class="tarjeta aviso-serie">
        <h2>Sobre el dato oficial de ${APAGON}</h2>
        <p>
          ${APAGON} es un año partido. Entre enero y mayo <strong>no hubo IPC nacional del
          INDEC</strong>: fue el apagón estadístico que siguió al Decreto 55/2016, y el índice
          nuevo empezó a publicarse a mitad de año. La serie mensual del BCRA sí trae valores para
          esos meses y son los que usa esta página, pero no declara de dónde los toma, así que ese
          tramo hay que leerlo con más cuidado que el resto.
        </p>
        <p>
          Es además el año donde se empalman las dos fuentes del sitio: diciembre de ${APAGON} es
          el ancla del índice del INDEC, y todo lo anterior está reconstruido hacia atrás con las
          variaciones del BCRA. Por eso once filas dicen BCRA y una dice INDEC. El detalle está en
          <a href="../datos.html">fuentes y metodología</a>.
        </p>
      </section>`);
  }

  return bloques.join("\n");
}

function paginaAnio(
  serie: SerieIndice,
  r: ResumenAnual,
  vecinos: { anterior: number | null; siguiente: number | null },
): Pagina {
  const ruta = `/inflacion-${r.anio}/`;
  const subioOBajo = r.variacionPct >= 0 ? "subieron" : "bajaron";
  const cifra = pct(r.variacionPct);
  const fuente = fuenteDe(r.filas);

  /*
   * Dos titulares distintos porque son dos cosas distintas: un año completo tiene
   * inflación anual y el año en curso tiene un acumulado parcial. El sufijo con la
   * fuente va sólo si el año tiene filas del INDEC y si entra bajo los ~60 caracteres
   * que Google muestra sin cortar; si no, el título ya dice bastante sin él.
   */
  const titular = r.completo
    ? `Inflación de ${r.anio} en Argentina: ${cifra} anual`
    : `Inflación de ${r.anio} en Argentina: ${cifra} hasta ${soloMes(r.hasta)}`;
  const sufijo = " · IPC del INDEC";
  const title =
    fuente.hayIndec && titular.length + sufijo.length <= 60 ? `${titular}${sufijo}` : titular;

  /*
   * En los años intervenidos la salvedad viaja en la propia description, no sólo en la
   * página: el resultado de Google es lo único que mucha gente va a leer, y ahí "la
   * inflación de 2011 fue 9,16%" sin más es un titular que no se sostiene.
   */
  const salvedad =
    r.anio >= INTERVENIDOS.desde && r.anio <= INTERVENIDOS.hasta
      ? " Es el dato oficial de los años del INDEC intervenido, que está cuestionado."
      : r.anio === APAGON
        ? " Entre enero y mayo de 2016 no hubo IPC nacional del INDEC."
        : "";

  const description = r.completo
    ? `La inflación de ${r.anio} en Argentina fue del ${cifra}, medida de diciembre a diciembre. Mes a mes, con el promedio mensual y el mes más alto.${salvedad} Fuente: ${fuente.corta}.`
    : `Inflación acumulada de ${r.anio} en Argentina: ${cifra} hasta ${mesConAnio(r.hasta)}, el último mes publicado. Mes a mes, sin ningún dato estimado. Fuente: ${fuente.corta}.`;

  /*
   * El puente a la calculadora. Va de enero del año al último mes publicado: es
   * "cuánto vale hoy la plata de ese año", que es la pregunta que trae a la gente.
   * Todo el tramo está publicado, así que no hay ni un número estimado.
   *
   * No se dibuja para los años del austral (ver `PRIMER_ANIO_EN_PESOS`) ni cuando el
   * tramo tendría largo cero, que pasa en enero de cada año hasta que sale el primer
   * dato: en los dos casos el bloque desaparece en vez de mostrar algo defendible a
   * medias.
   */
  const origenEjemplo: Mes = `${r.anio}-01`;
  const equivalencia =
    r.anio >= PRIMER_ANIO_EN_PESOS && compararMeses(origenEjemplo, serie.ultimo_oficial) < 0
      ? adjust(MONTO_EJEMPLO, origenEjemplo, serie.ultimo_oficial, serie, {
          metodologia: "sin_proyectar",
        })
      : null;

  const bloqueEquivalencia =
    equivalencia === null
      ? ""
      : `
      <section class="tarjeta panel">
        <div class="panel__cabecera">
          <h2>¿Cuánto vale hoy la plata de ${r.anio}?</h2>
        </div>
        <p class="equivalencia">
          <strong>${esc(pesosRedondo(MONTO_EJEMPLO))}</strong> de ${esc(mesConAnio(origenEjemplo))}
          compran lo mismo que <strong>${esc(pesosRedondo(equivalencia.montoAjustado))}</strong> de
          ${esc(mesConAnio(serie.ultimo_oficial))}, el último mes que publicó el INDEC. Los precios
          ${esc(equivalencia.variacionPct >= 0 ? "subieron" : "bajaron")} un
          ${esc(pctSinSigno(equivalencia.variacionPct))} en ese tramo.
        </p>
        <p>
          <a
            class="boton-enlace"
            href="../?monto=${MONTO_EJEMPLO}&amp;desde=${origenEjemplo}&amp;hasta=${serie.ultimo_oficial}"
            >Probarlo con tu monto y tus fechas</a
          >
        </p>
      </section>`;

  const navVecinos = [
    vecinos.anterior === null
      ? ""
      : `<a href="../inflacion-${vecinos.anterior}/" rel="prev">← Inflación de ${vecinos.anterior}</a>`,
    `<a href="../inflacion-por-anio/">Todos los años</a>`,
    vecinos.siguiente === null
      ? ""
      : `<a href="../inflacion-${vecinos.siguiente}/" rel="next">Inflación de ${vecinos.siguiente} →</a>`,
  ]
    .filter(Boolean)
    .join("\n        ");

  const notaAnioEnCurso = r.completo
    ? ""
    : `
        <p class="pie-tabla">
          ${r.anio} todavía está en curso: la tabla llega hasta ${esc(mesConAnio(r.hasta))}, el
          último mes que publicó el INDEC. Acá no hay ningún mes estimado. Si necesitás una
          proyección de los meses que faltan, elegila vos en
          <a href="../">la calculadora</a>.
        </p>`;

  /*
   * La nota del interés compuesto, con los dos números en vez de un adjetivo.
   *
   * Antes decía "el acumulado siempre da un poco más que la suma". En 2024 la suma da
   * 81,94% contra 117,76%: llamar "un poco" a 36 puntos pierde a la persona justo
   * cuando estaba comprobando. Y en los años con meses negativos el acumulado queda
   * por DEBAJO de la suma, así que la palabra "siempre" era directamente falsa.
   */
  const suma = pct(r.sumaDeVariacionesPct);
  const notaCompuesto = !seVenDistintos(r.sumaDeVariacionesPct, r.variacionPct)
    ? "" // Contraponer dos cifras que se imprimen igual no explica nada.
    : `
        <p class="pie-tabla">
          <strong>Si sumás la columna «Subió» te va a dar ${esc(suma)}, no ${esc(cifra)}.</strong>
          No es un error de la tabla: los porcentajes mensuales no se suman entre sí, porque cada
          mes se aplica sobre el nivel de precios que dejó el anterior. El número que vale es el
          acumulado, ${esc(cifra)}, y es el mismo que da la calculadora.
        </p>`;

  const bloqueExtremos =
    r.conVariacion.length < 2
      ? ""
      : `
        <li>
          <span class="datos-clave__rotulo">Mes más alto</span>
          <span class="datos-clave__valor">${esc(pct(r.mesesMasAltos[0]!.varMensualPct!))}</span>
          <span class="datos-clave__nota">${esc(nombrarEmpate(r.mesesMasAltos))}</span>
        </li>
        <li>
          <span class="datos-clave__rotulo">Mes más bajo</span>
          <span class="datos-clave__valor">${esc(pct(r.mesesMasBajos[0]!.varMensualPct!))}</span>
          <span class="datos-clave__nota">${esc(nombrarEmpate(r.mesesMasBajos))}</span>
        </li>`;

  const jsonLd = {
    "@type": "Dataset",
    name: `Inflación mensual de Argentina en ${r.anio} (IPC)`,
    description,
    url: `${SITIO}${ruta}`,
    inLanguage: "es-AR",
    temporalCoverage: `${mesDeFila(r.filas[0]!)}/${r.hasta}`,
    spatialCoverage: { "@type": "Place", name: "Argentina" },
    // El "IPC Nivel General Nacional" no existía antes de diciembre de 2016: para los
    // años reconstruidos lo que se mide es la variación mensual de precios al consumidor.
    variableMeasured: fuente.hayIndec
      ? "Índice de Precios al Consumidor, Nivel General Nacional"
      : "Variación mensual de precios al consumidor",
    isAccessibleForFree: true,
    creator: [
      ...(fuente.hayIndec
        ? [
            {
              "@type": "GovernmentOrganization",
              name: "Instituto Nacional de Estadística y Censos (INDEC)",
              url: "https://www.indec.gob.ar/",
            },
          ]
        : []),
      ...(fuente.hayBcra
        ? [
            {
              "@type": "GovernmentOrganization",
              name: "Banco Central de la República Argentina (BCRA)",
              url: "https://www.bcra.gob.ar/",
            },
          ]
        : []),
    ],
    isBasedOn: "https://argentinadata.mymcps.dev",
    dateModified: serie.actualizado.slice(0, 10),
  };

  const cuerpo = `      <div class="tarjeta resultado resultado--principal">
        <p class="resultado__rotulo">${esc(rotuloDelNumero(r))}</p>
        <p class="resultado__cifra">${esc(cifra)}</p>
        <p class="resultado__detalle">
          En ${r.anio} los precios ${subioOBajo} un ${esc(pctSinSigno(r.variacionPct))} entre
          ${esc(mesConAnio(r.desde))} y ${esc(mesConAnio(r.hasta))}, según ${esc(fuente.larga)}.
        </p>
      </div>
${avisosDelAnio(r.anio)}
      <ul class="datos-clave">
        <li>
          <span class="datos-clave__rotulo">Promedio mensual</span>
          <span class="datos-clave__valor">${esc(pct(r.promedioMensualPct))}</span>
          <span class="datos-clave__nota">${esc(notaDelPromedio(r, cifra))}</span>
        </li>${bloqueExtremos}
        <li>
          <span class="datos-clave__rotulo">Meses publicados</span>
          <span class="datos-clave__valor">${r.conVariacion.length}</span>
          <span class="datos-clave__nota">de 12</span>
        </li>
      </ul>

      <section class="tarjeta panel">
        <div class="panel__cabecera">
          <h2>Inflación mensual de ${r.anio}, mes por mes</h2>
        </div>
${tablaDelAnio(r, fuente.larga)}${notaCompuesto}${notaAnioEnCurso}
      </section>
${bloqueEquivalencia}

      <nav class="navegacion-anios" aria-label="Otros años">
        ${navVecinos}
      </nav>`;

  return {
    ruta,
    title,
    description,
    h1: `Inflación de ${r.anio} en Argentina`,
    bajada: `Cuánto ${subioOBajo} los precios en ${r.anio}, mes por mes, según ${esc(fuente.larga)}. Todos los meses de esta página son datos publicados: acá no hay ninguna estimación.`,
    migas: [
      { nombre: "Calculadora de inflación", ruta: "/" },
      { nombre: "Inflación por año", ruta: "/inflacion-por-anio/" },
    ],
    jsonLd,
    cuerpo,
  };
}

/* -------------------------------------------------------------- página índice */

function paginaHub(serie: SerieIndice, resumenes: ResumenAnual[]): Pagina {
  const completos = resumenes.filter((r) => r.completo);
  if (completos.length === 0) {
    throw new Error("No hay ningún año completo: el índice no tendría nada que rankear.");
  }
  const masAlto = completos.reduce((a, b) => (b.variacionPct > a.variacionPct ? b : a));
  const masBajo = completos.reduce((a, b) => (b.variacionPct < a.variacionPct ? b : a));
  const primero = resumenes[0]!;
  const ultimo = resumenes[resumenes.length - 1]!;

  /*
   * Los años intervenidos van marcados en la propia fila y no sólo explicados abajo.
   * Alguien que escanea la tabla lee "2011 · 9,16%" y sigue de largo: si la salvedad
   * vive dos secciones más abajo, para esa persona no existe.
   */
  const filas = [...resumenes]
    .reverse()
    .map((r) => {
      const marcado = r.anio === APAGON || (r.anio >= INTERVENIDOS.desde && r.anio <= INTERVENIDOS.hasta);
      const nota = r.completo ? "" : ` <small>(en curso)</small>`;
      const marca = marcado
        ? ` <a class="cuestionado" href="#dato-cuestionado" title="Dato oficial cuestionado">†</a>`
        : "";
      return `            <tr>
              <th scope="row"><a href="../inflacion-${r.anio}/">${r.anio}</a>${nota}${marca}</th>
              <td>${esc(pct(r.variacionPct))}</td>
              <td>${esc(pct(r.promedioMensualPct))}</td>
              <td class="col-tecnica">${esc(nombrarEmpate(r.mesesMasAltos))} · ${esc(pct(r.mesesMasAltos[0]!.varMensualPct!))}</td>
            </tr>`;
    })
    .join("\n");

  /*
   * La frase de las excepciones sale de la misma lista que decide los marcadores de la
   * tabla. Escrita a mano decía "las dos excepciones" y describía al último año como
   * excepción: cada enero, cuando sale el IPC de diciembre, el año pasado se completa y
   * la frase pasaba a mentir — justo cuando "inflación <año pasado>" está en su pico de
   * búsquedas y ésta es la página que más gente ve.
   */
  const incompletos = resumenes.filter((r) => !r.completo);
  const pieExcepciones =
    incompletos.length === 0
      ? `Cada año se mide de diciembre a diciembre, del cierre de un diciembre al del siguiente.`
      : `Cada año se mide de diciembre a diciembre. La excepción está marcada: ` +
        `${incompletos.map((r) => `${r.anio} llega hasta ${mesConAnio(r.hasta)}, el último mes que publicó el INDEC`).join("; ")}.`;

  const jsonLd = {
    "@type": "Dataset",
    name: `Inflación anual de Argentina, ${primero.anio}–${ultimo.anio}`,
    description: `Serie de inflación anual de Argentina desde ${primero.anio} hasta ${ultimo.anio}, calculada con el IPC del INDEC y la serie histórica del BCRA.`,
    url: `${SITIO}/inflacion-por-anio/`,
    inLanguage: "es-AR",
    temporalCoverage: `${primero.desde}/${ultimo.hasta}`,
    spatialCoverage: { "@type": "Place", name: "Argentina" },
    variableMeasured: "Índice de Precios al Consumidor, Nivel General Nacional",
    isAccessibleForFree: true,
    isBasedOn: "https://argentinadata.mymcps.dev",
    dateModified: serie.actualizado.slice(0, 10),
  };

  const cuerpo = `      <section class="tarjeta panel">
        <div class="panel__cabecera">
          <h2>Inflación anual, año por año</h2>
        </div>
        <div class="tabla-scroll">
          <table class="desglose">
            <caption class="sr-solo">Inflación anual de Argentina por año</caption>
            <thead>
              <tr>
                <th scope="col">Año</th>
                <th scope="col">Inflación</th>
                <th scope="col">Promedio mensual</th>
                <th scope="col" class="col-tecnica">Mes más alto</th>
              </tr>
            </thead>
            <tbody>
${filas}
            </tbody>
          </table>
        </div>
        <p class="pie-tabla">${esc(pieExcepciones)}</p>
      </section>

      <section class="tarjeta panel" id="dato-cuestionado">
        <div class="panel__cabecera">
          <h2>Tres advertencias antes de usar estos números</h2>
        </div>
        <p>
          <strong>2007 a 2015 (†).</strong> El INDEC estuvo intervenido y en 2016 el Poder
          Ejecutivo declaró por Decreto 55/2016 la emergencia administrativa del Sistema
          Estadístico Nacional. Los números de esos años son los oficiales, pero están
          cuestionados y suelen considerarse por debajo de la inflación real. La página de cada
          uno lo repite arriba de todo — por ejemplo, la de
          <a href="../inflacion-2011/">2011</a>.
        </p>
        <p>
          <strong>2016 (†).</strong> Entre enero y mayo no hubo IPC nacional del INDEC: fue el
          apagón estadístico, y el índice nuevo empezó a publicarse a mitad de año.
          <a href="../inflacion-2016/">La página de 2016</a> lo explica.
        </p>
        <p>
          <strong>Antes de diciembre de 2016.</strong> El INDEC publica un índice de nivel recién
          desde ahí. Para atrás, la serie se reconstruye con las variaciones mensuales que publica
          el BCRA —que republica el IPC que publicaba el INDEC— encadenadas hacia atrás. Es el
          mismo empalme que usa la calculadora, y el detalle está en
          <a href="../datos.html">fuentes y metodología</a>.
        </p>
      </section>`;

  return {
    ruta: "/inflacion-por-anio/",
    title: `Inflación en Argentina año por año, ${primero.anio}–${ultimo.anio} · IPC del INDEC`,
    description: `Inflación anual de Argentina desde ${primero.anio} hasta ${ultimo.anio}, con el detalle mes a mes de cada año. El año más alto fue ${masAlto.anio} (${pct(masAlto.variacionPct)}) y el más bajo, ${masBajo.anio} (${pct(masBajo.variacionPct)}).`,
    h1: `Inflación en Argentina, año por año`,
    bajada: `La inflación anual de cada año desde ${primero.anio}, según el IPC del INDEC y —para todo lo anterior a diciembre de 2016— la serie de inflación mensual del BCRA. El más alto de los años completos fue <strong>${esc(String(masAlto.anio))}</strong>, con ${esc(pct(masAlto.variacionPct))}; el más bajo, <strong>${esc(String(masBajo.anio))}</strong>, con ${esc(pct(masBajo.variacionPct))}. Entrá a cualquier año para ver el mes a mes.`,
    migas: [{ nombre: "Calculadora de inflación", ruta: "/" }],
    jsonLd,
    cuerpo,
  };
}

/* ------------------------------------------------------------------- sitemap */

/**
 * El sitemap se genera acá y no se versiona a mano por una razón concreta: cada año
 * nuevo agrega una página. Un archivo estático se olvida, y un sitemap que anuncia
 * URLs que no existen —o que se calla las que sí— es peor que no tener ninguno.
 */
function sitemap(rutas: { ruta: string; prioridad: string }[], lastmod: string): string {
  const urls = rutas
    .map(
      ({ ruta, prioridad }) => `  <url>
    <loc>${SITIO}${ruta}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${prioridad}</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/* ---------------------------------------------------------------------- main */

function escribir(rutaRelativa: string, contenido: string): void {
  const destino = resolve(DIST, rutaRelativa);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, contenido, "utf8");
}

function main(): void {
  const serie = JSON.parse(
    readFileSync(resolve(RAIZ, "public/data/ipc.json"), "utf8"),
  ) as SerieIndice;
  const assets = leerAssets();

  /*
   * Sólo se publican los años medidos de diciembre a diciembre.
   *
   * El único que queda afuera es 1990: la serie arranca en enero, así que no existe el
   * diciembre de 1989 contra el cual medir y lo que se puede calcular es la variación de
   * once meses (706,06%). La inflación de 1990 que la gente busca es ~1.344%. Publicar
   * una página titulada "Inflación de 1990: 706,06%" con la salvedad abajo es publicar
   * un número que el lector va a saber que está mal, y esa página no se puede defender.
   *
   * La variación de enero de 1990 existe en `bcra:27` y el empalme la descarta: el loop
   * de `splice.ts` corta un mes antes de usarla. Arreglar eso convierte a 1990 en un año
   * dic-a-dic normal y esta página aparece sola. Es un cambio del motor, con su propia
   * revisión y una regeneración del snapshot, así que va aparte.
   */
  const resumenes = aniosDisponibles(serie)
    .map((a) => resumenAnual(serie, a))
    .filter((r) => r.dicADic);

  for (const [i, r] of resumenes.entries()) {
    const pagina = paginaAnio(serie, r, {
      anterior: i > 0 ? resumenes[i - 1]!.anio : null,
      siguiente: i < resumenes.length - 1 ? resumenes[i + 1]!.anio : null,
    });
    escribir(`inflacion-${r.anio}/index.html`, plantilla(pagina, assets, serie));
  }

  const hub = paginaHub(serie, resumenes);
  escribir("inflacion-por-anio/index.html", plantilla(hub, assets, serie));

  const ultimoAnio = resumenes[resumenes.length - 1]!.anio;
  escribir(
    "sitemap.xml",
    sitemap(
      [
        { ruta: "/", prioridad: "1.0" },
        { ruta: "/inflacion-por-anio/", prioridad: "0.9" },
        // El año en curso es el que más se busca, así que va con la prioridad más
        // alta de los años; el resto comparte una prioridad media.
        ...resumenes
          .map((r) => ({
            ruta: `/inflacion-${r.anio}/`,
            prioridad: r.anio === ultimoAnio ? "0.9" : "0.7",
          }))
          .reverse(),
        { ruta: "/datos.html", prioridad: "0.5" },
      ],
      serie.actualizado.slice(0, 10),
    ),
  );

  // El manifest es andamiaje del build: sirvió para saber qué enlazar y no tiene por qué
  // quedar servido en el dominio. `upload-pages-artifact` empaqueta `dist` entero.
  rmSync(resolve(DIST, ".vite"), { recursive: true, force: true });

  console.log(
    `Generadas ${resumenes.length} páginas por año ` +
      `(${resumenes[0]!.anio}–${ultimoAnio}), el índice y el sitemap.`,
  );
}

main();
