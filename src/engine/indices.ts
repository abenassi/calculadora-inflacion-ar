/**
 * El catálogo de índices con los que se puede calcular.
 *
 * Vive en `engine/` y no en `ui/` porque es dato, no pintura: el pipeline lo escribe en
 * `public/data/indices.json` y la interfaz lo lee. Acá adentro no se hace ninguna cuenta.
 *
 * Es un archivo aparte del de cada serie —y chico, un kilobyte— porque se baja siempre,
 * incluso para quien nunca abre el selector. Los índices en sí pesan cien veces más y se
 * bajan sólo cuando se eligen.
 */

import { compararMeses, esFecha, mesDe, mesPisoNecesario, primerDia, sumarMeses } from "./mes.js";
import type { Mes, Punto } from "./types.js";

/**
 * Qué es la jurisdicción que se eligió.
 *
 * `region` no es un detalle de presentación: son las seis regiones del INDEC, que existen
 * porque catorce provincias **no miden su propia inflación**. Una región cubre a varias
 * provincias y no mide a ninguna en particular, así que la interfaz tiene que poder
 * decirlo en vez de dejar que se lea como el índice de la provincia de quien la eligió.
 */
export type TipoIndice = "nacional" | "provincia" | "region";

export type EntradaCatalogo = {
  slug: string;
  /** Cómo se llama en las frases del sitio. */
  nombre: string;
  /**
   * Cómo se lee en el desplegable, cuando decir sólo el nombre no alcanza.
   *
   * Las regiones lo usan para llevar sus provincias adentro del renglón: alguien de
   * Formosa que mira la lista ve seis nombres de regiones y ninguno dice Formosa, así que
   * sin esto tiene que elegir a ciegas y leer el párrafo de abajo para saber si le tocaba.
   */
  enElSelector?: string;
  tipo: TipoIndice;
  /**
   * Qué mide de verdad, en una oración. Se muestra sólo cuando el índice elegido no es el
   * nacional. Es lo que impide que una región se lea como si fuera un índice provincial.
   */
  cubre: string;
  /**
   * Las siglas de los organismos que lo publican, en el orden del empalme.
   *
   * Está acá y no sólo en el archivo de la serie porque la página de fuentes las muestra
   * para los dieciséis: leerlas de cada archivo la obligaba a bajar 400 KB para una
   * columna, y a que una sola respuesta con error se llevara puesta la tabla entera.
   */
  organismos: string[];
  primerMes: Mes;
  ultimoOficial: Mes;
  /**
   * Un tramo viejo de la serie que hay que leer con cuidado, y por qué.
   *
   * La nota del índice la muestra sólo cuando el período elegido entra en el tramo: con
   * Chaco de 2024 a hoy no tiene nada que decir, y con 1965 es lo primero que hay que saber.
   */
  salvedad?: { hasta: Mes; texto: string };
};

export type CatalogoIndices = {
  indices: EntradaCatalogo[];
  actualizado: string;
};

export const SLUG_NACIONAL = "nacional";

/**
 * El índice pedido, o el nacional si no existe.
 *
 * No tira: un `?indice=` viejo, mal tipeado o copiado de un fork no puede dejar la página
 * en blanco. Se cae al nacional, que es lo que la persona habría visto sin el parámetro.
 */
export function buscarIndice(catalogo: CatalogoIndices, slug: string | null): EntradaCatalogo {
  const nacional = catalogo.indices.find((i) => i.slug === SLUG_NACIONAL);
  if (!nacional) throw new Error("El catálogo no trae el índice nacional");
  if (!slug) return nacional;
  return catalogo.indices.find((i) => i.slug === slug) ?? nacional;
}

/**
 * Los tres grupos del desplegable: el nacional primero y solo, después las provincias que
 * miden, y al final las regiones.
 *
 * El orden es alfabético **por nombre** y con `localeCompare` en es-AR. Ordenar por slug
 * daría un orden que nadie puede predecir mirando la lista —"caba" cae antes que "córdoba"
 * pero se lee "Ciudad de Buenos Aires"— y un sort binario mandaría los acentos y la Ñ al
 * final.
 */
