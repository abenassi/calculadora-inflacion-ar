/**
 * Baja las series de Argentina Data MCP y escribe el snapshot que consume el sitio.
 *
 * Corre en GitHub Actions una vez por día. Veinticuatro llamadas de quota: cuatro del
 * índice nacional y el REM, dos auxiliares, una por cada índice jurisdiccional, el
 * dólar blue, y dos por cada índice secundario declarado (la serie y su cross-check).
 *
 * Invariante que este script protege: **ni un snapshot ni el catálogo pueden encoger**. Si el MCP responde raro, o el INDEC revisa la serie hacia atrás, o una
 * fuente se cae, preferimos fallar ruidosamente y seguir sirviendo el último
 * snapshot bueno antes que publicar datos peores que los que ya teníamos.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { empalmar, type PuntoCrudo } from "../src/engine/splice.js";
import { aMes, diffMeses, nombrarMes } from "../src/engine/mes.js";
import { SLUG_NACIONAL, type CatalogoIndices, type EntradaCatalogo } from "../src/engine/indices.js";
import type { EntradaCatalogoSecundario } from "../src/engine/indices-secundarios.js";
import type { ExpectativaRem, SerieIndice, SerieValores } from "../src/engine/types.js";
import { INDICES, type IndiceDeclarado } from "./indices-declarados.js";
import { INDICES_SECUNDARIOS, type IndiceSecundarioDeclarado } from "./indices-secundarios-declarados.js";
import { traerDolarHistorico, traerSerie } from "./mcp-client.js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Vive bajo `public/` porque Vite sirve ese directorio en la raíz del sitio: así el
// browser lo pide como `/data/ipc.json` tanto en desarrollo como en producción, y
// además queda versionado y visible en el repo público.
const DIR_DATOS = resolve(RAIZ, "public", "data");

const ID_BCRA_INFLACION = "bcra:27";
const ID_INDEC_IPC = "indec:148.3_INIVELNAL_DICI_M_26";
// Mediana de la inflación interanual esperada para los próximos 12 meses, del
// Relevamiento de Expectativas de Mercado. Es la única serie del REM en el
// catálogo: no hay senda mes a mes.
const ID_REM_ANUAL = "bcra:29";
// Senda mensual del REM: la mediana esperada para cada uno de los próximos ~6
// meses. Se indexó en el MCP en 2026-08 justamente para este sitio; antes sólo
// existía el número a 12 meses y había que repartirlo parejo.
const ID_REM_MENSUAL = "rem:ipc_mensual";

function aPuntos(datos: { fecha: string; valor: number }[]): PuntoCrudo[] {
  return datos
    .map((d) => ({ mes: aMes(d.fecha), valor: d.valor }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

/** Serializa ignorando `actualizado`, para comparar datos contra datos. */
function huella(contenido: unknown): string {
  const { actualizado: _descartado, ...resto } = contenido as Record<string, unknown>;
  return JSON.stringify(resto);
}

