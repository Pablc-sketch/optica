// Abono mínimo sugerido de una venta: lo que cuesta de verdad mandar a
// hacer los pares (cristal a Fides + marco), BRUTO del medio de pago (lo que
// hay que cobrar para que, después de la comisión de la máquina, llegue
// ese costo), redondeado hacia arriba a mil. Nunca menos que el mínimo fijo
// por tipo, ni más que el precio de cada par ni el total. Si el costo pasa
// el precio, se avisa (noCubre) en vez de prometer cobertura.
// Revisiones Codex 20-10-2026.
export type ResultadoAbonoMinimo = { monto: number; noCubre: boolean };

export function abonoMinimoDe(
  pares: { precio: number; costoCristal: number | null; minimoFijo: number }[],
  costoMarco: number,
  total: number,
  // Comisión % del medio con que se va a cobrar (0 para efectivo y
  // transferencia).
  tasaPct = 0
): ResultadoAbonoMinimo {
  const factor = 1 - Math.min(Math.max(tasaPct, 0), 99) / 100;
  let noCubre = false;
  const suma = pares
    .filter((p) => p.precio > 0)
    .reduce((s, p) => {
      const real = p.costoCristal === null ? 0 : Math.ceil((p.costoCristal + costoMarco) / factor / 1000) * 1000;
      if (real > p.precio) noCubre = true;
      return s + Math.min(p.precio, Math.max(p.minimoFijo, real));
    }, 0);
  const monto = Math.min(total, suma);
  return { monto, noCubre: noCubre || suma > total };
}

export function tasaDelMedio(medio: string, pctDebito: number, pctCredito: number): number {
  return medio === "debito" ? pctDebito : medio === "credito" ? pctCredito : 0;
}