export function agruparParaSelector(catalogo: CatalogoIndices): {
  nacional: EntradaCatalogo;
  provincias: EntradaCatalogo[];
  regiones: EntradaCatalogo[];
} {
  const porNombre = (a: EntradaCatalogo, b: EntradaCatalogo) =>
    a.nombre.localeCompare(b.nombre, "es-AR");

  return {
    nacional: buscarIndice(catalogo, SLUG_NACIONAL),
    provincias: catalogo.indices.filter((i) => i.tipo === "provincia").sort(porNombre),
    regiones: catalogo.indices.filter((i) => i.tipo === "region").sort(porNombre),
  };
}

/**
 * Cuántos meses hay que estar detrás del índice nacional para que valga la pena avisarlo.
 *
 * Dos, porque uno es lo normal: los organismos provinciales publican en fechas distintas
 * y en cualquier momento del mes hay alguno que todavía no sacó el mes anterior. Avisar
 * de eso sería un cartel permanente que nadie lee. Tres o más meses de atraso, en cambio,
 * cambia de verdad la ventana sobre la que se calcula y hay que decirlo.
 */
export const MESES_DE_ATRASO_TOLERADOS = 2;

/**
 * Hasta cuántos meses más allá del último dato publicado se puede pedir.
 *
 * Repetir la última variación mensual más allá de dos años es ruido con forma de número.
 */
export const HORIZONTE_MESES = 24;

/**
 * Los dos extremos que el índice puede contestar: `[primer mes con dato, último pedible]`.
 *
 * **Es la única fuente de ese rango.** Lo tienen que responder los tres lugares que antes
 * lo calculaban por su cuenta —los desplegables de mes y año, el `min`/`max` de los campos
 * de fecha, y el acotado que corre el período cuando cambiás de índice— y hasta ahora
 * cada uno lo hacía distinto. El resultado eran dos agujeros que el review encontró: el
 * desplegable ofrecía meses del primer año que el motor rechaza (Santa Fe mide desde
 * diciembre de 2013 y se podía elegir enero de 2013) y sólo se acotaba por abajo, así que
 * un índice que se atrasara hasta cruzar un año dejaba el año seleccionado sin `option` y
 * el sitio contestaba `Mes inválido: "-05"`.
 */
export function rangoPedible(serie: { datos: { mes: Mes }[]; ultimo_oficial: Mes }): {
  primero: Mes;
  ultimo: Mes;
} {
  return {
    primero: serie.datos[0]!.mes,
    ultimo: sumarMeses(serie.ultimo_oficial, HORIZONTE_MESES),
  };
}

/**
 * El primer mes que se puede pedir en un índice.
 *
 * En modo por mes es el primero de la serie: el índice de nivel alcanza. En modo por día es
 * uno después: prorratear un día del primer mes necesita el índice del mes anterior, que no
 * existe. El calendario, los atajos y el acotado del período tienen que usar el mismo piso.
 */
export function primerMesPedibleDe(
  serie: { datos: { mes: Mes }[]; ultimo_oficial: Mes },
  dias: boolean,
): Mes {
  const { primero } = rangoPedible(serie);
  return dias ? sumarMeses(primero, 1) : primero;
}

/**
 * Lo que se escribe en el formulario para un punto pedido, y si se corrió contra qué extremo.
 *
 * El piso se mide con `mesPisoNecesario`, el del motor: una fecha necesita también el mes
 * anterior. Con el mes de la fecha, el 15 de enero de 1968 entraba en Córdoba (que arranca en
 * enero de 1968) y el motor lo rechazaba; y al correrlo se escribía el 1 de enero, que
 * tampoco calcula. Se corre al primer punto que el calendario ofrece. Es el mismo piso que
 * usa `indicesQueCubren`: el índice que el aviso sugiere es uno que deja el pedido intacto.
 */
