/**
 * Gráfico de la evolución del monto.
 *
 * Una sola serie, así que no lleva caja de leyenda: el título nombra qué se está
 * viendo. Lo único que hay que distinguir dentro de la serie es el tramo oficial
 * del proyectado, y eso va por trazo (continuo vs punteado) además de por la
 * leyenda inline del encabezado — nunca por color solo.
 *
 * Colores tomados de la paleta de referencia (slot categórico 1), validados contra
 * ambas superficies con el validador del skill de dataviz.
 */

import {
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";

import type { Resultado } from "../engine/types.js";
import { abreviarPunto } from "../engine/mes.js";
import { pesos, porcentaje } from "./format.js";

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Filler, Tooltip);

type Tokens = {
  serie: string;
  grilla: string;
  eje: string;
  texto: string;
  superficie: string;
};

function tokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const leer = (n: string, fallback: string) => cs.getPropertyValue(n).trim() || fallback;
  return {
    serie: leer("--series-1", "#2a78d6"),
    grilla: leer("--gridline", "#e1e0d9"),
    eje: leer("--muted", "#898781"),
    texto: leer("--text-primary", "#0b0b0b"),
    superficie: leer("--surface-1", "#fcfcfb"),
  };
}

let grafico: Chart | null = null;

export function dibujar(canvas: HTMLCanvasElement, r: Resultado): void {
  const t = tokens();
  const filas = r.desglose;
  const primerProyectado = filas.findIndex((f) => f.esProyeccion);

  grafico?.destroy();
  grafico = new Chart(canvas, {
    type: "line",
    data: {
      labels: filas.map((f) => abreviarPunto(f.punto)),
      datasets: [
        {
          label: "Monto ajustado",
          data: filas.map((f) => f.monto),
          borderColor: t.serie,
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 0,
          // 10px de diámetro al pasar el mouse: blanco de sobra para el puntero.
          pointHoverRadius: 5,
          pointHoverBackgroundColor: t.serie,
          // Anillo de superficie de 2px sobre la marca, para que el punto no se
          // funda con la línea ni con la grilla.
          pointHoverBorderColor: t.superficie,
          pointHoverBorderWidth: 2,
          tension: 0.15,
          segment: {
            // El tramo proyectado va punteado. Es la distinción que da sentido al
            // producto entero, así que no puede depender del color.
            borderDash: (ctx) =>
              primerProyectado > 0 && ctx.p1DataIndex >= primerProyectado ? [5, 4] : undefined,
          },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        tooltip: {
          backgroundColor: t.texto,
          padding: 10,
          displayColors: false,
          callbacks: {
            title: (items) => {
              const i = items[0]?.dataIndex ?? 0;
              const fila = filas[i]!;
              return `${abreviarPunto(fila.punto)}${fila.esProyeccion ? " · estimado" : ""}`;
            },
            label: (item) => {
              const fila = filas[item.dataIndex]!;
              const partes = [pesos(fila.monto)];
              if (fila.acumuladoPct !== null) {
                partes.push(`${porcentaje(fila.acumuladoPct)} desde el origen`);
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
          ticks: { color: t.eje, maxRotation: 0, autoSkipPadding: 16, font: { size: 11 } },
        },
        y: {
          grid: { color: t.grilla },
          border: { display: false },
          ticks: {
            color: t.eje,
            font: { size: 11 },
            maxTicksLimit: 6,
            callback: (v) =>
              new Intl.NumberFormat("es-AR", { notation: "compact" }).format(Number(v)),
          },
        },
      },
    },
  });
}
