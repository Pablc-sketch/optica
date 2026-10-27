import { notFound } from "next/navigation";
import { exigirRolPagina } from "@/lib/autorizacion";
import { cargarCompraReembolso } from "@/lib/actions/seguros";
import RevisionReembolso from "./revision";

export default async function ReembolsoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirRolPagina(["admin", "ventas"]);
  const { id } = await params;
  const compra = await cargarCompraReembolso(id);
  if (!compra) notFound();
  return <RevisionReembolso key={compra.id} compra={compra} />;
}