export function acotarPunto(
  punto: Punto,
  serie: { datos: { mes: Mes }[]; ultimo_oficial: Mes },
  dias: boolean,
): { escribir: Punto; contra: "primero" | "ultimo" | null } {
  const { primero, ultimo } = rangoPedible(serie);
  const aPunto = (mes: Mes): Punto => (dias ? primerDia(mes) : mes);
  if (compararMeses(mesPisoNecesario(punto), primero) < 0) {
    return { escribir: aPunto(primerMesPedibleDe(serie, dias)), contra: "primero" };
  }
  if (compararMeses(mesDe(punto), ultimo) > 0) return { escribir: aPunto(ultimo), contra: "ultimo" };
  return { escribir: punto, contra: null };
}

/** Una punta del período que no entraba en el índice elegido, y contra qué extremo se topó. */
export type PeriodoCorrido = {
  punta: "desde" | "hasta";
  /** El punto que se había pedido. La nota lo nombra: correrlo en silencio sería cambiarle
   * la pregunta a la persona sin decírselo. */
  pedido: Punto;
  contra: "primero" | "ultimo";
};

/**
 * El período que hay que intentar escribir al cambiar de índice.
 *
 * Es el del formulario, salvo las puntas que el índice anterior corrió y que la persona no
 * volvió a tocar: ésas vuelven a lo que se había pedido. Si no, el pedido se perdía en el
 * primer índice que no lo alcanzaba: un link con `desde=1965-01` abierto con el nacional
 * quedaba en enero de 1990, y al elegir Chaco —que mide desde 1960— seguía en 1990, con
 * la nota diciendo "pediste desde enero 1965" arriba de un cálculo que no lo honraba.
 *
 * Un pedido de otro modo (mes contra fecha) no se restituye: la persona cambió de modo
 * después, y escribir un mes en un campo de fecha lo dejaría en blanco.
 */
export function periodoAIntentar(
  formulario: { desde: Punto; hasta: Punto },
  corridos: readonly PeriodoCorrido[],
): { desde: Punto; hasta: Punto } {
  const periodo = { ...formulario };
  for (const c of corridos) {
    if (esFecha(c.pedido) === esFecha(formulario[c.punta])) periodo[c.punta] = c.pedido;
  }
  return periodo;
}

/**
 * Los otros índices que sí arrancan antes de un punto que el elegido no alcanza.
 *
 * El aviso de "se corrió el período" decía qué pasó pero no qué hacer: quien llega con un
 * link de 1965 al nacional no tiene cómo saber que Chaco lo cubre sin abrir los dieciséis.
 * Mira el `primerMes` del catálogo con el mismo piso que `rangoPedible` (y, con fechas,
 * el mes anterior que necesita el prorrateo: ver `mesPisoNecesario`).
 */
export function indicesQueCubren(
  catalogo: CatalogoIndices,
  pedido: Punto,
  salvo: string,
): EntradaCatalogo[] {
  const piso = mesPisoNecesario(pedido);
  const { nacional, provincias, regiones } = agruparParaSelector(catalogo);
  return [nacional, ...provincias, ...regiones].filter(
    (i) => i.slug !== salvo && compararMeses(i.primerMes, piso) <= 0,
  );
}

/**
 * Si el período entra en el tramo de la salvedad del índice. Va por la punta más vieja,
 * así que deflactar (desde más nuevo que hasta) cuenta igual.
 */
export function tocaLaSalvedad(
  entrada: Pick<EntradaCatalogo, "salvedad">,
  desde: Punto,
  hasta: Punto,
): boolean {
  if (!entrada.salvedad) return false;
  const viejo = compararMeses(mesDe(desde), mesDe(hasta)) <= 0 ? mesDe(desde) : mesDe(hasta);
  return compararMeses(viejo, entrada.salvedad.hasta) <= 0;
}
