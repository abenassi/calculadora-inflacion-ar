/**
 * Gráfico de la inflación mensual del IPC en los meses que entraron en el cálculo.
 *
 * Antes graficaba la evolución del monto, y no decía nada: un monto ajustado por
 * inflación siempre sube, así que la curva era la misma forma para cualquier
 * consulta. Lo que sí varía —y lo que la persona necesita para defender el
 * porcentaje que aplicó— es cuánto subió cada mes.
 *
 * Una sola serie, así que no lleva caja de leyenda: el título nombra qué se está viendo.
 * Adentro de la serie hay **tres** clases de barra, no dos, y ninguna se distingue por
 * color solo: el mes publicado va liso, el estimado va con trama diagonal, y el tramo
 * prorrateado —que no es ninguna de las dos: su número no lo publicó nadie, pero tampoco
 * es una estimación— va con el mismo color más claro y el contorno lleno. Las tres tienen
 * su leyenda inline en el encabezado.
 *
 * Colores tomados de la paleta de referencia (slot categórico 1), validados contra
 * ambas superficies con el validador del skill de dataviz.
 */

import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  Tooltip,
} from "chart.js";

import type { Resultado } from "../engine/types.js";
import { hayTramosDeDias, llevaSello, rotularFila } from "./etiquetas.js";
import { porcentaje } from "./format.js";

Chart.register(CategoryScale, LinearScale, BarController, BarElement, Tooltip);

type Tokens = {
  serie: string;
  /** Segunda serie categórica, para el overlay del cross-check en `chart-serie.ts`. */
  serie2: string;
  /** Tercera serie categórica: en `/tcr.html`, el cross-check bilateral del BCRA
   *  (las dos curvas reales ya usan `serie`/`serie2`). */
  serie3: string;
  /** Cuarta serie categórica: en `/tcr.html`, el cross-check multilateral del BCRA. */
  serie4: string;
  grilla: string;
  eje: string;
  texto: string;
  superficie: string;
};

export function tokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const leer = (n: string, fallback: string) => cs.getPropertyValue(n).trim() || fallback;
  return {
    serie: leer("--series-1", "#2a78d6"),
    serie2: leer("--series-2", "#c96a1f"),
    serie3: leer("--series-3", "#9c4ea1"),
    serie4: leer("--series-4", "#1baf7a"),
    grilla: leer("--gridline", "#e1e0d9"),
    eje: leer("--muted", "#898781"),
    texto: leer("--text-primary", "#0b0b0b"),
    superficie: leer("--surface-1", "#fcfcfb"),
  };
}

/**
 * Trama diagonal para las barras estimadas.
 *
 * La distinción oficial/estimado no puede depender del color: es lo que separa un
 * dato de una cuenta nuestra. Con trama sobrevive al daltonismo, a la impresión en
 * blanco y negro y al modo de alto contraste.
 */
/**
 * El mismo color con menos peso, para las barras prorrateadas.
 *
 * Sigue al color de la serie en vez de ser un token propio porque el gráfico lee sus
 * colores del CSS y hay tema claro y oscuro.
 *
 * Devuelve un hex de 8 dígitos y no un `color-mix()`: un `fillStyle` que el browser no
 * parsea **se ignora sin error**, y la barra se quedaría con el color anterior, o sea
 * idéntica a una oficial. La degradación silenciosa iría hacia "esto parece un dato
 * publicado", que es el lado que la regla 2 prohíbe. Si el token no es un hex —una serie
 * futura podría traer `oklch()`—, se devuelve el color tal cual y la barra queda
 * distinguida igual por el contorno.
 */
export function conAlfa(color: string, alfa: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!hex) return color;
  return `#${hex[1]}${Math.round(alfa * 255).toString(16).padStart(2, "0")}`;
}

function trama(color: string, fondo: string): CanvasPattern | string {
  const tile = document.createElement("canvas");
  tile.width = 6;
  tile.height = 6;
  const ctx = tile.getContext("2d");
  if (!ctx) return color;

  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, 6, 6);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  // Tres trazos: el central más los dos que cierran el calce con la baldosa
  // vecina, para que la diagonal no se corte en los bordes del patrón.
  ctx.moveTo(0, 6);
  ctx.lineTo(6, 0);
  ctx.moveTo(-1, 1);
  ctx.lineTo(1, -1);
  ctx.moveTo(5, 7);
  ctx.lineTo(7, 5);
  ctx.stroke();

  return ctx.createPattern(tile, "repeat") ?? color;
}

let grafico: Chart | null = null;

