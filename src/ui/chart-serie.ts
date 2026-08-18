/**
 * Gráfico de línea de una serie ya reindexada.
 *
 * En el caso simple —sin índice secundario— es un solo trazo, sin la distinción
 * oficial/estimado que sí necesita el gráfico de barras: `actualizarSerie` ya
 * descarta los puntos que necesitarían estimar, así que todo lo que llega acá es
 * cálculo directo o ventana de referencia, nunca una tasa inventada.
 *
 * Con un índice secundario activo (tipo de cambio real bilateral) se agregan hasta
 * dos trazos más, sin tocar el primero: `valorSoloBase` —el mismo color, más claro y
 * punteado, "sólo pesos" al lado de "tipo de cambio real"— y el cross-check oficial
 * del BCRA, en un eje secundario porque es un índice (base 100) y no está en pesos de
 * ningún mes (ver `reescalarCrossCheck` en `src/engine/actualizar.ts`).
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

import type { PuntoActualizado } from "../engine/actualizar.js";
import { abreviarMes } from "../engine/mes.js";
import { conAlfa, tokens } from "./chart.js";
import { indice, pesosRedondo } from "./format.js";

// `Legend` sólo hace falta acá (el gráfico de barras no la usa, tiene una sola serie
// y la nombra en el título) — la lista de qué se registra tiene que reflejar lo que
// el archivo de verdad dibuja, porque un plugin no registrado no tira error: la
// opción `legend: { display: true }` se ignora en silencio y la leyenda no aparece.
Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip, Legend);

/** Lo que hace falta para dibujar el overlay de tipo de cambio real, además de `valorActualizado`. */
export type OverlaySerieDoble = {
  /** Mismo largo y orden que `puntos`: el ajuste sin componer con el índice secundario. */
  valoresSoloBase: number[];
  labelSoloBase: string;
  /**
   * El cross-check oficial, ya reescalado a base 100 en el mes objetivo y alineado
   * mes a mes con `puntos` (mismo largo, `null` donde no hay dato — Chart.js lo
   * dibuja como corte de línea, no como cero). `undefined` si no hay cross-check
   * declarado o el snapshot no lo trae: el overlay es un adicional, no un bloqueante.
   */
  crossCheck?: (number | null)[];
  labelCrossCheck?: string;
};

let grafico: Chart | null = null;

export function dibujarSerieActualizada(
  canvas: HTMLCanvasElement,
  puntos: PuntoActualizado[],
  mesObjetivoTexto: string,
  overlay?: OverlaySerieDoble,
): void {
  const t = tokens();
  const hayCrossCheck = overlay?.crossCheck !== undefined;

  const datasets: ChartDataset<"line", (number | null)[]>[] = [
    {
      label: overlay
        ? `Dólar blue, tipo de cambio real a ${mesObjetivoTexto}`
        : `Dólar blue, a pesos de ${mesObjetivoTexto}`,
      data: puntos.map((p) => p.valorActualizado),
      borderColor: t.serie,
      backgroundColor: t.serie,
      pointRadius: 0,
      borderWidth: 2,
      yAxisID: "y",
    },
  ];

  if (overlay) {
    datasets.push({
      label: overlay.labelSoloBase,
      data: overlay.valoresSoloBase,
      // Mismo color que la serie principal pero más claro y punteado: es la misma
      // familia de dato ("dólar blue reindexado"), sólo que sin el segundo índice.
      borderColor: conAlfa(t.serie, 0.45),
      backgroundColor: conAlfa(t.serie, 0.45),
      borderDash: [6, 4],
      pointRadius: 0,
      borderWidth: 2,
      yAxisID: "y",
    });
  }

  if (overlay?.crossCheck) {
    datasets.push({
      label: overlay.labelCrossCheck ?? "Cross-check oficial",
      data: overlay.crossCheck,
      borderColor: t.serie2,
      backgroundColor: t.serie2,
      pointRadius: 0,
      borderWidth: 2,
      // Eje secundario: esta serie es un índice (base 100 en el mes objetivo), no
      // está en pesos de ningún mes, así que compartir el eje `y` la aplastaría o la
      // desbordaría según la escala de `valorActualizado`.
      yAxisID: "y1",
    });
  }

  grafico?.destroy();
  grafico = new Chart(canvas, {
    type: "line",
    data: {
      labels: puntos.map((p) => abreviarMes(p.mes)),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: !!overlay, labels: { color: t.eje, font: { size: 11 } } },
        tooltip: {
          backgroundColor: t.texto,
          // El fondo del tooltip es `t.texto` (blanco en modo oscuro), así que el
          // texto tiene que ir con `t.superficie` —su opuesto— para no quedar
          // blanco sobre blanco: Chart.js no hereda el color del tema, así que sin
          // esto usa su propio default (también blanco).
          titleColor: t.superficie,
          bodyColor: t.superficie,
          padding: 10,
          callbacks: {
            // El eje `y1` es un índice (base 100), no un monto: mezclar `$ 3.955` (miles
            // con punto, coma decimal) con un `123.3` de punto decimal en el mismo
            // tooltip se lee como el mismo carácter significando dos cosas distintas.
            // `indice()` ya es el formateador que usa el resto del sitio para números de
            // índice, con la misma convención es-AR que todo lo demás.
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
        ...(hayCrossCheck
          ? {
              y1: {
                position: "right" as const,
                grid: { display: false },
                border: { display: false },
                ticks: { color: t.serie2, font: { size: 11 }, callback: (v) => indice(Number(v)) },
                // El "100 = " no dice acá EN QUÉ mes, porque desde el fix de la vuelta 1
                // del review el ancla es el último dato del cross-check, no el mes
                // objetivo — y ese mes cambia con la serie, no con el gráfico. La nota
                // debajo del gráfico (`notaCrossCheck` en `actualizar-main.ts`) sí lo dice.
                title: { display: true, text: "Índice (base 100)", color: t.serie2 },
              },
            }
          : {}),
      },
    },
  });
}
