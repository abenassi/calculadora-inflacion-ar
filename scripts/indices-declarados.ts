/**
 * Qué índices publica el sitio, y cómo se nombra cada uno.
 *
 * Es la única lista que hay que tocar para sumar o sacar una jurisdicción: el pipeline
 * itera sobre esto y la interfaz lee lo que el pipeline escribió. Ninguna frase de
 * `src/ui/` nombra a un organismo.
 *
 * ── POR QUÉ SON DIEZ Y NO VEINTICUATRO ──
 * Sólo diez jurisdicciones miden su propia inflación y publican la serie de forma que se
 * pueda bajar sin intervención humana. Jujuy la mide pero la publica únicamente en PDF, y
 * un PDF no es una fuente que se pueda actualizar todos los meses sin sorpresas. Las
 * catorce restantes **no miden**: para ellas están las seis regiones del INDEC, que se
 * ofrecen como lo que son y con la aclaración adentro.
 *
 * ── LAS ETIQUETAS NO SON DECORACIÓN ──
 * Los `cubre` y los `publicadosPor` son la mitad que se olvida de la regla 2: no prometer
 * dato oficial donde no lo hay. Una región del INDEC incluye a varias provincias pero no
 * mide a ninguna en particular, y sin esa frase alguien de Formosa lee "Noreste" como si
 * fuera el índice de Formosa.
 */

import type { TipoIndice } from "../src/engine/indices.js";
import type { EtiquetaFuente } from "../src/engine/types.js";

export type IndiceDeclarado = {
  slug: string;
  nombre: string;
  /** Cómo se lee en el desplegable, si difiere del nombre. */
  enElSelector?: string;
  tipo: TipoIndice;
  cubre: string;
  /** La serie del catálogo del MCP de la que sale. */
  serie: string;
  /** Slug corto que va en `origen` de cada punto y en el sello de la fila. */
  origen: string;
  organismo: string;
  organismoCorto: string;
  url: string;
  etiqueta: EtiquetaFuente;
};

const INDEC = {
  organismo: "Instituto Nacional de Estadística y Censos (INDEC)",
  url: "https://www.indec.gob.ar/",
};

/**
 * Una región del INDEC. Las seis se declaran igual: mismo organismo, misma forma de
 * nombrarse, y un `cubre` que enumera las provincias y termina diciendo que no es el
 * índice de ninguna de ellas.
 */
function region(
  slug: string,
  nombre: string,
  serie: string,
  provincias: string,
  enElSelector: string,
): IndiceDeclarado {
  return {
    slug,
    nombre,
    tipo: "region",
    // Qué provincias tiene adentro, **en el renglón del desplegable**. Sin esto alguien de
    // Formosa mira la lista, ve seis nombres de regiones, ninguno dice Formosa, y tiene que
    // elegir a ciegas y leer el párrafo de abajo para enterarse de si le tocaba. No es una
    // recomendación de nada: es decir qué es cada cosa antes de que la elijas.
    enElSelector: `${nombre} (${enElSelector})`,
    cubre: `Cubre ${provincias}. No es el índice de ninguna de ellas por separado.`,
    serie,
    ...INDEC,
    // El sello de la fila lleva la región adentro. Con sólo "INDEC ✓" la tabla de la
    // Región Noreste era indistinguible de la nacional, y la tabla es lo que la gente
    // manda por foto: sin el parrafito de arriba no hay forma de saber cuál es cuál.
    origen: `indec-${slug}`,
    organismoCorto: `INDEC ${nombre.replace("Región ", "")}`,
    etiqueta: {
      corta: `IPC ${nombre} del INDEC`,
      larga: `el IPC de la ${nombre} del INDEC`,
      publicadosPor: "el INDEC",
    },
  };
}

