/**
 * El estado del zoom temporal de `/actualizar.html`, separado del DOM para poder
 * testearlo. Guarda índices sobre `puntosCompletos`, y esos índices dejan de
 * significar el mismo mes cada vez que el largo de esa serie cambia: pasa de verdad,
 * no es hipotético, porque `actualizarSerie` descarta el punto más nuevo del dólar
 * blue mientras el IPC todavía no publicó ese mes, y lo vuelve a incluir apenas
 * publica — una ventana de ~2 semanas por mes.
 *
 * La solución no es "recortar si ya no entra": un slider que la persona dejó pegado
 * a una punta tiene que **seguir** a esa punta cuando el largo cambia, no quedarse
 * pegado al número de índice viejo. Uno que la persona dejó en un punto intermedio,
 * en cambio, no se mueve solo — sólo se recorta si el nuevo largo ya no lo banca.
 */
export type EstadoRango = {
  desdeIdx: number;
  hastaIdx: number;
  desdeEnElPiso: boolean;
  hastaEnElTope: boolean;
};

/** Primer estado, para cuando todavía no hay uno previo: la serie entera. */
export function rangoInicial(largo: number): EstadoRango {
  const maximo = largo - 1;
  return { desdeIdx: 0, hastaIdx: maximo, desdeEnElPiso: true, hastaEnElTope: true };
}

/** Recalcula el rango tras un cambio de largo de `puntosCompletos` (cambió el mes objetivo). */
export function reajustarRango(anterior: EstadoRango, largo: number): EstadoRango {
  const maximo = largo - 1;
  return {
    desdeIdx: anterior.desdeEnElPiso ? 0 : Math.min(anterior.desdeIdx, maximo),
    hastaIdx: anterior.hastaEnElTope ? maximo : Math.min(anterior.hastaIdx, maximo),
    desdeEnElPiso: anterior.desdeEnElPiso,
    hastaEnElTope: anterior.hastaEnElTope,
  };
}

/**
 * Recalcula el rango tras mover un slider a mano. Si "desde" cruza a "hasta" (o al
 * revés), empuja al otro en vez de dejar un rango invertido — son dos sliders
 * separados, no uno con dos manijas, así que nada impide que se crucen solos.
 */
export function moverSlider(
  origen: "desde" | "hasta",
  desdeIdx: number,
  hastaIdx: number,
  largo: number,
): EstadoRango {
  const maximo = largo - 1;
  if (desdeIdx > hastaIdx) {
    if (origen === "desde") hastaIdx = desdeIdx;
    else desdeIdx = hastaIdx;
  }
  return {
    desdeIdx,
    hastaIdx,
    desdeEnElPiso: desdeIdx === 0,
    hastaEnElTope: hastaIdx === maximo,
  };
}