async function escribirSiMejora(archivo: string, contenido: unknown, minimoDatos = 0): Promise<void> {
  const ruta = resolve(DIR_DATOS, archivo);
  const nuevo = JSON.stringify(contenido, null, 2) + "\n";

  const previo = await readFile(ruta, "utf8").catch(() => null);
  if (previo !== null) {
    // El catálogo no tiene `datos` sino `indices`, y sin contarlo la guarda quedaba en
    // `0 < 0`: el archivo nuevo era justo el que la invariante no cubría. Un catálogo al
    // que se le caen cinco provincias las borra del desplegable sin que nada falle.
    const cuantos = (x: { datos?: unknown[]; indices?: unknown[] }) =>
      x.datos?.length ?? x.indices?.length ?? 0;
    const cantidadAnterior = cuantos(JSON.parse(previo) as object);
    const cantidadNueva = cuantos(contenido as object);
    if (cantidadNueva < cantidadAnterior) {
      throw new Error(
        `${archivo}: el snapshot nuevo tiene ${cantidadNueva} entradas y el vigente ${cantidadAnterior}. ` +
          `Un snapshot no puede encoger — abortando sin escribir.`,
      );
    }
    // La comparación ignora `actualizado` a propósito. Ese campo cambia en cada
    // corrida, así que compararlo haría que el snapshot "difiera" todos los días
    // aunque el INDEC no publique nada: 365 commits y 365 deploys al año de puro
    // ruido. `actualizado` significa "cuándo cambiaron los datos", no "cuándo
    // miramos"; para lo segundo está el historial de corridas del workflow.
    if (huella(JSON.parse(previo)) === huella(contenido)) {
      console.log(`  ${archivo}: sin cambios`);
      return;
    }
  }

  const c = contenido as { datos?: unknown[]; indices?: unknown[] };
  // El catálogo no tiene `datos` sino `indices`. Contar sólo `datos` lo hacía informar
  // "escrito (0 puntos)" en cada corrida, que se lee como que salió vacío.
  const cantidad = c.datos?.length ?? c.indices?.length ?? 0;
  if (cantidad < minimoDatos) {
    throw new Error(`${archivo}: sólo ${cantidad} puntos, se esperaban al menos ${minimoDatos}`);
  }

  await writeFile(ruta, nuevo, "utf8");
  console.log(`  ${archivo}: escrito (${cantidad} ${c.indices ? "entradas" : "puntos"})`);
}

/**
 * La expectativa del REM más reciente.
 *
 * Devuelve `undefined` en vez de romper si la serie no viene: el REM es una opción
 * secundaria del sitio, y quedarnos sin snapshot de IPC porque el BCRA no respondió
 * sería cambiar un problema chico por uno grande. Sin este campo, la interfaz
 * esconde la opción.
 */
async function traerRem(): Promise<ExpectativaRem | undefined> {
  try {
    const [anual, mensual] = await Promise.all([
      traerSerie(ID_REM_ANUAL, { fecha_desde: "2024-01-01" }),
      traerSerie(ID_REM_MENSUAL, { fecha_desde: "2024-01-01" }),
    ]);

    const ultimo = anual.datos.at(-1);
    if (!ultimo || !Number.isFinite(ultimo.valor)) {
      console.warn("  REM: la serie a 12 meses vino vacía, se omite");
      return undefined;
    }

    // La senda incluye meses ya publicados por el INDEC (el REM también nowcastea
    // el mes en curso). Esos no interesan: el sitio usa el dato real cuando existe.
    const encuesta = aMes(ultimo.fecha);
    const senda = mensual.datos
      .map((d) => ({ mes: aMes(d.fecha), tasaPct: d.valor }))
      .filter((p) => Number.isFinite(p.tasaPct))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    // La fecha de la encuesta sale de `bcra:29` y la senda de `rem:ipc_mensual`:
    // dos series que se actualizan por caminos distintos. Si una queda un mes
    // atrás de la otra, el sitio nombraría una encuesta equivocada, que es
    // justo la clase de inexactitud silenciosa que acá no puede pasar. El REM
    // pronostica t..t+6, así que el horizonte tiene que dar 6.
    const horizonte = senda.length > 0 ? diffMeses(encuesta, senda.at(-1)!.mes) : 0;
    if (horizonte !== 6) {
      console.warn(
        `  REM: OJO, el horizonte da ${horizonte} meses y deberían ser 6. ` +
          `Puede que bcra:29 y rem:ipc_mensual vengan de encuestas distintas.`,
      );
    }

    console.log(
      `  REM: ${ultimo.valor}% a 12 meses y senda de ${senda.length} meses ` +
        `(hasta ${senda.at(-1)?.mes ?? "—"}), encuesta de ${encuesta}`,
    );
    return {
      senda,
      expectativaAnualPct: ultimo.valor,
      mes: encuesta,
      series: [ID_REM_ANUAL, ID_REM_MENSUAL],
      organismo: anual.fuente,
    };
  } catch (e: unknown) {
    console.warn(`  REM: no se pudo traer (${(e as Error).message}), se omite`);
    return undefined;
  }
}

