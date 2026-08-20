/**
 * Parsea una serie de valores pegada o subida como CSV: cada línea es
 * `<fecha><separador><valor>`. No hace ninguna cuenta de inflación — sólo
 * convierte texto suelto en `{ punto, valor }[]`, listo para `actualizarSerie`.
 *
 * Vive separado de `actualizarSerie` porque parsear texto y ajustar por inflación
 * son dos responsabilidades sin nada en común: ésta no sabe qué es el IPC, y
 * `actualizarSerie` no sabe qué es un CSV.
 */
import { esFechaValida, esMesValido } from "./mes.js";
import type { Punto } from "./types.js";

export type PuntoSerieUsuario = { punto: Punto; valor: number };
export type FilaInvalida = { linea: number; motivo: string };
export type ResultadoParseo = { puntos: PuntoSerieUsuario[]; errores: FilaInvalida[] };

const SEPARADORES = ["\t", ",", ";"] as const;

/**
 * Prueba los tres separadores en orden y se queda con el primero que parte la línea en
 * una fecha Y un valor que efectivamente parsean — no con el primero que simplemente
 * aparece en el texto. Antes elegía por presencia: con "punto y coma" de campo y coma
 * decimal en el valor (el CSV que exporta Excel/Sheets en configuración regional
 * Argentina/España, ej. "15/01/2024;1234,56", donde ";" separa justamente porque la
 * coma ya es el decimal), la coma aparecía antes en la línea que el separador de campo
 * real, así que cortaba ahí y partía la fecha al medio. Si ningún separador da un
 * resultado válido, cae al primero que aparece (mismo comportamiento de antes), para
 * que el mensaje de error siga señalando la línea entera.
 */
function separarLinea(linea: string): { fecha: string; valor: string } | null {
  const candidatos = SEPARADORES.map((sep) => {
    const idx = linea.indexOf(sep);
    if (idx === -1) return null;
    return { fecha: linea.slice(0, idx).trim(), valor: linea.slice(idx + 1).trim() };
  }).filter((c): c is { fecha: string; valor: string } => c !== null);

  if (candidatos.length === 0) return null;

  const valido = candidatos.find(
    (c) => parsearFecha(c.fecha) !== null && parsearValor(c.valor) !== null,
  );
  return valido ?? candidatos[0]!;
}

const ANIO_MINIMO = 1000;
const ANIO_MAXIMO = 3000;

function anioPlausible(punto: string): boolean {
  const anio = Number(punto.slice(0, 4));
  return anio >= ANIO_MINIMO && anio <= ANIO_MAXIMO;
}

function parsearFecha(crudo: string): Punto | null {
  const texto = crudo.trim();
  if (esMesValido(texto)) return anioPlausible(texto) ? texto : null;
  if (esFechaValida(texto)) return anioPlausible(texto) ? texto : null;

  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    const candidato = `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    return esFechaValida(candidato) && anioPlausible(candidato) ? candidato : null;
  }

  const mmyyyy = /^(\d{1,2})\/(\d{4})$/.exec(texto);
  if (mmyyyy) {
    const [, m, y] = mmyyyy;
    const candidato = `${y}-${m!.padStart(2, "0")}`;
    return esMesValido(candidato) && anioPlausible(candidato) ? candidato : null;
  }

  return null;
}

/**
 * Ver la regla completa en el spec ("Formato de entrada"). Resumen: con los dos
 * símbolos presentes, el último en la posición es el decimal. Con uno solo repetido,
 * es separador de miles (un decimal nunca se repite). Con uno solo una vez, 1-2
 * dígitos después es decimal, 3 es separador de miles, cualquier otro largo no
 * tiene lectura razonable.
 */
function parsearValor(crudo: string): number | null {
  const texto = crudo.trim();
  if (!/^-?[\d.,]+$/.test(texto) || !/\d/.test(texto)) return null;

  const negativo = texto.startsWith("-");
  const cuerpo = negativo ? texto.slice(1) : texto;

  const puntos = [...cuerpo.matchAll(/\./g)].map((m) => m.index!);
  const comas = [...cuerpo.matchAll(/,/g)].map((m) => m.index!);

  let normalizado: string;

  if (puntos.length > 0 && comas.length > 0) {
    const decimalEsPunto = puntos.at(-1)! > comas.at(-1)!;
    const separadorMiles = decimalEsPunto ? "," : ".";
    const separadorDecimal = decimalEsPunto ? "." : ",";
    normalizado = cuerpo.split(separadorMiles).join("").replace(separadorDecimal, ".");
  } else if (puntos.length > 1 || comas.length > 1) {
    normalizado = cuerpo.replace(/[.,]/g, "");
  } else if (puntos.length === 1 || comas.length === 1) {
    const simbolo = puntos.length === 1 ? "." : ",";
    const idx = cuerpo.indexOf(simbolo);
    const digitosDespues = cuerpo.length - idx - 1;
    if (digitosDespues === 1 || digitosDespues === 2) {
      normalizado = cuerpo.replace(simbolo, ".");
    } else if (digitosDespues === 3) {
      normalizado = cuerpo.replace(simbolo, "");
    } else {
      return null;
    }
  } else {
    normalizado = cuerpo;
  }

  const valor = Number(normalizado);
  if (!Number.isFinite(valor)) return null;
  return negativo ? -valor : valor;
}

export function parsearSerie(texto: string): ResultadoParseo {
  const lineas = texto.split(/\r\n|\r|\n/);
  const puntos: PuntoSerieUsuario[] = [];
  const errores: FilaInvalida[] = [];
  const vistos = new Set<Punto>();

  lineas.forEach((lineaCruda, i) => {
    const linea = lineaCruda.trim();
    if (linea === "") return;

    const numeroDeLinea = i + 1;
    const partida = separarLinea(linea);
    if (!partida) {
      // A diferencia del caso de abajo (fecha y valor parsean el campo pero ninguno
      // de los dos da una fecha/número válido, ahí sí se perdona en la línea 1): acá
      // no hay ni separador reconocible, así que no hay ninguna lectura razonable
      // de "esto es un encabezado" — siempre es un error, sea cual sea la línea.
      errores.push({ linea: numeroDeLinea, motivo: "no se reconoce fecha y valor separados" });
      return;
    }

    const punto = parsearFecha(partida.fecha);
    const valor = parsearValor(partida.valor);

    // Encabezado: ni la fecha ni el valor parsean, y es la primera línea. Un error
    // genuino en la línea 1 (una de las dos SÍ parsea) se reporta igual que en
    // cualquier otra línea, más abajo.
    if (punto === null && valor === null && numeroDeLinea === 1) return;

    if (punto === null) {
      errores.push({ linea: numeroDeLinea, motivo: `fecha no reconocida: "${partida.fecha}"` });
      return;
    }
    if (valor === null) {
      errores.push({ linea: numeroDeLinea, motivo: `valor no reconocido: "${partida.valor}"` });
      return;
    }
    if (vistos.has(punto)) {
      errores.push({ linea: numeroDeLinea, motivo: `fecha repetida: ${punto}` });
      return;
    }

    vistos.add(punto);
    puntos.push({ punto, valor });
  });

  return { puntos, errores };
}
