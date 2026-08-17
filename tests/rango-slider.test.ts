import { describe, expect, it } from "vitest";

import { moverSlider, rangoInicial, reajustarRango } from "../src/ui/rango-slider.js";

describe("rangoInicial", () => {
  it("arranca mostrando la serie entera, con las dos puntas pegadas", () => {
    const r = rangoInicial(296);
    expect(r).toEqual({ desdeIdx: 0, hastaIdx: 295, desdeEnElPiso: true, hastaEnElTope: true });
  });
});

describe("reajustarRango", () => {
  it("sigue el tope cuando 'hasta' estaba pegado y el largo baja (el mes objetivo excluye el punto más nuevo)", () => {
    const r = reajustarRango(rangoInicial(296), 295);
    expect(r.hastaIdx).toBe(294);
    expect(r.hastaEnElTope).toBe(true);
  });

  it("vuelve a seguir al tope cuando el largo sube de nuevo — el bug real: el punto más nuevo entra y sale de la serie según el mes objetivo, y 'hasta' se quedaba pegado al índice viejo en vez de volver a apuntar al último mes", () => {
    const achicado = reajustarRango(rangoInicial(296), 295);
    const r = reajustarRango(achicado, 296);
    expect(r.hastaIdx).toBe(295);
    expect(r.hastaEnElTope).toBe(true);
  });

  it("un 'hasta' que la persona dejó en un punto intermedio no se mueve solo cuando el largo cambia", () => {
    const enElMedio = { desdeIdx: 0, hastaIdx: 200, desdeEnElPiso: true, hastaEnElTope: false };
    expect(reajustarRango(enElMedio, 296).hastaIdx).toBe(200);
  });

  it("un 'hasta' intermedio se recorta si el nuevo largo ya no lo banca, pero no se reexpande solo después", () => {
    const enElMedio = { desdeIdx: 0, hastaIdx: 200, desdeEnElPiso: true, hastaEnElTope: false };
    const recortado = reajustarRango(enElMedio, 150);
    expect(recortado.hastaIdx).toBe(149);
    expect(recortado.hastaEnElTope).toBe(false);

    const vueltoAExpandir = reajustarRango(recortado, 296);
    expect(vueltoAExpandir.hastaIdx).toBe(149);
  });

  it("mismo comportamiento simétrico para 'desde' y el piso", () => {
    const pegadoAlPiso = { desdeIdx: 0, hastaIdx: 100, desdeEnElPiso: true, hastaEnElTope: false };
    expect(reajustarRango(pegadoAlPiso, 296).desdeIdx).toBe(0);

    const enElMedio = { desdeIdx: 50, hastaIdx: 100, desdeEnElPiso: false, hastaEnElTope: false };
    expect(reajustarRango(enElMedio, 296).desdeIdx).toBe(50);
  });
});

describe("moverSlider", () => {
  it("mueve 'hasta' y marca si quedó en el tope", () => {
    const r = moverSlider("hasta", 0, 200, 296);
    expect(r).toEqual({ desdeIdx: 0, hastaIdx: 200, desdeEnElPiso: true, hastaEnElTope: false });
  });

  it("si 'desde' cruza a 'hasta', empuja a 'hasta' en vez de invertir el rango", () => {
    const r = moverSlider("desde", 250, 200, 296);
    expect(r.desdeIdx).toBe(250);
    expect(r.hastaIdx).toBe(250);
  });

  it("si 'hasta' cruza a 'desde', empuja a 'desde'", () => {
    const r = moverSlider("hasta", 100, 50, 296);
    expect(r.desdeIdx).toBe(50);
    expect(r.hastaIdx).toBe(50);
  });

  it("marca hastaEnElTope cuando el slider se suelta justo en el máximo", () => {
    const r = moverSlider("hasta", 0, 295, 296);
    expect(r.hastaEnElTope).toBe(true);
  });
});
