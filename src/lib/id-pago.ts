import { createHash } from "node:crypto";

// Una reserva de escritura por saldo y categoría. No depende de la pestaña
// ni del importe elegido: dos pagos concurrentes no pueden consumir el mismo saldo.
export function idPagoCosto(operativoId: string, clave: string, pagado: number) {
  const h = createHash("sha256").update(JSON.stringify(["lentia-pago-v1", operativoId, clave, pagado])).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
