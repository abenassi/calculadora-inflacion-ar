/**
 * Baja las series de Argentina Data MCP y escribe el snapshot que consume el sitio.
 *
 * Corre en GitHub Actions una vez por día. Seis llamadas de quota.
 *
 * Invariante que este script protege: **un snapshot nunca puede encoger ni perder
 * meses**. Si el MCP responde raro, o el INDEC revisa la serie hacia atrás, o una
 * fuente se cae, preferimos fallar ruidosamente y seguir sirviendo el último
 * snapshot bueno antes que publicar datos peores que los que ya teníamos.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { empalmar, type PuntoCrudo } from "../src/engine/splice.js";
import { aMes, diffMeses, nombrarMes } from "../src/engine/mes.js";
import type { ExpectativaRem, SerieIndice } from "../src/engine/types.js";
import { traerSerie } from "./mcp-client.js";

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
    const anterior = JSON.parse(previo) as { datos?: unknown[] };
    const cantidadAnterior = anterior.datos?.length ?? 0;
    const cantidadNueva = (contenido as { datos?: unknown[] }).datos?.length ?? 0;
    if (cantidadNueva < cantidadAnterior) {
      throw new Error(
        `${archivo}: el snapshot nuevo tiene ${cantidadNueva} puntos y el vigente ${cantidadAnterior}. ` +
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

  const cantidad = (contenido as { datos?: unknown[] }).datos?.length ?? 0;
  if (cantidad < minimoDatos) {
    throw new Error(`${archivo}: sólo ${cantidad} puntos, se esperaban al menos ${minimoDatos}`);
  }

  await writeFile(ruta, nuevo, "utf8");
  console.log(`  ${archivo}: escrito (${cantidad} puntos)`);
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
        id: ID_BCRA_INFLACION,
        organismo: "Banco Central de la República Argentina",
        rango: `${primerMes}/${datos.filter((d) => d.origen === "bcra").at(-1)?.mes ?? primerMes}`,
      },
      {
        id: ID_INDEC_IPC,
        organismo: "Instituto Nacional de Estadística y Censos (INDEC)",
        rango: `${primerIndec}/${ultimoOficial}`,
      },
    ],
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

async function main(): Promise<void> {
  await mkdir(DIR_DATOS, { recursive: true });

  const ipc = await construirIpc();
  // 400 meses ≈ 33 años: si el empalme devuelve mucho menos, algo se rompió.
  await escribirSiMejora("ipc.json", ipc, 400);

  const uva = await construirAuxiliar("uva", "uva");
  await escribirSiMejora("uva.json", uva, 100);

  const dolar = await construirAuxiliar("dolar_oficial", "dolar_oficial");
  await escribirSiMejora("dolar.json", dolar, 100);

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
