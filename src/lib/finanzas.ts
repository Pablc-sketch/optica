import { diaEnChile, mesEnChile, primerDiaDelMes, ultimoDiaDelMes } from './fechas';
import { montoCaja } from './caja-fuentes';
import { fechaValidaDocumento } from './fecha-documentos';
import { PERSONAS_REVISION, type MovimientoRevision } from './revision-financiera';

export const FUENTES = { digital: 'Cuenta bancaria (Mercado Pago)', efectivo: 'Efectivo de la óptica', personal: 'Dinero personal de Pablo' } as const;
export const TIPOS_REGISTRO = {
  gasto: 'Gasto del negocio', sueldo: 'Pago de sueldo', retiro: 'Adelanto o retiro',
  aporte: 'Aporte al negocio', ahorro: 'Separar ahorro', traslado: 'Mover entre cuenta y efectivo',
  devolucion: 'Devolver gasto personal', conteo: 'Contar efectivo',
} as const;
export type TipoRegistro = keyof typeof TIPOS_REGISTRO;
export const esTipoRegistro = (v: string): v is TipoRegistro => Object.hasOwn(TIPOS_REGISTRO, v);
export type Fuente = keyof typeof FUENTES;
export type CobroFinanzas = { id: string; fecha: string; monto: number; medio_pago: string | null; venta_id: string };
export type GastoFinanzas = { id: string; fecha: string; monto: number; caja: string; descripcion: string; operativo_id?: string | null; confirmado_en?: string | null };
export type RetiroFinanzas = { id: string; fecha: string; monto: number; caja: string; persona: string; operativo_id: string | null; es_sueldo?: boolean; motivo?: string | null; confirmado_en?: string | null };
export type TrasladoFinanzas = { id: string; fecha: string; monto: number; caja: string; tipo: string; descripcion: string };
export type FilaFinanzas = {
  id: string; fecha: string; titulo: string; tipo: 'cobro' | 'gasto' | 'sueldo' | 'retiro' | 'aporte' | 'ahorro' | 'traslado' | 'devolucion';
  caja: string; monto: number; efectivo: number; digital: number; personal: number;
  href: string; confirmado: boolean | null; nota: string;
};

