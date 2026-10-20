// Líneas del carrito que dependen de un par de cristales: su marco
// ("armazon-N") y su recargo premium ("premium-N"). Si el par N ya no tiene
// cristal (se quitó o se cambió de paciente), esas líneas no cuentan: no se
// cobran, no suman al total y no viajan en la venta. Revisión Codex
// 20-10-2026: quedaba "Marco premium (par 1)" $10.000 cobrable sin cristal.
export function quitarHuerfanos<T extends { key: string }>(lineas: T[]): T[] {
  const pares = new Set(
    lineas.filter((l) => l.key.startsWith("cristal-")).map((l) => l.key.slice("cristal-".length))
  );
  return lineas.filter((l) => {
    const m = /^(armazon|premium)-(\d+)$/.exec(l.key);
    return !m || pares.has(m[2]);
  });
}
