import { validarVoucher, requiereVoucher } from "./voucher";

export type PagoReembolso = { id: string; fecha: string; monto: number; medio_pago: string; numero_voucher: string | null };
export type ItemReembolso = { descripcion: string; cantidad: number; precio_unitario: number; descuento: number };
export type CompraReembolso = {
  id: string; fecha: string; total: number; anulada: boolean;
  paciente: { nombre: string; rut: string | null } | null;
  optica: { nombre_comercial: string; razon_social: string | null; rut_empresa: string | null } | null;
  items: ItemReembolso[]; pagos: PagoReembolso[];
};

// No confundir el RUT del comercio con el del titular de la tarjeta.
export function rutReembolso(valor: string | null | undefined): string | null {
  if (!valor || !/^[\d.kK\s-]+$/.test(valor)) return null;
  const rut = valor.replace(/[.\s-]/g, "").toUpperCase();
  if (!/^\d{7,8}[\dK]$/.test(rut)) return null;
  const cuerpo = rut.slice(0, -1);
  if (Number(cuerpo) === 0) return null;
  let suma = 0;
  for (let i = cuerpo.length - 1, factor = 2; i >= 0; i--, factor = factor === 7 ? 2 : factor + 1) suma += Number(cuerpo[i]) * factor;
  const resto = 11 - suma % 11;
  const dv = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return rut.endsWith(dv) ? rut : null;
}

export function compararEmisor(empresa: string | null | undefined, original: string): "pendiente" | "invalido" | "distinto" | "coincide" {
  if (!original.trim()) return "pendiente";
  const comercio = rutReembolso(original);
  if (!comercio || !rutReembolso(empresa)) return "invalido";
  return comercio === rutReembolso(empresa) ? "coincide" : "distinto";
}

export function pendientesCompra(compra: CompraReembolso): string[] {
  const pendientes: string[] = [];
  if (compra.anulada) pendientes.push("La venta está anulada; no presentes estos documentos como una compra vigente.");
  if (!compra.paciente?.nombre || !rutReembolso(compra.paciente.rut)) pendientes.push("Completa el nombre y un RUT válido del paciente en su ficha.");
  if (!compra.optica?.razon_social || !rutReembolso(compra.optica.rut_empresa)) pendientes.push("Completa la razón social y un RUT válido de la óptica en Configuración.");
  if (!compra.items.length || compra.items.some(i => !i.descripcion.trim() || i.cantidad <= 0 || i.precio_unitario < 0 || i.descuento < 0 || i.cantidad * i.precio_unitario < i.descuento)) pendientes.push("Revisa las descripciones, cantidades y precios de los artículos.");
  if (compra.items.reduce((s, i) => s + i.cantidad * i.precio_unitario - i.descuento, 0) !== compra.total) pendientes.push("El desglose no coincide con el total de la compra. Revisa la venta.");
  if (compra.items.some(i => i.precio_unitario === 0)) pendientes.push("Artículo con precio $0: confirma el precio real o de conjunto, sin inventar valores.");
  const pagado = compra.pagos.reduce((s, p) => s + p.monto, 0);
  if (pagado < compra.total) pendientes.push("Hay saldo pendiente: el comprobante debe mostrar lo pagado y el saldo, sin declarar un pago total.");
  if (pagado > compra.total) pendientes.push("Los pagos superan el total. Revisa la conciliación antes de presentar los documentos.");
  if (compra.pagos.some(p => requiereVoucher(p.medio_pago, p.monto) && validarVoucher(p.medio_pago, p.monto, p.numero_voucher).error)) pendientes.push("Completa el número de cada voucher en el comprobante detallado, copiándolo del original.");
  return pendientes;
}

export const GUIAS_REEMBOLSO = {
  banmedica: { nombre: "Banmédica", url: "https://www.banmedica.cl/guia-de-boletas/", texto: "Reúne el documento tributario y el detalle de la compra, con los respaldos que correspondan. La receta no es exigible por la isapre para lentes destinados al tratamiento de la presbicia. Revisa los datos del beneficiario y prestador y responde a las observaciones de cualquier rechazo." },
  fonasa: { nombre: "Fonasa", url: "https://www.chileatiende.gob.cl/fichas/85589-solicitar-reembolso-de-protesis-y-ortesis-a-fonasa", texto: "Verifica primero si corresponde el beneficio, el tramo y la edad al comprar. Reúne cédula, receta original vigente, boleta/factura o voucher válido y certificado de compra si falta el detalle. Contrasta el formato vigente con Fonasa antes de firmar." },
  complementario: { nombre: "Seguro complementario", url: "https://seguros.sura.cl/complementarios/reembolsos", texto: "Consulta la póliza y el formulario de la aseguradora concreta. Reúne receta, boleta y detalle; verifica si exige liquidación de Isapre/Fonasa, certificado de afiliación o constancia de no bonificación. La guía enlazada es un ejemplo de SURA, no una regla para todos los seguros." },
} as const;