export const INDICES: IndiceDeclarado[] = [
  /* ── Provincias que miden su propia inflación ─────────────────────────────── */
  {
    slug: "caba",
    nombre: "Ciudad de Buenos Aires",
    tipo: "provincia",
    cubre:
      "Mide precios en la Ciudad de Buenos Aires, no en el conurbano. Para el aglomerado " +
      "completo está la región Gran Buenos Aires.",
    serie: "ipc:caba",
    origen: "idecba",
    organismo: "Instituto de Estadística y Censos de la Ciudad de Buenos Aires (IDECBA)",
    organismoCorto: "IDECBA",
    url: "https://www.estadisticaciudad.gob.ar/",
    etiqueta: {
      corta: "IPCBA del IDECBA",
      larga: "el Índice de Precios al Consumidor de la Ciudad de Buenos Aires (IPCBA)",
      publicadosPor: "el IDECBA, la dirección de estadística de la Ciudad",
    },
  },
  {
    slug: "chaco",
    nombre: "Chaco",
    tipo: "provincia",
    cubre: "Se releva en el Gran Resistencia y se publica como índice provincial.",
    serie: "indec:464.1_IPC_CHACO_NG_0_0_22_93",
    origen: "ipecd-chaco",
    organismo: "Instituto Provincial de Estadísticas y Ciencia de Datos del Chaco",
    organismoCorto: "IPECD",
    // El dominio viejo (estadistica.chaco.gob.ar) y el del IPECD dejaron de resolver;
    // el que está vivo es éste. La sigla del sello queda en IPECD hasta confirmar el
    // renombramiento: el propio MCP sigue devolviendo ese nombre, y cambiar el rótulo de
    // autoridad de una fila por una inferencia de DNS sería peor que dejarlo viejo.
    url: "https://dipiet.chaco.gob.ar/",
    etiqueta: {
      corta: "IPC de Chaco",
      larga: "el IPC de la Provincia del Chaco",
      publicadosPor: "el instituto de estadística del Chaco",
    },
  },
  {
    slug: "cordoba",
    nombre: "Córdoba",
    tipo: "provincia",
    cubre: "Índice provincial de Córdoba, con datos desde 1990.",
    serie: "ipc:cordoba",
    origen: "dgeyc-cordoba",
    organismo: "Dirección General de Estadística y Censos de la Provincia de Córdoba",
    organismoCorto: "DGEyC Córdoba",
    url: "https://estadistica.cba.gov.ar/",
    etiqueta: {
      corta: "IPC de Córdoba",
      larga: "el IPC de la Provincia de Córdoba",
      publicadosPor: "la dirección de estadística de Córdoba",
    },
  },
  {
    slug: "mendoza",
    nombre: "Mendoza",
    tipo: "provincia",
    cubre:
      "Índice provincial de Mendoza. La provincia no publicó entre marzo de 2012 y abril " +
      "de 2016, así que la serie arranca después de ese corte: rellenar el hueco sería " +
      "inventar números que no publicó nadie.",
    serie: "indec:195.1_NIVEL_GENERAL_0_0_13",
    origen: "deie-mendoza",
    organismo: "Dirección de Estadísticas e Investigaciones Económicas de Mendoza (DEIE)",
    organismoCorto: "DEIE",
    url: "https://deie.mendoza.gov.ar/",
    etiqueta: {
      corta: "IPC de Mendoza",
      larga: "el IPC de la Provincia de Mendoza",
      publicadosPor: "la DEIE, la dirección de estadística de Mendoza",
    },
  },
  {
    slug: "neuquen",
    nombre: "Neuquén",
    tipo: "provincia",
    cubre: "Índice provincial del Neuquén.",
    serie: "indec:196.1_NIVEL_GENERAL_2014_0_13",
    origen: "dpeyc-neuquen",
    organismo: "Dirección Provincial de Estadística y Censos del Neuquén",
    organismoCorto: "DPEyC Neuquén",
    url: "https://www.estadisticaneuquen.gob.ar/",
    etiqueta: {
      corta: "IPC del Neuquén",
      larga: "el IPC de la Provincia del Neuquén",
      publicadosPor: "la dirección de estadística del Neuquén",
    },
  },
  {
    slug: "rio-negro",
    nombre: "Río Negro",
    tipo: "provincia",
    cubre: "Se releva en Viedma y se publica como referencia provincial.",
    serie: "ipc:rio_negro",
    origen: "deyc-rio-negro",
    organismo: "Dirección de Estadística y Censos de la Provincia de Río Negro",
    organismoCorto: "DEyC Río Negro",
    url: "https://estadisticaycensos.rionegro.gov.ar/",
    etiqueta: {
      corta: "IPC de Río Negro",
      larga: "el IPC de Viedma, que Río Negro publica como referencia provincial",
      publicadosPor: "la dirección de estadística de Río Negro",
    },
  },
  {
    slug: "san-luis",
    nombre: "San Luis",
    tipo: "provincia",
    cubre: "Índice provincial de San Luis.",
    serie: "indec:197.1_NIVEL_GENERAL_2014_0_13",
    origen: "dpeyc-san-luis",
    organismo: "Dirección Provincial de Estadística y Censos de San Luis",
    organismoCorto: "DPEyC San Luis",
    url: "https://www.estadistica.sanluis.gov.ar/",
    etiqueta: {
      corta: "IPC de San Luis",
      larga: "el IPC de la Provincia de San Luis",
      publicadosPor: "la dirección de estadística de San Luis",
    },
  },
  {
    slug: "santa-fe",
    nombre: "Santa Fe",
    tipo: "provincia",
    cubre: "Índice provincial de Santa Fe.",
    serie: "indec:198.1_NIVEL_GENERAL_2014_0_13",
    origen: "ipec-santa-fe",
    organismo: "Instituto Provincial de Estadística y Censos de Santa Fe (IPEC)",
    organismoCorto: "IPEC Santa Fe",
    url: "https://www.santafe.gob.ar/index.php/web/content/view/full/113239",
    etiqueta: {
      corta: "IPC de Santa Fe",
      larga: "el IPC de la Provincia de Santa Fe",
      publicadosPor: "el IPEC, el instituto de estadística de Santa Fe",
    },
  },
  {
    slug: "tucuman",
    nombre: "Tucumán",
    tipo: "provincia",
    cubre: "Índice provincial de Tucumán.",
    serie: "indec:199.1_NIVEL_GENERAL_2014_0_13",
    origen: "de-tucuman",
    organismo: "Dirección de Estadística de la Provincia de Tucumán",
    organismoCorto: "Estadística Tucumán",
    url: "https://estadistica.tucuman.gov.ar/",
    etiqueta: {
      corta: "IPC de Tucumán",
      larga: "el IPC de la Provincia de Tucumán",
      publicadosPor: "la dirección de estadística de Tucumán",
    },
  },

  /* ── Las seis regiones del INDEC ──────────────────────────────────────────── */
  {
    // El GBA es la única región que no lleva la coletilla: sí es el índice del aglomerado
    // que nombra, entero. Lo que hay que decir acá es la otra cosa —que incluye la Ciudad
    // y el conurbano juntos— porque quien busca sólo la Ciudad tiene el IPCBA al lado.
    slug: "gba",
    nombre: "Región Gran Buenos Aires",
    enElSelector: "Región Gran Buenos Aires (CABA y conurbano)",
    tipo: "region",
    cubre:
      "Cubre la Ciudad de Buenos Aires y los 24 partidos del conurbano bonaerense juntos. " +
      "Si buscás sólo la Ciudad, está el IPCBA del IDECBA.",
    serie: "indec:148.3_INIVELGBA_DICI_M_21",
    ...INDEC,
    origen: "indec-gba",
    organismoCorto: "INDEC Gran Buenos Aires",
    etiqueta: {
      corta: "IPC Región Gran Buenos Aires del INDEC",
      larga: "el IPC de la Región Gran Buenos Aires del INDEC",
      publicadosPor: "el INDEC",
    },
  },
  region(
    "pampeana",
    "Región Pampeana",
    "indec:148.3_INIVELANA_DICI_M_26",
    "Buenos Aires, Córdoba, Entre Ríos, La Pampa y Santa Fe",
    "Buenos Aires, Córdoba, Entre Ríos, La Pampa, Santa Fe",
  ),
  region(
    "noroeste",
    "Región Noroeste",
    "indec:148.3_INIVELNOA_DICI_M_21",
    "Catamarca, Jujuy, La Rioja, Salta, Santiago del Estero y Tucumán",
    "Catamarca, Jujuy, La Rioja, Salta, Sgo. del Estero, Tucumán",
  ),
  region(
    "noreste",
    "Región Noreste",
    "indec:148.3_INIVELNEA_DICI_M_21",
    "Corrientes, Chaco, Formosa y Misiones",
    "Corrientes, Chaco, Formosa, Misiones",
  ),
  region(
    "cuyo",
    "Región Cuyo",
    "indec:148.3_INIVELUYO_DICI_M_22",
    "Mendoza, San Juan y San Luis",
    "Mendoza, San Juan, San Luis",
  ),
  region(
    "patagonia",
    "Región Patagónica",
    "indec:148.3_INIVELNIA_DICI_M_27",
    "Chubut, Neuquén, Río Negro, Santa Cruz y Tierra del Fuego",
    "Chubut, Neuquén, Río Negro, Santa Cruz, T. del Fuego",
  ),
];
