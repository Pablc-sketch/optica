import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { telefonoParaWhatsapp } from "@/lib/formato";
import { clp } from "@/lib/clp";
import RecordarEntrega from "../operativos/[id]/recordar-entrega";
import type { DestinatarioWsp } from "../operativos/[id]/enviar-whatsapp";

// Avisos de entrega por WhatsApp, en una pantalla liviana: elegir el
// operativo, ajustar fecha y horario, y mandar. La ficha completa del
// operativo carga mucho más (costos, metas, reportes) y para avisar no hace
// falta nada de eso.
export default async function Avisos({ searchParams }: { searchParams: Promise<{ op?: string }> }) {
  const { op } = await searchParams;
  const supabase = await createClient();

  const [operativosRes, tenantRes] = await Promise.all([
    supabase
      .from("operativos")
      .select("id, nombre, fecha, fecha_entrega_estimada")
      .order("fecha", { ascending: false })
      .limit(40),
    supabase.from("tenants").select("nombre_comercial").single(),
  ]);
  const operativos = operativosRes.data ?? [];
  const elegidoId = op ?? operativos[0]?.id;

  const [operativoRes, ventasRes] = elegidoId
    ? await Promise.all([
        supabase
          .from("operativos")
          .select("id, nombre, direccion, fecha_entrega_estimada, hora_entrega, lugar_entrega")
          .eq("id", elegidoId)
          .maybeSingle(),
        supabase
          .from("ventas")
          .select("id, total, pacientes:paciente_id (nombre, telefono), pagos_abonos (monto)")
          .eq("operativo_id", elegidoId)
          .eq("anulada", false)
          .order("fecha", { ascending: false }),
      ])
    : [{ data: null }, { data: [] }];

  const operativo = operativoRes.data;
  const nombreOptica = tenantRes.data?.nombre_comercial ?? "la óptica";
  type Pac = { nombre: string; telefono: string | null };
  const destinatarios: DestinatarioWsp[] = (ventasRes.data ?? []).flatMap((v) => {
    const raw = v.pacientes as unknown as Pac | Pac[] | null;
    const paciente = Array.isArray(raw) ? raw[0] : raw;
    if (!paciente) return [];
    const abonado = (v.pagos_abonos ?? []).reduce((s: number, p: { monto: number }) => s + p.monto, 0);
    const saldo = Math.max(0, v.total - abonado);
    return [
      {
        id: v.id,
        nombre: paciente.nombre,
        telefonoWsp: telefonoParaWhatsapp(paciente.telefono),
        detalle: saldo > 0 ? "saldo pendiente" : "pagado",
        monto: saldo,
        valores: { saldo: saldo > 0 ? clp(saldo) : "$0 (ya está pagado)", optica: nombreOptica },
      },
    ];
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Avisos de entrega</h1>
        <p className="text-sm text-tinta-suave">Elige el operativo y avisa por WhatsApp a quienes compraron.</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {operativos.map((o) => (
          <Link
            key={o.id}
            href={`/avisos?op=${o.id}`}
            className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-semibold ${
              o.id === elegidoId ? "border-tinta bg-tinta text-white" : "border-tinta/15 bg-white hover:bg-crema"
            }`}
          >
            {o.nombre}
          </Link>
        ))}
        {operativos.length === 0 && <p className="text-sm text-tinta-suave">Todavía no hay operativos.</p>}
      </div>

      {operativo && (
        <RecordarEntrega
          key={operativo.id}
          abierto
          operativo={operativo}
          destinatarios={destinatarios}
        />
      )}
    </div>
  );
}
