import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRolPagina } from "@/lib/autorizacion";
import Certificado from "../certificado-fonasa/page";
import Comprobante from "../comprobante/page";
import Receta from "../../../pacientes/[id]/receta/[recetaId]/page";
import AdjuntarBoleta from "@/components/adjuntar-boleta";
export default async function Expediente({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 const { supabase, tenantId } = await exigirRolPagina(["admin", "ventas"]);
 const { data: venta } = await supabase.from("ventas").select("id, paciente_id, anulada, venta_items (ordenes_trabajo:ot_id (receta_id))").eq("id", id).eq("tenant_id", tenantId).single();
 if (!venta || venta.anulada) notFound();
 const recetas = [...new Set(venta.venta_items.flatMap(i => { const rel = i.ordenes_trabajo; return (Array.isArray(rel) ? rel : rel ? [rel] : []).map(r => r.receta_id).filter((r): r is string => Boolean(r)); }))];
 return <div className="space-y-8"><div className="print:hidden"><Link href={`/ventas/${id}`}>← Editar fechas y folio</Link><h1 className="text-xl font-bold">Expediente de reembolso</h1><p>Revisa el certificado y los documentos. Adjunta la boleta en PNG, JPG o PDF y guarda todo como un solo PDF. Firma y timbra el certificado antes de presentarlo.</p></div>
 <section className="print:break-after-page"><Certificado params={Promise.resolve({ id })} searchParams={Promise.resolve({})}/></section>
 <section className="print:break-after-page"><Comprobante params={Promise.resolve({ id })}/></section>
 {venta.paciente_id && recetas.map(recetaId => <section data-pdf-page="receta" key={recetaId} className="print:break-after-page"><Receta params={Promise.resolve({ id: venta.paciente_id!, recetaId })}/></section>)}
 {recetas.length === 0 && <p className="print:hidden">No hay receta vinculada a la orden de esta venta. Adjunta su imagen abajo para incluirla.</p>}
 <AdjuntarBoleta/>
 </div>;
}