// Un traslado es UN movimiento con dos efectos opuestos. Los gastos personales
// se muestran, pero no se convierten en una salida de dinero del negocio.
export function movimientosFinanzas({ cobros, gastos, retiros, traslados }: {
  cobros: CobroFinanzas[]; gastos: GastoFinanzas[]; retiros: RetiroFinanzas[]; traslados: TrasladoFinanzas[];
}): FilaFinanzas[] {
  const efecto = (caja: string, monto: number) => ({ digital: caja === 'digital' ? monto : 0, efectivo: caja === 'efectivo' ? monto : 0, personal: caja === 'personal' ? monto : 0 });
  return [
    ...cobros.map(c => {
      const caja = !c.medio_pago || c.medio_pago === 'efectivo' ? 'efectivo' : 'digital';
      return { id: `c-${c.id}`, fecha: diaEnChile(c.fecha), titulo: 'Cobro de venta', tipo: 'cobro' as const,
        caja, monto: c.monto, ...efecto(caja, c.monto), href: `/ventas/${c.venta_id}`, confirmado: null,
        nota: !c.medio_pago ? 'Sin medio de pago · incluido como efectivo' : c.medio_pago === 'credito' ? 'Crédito · antes de comisión' : c.medio_pago === 'debito' ? 'Débito · antes de comisión' : c.medio_pago === 'transferencia' ? 'Transferencia recibida' : 'Efectivo' };
    }),
    ...gastos.map(g => ({ id: `g-${g.id}`, fecha: g.fecha, titulo: g.descripcion, tipo: 'gasto' as const,
      caja: g.caja, monto: -g.monto, ...efecto(g.caja, -g.monto), href: `/pagos/revisar?registro=${g.id}`,
      confirmado: !!g.confirmado_en, nota: g.caja === 'personal' ? 'Pablo pagó por la óptica · no sale de caja' : g.operativo_id ? 'Pago de costo del operativo' : 'Gasto del negocio' })),
    ...retiros.map(r => {
      const tipo = r.monto < 0 ? 'aporte' as const : r.persona === 'ahorro' ? 'ahorro' as const : r.es_sueldo ? 'sueldo' as const : 'retiro' as const;
      const nombre = PERSONAS_REVISION[r.persona as keyof typeof PERSONAS_REVISION] ?? 'Persona sin identificar';
      return { id: `r-${r.id}`, fecha: r.fecha, titulo: `${tipo === 'aporte' ? 'Aporte' : tipo === 'ahorro' ? 'Ahorro separado' : tipo === 'sueldo' ? 'Sueldo' : 'Adelanto / retiro'} · ${nombre}`,
        tipo, caja: r.caja, monto: -r.monto, ...efecto(r.caja, -r.monto), href: `/pagos/revisar?registro=${r.id}`,
        confirmado: !!r.confirmado_en, nota: r.motivo ?? (r.operativo_id ? 'Asignado a un operativo' : 'Sin operativo asignado') };
    }),
    ...traslados.map(t => {
      const traslado = t.tipo === 'deposito' || t.tipo === 'retiro';
      const digital = t.tipo === 'deposito' ? t.monto : t.tipo === 'retiro' ? -t.monto : t.caja === 'digital' ? -t.monto : 0;
      const efectivo = t.tipo === 'deposito' ? -t.monto : t.tipo === 'retiro' ? t.monto : t.caja === 'efectivo' ? -t.monto : 0;
      return { id: `t-${t.id}`, fecha: t.fecha, titulo: t.descripcion, tipo: traslado ? 'traslado' as const : 'devolucion' as const,
        caja: traslado ? 'entre_cuentas' : t.caja, monto: traslado ? 0 : -t.monto, digital, efectivo, personal: 0,
        href: '/caja?vista=movimientos', confirmado: null,
        nota: t.tipo === 'deposito' ? 'Efectivo → Mercado Pago' : t.tipo === 'retiro' ? 'Mercado Pago → efectivo' : 'Reintegro a Pablo · el gasto ya estaba registrado' };
    }),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
}

export function resumenMovimientos(filas: FilaFinanzas[], caja = 'todas') {
  let entradas = 0, salidas = 0, personal = 0, traslados = 0;
  for (const m of filas) {
    if (m.tipo === 'traslado') traslados += 1;
    personal += -m.personal;
    const importe = caja === 'digital' ? m.digital : caja === 'efectivo' ? m.efectivo : caja === 'personal' ? 0 : m.digital + m.efectivo;
    if (importe > 0) entradas += importe;
    if (importe < 0) salidas -= importe;
  }
  return { entradas, salidas, neto: entradas - salidas, personal, traslados };
}

export function periodoFinanzas(mes?: string) {
  const actual = mesEnChile();
  const valido = /^\d{4}-(0[1-9]|1[0-2])$/.test(mes ?? '') && Number(mes?.slice(0,4)) >= 2000 && Number(mes?.slice(0,4)) <= 2100;
  const elegido = valido ? mes! : actual;
  return { mes: elegido, desde: primerDiaDelMes(elegido), hasta: ultimoDiaDelMes(elegido) };
}

export function prepararRegistroFinanzas(f: FormData, hoy: string): { error: string } | { movimiento: MovimientoRevision } {
  const tipo = String(f.get('tipo') ?? '');
  const id = String(f.get('id') ?? '');
  const fecha = String(f.get('fecha') ?? '');
  const monto = montoCaja(f.get('monto'));
  const caja = String(f.get('caja') ?? '');
  const persona = tipo === 'ahorro' ? 'ahorro' : String(f.get('persona') ?? '');
  const operativoId = String(f.get('operativo_id') ?? '').trim();
  const descripcion = String(f.get('descripcion') ?? '').trim();
  const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
  if (!uuid.test(id) || (operativoId && !uuid.test(operativoId))) return { error: 'Recarga antes de guardar este movimiento.' };
  if (!['gasto','sueldo','retiro','aporte','ahorro'].includes(tipo) || monto === null || !fechaValidaDocumento(fecha) || fecha > hoy)
    return { error: 'Revisa el monto y la fecha del movimiento.' };
  if (!Object.hasOwn(FUENTES, caja) || (tipo !== 'gasto' && caja === 'personal')) return { error: 'Elige la cuenta o el efectivo que se usó.' };
  if (!descripcion || descripcion.length > 250) return { error: 'Describe el movimiento (máximo 250 caracteres).' };
  if (tipo !== 'gasto' && (!Object.hasOwn(PERSONAS_REVISION, persona) || (tipo !== 'ahorro' && persona === 'ahorro')))
    return { error: 'Elige a quién corresponde el movimiento.' };
  // Un retiro sin operativo no rebaja sueldos de un operativo específico.
  if ((tipo === 'sueldo' || tipo === 'retiro' || tipo === 'ahorro') && !operativoId)
    return { error: 'Elige el operativo para descontar este pago del pendiente correcto.' };
  if (tipo === 'gasto' && /^(Costo operativo · |Fides · |Marcos · )/.test(descripcion))
    return { error: 'Registra Fides, marcos y costos de operativos desde Por pagar para evitar duplicarlos.' };
  const categoria = String(f.get('categoria') ?? 'otro');
  if (tipo === 'gasto' && !['otro','arriendo','compra_inventario'].includes(categoria)) return { error: 'Elige la categoría del gasto.' };
  return { movimiento: { id, tabla: tipo === 'gasto' ? 'gastos_globales' : 'retiros_sueldo', fecha,
    monto: tipo === 'aporte' ? -monto : monto, caja, operativo_id: tipo === 'gasto' ? null : operativoId || null,
    revision_version: 0, confirmado_en: null,
    ...(tipo === 'gasto' ? { descripcion, categoria } : { persona, motivo: descripcion, es_sueldo: tipo === 'sueldo' }),
  } };
}

// Excel interpreta =,+,-,@ como fórmulas incluso dentro de comillas CSV.
export function celdaCsv(valor: string | number) {
  const texto = String(valor);
  const seguro = typeof valor === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replaceAll('"', '""')}"`;
}