async function construirIpc(): Promise<SerieIndice> {
  console.log("IPC: bajando bcra:27, índice INDEC y REM…");
  const [bcra, indec, rem] = await Promise.all([
    traerSerie(ID_BCRA_INFLACION, { fecha_desde: "1990-01-01" }),
    traerSerie(ID_INDEC_IPC, { fecha_desde: "2016-12-01" }),
    traerRem(),
  ]);

  const puntosBcra = aPuntos(bcra.datos);
  const puntosIndec = aPuntos(indec.datos);
  const datos = empalmar(puntosBcra, puntosIndec);

  const ultimoOficial = datos.at(-1)!.mes;
  const primerIndec = puntosIndec[0]!.mes;
  const primerMes = datos[0]!.mes;

  console.log(
    `  empalmado: ${nombrarMes(primerMes)} → ${nombrarMes(ultimoOficial)} (${datos.length} meses)`,
  );

  return {
    serie: "ipc_nacional_empalmado",
    base: "2016-12=100",
    fuentes: [
      {
        id: "bcra",
        serie: ID_BCRA_INFLACION,
        organismo: "Banco Central de la República Argentina",
        organismoCorto: "BCRA",
        url: "https://www.bcra.gob.ar/",
        rango: `${primerMes}/${datos.filter((d) => d.origen === "bcra").at(-1)?.mes ?? primerMes}`,
        // El BCRA no es una fuente alternativa al INDEC: republica el IPC que el INDEC
        // publicaba, y lo dice la propia serie `bcra:27`. Decirlo importa porque si no la
        // atribución honesta ("esto lo publica el BCRA") deja a la persona preguntándose
        // de dónde salió un índice de precios de un banco central, y peor, sin poder
        // conectar el aviso del INDEC intervenido con una página de puros sellos BCRA.
        etiqueta: {
          corta: "serie de inflación mensual del BCRA",
          larga:
            "la serie de inflación mensual del BCRA, que para ese tramo republica el IPC " +
            "que publicaba el INDEC",
          publicadosPor: "el BCRA, que republica el IPC que publicaba el INDEC",
        },
      },
      {
        id: "indec",
        serie: ID_INDEC_IPC,
        organismo: "Instituto Nacional de Estadística y Censos (INDEC)",
        organismoCorto: "INDEC",
        url: "https://www.indec.gob.ar/",
        rango: `${primerIndec}/${ultimoOficial}`,
        etiqueta: {
          corta: "IPC del INDEC",
          larga: "el IPC Nivel General Nacional del INDEC",
          publicadosPor: "el INDEC",
        },
      },
    ],
    // El nacional es la única serie empalmada, y su combinación dice dónde corta el
    // empalme: es lo primero que alguien va a querer verificar si ve dos sellos distintos
    // en la misma tabla.
    etiquetaCombinada: {
      corta: "IPC del INDEC y serie del BCRA",
      larga:
        "el IPC Nivel General Nacional del INDEC y, para los meses anteriores a diciembre " +
        "de 2016, la serie de inflación mensual del BCRA",
      publicadosPor: "el INDEC y el BCRA",
    },
    // La senda del REM arranca en 2024 porque incluye los nowcasts de cada
    // encuesta pasada. El sitio sólo proyecta hacia adelante, así que se guardan
    // los meses que el INDEC todavía no publicó y nada más: lo demás engorda el
    // snapshot y confunde a quien lo lea en el repo.
    ...(rem
      ? {
          rem: {
            ...rem,
            senda: rem.senda.filter((p) => p.mes > ultimoOficial),
          },
        }
      : {}),
    ultimo_oficial: ultimoOficial,
    actualizado: new Date().toISOString(),
    datos,
  };
}

