import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { telefonoParaWhatsapp } from "@/lib/formato";
import { clp } from "@/lib/clp";
import RecordarEntrega from "../operativos/[id]/recordar-entrega";
import { cargarVentasParaAviso, clasificarAvisos, destinatariosDeAvisos } from "@/lib/avisos";

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

  const operativoRes = elegidoId
    ? await supabase
        .from("operativos")
        .select("id, nombre, direccion, fecha_entrega_estimada, hora_entrega, lugar_entrega")
        .eq("id", elegidoId)
        .maybeSingle()
    : { data: null, error: null };
  const operativo = operativoRes.data;
  const nombreOptica = tenantRes.data?.nombre_comercial ?? "la óptica";
  const { ventas, error: errorVentas } = operativo
    ? await cargarVentasParaAviso(supabase, operativo.id)
    : { ventas: [], error: null };
  const { listos, enProceso } = clasificarAvisos(ventas);
  const destinatarios = destinatariosDeAvisos(listos, telefonoParaWhatsapp, clp, nombreOptica);
  const errorLectura = operativosRes.error?.message ?? operativoRes.error?.message ?? errorVentas;

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
        {operativos.length === 0 && !operativosRes.error && (
          <p className="text-sm text-tinta-suave">Todavía no hay operativos.</p>
        )}
        {operativosRes.error && (
          <p className="text-sm font-semibold text-red-700">No se pudieron leer los operativos. Recarga la página.</p>
        )}
      </div>

      {operativo && (
        <RecordarEntrega
          key={operativo.id}
          abierto
          operativo={operativo}
          destinatarios={destinatarios}
          enProceso={enProceso.map((p) => p.nombre)}
          error={errorLectura}
        />
      )}
    </div>
  );
}
