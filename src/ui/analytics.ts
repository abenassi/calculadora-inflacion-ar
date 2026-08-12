/**
 * Analytics del sitio. Manda eventos a Argentina Data MCP, que los guarda en su propio Postgres.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * SI FORKEASTE ESTE REPO: no manda nada.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * `SITIOS` mapea hostname → identificador, y sólo se emite desde un hostname que esté en ese mapa.
 * Un fork desplegado en cualquier otro lado —o corriendo en localhost— es un no-op completo: no
 * hay red, no hay endpoint, no hay que borrar nada ni pedir una key. Para prender el tuyo, agregá
 * tu hostname acá y apuntá `ENDPOINT` a tu propio backend.
 *
 * Esto es deliberado y va más allá de la cortesía: si el gate fuera una env var o una constante
 * que hay que acordarse de apagar, cada fork nos mandaría eventos indistinguibles de los nuestros
 * y los conteos dejarían de ser de este sitio.
 *
 * QUÉ SE MANDA, EN CONCRETO
 * Qué página se abrió, qué se calculó (monto, período, metodología), y qué botones se tocaron.
 * NO se manda ningún identificador de persona: el servidor deriva un visitante anónimo que rota
 * todos los días y no guarda la IP. El detalle está en /datos y el diseño en el repo del MCP.
 * Por eso mismo el sitio no tiene banner de cookies: no hay ninguna que avisar.
 */

import type { Metodologia, Punto, Resultado } from "../engine/types.js";
import { diffMeses, esFecha, mesDe } from "../engine/mes.js";

/** Hostnames que emiten, y con qué nombre. Ver el bloque de arriba antes de tocar. */
const SITIOS: Record<string, string> = {
  "inflacion.mymcps.dev": "calculadora-inflacion",
};

const ENDPOINT = "https://argentinadata.mymcps.dev/api/eventos";

const SITIO = SITIOS[location.hostname];

/** Clave de sesión en sessionStorage: muere al cerrar la pestaña, que es exactamente su alcance. */
const CLAVE_SESION = "sesion-analytics";

function idDeSesion(): string | null {
  try {
    let id = sessionStorage.getItem(CLAVE_SESION);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(CLAVE_SESION, id);
    }
    return id;
  } catch {
    // Safari en navegación privada tira al tocar sessionStorage. Sin sesión el evento igual sirve
    // para contar volumen, así que se sigue.
    return null;
  }
}

type Props = Record<string, string | number | boolean | null>;

/**
 * Emite un evento. Nunca tira y nunca bloquea: si algo sale mal, el sitio no se entera.
 *
 * `sendBeacon` primero porque es la única forma de que un evento sobreviva a que el usuario cierre
 * la pestaña o navegue — justo el caso del clic que se va al MCP, que es el evento que más
 * importa. Va como texto plano a propósito: un `application/json` cross-origin dispararía un
 * preflight CORS que sendBeacon no sabe hacer, y el evento se perdería en silencio.
 */
export function evento(nombre: string, props: Props = {}): void {
  if (!SITIO) return;

  const cuerpo = JSON.stringify({
    sitio: SITIO,
    evento: nombre,
    sesion: idDeSesion(),
    ruta: location.pathname,
    referrer: document.referrer || null,
    utm_source: parametro("utm_source"),
    utm_medium: parametro("utm_medium"),
    utm_campaign: parametro("utm_campaign"),
    props,
  });

  try {
    const blob = new Blob([cuerpo], { type: "text/plain;charset=UTF-8" });
    if (navigator.sendBeacon?.(ENDPOINT, blob)) return;
  } catch {
    // Cae al fetch de abajo.
  }

  try {
    void fetch(ENDPOINT, {
      method: "POST",
      body: cuerpo,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      keepalive: true,
      mode: "cors",
    }).catch(() => {});
  } catch {
    // Sin red, sin analytics. No es un problema del usuario.
  }
}

