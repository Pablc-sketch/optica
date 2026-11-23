import CabeceraPagina from "@/components/cabecera-pagina";
import Link from "next/link";
import { redirect } from "next/navigation";
import { esPilotoTerreno } from "@/lib/piloto-terreno";
import { createClient } from "@/lib/supabase/server";
import { crearOperativo, cambiarEstadoOperativo } from "@/lib/actions/operativos";
import { formatearTelefono } from "@/lib/formato";
import { diaEnChile, horaCorta, rangoHorario, ZONA_CHILE } from "@/lib/fechas";
import { cubreDia, esOperativoArchivado, mostrarFechas } from "@/lib/agenda";
import { clp } from "@/lib/clp";
import { CampoTelefono } from "@/components/campos";
import { cargarPendientes } from "@/lib/resumen-pendientes";
import { leerTodas } from "@/lib/leer-todas";
import BotonEnviar from "@/components/boton-enviar";

const TIPOS_VENUE = [
  { valor: "condominio", etiqueta: "Condominio" },
  { valor: "junta_vecinos", etiqueta: "Junta de vecinos" },
  { valor: "apr", etiqueta: "APR" },
  { valor: "colegio", etiqueta: "Colegio" },
  { valor: "sala_cuna", etiqueta: "Sala cuna" },
  { valor: "supermercado", etiqueta: "Supermercado" },
  { valor: "otro", etiqueta: "Otro" },
];

