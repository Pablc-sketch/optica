import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NuevaReceta from "../../../nueva-receta";
import DatosPaciente from "../../../../datos-paciente";
import { hoyEnChile } from "@/lib/fechas";
import { cargarCatalogoParaCotizar } from "@/lib/catalogo-laboratorio";

export default async function EditarRecetaPage({
  params,
}: {
  params: Promise<{ id: string; recetaId: string }>;
}) {
  const { id, recetaId } = await params;
  const supabase = await createClient();

  const [recetaRes, operativosRes, cotizar, pacienteRes] = await Promise.all([
    supabase.from("recetas").select("*").eq("id", recetaId).eq("paciente_id", id).single(),
    supabase
      .from("operativos")
      .select("id, nombre, fecha, estado")
      .in("estado", ["planificado", "realizado"])
      .order("fecha", { ascending: false }),
    cargarCatalogoParaCotizar(supabase),
    supabase.from("pacientes").select("id,nombre,rut,telefono,email,fecha_nacimiento").eq("id", id).single(),
  ]);

  const receta = recetaRes.data;
  const paciente = pacienteRes.data;
  if (!receta || !paciente) notFound();

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
        <p className="font-semibold">{paciente.nombre}</p>
        <DatosPaciente paciente={paciente} hoy={hoyEnChile()} />
        <NuevaReceta
          pacienteId={id}
          operativos={operativosRes.data ?? []}
          costos={cotizar.filas}
          catalogoLab={cotizar.catalogo} recargosMarcos={cotizar.recargosMarcos}
          receta={receta}
        />
      </div>
    </div>
  );
}
