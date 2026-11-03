import { createHash } from "node:crypto";

// Una reserva de escritura por saldo y categoría. No depende de la pestaña
// ni del importe elegido: dos pagos concurrentes no pueden consumir el mismo saldo.
export function idPagoCosto(operativoId: string, clave: string, pagado: number) {
  const h = createHash("sha256").update(JSON.stringify(["lentia-pago-v1", operativoId, clave, pagado])).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Una corrección puede devolver el saldo a un importe anterior. Su versión
// distingue ese estado del que ya consumió una clave de inserción.
export function claveConRevisiones(clave: string, filas: { id: string; revision_version?: number }[]) {
  const revisadas = filas.filter(f => (f.revision_version ?? 0) > 0)
    .map(f => [f.id, f.revision_version] as const).sort((a,b) => a[0].localeCompare(b[0]));
  return revisadas.length ? `${clave}:${JSON.stringify(revisadas)}` : clave;
}
