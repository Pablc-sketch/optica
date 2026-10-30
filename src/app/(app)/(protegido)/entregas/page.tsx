import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaLegible } from "@/lib/fechas";
import { leerTodas } from "@/lib/leer-todas";
import { esConsulta } from "@/lib/consulta";
import TarjetaCobro, { type FilaCobro } from "../cobros/tarjeta-cobro";

// Entrega: los lentes que faltan por entregar, agrupados por operativo para
// que siempre se sepa de cuál son. Primero los que ya están listos.
type Ot = { id: string; estado: string; tipo_lente: string | null; tipo_lente_2: string | null };
type Grupo = { clave: string; nombre: string; fecha: string | null; filas: FilaCobro[] };

export default async function Entregas() {
  const supabase = await createClient();
  const res = await leerTodas((a, b) => supabase
    .from("ventas")
    .select(
      `id, total, fecha, operativos:operativo_id (id, nombre, fecha), pacientes:paciente_id (nombre, telefono), pagos_abonos (monto),
       venta_items (descripcion, ot_id, ordenes_trabajo:ot_id (id, estado, tipo_lente, tipo_lente_2))`
    )
    .eq("anulada", false)
    .order("fecha", { ascending: false })
    .order("id").range(a, b));

  const unico = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const grupos = new Map<string, Grupo>();

  for (const v of res.data ?? []) {
    const items = v.venta_items ?? [];
    if (items.length > 0 && items.every((i) => esConsulta((i as { descripcion: string | null }).descripcion))) continue;
    const ots = new Map<string, Ot>();
    for (const item of items) {
      const ot = unico((item as { ordenes_trabajo?: Ot | Ot[] | null }).ordenes_trabajo);
      if (ot) ots.set(ot.id, ot);
    }
    const pares = (o: Ot) => (o.tipo_lente ? 1 : 0) + (o.tipo_lente_2 ? 1 : 0) || 1;
    const sumar = (f: (o: Ot) => boolean) => [...ots.values()].filter(f).reduce((s, o) => s + pares(o), 0);
    const listos = sumar((o) => o.estado === "listo");
    const enProceso = sumar((o) => !["listo", "entregado", "cancelado"].includes(o.estado));
    if (listos + enProceso === 0) continue;

    const paciente = unico(v.pacientes as unknown as { nombre: string; telefono: string | null } | { nombre: string; telefono: string | null }[] | null);
    const op = unico(v.operativos as unknown as { id: string; nombre: string; fecha: string } | { id: string; nombre: string; fecha: string }[] | null);
    const pagado = (v.pagos_abonos ?? []).reduce((s: number, p: { monto: number }) => s + p.monto, 0);
    const clave = op?.id ?? "sin";
    const grupo = grupos.get(clave) ?? { clave, nombre: op?.nombre ?? "Sin operativo", fecha: op?.fecha ?? null, filas: [] };
    grupo.filas.push({
      ventaId: v.id,
      nombre: paciente?.nombre ?? "Sin paciente",
      telefono: paciente?.telefono ?? null,
      total: v.total,
      pagado,
      saldo: Math.max(0, v.total - pagado),
      listos,
      enProceso,
      entregados: sumar((o) => o.estado === "entregado"),
    });
    grupos.set(clave, grupo);
  }

  const lista = [...grupos.values()]
    .map((g) => ({
      ...g,
      filas: g.filas.sort((a, b) => Number(b.listos > 0) - Number(a.listos > 0) || b.saldo - a.saldo),
    }))
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  const totalListos = lista.reduce((s, g) => s + g.filas.filter((f) => f.listos > 0).length, 0);
  const totalFaltan = lista.reduce((s, g) => s + g.filas.length, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Entrega</h1>
          <p className="text-sm text-tinta-suave">
            {res.error ? "Entregas no disponibles" : totalFaltan === 0 ? "Todo entregado" : `${totalListos} listos · ${totalFaltan - totalListos} en laboratorio`}
          </p>
        </div>
        <Link href="/avisos" className="rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900">
          Avisar que están listos
        </Link>
      </div>

      {res.error && (
        <p className="rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-800">
          No se pudieron leer las entregas. Recarga la página; no es que no haya nadie.
        </p>
      )}

      {lista.length === 0 && !res.error && (
        <p className="rounded-2xl bg-white p-6 text-center text-lg font-semibold text-emerald-800 shadow-sm">Todo entregado ✓</p>
      )}

      {lista.map((g) => {
        const listos = g.filas.filter((f) => f.listos > 0).length;
        return (
          <section key={g.clave} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-tinta/10 pb-1">
              <h2 className="text-lg font-bold">{g.nombre}</h2>
              <p className="text-sm text-tinta-suave">
                {g.fecha ? `${fechaLegible(g.fecha)} · ` : ""}
                <b className={listos > 0 ? "text-emerald-700" : ""}>{listos} listos</b> · {g.filas.length - listos} en laboratorio
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              {g.filas.map((f) => (
                <TarjetaCobro key={f.ventaId} fila={f} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