const ESTADOS: Record<string, string> = {
  planificado: "Por realizar",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

export default async function OperativosPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const archivo = (await searchParams).ver === "archivo";
  const ahora = new Date();
  const hoy = diaEnChile(ahora);
  const hora = new Intl.DateTimeFormat("es-CL", { timeZone: ZONA_CHILE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ahora);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  const perfilRes = await supabase.from("users").select("rol,tenant_id").eq("id", user!.id).single();
  const esAdmin = perfilRes.data?.rol === "admin";
  if (esAdmin && esPilotoTerreno(perfilRes.data?.tenant_id)) redirect("/agenda/equipos");

  if (!esAdmin) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold">Operativos</h1>
        <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
          Solo el administrador maneja los operativos.
        </p>
      </div>
    );
  }

  const [opsRes, recetasRes, ventasRes, contactosRes, pendientesRes] = await Promise.all([
    leerTodas((a, b) => supabase
      .from("operativos")
      .select(
        "id, nombre, tipo_venue, fecha, fecha_fin, hora_inicio, hora_fin, direccion, estado"
      )
      .in("estado", archivo ? ["realizado", "cancelado"] : ["planificado"])
      .order("fecha", { ascending: false }).order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("recetas").select("id, operativo_id").not("operativo_id", "is", null).order("id").range(a, b)),
    leerTodas((a, b) => supabase
      .from("ventas")
      .select(
        `id, operativo_id, total, pagos_abonos (monto),
         venta_items (ordenes_trabajo:ot_id (id, estado))`
      )
      .eq("anulada", false)
      .not("operativo_id", "is", null).order("id").range(a, b)),
    leerTodas((a, b) => supabase
      .from("contactos_operativo")
      .select("id, operativo_id, nombre, cargo, telefono")
      .order("created_at", { ascending: true }).order("id").range(a, b)),
    cargarPendientes(supabase),
  ]);

  const errorLectura = opsRes.error ?? recetasRes.error ?? ventasRes.error ?? contactosRes.error ?? pendientesRes.error;
  if (errorLectura) return <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">No se pudieron leer los operativos. Recarga; los pendientes no están confirmados.</p>;
  const operativos = opsRes.data;
  const recetas = recetasRes.data;
  const ventas = ventasRes.data;
  const contactos = contactosRes.data;
  const pagosPorOperativo = new Map(pendientesRes.resumen.operativos.map((o) => [o.operativoId, o]));
  // Un vistazo de cómo le fue a cada operativo sin tener que entrar: cuántos
  // exámenes, cuántas ventas y cuánto se vendió — se arma en memoria en vez
  // de una consulta por operativo.
  const examenesPorOperativo = new Map<string, number>();
  for (const r of recetas ?? []) {
    if (!r.operativo_id) continue;
    examenesPorOperativo.set(r.operativo_id, (examenesPorOperativo.get(r.operativo_id) ?? 0) + 1);
  }
  // El primer dirigente anotado de cada lugar, para verlo sin entrar. El
  // resto vive en la agenda: en la lista solo estorbarían.
  const contactoPorOperativo = new Map<string, { nombre: string; cargo: string | null; telefono: string | null }>();
  const cuantosContactos = new Map<string, number>();
  for (const c of contactos ?? []) {
    cuantosContactos.set(c.operativo_id, (cuantosContactos.get(c.operativo_id) ?? 0) + 1);
    if (!contactoPorOperativo.has(c.operativo_id)) contactoPorOperativo.set(c.operativo_id, c);
  }
  const ventasPorOperativo = new Map<string, { cantidad: number; total: number }>();
  // Lo que sigue pendiente de cada operativo: lentes sin entregar y plata
  // sin cobrar. Un operativo sin nada pendiente ya está terminado.
  const pendientePorOperativo = new Map<string, { lentes: Set<string>; saldo: number }>();
  for (const v of ventas ?? []) {
    if (!v.operativo_id) continue;
    const actual = ventasPorOperativo.get(v.operativo_id) ?? { cantidad: 0, total: 0 };
    actual.cantidad += 1;
    actual.total += v.total;
    ventasPorOperativo.set(v.operativo_id, actual);

    const pend = pendientePorOperativo.get(v.operativo_id) ?? { lentes: new Set<string>(), saldo: 0 };
    pend.saldo += Math.max(0, v.total - (v.pagos_abonos ?? []).reduce((a: number, p: { monto: number }) => a + p.monto, 0));
    for (const item of v.venta_items ?? []) {
      const rel = (item as { ordenes_trabajo?: { id: string; estado: string } | { id: string; estado: string }[] | null }).ordenes_trabajo;
      const ot = Array.isArray(rel) ? rel[0] : rel;
      if (ot && !["entregado", "cancelado"].includes(ot.estado)) pend.lentes.add(ot.id);
    }
    pendientePorOperativo.set(v.operativo_id, pend);
  }

  const lista = operativos ?? [];
  const pendiente = (id: string) => pendientePorOperativo.get(id) ?? { lentes: new Set<string>(), saldo: 0 };
  const prioridad = (o: (typeof lista)[number]) => cubreDia(o, hoy) ? 0 : o.fecha > hoy ? 1 : 2;
  const visibles = archivo ? lista : [...lista].sort((a, b) =>
    prioridad(a) - prioridad(b) || (prioridad(a) === 2 ? b.fecha.localeCompare(a.fecha) : a.fecha.localeCompare(b.fecha))
    || (a.hora_inicio ?? "99").localeCompare(b.hora_inicio ?? "99"));
  const etiqueta = (o: (typeof lista)[number]) => {
    if (esOperativoArchivado(o.estado)) return ESTADOS[o.estado];
    if (!cubreDia(o, hoy)) return o.fecha < hoy ? "Pendiente de cierre" : ESTADOS.planificado;
    const inicio = horaCorta(o.hora_inicio);
    const fin = horaCorta(o.hora_fin);
    return inicio && fin && inicio <= hora && hora < fin ? "En curso" : "Hoy";
  };

  const input =
    "rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand";

  const botonEstado = (o: (typeof lista)[number]) => o.estado !== "cancelado" && (
    <form action={cambiarEstadoOperativo}>
      <input type="hidden" name="id" value={o.id} />
      <input type="hidden" name="estado" value={archivo ? "planificado" : "realizado"} />
      <input type="hidden" name="estado_anterior" value={o.estado} />
      <BotonEnviar className="min-h-10 rounded-lg border border-tinta/20 bg-white px-3 py-2 text-xs font-semibold transition hover:bg-crema">
        {archivo ? "Volver a activos" : "Marcar realizado"}
      </BotonEnviar>
    </form>
  );

  const tarjeta = (o: (typeof lista)[number]) => {
    const examenes = examenesPorOperativo.get(o.id) ?? 0;
    const venta = ventasPorOperativo.get(o.id);
    const contacto = contactoPorOperativo.get(o.id);
    const pend = pendiente(o.id);
    const pagos = pagosPorOperativo.get(o.id);
    const enFecha = !archivo && cubreDia(o, hoy);
    return (
      <li
        key={o.id}
        className={`rounded-2xl border-2 p-4 shadow-sm ${enFecha ? "border-sky-400 bg-sky-50" : "border-tinta/10 bg-white"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/operativos/${o.id}`} className="flex-1">
            <p className="text-lg font-bold text-tinta">{o.nombre}</p>
            <p className="text-sm text-tinta-suave">
              {[mostrarFechas(o), rangoHorario(o.hora_inicio, o.hora_fin), TIPOS_VENUE.find((t) => t.valor === o.tipo_venue)?.etiqueta, o.direccion].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className={`rounded-full px-2.5 py-1 ${enFecha ? "bg-sky-700 text-white" : "bg-crema text-tinta"}`}>
                {etiqueta(o)}
              </span>
              {pend.lentes.size > 0 && (
                <span className="rounded-full bg-amber-400 px-2.5 py-1 text-amber-950">
                  {pend.lentes.size} {pend.lentes.size === 1 ? "orden" : "órdenes"} por entregar
                </span>
              )}
              {pend.saldo > 0 && <span className="rounded-full bg-red-600 px-2.5 py-1 text-white">Falta cobrar {clp(pend.saldo)}</span>}
              {pagos && pagos.total > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-950">Por pagar {clp(pagos.total)}</span>}
              {pagos && pagos.ahorro > 0 && <span className="rounded-full bg-white px-2.5 py-1 text-emerald-800">Ahorro por separar</span>}
              {examenes > 0 && <span className="rounded-full bg-white px-2.5 py-1 text-tinta">{examenes} examinados</span>}
              {venta && <span className="rounded-full bg-white px-2.5 py-1 text-tinta">{clp(venta.total)} vendido</span>}
            </p>
            {contacto && (
              <p className="mt-1 text-xs text-tinta-suave">
                📇 {[contacto.nombre, contacto.cargo, formatearTelefono(contacto.telefono)].filter(Boolean).join(" · ")}
                {(cuantosContactos.get(o.id) ?? 0) > 1 && ` +${(cuantosContactos.get(o.id) ?? 0) - 1} más`}
              </p>
            )}
          </Link>
          {botonEstado(o)}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CabeceraPagina seccion="En terreno" titulo={archivo ? "Archivo de operativos" : "Operativos"} />
        <div className="flex flex-wrap gap-2">
          <Link href={archivo ? "/operativos" : "/operativos?ver=archivo"} className="rounded-xl border border-tinta/15 bg-white px-4 py-3 text-sm font-semibold">{archivo ? "Activos" : "Archivo"}</Link>
          <Link href="/operativos/agenda" className="rounded-xl bg-sky-900 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-800">
            Abrir calendario
          </Link>
          <Link href="/operativos/contactos" className="rounded-xl border-2 border-tinta/15 bg-white px-3.5 py-2 text-sm font-semibold hover:bg-crema">
            Dirigentes
          </Link>
          <Link href="/operativos/comparar" className="rounded-xl border-2 border-tinta/15 bg-white px-3.5 py-2 text-sm font-semibold hover:bg-crema">
            Comparar
          </Link>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        {visibles.length > 0 ? <ul className="flex flex-col gap-3">
          {visibles.map(tarjeta)}
        </ul> : <p className="rounded-2xl bg-white p-4 text-sm text-tinta-suave">{archivo ? "Sin operativos archivados." : "Sin operativos por realizar o en curso."}</p>}

        {!archivo && <details className="rounded-2xl border border-sky-100 bg-sky-50 p-4 shadow-sm">
          <summary className="cursor-pointer font-semibold text-sky-800">＋ Nuevo operativo</summary>
          <form action={crearOperativo} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Nombre *
              <input name="nombre" required placeholder="Colegio San José" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Tipo de lugar
              <select name="tipo_venue" defaultValue="" className={input}>
                <option value="">— Sin especificar —</option>
                {TIPOS_VENUE.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Fecha *
              <input type="date" name="fecha" required className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Fecha de término (si dura más de un día)
              <input type="date" name="fecha_fin" className={input} />
            </label>
            {/* La hora es lo que permite poner dos sedes el mismo día en el
                calendario, una después de la otra. Es opcional: un operativo
                sin hora igual aparece, solo que sin horario. */}
            <label className="flex flex-col gap-1 text-sm font-medium">
              Hora de inicio
              <input type="time" name="hora_inicio" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Hora de término
              <input type="time" name="hora_fin" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Dirección
              <input name="direccion" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Dirigente que consiguió el lugar
              <input name="contacto_nombre" placeholder="Luigino" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Su cargo
              <input name="contacto_cargo" placeholder="Presidente de la directiva" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Su teléfono
              <CampoTelefono name="contacto_telefono" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
              Notas
              <textarea name="notas" rows={2} className={input} />
            </label>
            <div className="sm:col-span-2">
              <BotonEnviar className="rounded-lg bg-sky-700 px-4 py-2.5 font-semibold text-white transition hover:bg-sky-800">
                Crear operativo
              </BotonEnviar>
            </div>
          </form>
        </details>}
      </section>
    </div>
  );
}
