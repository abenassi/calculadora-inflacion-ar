/**
 * Gráfico de la inflación mensual del IPC en los meses que entraron en el cálculo.
 *
 * Antes graficaba la evolución del monto, y no decía nada: un monto ajustado por
 * inflación siempre sube, así que la curva era la misma forma para cualquier
 * consulta. Lo que sí varía —y lo que la persona necesita para defender el
 * porcentaje que aplicó— es cuánto subió cada mes.
 *
 * Una sola serie, así que no lleva caja de leyenda: el título nombra qué se está
 * viendo. Lo único que hay que distinguir dentro de la serie es el mes oficial del
 * estimado, y eso va por trama diagonal además de por la leyenda inline del
 * encabezado — nunca por color solo.
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
import { abreviarPunto } from "../engine/mes.js";
import { porcentaje } from "./format.js";

Chart.register(CategoryScale, LinearScale, BarController, BarElement, Tooltip);

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

/**
 * Trama diagonal para las barras estimadas.
 *
 * La distinción oficial/estimado no puede depender del color: es lo que separa un
 * dato de una cuenta nuestra. Con trama sobrevive al daltonismo, a la impresión en
 * blanco y negro y al modo de alto contraste.
 */
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

  grafico?.destroy();
  grafico = new Chart(canvas, {
    type: "bar",
    data: {
      labels: filas.map((f) => abreviarPunto(f.punto)),
      datasets: [
        {
          label: "Inflación mensual",
          data: filas.map((f) => f.varMensualPct ?? 0),
          backgroundColor: filas.map((f) => (f.esProyeccion ? estimada : t.serie)),
          borderColor: t.serie,
          borderWidth: filas.map((f) => (f.esProyeccion ? 1 : 0)),
          // Punta redondeada del lado del dato; el extremo apoyado en la línea de
          // cero queda recto. Con deflación la barra baja y Chart.js invierte el
          // lado sin que haya que hacer nada.
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
              const partes = [`Inflación del mes: ${porcentaje(fila.varMensualPct ?? 0)}`];
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