/**
 * El valor más chico que el MCP guarda sin perder las cifras que hacen falta.
 *
 * `series_data.valor` es `numeric(20,6)`. Un índice encadenado hacia atrás a través de los
 * cambios de moneda cae por debajo de una millonésima y **queda guardado como cero**.
 * Medido contra producción el 2026-08-13: Chaco tiene 256 puntos en cero, Tucumán 167 y
 * Mendoza 148, y bastantes más quedan con dos o tres cifras significativas.
 *
 * Un cero no es un dato impreciso: es una división por cero en el único cálculo que hace
 * este sitio. El umbral está en 1e-2 y no en 1e-6 porque el límite no es "que no sea cero"
 * sino "que queden cifras significativas": como la cuantización de la columna es 1e-6, con
 * un umbral de 1e-2 el peor caso conserva **cinco** cifras y el error relativo máximo es
 * 0,005%.
 *
 * Con 1e-3 quedarían cuatro cifras (0,05% de error) y se recuperarían veinte meses de
 * Chaco y diecinueve de Tucumán, que son los únicos dos índices donde cambiaría algo. Es
 * una mejora real y chica, pero el mismo umbral vive también en los colectores del MCP
 * (`src/collectors/lib/ipc-jurisdiccional.ts`), que son los que recortan Córdoba y Río
 * Negro: bajarlo de un solo lado dejaría dos criterios distintos para lo mismo. Se cambia
 * en los dos repos o en ninguno.
 *
 * Es un problema del lado del MCP —82 series de nivel de índice, 1.888 puntos, la peor es
 * el IPC histórico del propio INDEC— y hay que arreglarlo allá. Mientras tanto el sitio no
 * puede confiar en lo que le llega: publicar un índice en cero rompe la página.
 */
const VALOR_MINIMO_REPRESENTABLE = 0.01;

/** Cuántos puntos devuelve la tool `series` cuando no se le acota el rango. */
const LIMITE_IMPLICITO = 365;

/**
 * Recorta la serie al tramo final que se puede usar, y explota si no queda nada.
 *
 * Se corta desde el **último** valor demasiado chico y no desde el primero grande: si
 * apareciera uno chico después de uno grande, lo anterior queda bajo sospecha y lo único
 * que garantiza precisión pareja es quedarse con lo que viene después.
 *
 * Se recorta y no se reescala. Reescalar preservaría los cocientes, pero nuestros números
 * dejarían de coincidir con la tabla que publica el organismo, y eso es justo lo que
 * alguien cruza cuando quiere verificar. Menos historia con los números de la fuente.
 */
export function recortarRepresentable(puntos: PuntoCrudo[], slug: string): PuntoCrudo[] {
  let inicio = 0;
  for (let i = puntos.length - 1; i >= 0; i--) {
    if (!(puntos[i]!.valor >= VALOR_MINIMO_REPRESENTABLE)) {
      inicio = i + 1;
      break;
    }
  }

  const out = puntos.slice(inicio);
  if (out.length === 0) {
    throw new Error(
      `${slug}: no quedó ningún valor representable, todos caen por debajo de ` +
        `${VALOR_MINIMO_REPRESENTABLE}. El MCP los está sirviendo truncados a cero.`,
    );
  }
  if (out.length < puntos.length) {
    console.log(
      `  ${slug}: se descartaron ${puntos.length - out.length} punto(s) del arranque que el ` +
        `MCP sirve truncados; la serie arranca en ${out[0]!.mes}`,
    );
  }
  return out;
}

/**
 * Recorta la serie a su tramo continuo más reciente.
 *
 * Un hueco no se puede dejar pasar: el motor lee los puntos como meses contiguos, así que
 * un salto de 2012 a 2016 le haría calcular una "variación mensual" de cuatro años. Y
 * tampoco se puede rellenar, porque cualquier relleno es un número que no publicó nadie.
 * Queda recortar: menos historia, toda cierta.
 *
 * Se conserva el tramo que **llega hasta el dato más nuevo** y no el más largo, aunque a
 * veces sea más corto. Un tramo que termina en 2012 no sirve para lo único que hace este
 * sitio, que es traer un monto hasta hoy.
 *
 * Pasa de verdad: Mendoza dejó de publicar entre marzo de 2012 y abril de 2016 —los años
 * del apagón estadístico— así que se sirve desde 2016 y no desde 1988.
 */
