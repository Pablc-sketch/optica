import { createClient } from "@/lib/supabase/server";

// Panel del equipo que vende el producto (spec pantalla 12). La RPC valida
// el flag es_superadmin contra la tabla, así que a un usuario de óptica le
// devuelve error aunque abra la URL a mano.

type Fila = {
  tenant_id: string;
  nombre_comercial: string;
  rut_empresa: string | null;
  creada: string;
  plan: string | null;
  estado: string | null;
  fecha_renovacion: string | null;
  usuarios: number;
  pacientes: number;
  ventas: number;
};

const COLOR_ESTADO: Record<string, string> = {
  trial: "bg-sky-100 text-sky-800",
  activa: "bg-green-100 text-green-700",
  vencida: "bg-red-100 text-red-700",
  cancelada: "bg-neutral-200 text-neutral-700",
};

export default async function SuperadminPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("listar_opticas");

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
        No tienes acceso a este panel.
      </div>
    );
  }

  const opticas = (data ?? []) as Fila[];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">Ópticas cliente</h1>
        <p className="text-sm text-tinta-suave">
          {opticas.length} óptica{opticas.length === 1 ? "" : "s"} registrada
          {opticas.length === 1 ? "" : "s"}.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-crema-claro p-3 shadow-sm">
        <table className="w-full min-w-175 text-sm">
          <thead>
            <tr className="text-left text-xs text-tinta-suave">
              <th className="px-2 py-1.5">Óptica</th>
              <th className="px-2 py-1.5">Plan</th>
              <th className="px-2 py-1.5">Estado</th>
              <th className="px-2 py-1.5">Renueva</th>
              <th className="px-2 py-1.5 text-right">Usuarios</th>
              <th className="px-2 py-1.5 text-right">Pacientes</th>
              <th className="px-2 py-1.5 text-right">Ventas</th>
            </tr>
          </thead>
          <tbody>
            {opticas.map((o) => (
              <tr key={o.tenant_id} className="border-t border-tinta-suave/10">
                <td className="px-2 py-2">
                  <p className="font-medium">{o.nombre_comercial}</p>
                  <p className="text-xs text-tinta-suave">
                    {o.rut_empresa ?? "sin RUT"} · alta{" "}
                    {new Date(o.creada).toLocaleDateString("es-CL")}
                  </p>
                </td>
                <td className="px-2 py-2">{o.plan ?? "—"}</td>
                <td className="px-2 py-2">
                  {o.estado && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_ESTADO[o.estado] ?? ""}`}>
                      {o.estado}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {o.fecha_renovacion
                    ? new Date(o.fecha_renovacion + "T00:00:00").toLocaleDateString("es-CL")
                    : "—"}
                </td>
                <td className="px-2 py-2 text-right">{o.usuarios}</td>
                <td className="px-2 py-2 text-right">{o.pacientes}</td>
                <td className="px-2 py-2 text-right">{o.ventas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
