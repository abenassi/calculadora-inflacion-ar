/**
 * Gráfico de línea de una serie ya reindexada: un solo trazo, sin la distinción
 * oficial/estimado que sí necesita el gráfico de barras — `actualizarSerie` ya
 * descarta los puntos que necesitarían estimar, así que todo lo que llega acá es
 * cálculo directo o ventana de referencia, nunca una tasa inventada.
 */
import {
  CategoryScale,
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";

import type { PuntoActualizado } from "../engine/actualizar.js";
import { abreviarMes } from "../engine/mes.js";
import { tokens } from "./chart.js";
import { pesosRedondo } from "./format.js";

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip);

let grafico: Chart | null = null;

export function dibujarSerieActualizada(
  canvas: HTMLCanvasElement,
  puntos: PuntoActualizado[],
  mesObjetivoTexto: string,
): void {
  const t = tokens();

  grafico?.destroy();
  grafico = new Chart(canvas, {
    type: "line",
    data: {
      labels: puntos.map((p) => abreviarMes(p.mes)),
      datasets: [
        {
          label: `Dólar blue, a pesos de ${mesObjetivoTexto}`,
          data: puntos.map((p) => p.valorActualizado),
          borderColor: t.serie,
          backgroundColor: t.serie,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        tooltip: {
          backgroundColor: t.texto,
          padding: 10,
          callbacks: {
            label: (item) => pesosRedondo(Number(item.raw)),
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
      },
    },
  });
}