function recortarContinuo(puntos: PuntoCrudo[], slug: string): PuntoCrudo[] {
  let inicio = 0;
  for (let i = puntos.length - 1; i > 0; i--) {
    if (diffMeses(puntos[i - 1]!.mes, puntos[i]!.mes) !== 1) {
      inicio = i;
      break;
    }
  }

  const out = puntos.slice(inicio);
  if (out.length < puntos.length) {
    console.log(
      `  ${slug}: la serie tiene un hueco antes de ${out[0]!.mes}; se descartaron ` +
        `${puntos.length - out.length} punto(s) previos al último tramo continuo`,
    );
  }
  return out;
}

/**
 * Una serie jurisdiccional: una sola fuente, sin empalme y **sin REM**.
 *
 * El REM del BCRA pronostica el IPC nacional del INDEC. No existe un REM provincial y no
 * lo vamos a inventar promediando nada, así que la serie no trae el campo y la interfaz
 * esconde esa opción sola — el mismo camino que ya recorre cuando el REM no se pudo bajar.
 */
async function construirIndice(decl: IndiceDeclarado): Promise<SerieIndice> {
  // `fecha_desde` no es cosmético: **sin él el MCP devuelve los últimos 365 puntos y no
  // avisa**. Medido — Mendoza tiene 654 meses y llegaban 365, arrancando en 1992 en vez
  // de 1968. `limit` no lo cambia. El corte era invisible porque una serie de 365 meses
  // sigue pareciendo completa; se notó sólo porque cinco jurisdicciones dieron 365 justo.
  const serie = await traerSerie(decl.serie, { fecha_desde: "1900-01-01" });
  if (serie.datos.length === LIMITE_IMPLICITO) {
    console.warn(
      `  ${decl.slug}: OJO, vinieron exactamente ${LIMITE_IMPLICITO} puntos, que es el tope ` +
        `que el MCP aplica cuando ignora fecha_desde. Puede estar recortada por arriba.`,
    );
  }
  const puntos = recortarContinuo(recortarRepresentable(aPuntos(serie.datos), decl.slug), decl.slug);
  const datos = puntos.map((p) => ({ mes: p.mes, indice: p.valor, origen: decl.origen }));
  const primerMes = datos[0]!.mes;
  const ultimoOficial = datos.at(-1)!.mes;

  console.log(
    `  ${decl.slug}: ${nombrarMes(primerMes)} → ${nombrarMes(ultimoOficial)} ` +
      `(${datos.length} meses, ${decl.organismoCorto})`,
  );

  return {
    serie: decl.slug,
    base: serie.unidad,
    fuentes: [
      {
        id: decl.origen,
        serie: decl.serie,
        organismo: decl.organismo,
        organismoCorto: decl.organismoCorto,
        url: decl.url,
        rango: `${primerMes}/${ultimoOficial}`,
        etiqueta: decl.etiqueta,
      },
    ],
    ultimo_oficial: ultimoOficial,
    actualizado: new Date().toISOString(),
    datos,
  };
}

/**
 * UVA y dólar se cachean mensualizados (último valor del mes) para habilitar la
 * comparación de fuentes más adelante sin tener que rehacer el pipeline. Hoy el
 * sitio no los usa.
 */
async function construirAuxiliar(id: string, nombre: string) {
  console.log(`${nombre}: bajando ${id}…`);
  const serie = await traerSerie(id, { frecuencia: "mensual", funcion_colapso: "last" });
  const datos = aPuntos(serie.datos);
  return {
    serie: nombre,
    fuentes: [{ id, organismo: serie.fuente, rango: `${datos[0]!.mes}/${datos.at(-1)!.mes}` }],
    unidad: serie.unidad,
    actualizado: new Date().toISOString(),
    datos,
  };
}

/**
 * El dólar blue, promedio mensual, para la sección `/actualizar.html` — todavía sin
 * link desde ningún lado del sitio. Va en su propio `try/catch` en `main()`: si el
 * tool falla un día, el resto del pipeline se escribe igual y esto se queda con el
 * snapshot de ayer, el mismo trato que ya reciben los índices jurisdiccionales.
 */
