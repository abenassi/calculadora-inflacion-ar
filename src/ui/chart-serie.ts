/**
 * Gráfico de línea de una serie propia ya reindexada: la curva nominal (tal cual
 * la pegó la persona) y la actualizada, una al lado de la otra — es lo que hace
 * que el resultado se pueda defender, no sólo mostrar un número final.
 *
 * Puntos con `valorActualizado: null` (no se pudieron actualizar sin estimar, ver
 * `actualizarSerie`) cortan la línea actualizada en ese tramo — Chart.js interpreta
 * `null` como corte, no como cero ni como interpolación.
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

import type { PuntoSerieActualizado } from "../engine/actualizar.js";
import { abreviarPunto } from "../engine/mes.js";
import { conAlfa, tokens } from "./chart.js";
import { pesosRedondo } from "./format.js";

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip, Legend);

let grafico: Chart | null = null;

export function dibujarSerieActualizada(
  canvas: HTMLCanvasElement,
  puntos: PuntoSerieActualizado[],
  mesObjetivoTexto: string,
): void {
  const t = tokens();

  const datasets: ChartDataset<"line", (number | null)[]>[] = [
    {
      label: "Serie original",
      data: puntos.map((p) => p.valorOriginal),
      borderColor: conAlfa(t.serie, 0.45),
      backgroundColor: conAlfa(t.serie, 0.45),
      borderDash: [6, 4],
      pointRadius: 0,
      borderWidth: 2,
    },
    {
      label: `A pesos de ${mesObjetivoTexto}`,
      data: puntos.map((p) => p.valorActualizado),
      borderColor: t.serie,
      backgroundColor: t.serie,
      pointRadius: 0,
      borderWidth: 2,
    },
  ];

  grafico?.destroy();
  grafico = new Chart(canvas, {
    type: "line",
    data: {
      labels: puntos.map((p) => abreviarPunto(p.punto)),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, labels: { color: t.eje, font: { size: 11 } } },
        tooltip: {
          backgroundColor: t.texto,
          titleColor: t.superficie,
          bodyColor: t.superficie,
          padding: 10,
          callbacks: {
            label: (item) =>
              item.raw === null
                ? `${item.dataset.label}: no se pudo actualizar sin estimar`
                : `${item.dataset.label}: ${pesosRedondo(Number(item.raw))}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: t.grilla },
          ticks: { color: t.eje, maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 11 } },
        },
        y: {
          grid: { color: t.grilla },
          border: { display: false },
          ticks: { color: t.eje, font: { size: 11 }, callback: (v) => pesosRedondo(Number(v)) },
        },
      },
    },
  });
}
