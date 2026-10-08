// A quién se le puede decir "sus lentes están listos" (hallazgo F04 de la
// auditoría del 08-10-2026). Antes el aviso iba a todo el que compró en el
// operativo, aunque su orden siguiera en el laboratorio o ya se la hubiera
// llevado. Ahora se decide con el estado REAL de cada orden de trabajo.
//
// Código puro: recibe las ventas ya leídas y devuelve la clasificación, para
// poder probarlo caso a caso.

export type OrdenDeVenta = { id: string; estado: string; pares: number };
export type VentaParaAviso = {
  id: string;
  pacienteId: string | null;
  nombre: string;
  telefono: string | null;
  total: number;
  pagado: number;
  anulada: boolean;
  ordenes: OrdenDeVenta[];
};

export type PacienteAvisable = {
  pacienteId: string;
  nombre: string;
  telefono: string | null;
  ventaIds: string[];
  paresListos: number;
  paresPendientes: number;
  saldo: number;
};

export type ClasificacionAvisos = {
  // Tienen al menos un par listo para retirar.
  listos: PacienteAvisable[];
  // Compraron, pero ningún par está listo todavía (no se les dice "listo").
  enProceso: PacienteAvisable[];
};

const CERRADOS = new Set(["entregado", "cancelado"]);

export function clasificarAvisos(ventas: VentaParaAviso[]): ClasificacionAvisos {
  const porPaciente = new Map<string, PacienteAvisable>();
  for (const v of ventas) {
    if (v.anulada || !v.pacienteId) continue;
    const abiertas = v.ordenes.filter((o) => !CERRADOS.has(o.estado));
    // Sin órdenes abiertas (todo entregado o cancelado, o venta sin lentes)
    // no hay nada que avisar.
    if (abiertas.length === 0) continue;
    const listos = abiertas.filter((o) => o.estado === "listo").reduce((s, o) => s + o.pares, 0);
    const pendientes = abiertas.filter((o) => o.estado !== "listo").reduce((s, o) => s + o.pares, 0);
    const actual = porPaciente.get(v.pacienteId) ?? {
      pacienteId: v.pacienteId,
      nombre: v.nombre,
      telefono: v.telefono,
      ventaIds: [],
      paresListos: 0,
      paresPendientes: 0,
      saldo: 0,
    };
    actual.ventaIds.push(v.id);
    actual.paresListos += listos;
    actual.paresPendientes += pendientes;
    // Cada venta suma su saldo una sola vez, aunque tenga varias órdenes.
    actual.saldo += Math.max(0, v.total - v.pagado);
    porPaciente.set(v.pacienteId, actual);
  }
  const todos = [...porPaciente.values()];
  return {
    listos: todos.filter((p) => p.paresListos > 0),
    enProceso: todos.filter((p) => p.paresListos === 0),
  };
}

// La frase del mensaje: completa o parcial.
export function fraseListos(p: Pick<PacienteAvisable, "paresListos" | "paresPendientes">): string {
  if (p.paresPendientes === 0) return "sus lentes están listos";
  const total = p.paresListos + p.paresPendientes;
  return `${p.paresListos} de sus ${total} pares de lentes ${p.paresListos === 1 ? "ya está listo" : "ya están listos"} (el resto le avisamos cuando llegue)`;
}

// Lee de la base las ventas de un operativo con el estado de sus órdenes.
// Si la lectura falla, devuelve el error (no una lista vacía): "no hay a
// quién avisar" y "no se pudo leer" no son lo mismo (F10).
type Cliente = { from: (tabla: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export async function cargarVentasParaAviso(
  supabase: Cliente,
  operativoId: string
): Promise<{ ventas: VentaParaAviso[]; error: string | null }> {
  const { data, error } = await supabase
    .from("ventas")
    .select(
      `id, total, anulada, paciente_id, pacientes:paciente_id (nombre, telefono), pagos_abonos (monto),
       venta_items (ot_id, ordenes_trabajo:ot_id (id, estado, tipo_lente, tipo_lente_2))`
    )
    .eq("operativo_id", operativoId);
  if (error) return { ventas: [], error: error.message as string };
  type Ot = { id: string; estado: string; tipo_lente: string | null; tipo_lente_2: string | null };
  type Fila = {
    id: string;
    total: number;
    anulada: boolean;
    paciente_id: string | null;
    pacientes: { nombre: string; telefono: string | null } | { nombre: string; telefono: string | null }[] | null;
    pagos_abonos: { monto: number }[] | null;
    venta_items: { ot_id: string | null; ordenes_trabajo: Ot | Ot[] | null }[] | null;
  };
  const ventas = ((data ?? []) as Fila[]).map((v) => {
    const paciente = Array.isArray(v.pacientes) ? v.pacientes[0] : v.pacientes;
    const ordenes = new Map<string, OrdenDeVenta>();
    for (const item of v.venta_items ?? []) {
      const ot = Array.isArray(item.ordenes_trabajo) ? item.ordenes_trabajo[0] : item.ordenes_trabajo;
      if (ot && !ordenes.has(ot.id)) {
        ordenes.set(ot.id, { id: ot.id, estado: ot.estado, pares: (ot.tipo_lente ? 1 : 0) + (ot.tipo_lente_2 ? 1 : 0) || 1 });
      }
    }
    return {
      id: v.id,
      pacienteId: v.paciente_id,
      nombre: paciente?.nombre ?? "Sin nombre",
      telefono: paciente?.telefono ?? null,
      total: v.total,
      pagado: (v.pagos_abonos ?? []).reduce((s, p) => s + p.monto, 0),
      anulada: v.anulada,
      ordenes: [...ordenes.values()],
    };
  });
  return { ventas, error: null };
}

// Lo que necesita el recuadro de WhatsApp por cada persona avisable.
export function destinatariosDeAvisos(
  listos: PacienteAvisable[],
  telefonoWsp: (t: string | null) => string | null,
  formatoMonto: (n: number) => string,
  optica: string
) {
  return listos.map((p) => ({
    id: p.pacienteId,
    nombre: p.nombre,
    telefonoWsp: telefonoWsp(p.telefono),
    detalle: p.paresPendientes > 0 ? `${p.paresListos} de ${p.paresListos + p.paresPendientes} pares listos` : "todo listo",
    monto: p.saldo,
    valores: {
      listos: fraseListos(p),
      saldo: p.saldo > 0 ? formatoMonto(p.saldo) : "nada, ya está pagado",
      optica,
    },
  }));
}
