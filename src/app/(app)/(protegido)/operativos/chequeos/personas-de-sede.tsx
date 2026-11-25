import Link from "next/link";
import { clp } from "@/lib/clp";
import { esVentaDeConsulta } from "@/lib/consulta";
import { fechaLegible, diaEnChile } from "@/lib/fechas";
import { leerTodas } from "@/lib/leer-todas";
import type { createClient } from "@/lib/supabase/server";
import type { SedeChequeo } from "@/lib/chequeos";

type Cliente = { nombre: string };
type RelacionPaciente = Cliente | Cliente[] | null;
type VentaSede = {
  id: string;
  paciente_id: string | null;
  fecha: string;
  total: number;
  pacientes: RelacionPaciente;
  venta_items: { id: string; cantidad: number; descripcion: string; precio_unitario: number; descuento: number | null }[];
};
type Persona = { nombre: string; atendida: boolean; ventas: VentaSede[] };

function nombrePaciente(relacion: RelacionPaciente) {
  return (Array.isArray(relacion) ? relacion[0] : relacion)?.nombre || "Paciente sin nombre";
}

export default async function PersonasDeSede({ supabase, tenantId, sede, volver }: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  tenantId: string;
  sede: Pick<SedeChequeo, "id" | "nombre" | "fecha" | "direccion">;
  volver: string;
}) {
  const [atenciones, compras] = await Promise.all([
    leerTodas((a, b) => supabase.from("recetas").select("id,paciente_id,pacientes:paciente_id(nombre)")
      .eq("tenant_id", tenantId).eq("operativo_id", sede.id).order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("ventas")
      .select("id,paciente_id,fecha,total,pacientes:paciente_id(nombre),venta_items(id,cantidad,descripcion,precio_unitario,descuento)")
      .eq("tenant_id", tenantId).eq("operativo_id", sede.id).eq("anulada", false)
      .order("fecha").order("id").range(a, b)),
  ]);
  if (atenciones.error || compras.error) {
    return <p role="alert" className="rounded-lg bg-red-50 p-4">No se pudo cargar la lista de la sede. Recarga para reintentar.</p>;
  }

  const personas = new Map<string, Persona>();
  for (const a of atenciones.data ?? []) {
    personas.set(a.paciente_id, { nombre: nombrePaciente(a.pacientes), atendida: true, ventas: [] });
  }
  for (const v of compras.data ?? []) {
    const id = v.paciente_id ?? v.id;
    const persona = personas.get(id) ?? {
      nombre: v.paciente_id ? nombrePaciente(v.pacientes) : "Venta sin paciente asociado",
      atendida: false, ventas: [],
    };
    persona.ventas.push(v);
    personas.set(id, persona);
  }

  const lista = [...personas.entries()].sort(([, a], [, b]) => a.nombre.localeCompare(b.nombre, "es"));
  return <section className="space-y-4">
    <Link href={volver} className="inline-block text-sm font-semibold text-brand-dark underline">← Volver al chequeo</Link>
    <header>
      <h2 className="text-xl font-bold">{sede.nombre}</h2>
      <p className="text-sm text-tinta-suave">{fechaLegible(sede.fecha)}{sede.direccion ? ` · ${sede.direccion}` : ""}</p>
    </header>
    {lista.length === 0 ? <p className="rounded-lg bg-white p-4">Todavía no hay atenciones ni compras en esta sede.</p>
      : <ul className="space-y-2" aria-label="Atenciones y compras">
        {lista.map(([id, p]) => {
          const total = p.ventas.reduce((suma, v) => suma + v.total, 0);
          const soloConsulta = p.ventas.length > 0 && p.ventas.every(v => esVentaDeConsulta(v.venta_items));
          return <li key={id} className="rounded-lg border border-tinta/15 bg-white">
            {p.ventas.length === 0 ? <div className="flex flex-wrap justify-between gap-2 px-4 py-3">
              <strong>{p.nombre}</strong><span className="text-sm text-tinta-suave">Atención registrada · Sin compra</span>
            </div> : <details>
              <summary className="cursor-pointer px-4 py-3">
                <span className="ml-1 inline-flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <strong>{p.nombre}</strong>
                  <b className="tabular-nums text-brand-dark">{clp(total)}</b>
                  <span className="text-sm text-tinta-suave">{soloConsulta ? "Solo consulta" : p.atendida ? "Atención y compra" : "Compra registrada"}</span>
                </span>
              </summary>
              <div className="space-y-3 border-t border-tinta/10 px-4 py-3">
                {p.ventas.map(v => <div key={v.id} className="rounded-lg bg-crema-claro p-3">
                  <div className="flex flex-wrap justify-between gap-2 text-sm font-semibold">
                    <span>{fechaLegible(diaEnChile(v.fecha))}</span>
                    <span className="tabular-nums">{clp(v.total)}</span>
                  </div>
                  {v.venta_items.length ? <ul className="mt-2 space-y-1 text-sm">
                    {v.venta_items.map(i => <li key={i.id} className="flex justify-between gap-3">
                      <span>{i.cantidad} × {i.descripcion}</span>
                      <span className="shrink-0 tabular-nums">{clp(i.cantidad * i.precio_unitario - (i.descuento ?? 0))}</span>
                    </li>)}
                  </ul> : <p className="mt-2 text-sm text-tinta-suave">Venta sin productos detallados.</p>}
                  <Link href={`/ventas/${v.id}`} className="mt-2 inline-block text-sm font-semibold text-brand-dark underline">Ver venta</Link>
                </div>)}
              </div>
            </details>}
          </li>;
        })}
      </ul>}
  </section>;
}