async function construirSerieDolarBlue(): Promise<SerieValores> {
  console.log("Dólar blue: bajando dolar_historico…");
  const r = await traerDolarHistorico("blue", {
    fecha_desde: "2002-01-01",
    frecuencia: "mensual",
    funcion_colapso: "avg",
  });

  // El mes en curso viene con `periodo_incompleto` mientras no terminó: promediarlo
  // ya es engañoso (es el promedio de un puñado de días, no del mes), así que se
  // descarta — el mismo criterio que ya sigue el IPC, que nunca muestra el mes que
  // el INDEC no cerró.
  const datos = r.datos
    .filter((d) => !d.periodo_incompleto)
    .map((d) => ({ mes: aMes(d.fecha), valor: d.venta }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  return {
    serie: "dolar_blue",
    unidad: "pesos_por_usd",
    fuentes: [
      { id: "ambito", organismo: r.fuente, rango: `${datos[0]!.mes}/${datos.at(-1)!.mes}` },
    ],
    actualizado: new Date().toISOString(),
    datos,
  };
}

/**
 * Un índice secundario declarado (hoy sólo el CPI de EE.UU.), con la MISMA forma que
 * `ipc.json` (`SerieIndice`) para poder pasarlo tal cual a `adjust()` /
 * `actualizarSerieDoble`. Mismo piso que el dólar blue (2002) para poder componer los
 * dos sobre toda la serie.
 *
 * Va en su propio `try/catch` en `main()`, igual que `construirSerieDolarBlue`: si
 * FRED falla un día, el resto del pipeline se escribe igual y el selector del índice
 * secundario simplemente no aparece hasta que el snapshot tenga el archivo.
 */
async function construirSerieSecundaria(declarada: IndiceSecundarioDeclarado): Promise<SerieIndice> {
  console.log(`Índice secundario ${declarada.slug}: bajando ${declarada.serie}…`);
  const serie = await traerSerie(declarada.serie, { fecha_desde: "2002-01-01" });
  const puntos = recortarContinuo(recortarRepresentable(aPuntos(serie.datos), declarada.slug), declarada.slug);
  const datos = puntos.map((p) => ({ mes: p.mes, indice: p.valor, origen: declarada.slug }));
  const ultimoOficial = datos.at(-1)!.mes;

  console.log(
    `  ${declarada.slug}: ${nombrarMes(datos[0]!.mes)} → ${nombrarMes(ultimoOficial)} ` +
      `(${datos.length} meses, ${declarada.organismo})`,
  );

  return {
    serie: declarada.slug,
    base: serie.unidad,
    fuentes: [
      {
        id: declarada.slug,
        serie: declarada.serie,
        organismo: declarada.organismo,
        organismoCorto: declarada.organismo,
        url: declarada.url,
        rango: `${datos[0]!.mes}/${ultimoOficial}`,
        etiqueta: declarada.etiqueta,
      },
    ],
    ultimo_oficial: ultimoOficial,
    actualizado: new Date().toISOString(),
    datos,
  };
}

/**
 * El cross-check oficial de un índice secundario (hoy, `tipo_cambio_real_estados_unidos`
 * del BCRA) — una serie de VALORES, no un índice con el que se ajusta nada: se
 * reescala en la interfaz (`reescalarCrossCheck`) para superponerla como comparación
 * de forma, nunca para calcular.
 *
 * La serie de origen es diaria; se mensualiza con el mismo criterio que ya usa
 * `construirAuxiliar` para UVA y dólar oficial (último valor del mes), porque el resto
 * del pipeline —y el gráfico que la muestra al lado de series mensuales— trabaja en
 * meses.
 */
async function construirCrossCheck(declarada: IndiceSecundarioDeclarado): Promise<SerieValores | null> {
  if (!declarada.serieCrossCheck) return null;
  console.log(`Cross-check de ${declarada.slug}: bajando ${declarada.serieCrossCheck}…`);
  const serie = await traerSerie(declarada.serieCrossCheck, {
    fecha_desde: "2002-01-01",
    frecuencia: "mensual",
    funcion_colapso: "last",
  });
  const datos = aPuntos(serie.datos);

  console.log(`  ${declarada.slug}: cross-check ${datos[0]!.mes} → ${datos.at(-1)!.mes} (${datos.length} meses)`);

  return {
    serie: `crosscheck-${declarada.slug}`,
    unidad: serie.unidad,
    fuentes: [
      { id: "bcra", organismo: serie.fuente, rango: `${datos[0]!.mes}/${datos.at(-1)!.mes}` },
    ],
    actualizado: new Date().toISOString(),
    datos,
  };
}

/**
 * El catálogo chico de índices secundarios, en el mismo espíritu que `indices.json`
 * para los primarios: la interfaz nunca lee `scripts/indices-secundarios-declarados.ts`
 * directo —es código de pipeline, no se empaqueta para el browser— sino este archivo,
 * que sólo lista lo que el pipeline **efectivamente pudo escribir**, esta corrida o
 * una anterior. Así el desplegable de `/actualizar.html` no ofrece nunca una opción
 * cuyo archivo de datos no existe.
 */
async function construirCatalogoSecundarios(): Promise<void> {
  const existeArchivo = (archivo: string) =>
    readFile(resolve(DIR_DATOS, archivo), "utf8")
      .then(() => true)
      .catch(() => false);

  const entradas: EntradaCatalogoSecundario[] = [];
  for (const decl of INDICES_SECUNDARIOS) {
    if (!(await existeArchivo(`series/secundario-${decl.slug}.json`))) {
      console.warn(`  ${decl.slug}: sin archivo de datos, no entra al catálogo de índices secundarios`);
      continue;
    }
    entradas.push({
      slug: decl.slug,
      nombre: decl.nombre,
      direccion: decl.direccion,
      requiereIndiceBase: decl.requiereIndiceBase,
      tieneCrossCheck: await existeArchivo(`series/crosscheck-${decl.slug}.json`),
    });
  }

  await escribirSiMejora("indices-secundarios.json", {
    indices: entradas,
    actualizado: new Date().toISOString(),
  });
}

/**
 * Los quince índices jurisdiccionales, cada uno a su archivo, y el catálogo.
 *
 * Dos reglas que importan más que el código:
 *
 * **Un índice que falla no puede voltear a los otros.** Se avisa, se lo saca del catálogo
 * de esta corrida y se sigue. El nacional es la excepción y va aparte, en `main()`: si ese
 * falla hay que cortar todo, porque es el que ve quien no toca el selector.
 *
 * **El catálogo se escribe último**, con los rangos que salieron de verdad. Escribirlo
 * antes lo dejaría anunciando en el desplegable un índice cuyo archivo no existe, y
 * elegirlo daría un 404 en vez de un número.
 */
async function construirCatalogo(nacional: SerieIndice): Promise<void> {
  await mkdir(resolve(DIR_DATOS, "indices"), { recursive: true });

  const anterior = (await readFile(resolve(DIR_DATOS, "indices.json"), "utf8")
    .then((t) => JSON.parse(t) as CatalogoIndices)
    .catch(() => null)) as CatalogoIndices | null;

  const entradas: EntradaCatalogo[] = [
    {
      slug: SLUG_NACIONAL,
      nombre: "Nacional (INDEC)",
      tipo: "nacional",
      cubre: "El IPC Nivel General Nacional del INDEC.",
      organismos: nacional.fuentes.map((f) => f.organismoCorto),
      primerMes: nacional.datos[0]!.mes,
      ultimoOficial: nacional.ultimo_oficial,
    },
  ];

  console.log(`Índices jurisdiccionales: bajando ${INDICES.length} series…`);
  for (const decl of INDICES) {
    try {
      const serie = await construirIndice(decl);
      // 12 meses: por debajo de eso no se puede calcular casi nada y seguro se rompió algo.
      await escribirSiMejora(`indices/${decl.slug}.json`, serie, 12);
      entradas.push({
        slug: decl.slug,
        nombre: decl.nombre,
        tipo: decl.tipo,
        ...(decl.enElSelector ? { enElSelector: decl.enElSelector } : {}),
        cubre: decl.cubre,
        organismos: [decl.organismoCorto],
        primerMes: serie.datos[0]!.mes,
        ultimoOficial: serie.ultimo_oficial,
      });
    } catch (e: unknown) {
      // Que la bajada de hoy falle no es razón para que el índice desaparezca del
      // desplegable: su archivo sigue en el repo con los datos de ayer, que es
      // exactamente el mismo trato que reciben las demás series cuando el MCP no
      // responde. Se conserva la entrada anterior y se avisa fuerte.
      const previa = anterior?.indices.find((i) => i.slug === decl.slug);
      console.warn(
        `  ${decl.slug}: NO se pudo actualizar (${(e as Error).message}) — ` +
          (previa ? "queda el dato de la corrida anterior" : "no está en el catálogo"),
      );
      if (previa) entradas.push(previa);
    }
  }

  const faltantes = INDICES.length + 1 - entradas.length;
  if (faltantes > 0) console.warn(`  OJO: ${faltantes} índice(s) quedaron fuera del catálogo`);

  await escribirSiMejora("indices.json", {
    indices: entradas,
    actualizado: new Date().toISOString(),
  });
}

async function main(): Promise<void> {
  await mkdir(DIR_DATOS, { recursive: true });

  const ipc = await construirIpc();
  // 400 meses ≈ 33 años: si el empalme devuelve mucho menos, algo se rompió.
  await escribirSiMejora("ipc.json", ipc, 400);

  const uva = await construirAuxiliar("uva", "uva");
  await escribirSiMejora("uva.json", uva, 100);

  const dolar = await construirAuxiliar("dolar_oficial", "dolar_oficial");
  await escribirSiMejora("dolar.json", dolar, 100);

  try {
    await mkdir(resolve(DIR_DATOS, "series"), { recursive: true });
    const dolarBlue = await construirSerieDolarBlue();
    await escribirSiMejora("series/dolar-blue.json", dolarBlue, 100);
  } catch (e: unknown) {
    console.warn(
      `  dólar blue: NO se pudo actualizar (${(e as Error).message}) — se sigue con el resto del pipeline`,
    );
  }

  // Cada índice secundario (y su cross-check, si declara uno) en su propio try/catch:
  // si FRED o el BCRA fallan un día, el resto del pipeline no se cae con ellos, y el
  // selector "Ajustar también por" de `/actualizar.html` simplemente no ofrece la
  // opción hasta que el snapshot tenga el archivo (ver `construirSerieSecundaria`).
  for (const declarada of INDICES_SECUNDARIOS) {
    try {
      await mkdir(resolve(DIR_DATOS, "series"), { recursive: true });
      const secundaria = await construirSerieSecundaria(declarada);
      await escribirSiMejora(`series/secundario-${declarada.slug}.json`, secundaria, 100);
    } catch (e: unknown) {
      console.warn(
        `  ${declarada.slug}: NO se pudo actualizar (${(e as Error).message}) — se sigue con el resto del pipeline`,
      );
    }

    try {
      const crossCheck = await construirCrossCheck(declarada);
      if (crossCheck) {
        await escribirSiMejora(`series/crosscheck-${declarada.slug}.json`, crossCheck, 12);
      }
    } catch (e: unknown) {
      console.warn(
        `  ${declarada.slug}: NO se pudo actualizar el cross-check (${(e as Error).message}) — ` +
          `el overlay de comparación no aparece, el resto sigue igual`,
      );
    }
  }

  await construirCatalogo(ipc);
  await construirCatalogoSecundarios();

  await escribirSiMejora("meta.json", {
    actualizado: ipc.actualizado,
    ultimo_oficial: ipc.ultimo_oficial,
    primer_mes: ipc.datos[0]!.mes,
    meses: ipc.datos.length,
    fuente: "Argentina Data MCP · https://argentinadata.mymcps.dev",
  });
  console.log(`  último dato oficial: ${nombrarMes(ipc.ultimo_oficial)}`);
}

main().catch((e: unknown) => {
  console.error(`\nERROR: ${(e as Error).message}`);
  process.exit(1);
});