export function dibujar(canvas: HTMLCanvasElement, r: Resultado): void {
  const t = tokens();
  // La primera fila es el punto de origen: no tiene variación propia, sólo fija el
  // monto de partida. Graficarla como una barra en cero sería una lectura falsa.
  const filas = r.desglose.slice(1);
  const estimada = trama(t.serie, t.superficie);
  // Una barra prorrateada no es un dato publicado, y hasta ahora se pintaba igual que
  // uno: la distinción existía en la tabla, en el sello, y el gráfico la borraba. No
  // lleva la trama de lo estimado —no es una estimación, es un dato repartido entre los
  // días—, lleva el mismo color más claro y el contorno lleno, que se lee como "esto es
  // de la misma familia pero no es lo mismo".
  const prorrateada = conAlfa(t.serie, 0.45);

  grafico?.destroy();
  grafico = new Chart(canvas, {
    type: "bar",
    data: {
      // `i + 1` porque `filas` salteó la fila de origen del desglose.
      labels: filas.map((_, i) => rotularFila(r.desglose, i + 1, true)),
      datasets: [
        {
          label: hayTramosDeDias(r.desglose) ? "Inflación del tramo" : "Inflación mensual",
          data: filas.map((f) => f.varMensualPct ?? 0),
          backgroundColor: filas.map((f) =>
            f.esProyeccion ? estimada : f.esParcial ? prorrateada : t.serie,
          ),
          borderColor: t.serie,
          borderWidth: filas.map((f) => (llevaSello(f) ? 0 : 1)),
          // Punta redondeada del lado del dato; el extremo apoyado en la línea de
          // cero queda recto. Las barras son inflación mensual, así que suben también
          // deflactando (0014); bajan sólo cuando el mes tuvo deflación de verdad, y ahí
          // Chart.js invierte el lado sin que haya que hacer nada.
          borderRadius: 4,
          borderSkipped: "start",
          // Con tres o cuatro meses, barras finas quedan como islas en un
          // panel vacío. El tope alto las deja legibles sin deformarlas cuando
          // el período es largo.
          maxBarThickness: 72,
          // 2px de superficie entre barras vecinas.
          categoryPercentage: 0.8,
          barPercentage: 0.9,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // Sin animación, por dos razones. La primera es que el gráfico se redibuja en
      // cada tecla del formulario, así que la animación no llega a terminar nunca y
      // sólo produce un rebote. La segunda es que ata el dibujo a que corra
      // `requestAnimationFrame`: si no corre, las barras quedan clavadas en altura
      // cero y el panel se ve vacío con los ejes puestos, que es exactamente el bug
      // que este comentario evita que alguien reintroduzca.
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        tooltip: {
          backgroundColor: t.texto,
          // Mismo motivo que en `chart-serie.ts`: el fondo es `t.texto` (blanco en
          // modo oscuro), así que el texto necesita el color opuesto o queda
          // blanco sobre blanco con el default de Chart.js.
          titleColor: t.superficie,
          bodyColor: t.superficie,
          padding: 10,
          displayColors: false,
          callbacks: {
            title: (items) => {
              const i = items[0]?.dataIndex ?? 0;
              const fila = filas[i]!;
              const marca = fila.esProyeccion ? " · estimado" : fila.esParcial ? " · prorrateado" : "";
              return `${rotularFila(r.desglose, i + 1)}${marca}`;
            },
            label: (item) => {
              const fila = filas[item.dataIndex]!;
              // Por fila y no por tabla: decir "del mes" sobre un tramo de 15 días le pone
              // el nombre de julio (+2,11%) a un número que es +1,02%. Es la misma pregunta
              // que se hace `rotularFila` para elegir entre un mes y un rango, aunque desde
              // la 0014 esa función tiene además un caso propio (ver `hayTramosDeDias`).
              const de = fila.esParcial ? "Inflación del tramo" : "Inflación del mes";
              const partes = [`${de}: ${porcentaje(fila.varMensualPct ?? 0)}`];
              if (fila.acumuladoPct !== null) {
                partes.push(`${porcentaje(fila.acumuladoPct)} acumulado`);
              }
              return partes;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: t.grilla },
          ticks: { color: t.eje, maxRotation: 0, autoSkipPadding: 12, font: { size: 11 } },
        },
        y: {
          // Siempre desde cero: es una tasa, y recortar la base exagera
          // visualmente diferencias de décimas.
          beginAtZero: true,
          grid: { color: t.grilla },
          border: { display: false },
          ticks: {
            color: t.eje,
            font: { size: 11 },
            maxTicksLimit: 6,
            // Los ticks son valores redondos: "1%" se lee mejor que "1,00%".
            callback: (v) =>
              `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(Number(v))}%`,
          },
        },
      },
    },
  });
}
