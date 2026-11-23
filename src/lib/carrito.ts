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

// El servidor (registrarVenta) rechaza cristales sin paciente: la orden de
// trabajo es suya. Se puede cotizar sin ficha, pero no guardar. Una venta
// solo de accesorios sí se guarda sin paciente.
export function faltaPacienteParaGuardar(lineas: { cristal?: unknown }[], pacienteId: string | null | undefined): boolean {
  return !pacienteId && lineas.some((l) => Boolean(l.cristal));
}

// Guarda el descuento general repartido en ítems cobrables, hasta agotar
// el monto acordado, para que la suma y cada comprobante cuadren en pesos.
export function repartirDescuento<T extends { cantidad: number; precioUnitario: number }>(lineas: T[], monto: number) {
  let pendiente = monto;
  return lineas.map((linea) => {
    const descuento = Math.min(pendiente, linea.cantidad * linea.precioUnitario);
    pendiente -= descuento;
    return { ...linea, descuento };
  });
}

export function calcularPrecioAcordado(subtotal: number, campo: "descuento" | "total", monto: number | null) {
  const invalido = monto !== null && (!Number.isSafeInteger(monto) || monto < 0 || monto > subtotal);
  const descuento = invalido || monto === null ? 0 : campo === "total" ? subtotal - monto : monto;
  return { descuento, total: subtotal - descuento, invalido };
}