function parametro(nombre: string): string | null {
  return new URLSearchParams(location.search).get(nombre);
}

/* ------------------------------------------------------------ eventos del sitio */

export function pageview(): void {
  evento("pageview");
}

/**
 * Cuántos meses hacia atrás mira una consulta. Es el número que separa "actualizo un presupuesto
 * del trimestre" de "cuánto valdría hoy mi sueldo de 2015" — dos usos distintos del mismo sitio.
 */
function mesesAtras(desde: Punto, hasta: Punto): number {
  return diffMeses(mesDe(desde), mesDe(hasta));
}

/**
 * El evento que importa. Se llama con debounce desde main.ts: el cálculo se recomputa en cada
 * tecla del monto, y sin eso una sola consulta emitiría diez eventos y la mediana de montos
 * mediría lo que la gente tipea a mitad de camino, no lo que quiso consultar.
 */
export function calculo(r: Resultado): void {
  evento("calculo", {
    monto: Math.round(r.monto),
    modo: esFecha(r.desde) || esFecha(r.hasta) ? "fecha" : "mes",
    metodologia: r.metodologia,
    desde: r.desde,
    hasta: r.hasta,
    meses_atras: mesesAtras(r.desde, r.hasta),
    variacion_pct: Math.round(r.variacionPct * 100) / 100,
    // Si el tramo necesitó estimar, la consulta toca meses que el INDEC todavía no publicó. Dice
    // cuánta gente viene por el pasado y cuánta por el presente inmediato.
    estimado: r.metodo.tipo !== "directo",
  });
}

export function cambioMetodologia(a: Metodologia): void {
  evento("metodologia", { metodologia: a });
}

export function cambioModo(modo: "mes" | "fecha"): void {
  evento("modo", { modo });
}

const HOST_MCP = "argentinadata.mymcps.dev";

/**
 * Le pone `?ref=calculadora` a los links al MCP, para que del otro lado se sepa que la visita
 * (y con suerte la suscripción) vino de acá.
 *
 * Se hace al cargar y NO al hacer clic. Hacerlo en el handler del clic parece equivalente y no lo
 * es: se pierde en todo lo que no es un clic izquierdo común —abrir en pestaña nueva, clic del
 * medio, "copiar dirección del enlace", compartir— que es justo cómo se propaga un link que a
 * alguien le interesó. El atributo tiene que estar puesto antes de que el usuario haga nada.
 */
function marcarLinksMcp(): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>(`a[href*="${HOST_MCP}"]`)) {
    try {
      const url = new URL(link.href, location.href);
      if (url.hostname !== HOST_MCP || url.searchParams.has("ref")) continue;
      url.searchParams.set("ref", "calculadora");
      link.href = url.toString();
    } catch {
      // Un href que no parsea no es nuestro problema; se deja como está.
    }
  }
}

/**
 * Engancha los clics que salen del sitio y marca los links al MCP.
 *
 * Los clics van con delegación en el document y no con listeners por link porque el `<main>` se
 * repinta en cada cálculo: un listener por nodo se perdería en el primer repintado.
 */
export function engancharClics(): void {
  if (!SITIO) return;

  marcarLinksMcp();

  document.addEventListener("click", (ev) => {
    const link = (ev.target as HTMLElement | null)?.closest?.("a[href]");
    if (!(link instanceof HTMLAnchorElement)) return;

    let host: string;
    try {
      host = new URL(link.href, location.href).hostname;
    } catch {
      return;
    }
    if (host === location.hostname) return;

    if (host === HOST_MCP) {
      // `marcarLinksMcp()` ya le puso el ref al cargar; acá se vuelve a intentar sólo por si el
      // link apareció después. Lo que importa de este handler es el evento.
      marcarLinksMcp();
      evento("clic_mcp", { destino: new URL(link.href).pathname });
      return;
    }

    evento("clic_fuente", { destino: host });
  });
}
