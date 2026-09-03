import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NuevaReceta from "../../../nueva-receta";

export default async function EditarRecetaPage({
  params,
}: {
  params: Promise<{ id: string; recetaId: string }>;
}) {
  const { id, recetaId } = await params;
  const supabase = await createClient();

  const [recetaRes, operativosRes, costosRes] = await Promise.all([
    supabase.from("recetas").select("*").eq("id", recetaId).eq("paciente_id", id).single(),
    supabase
      .from("operativos")
      .select("id, nombre, fecha, estado")
      .in("estado", ["planificado", "realizado"])
      .order("fecha", { ascending: false }),
    supabase
      .from("costos_cristales")
      .select("tipo_lente, rango_receta, tratamiento, costo, precio_venta")
      .order("tipo_lente"),
  ]);

  const receta = recetaRes.data;
  if (!receta) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Editar receta</h1>
        <Link
          href={`/pacientes/${id}/receta/${recetaId}`}
          className="text-sm font-medium text-brand-dark hover:underline"
        >
          ← Volver a la receta
        </Link>
      </div>

      <div className="rounded-2xl bg-crema-claro p-4 shadow-sm">
        <NuevaReceta
          pacienteId={id}
          operativos={operativosRes.data ?? []}
          costos={costosRes.data ?? []}
          receta={receta}
        />
      </div>
    </div>
  );
}
