/**
 * Gráfico de línea de `/tcr.html`: siempre dos series reales — TCR-blue, TCR-oficial —
 * más, si el snapshot las trae, hasta dos líneas del BCRA (bilateral y multilateral)
 * en un eje secundario, porque son un índice y no un monto en pesos — mismo criterio
 * que `reescalarCrossCheck` en `src/engine/actualizar.ts`.
 *
 * No reusa `dibujarSerieActualizada` de `chart-serie.ts`: esa función está armada
 * para el caso de `/actualizar.html` (una sola serie real, con el label "Dólar blue"
 * escrito adentro, más su versión opcional "sólo pesos"). Acá siempre hay dos series
 * reales con nombre propio y nunca la versión "sólo pesos" — ver el spec, sección
 * "Por qué un gráfico propio".
 */
import {
  CategoryScale,
  Chart,
  type ChartDataset,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";

import { abreviarMes } from "../engine/mes.js";
import type { Mes } from "../engine/types.js";
import { tokens } from "./chart.js";
import { indice, pesosRedondo } from "./format.js";

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip, Legend);

export type SerieTcrGraficada = {
  label: string;
  /** Mismo largo y orden que `meses`; `null` donde esa serie no tiene dato ese mes. */
  valores: (number | null)[];
};

let grafico: Chart | null = null;

/**
 * `lineasIndice` trae hasta dos líneas del BCRA (bilateral, multilateral) en ese
 * orden fijo — el orden es el que decide el color: la primera va con `serie3`, la
 * segunda con `serie4`. No llevan color propio en el dato porque ya son series con
 * nombre fijo (siempre bilateral primero) y no una lista arbitraria.
 */
export function dibujarComparacionTcr(
  canvas: HTMLCanvasElement,
  meses: Mes[],
  blue: SerieTcrGraficada,
  oficial: SerieTcrGraficada,
  lineasIndice: SerieTcrGraficada[] = [],
): void {
  const t = tokens();
  const coloresIndice = [t.serie3, t.serie4];
  if (lineasIndice.length > coloresIndice.length) {
    // Sin este guard, una tercera línea de índice se dibujaría con `borderColor:
    // undefined` en silencio — Chart.js no tira ningún error, sólo pierde el color
    // de esa serie. Mejor fallar fuerte acá que dejar que el gráfico mienta.
    throw new Error(
      `dibujarComparacionTcr: ${lineasIndice.length} líneas de índice, sólo hay ${coloresIndice.length} colores`,
    );
  }
  const hayLineasIndice = lineasIndice.length > 0;

  const datasets: ChartDataset<"line", (number | null)[]>[] = [
    {
      label: blue.label,
      data: blue.valores,
      borderColor: t.serie,
      backgroundColor: t.serie,
      pointRadius: 0,
      borderWidth: 2,
      yAxisID: "y",
    },
    {
      label: oficial.label,
      data: oficial.valores,
      borderColor: t.serie2,
      backgroundColor: t.serie2,
      pointRadius: 0,
      borderWidth: 2,
      yAxisID: "y",
    },
  ];

  lineasIndice.forEach((linea, i) => {
    const color = coloresIndice[i]!;
    datasets.push({
      label: linea.label,
      data: linea.valores,
      borderColor: color,
      backgroundColor: color,
      pointRadius: 0,
      borderWidth: 2,
      // Eje secundario: esta serie es un índice (base 100), no está en pesos de
      // ningún mes, así que compartir el eje `y` la aplastaría o la desbordaría
      // según la escala de las dos curvas en pesos.
      yAxisID: "y1",
    });
  });

  grafico?.destroy();
  grafico = new Chart(canvas, {
    type: "line",
    data: {
      labels: meses.map((m) => abreviarMes(m)),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        // A diferencia de `chart-serie.ts` (leyenda sólo si hay overlay), acá SIEMPRE
        // hay al menos dos series con nombre propio (blue, oficial): la leyenda
        // siempre va.
        legend: { display: true, labels: { color: t.eje, font: { size: 11 } } },
        tooltip: {
          backgroundColor: t.texto,
          titleColor: t.superficie,
          bodyColor: t.superficie,
          padding: 10,
          callbacks: {
            // El eje `y1` es un índice (base 100), no un monto: mezclar `$ 3.955` con
            // un `123.3` de punto decimal en el mismo tooltip se lee como el mismo
            // carácter significando dos cosas distintas.
            label: (item) =>
              item.dataset.yAxisID === "y1"
                ? `${item.dataset.label}: ${indice(Number(item.raw))}`
                : `${item.dataset.label}: ${pesosRedondo(Number(item.raw))}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: t.grilla },
          ticks: {
            color: t.eje,
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 12,
            font: { size: 11 },
          },
        },
        y: {
          grid: { color: t.grilla },
          border: { display: false },
          ticks: {
            color: t.eje,
            font: { size: 11 },
            callback: (v) => pesosRedondo(Number(v)),
          },
        },
        ...(hayLineasIndice
          ? {
              y1: {
                position: "right" as const,
                grid: { display: false },
                border: { display: false },
                // Color neutro y no el de una línea puntual: puede haber una o dos
                // líneas del BCRA en este eje (bilateral, multilateral), cada una ya
                // distinguida por su propio color en la leyenda y el tooltip.
                ticks: { color: t.eje, font: { size: 11 }, callback: (v) => indice(Number(v)) },
                title: { display: true, text: "Índice (base 100)", color: t.eje },
              },
            }
          : {}),
      },
    },
  });
}
