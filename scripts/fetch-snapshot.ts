/**
 * Baja las series de Argentina Data MCP y escribe el snapshot que consume el sitio.
 *
 * Corre en GitHub Actions una vez por día. Cuatro llamadas de quota.
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
import { aMes, nombrarMes } from "../src/engine/mes.js";
import type { SerieIndice } from "../src/engine/types.js";
import { traerSerie } from "./mcp-client.js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR_DATOS = resolve(RAIZ, "data");

const ID_BCRA_INFLACION = "bcra:27";
const ID_INDEC_IPC = "indec:148.3_INIVELNAL_DICI_M_26";

function aPuntos(datos: { fecha: string; valor: number }[]): PuntoCrudo[] {
  return datos
    .map((d) => ({ mes: aMes(d.fecha), valor: d.valor }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
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
    if (previo === nuevo) {
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

async function construirIpc(): Promise<SerieIndice> {
  console.log("IPC: bajando bcra:27 e índice INDEC…");
  const [bcra, indec] = await Promise.all([
    traerSerie(ID_BCRA_INFLACION, { fecha_desde: "1990-01-01" }),
    traerSerie(ID_INDEC_IPC, { fecha_desde: "2016-12-01" }),
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

  await writeFile(
    resolve(DIR_DATOS, "meta.json"),
    JSON.stringify(
      {
        actualizado: ipc.actualizado,
        ultimo_oficial: ipc.ultimo_oficial,
        primer_mes: ipc.datos[0]!.mes,
        meses: ipc.datos.length,
        fuente: "Argentina Data MCP · https://argentinadata.mymcps.dev",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(`  meta.json: escrito (último oficial ${nombrarMes(ipc.ultimo_oficial)})`);
}

main().catch((e: unknown) => {
  console.error(`\nERROR: ${(e as Error).message}`);
  process.exit(1);
});
