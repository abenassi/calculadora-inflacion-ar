import { describe, expect, it } from "vitest";

import { indiceSecundarioDisponible } from "../src/engine/indices-secundarios.js";
import type { EntradaCatalogoSecundario } from "../src/engine/indices-secundarios.js";

const cpiEeuu: EntradaCatalogoSecundario = {
  slug: "cpi-eeuu",
  nombre: "CPI de Estados Unidos",
  direccion: "multiplicar",
  requiereIndiceBase: "nacional",
  tieneCrossCheck: true,
};

describe("indiceSecundarioDisponible", () => {
  it("está disponible cuando el índice primario activo coincide con requiereIndiceBase", () => {
    expect(indiceSecundarioDisponible(cpiEeuu, "nacional")).toBe(true);
  });

  /**
   * `/actualizar.html` no tiene hoy un selector de índice primario (siempre nacional),
   * así que este caso no se puede disparar todavía desde la interfaz — pero el criterio
   * tiene que existir y estar probado desde ahora, para que el día que se agregue un
   * selector primario (ver "No-goals" del spec) el desplegable de índices secundarios
   * ya sepa deshabilitar la opción en vez de ofrecer un cálculo que no puede honrar.
   */
  it("no está disponible cuando el índice primario activo no coincide", () => {
    expect(indiceSecundarioDisponible(cpiEeuu, "cordoba")).toBe(false);
  });
});
