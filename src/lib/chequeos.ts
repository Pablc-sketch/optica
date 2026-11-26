import { numerosDeOperativo, type OperativoParaCierre, type VentaParaCierre } from "./cierre-operativo";
import { esVentaDeConsulta } from "./consulta";
import type { ItemConCosto } from "./costo-venta";
import { calcularSueldos } from "./sueldos";

export type Chequeo = { id: string; nombre: string; desde: string; hasta: string; ahorro_pct: number; comision_isadora_pct?: number; reparto_pamela_pct?: number };
export type SedeChequeo = OperativoParaCierre & {
  id: string; nombre: string; fecha: string; fecha_fin: string | null; hora_inicio?: string | null;
  direccion: string | null; estado: string; pagos_saldados_en?: string | null; chequeo_id: string | null;
};
export type AtencionChequeo = { operativo_id: string; paciente_id: string };
type MarcoOT = {
  marco_propio: boolean; marco_propio_2: boolean; estado?: string;
  armazon_producto_id: string | null; armazon_producto_id_2: string | null;
};
type ItemChequeo = Omit<ItemConCosto, "ordenes_trabajo"> & {
  producto_id: string | null;
  precio_unitario: number;
  descuento?: number | null;
  ordenes_trabajo?: (NonNullable<Exclude<ItemConCosto["ordenes_trabajo"], unknown[]>> & MarcoOT)
    | (NonNullable<Exclude<ItemConCosto["ordenes_trabajo"], unknown[]>> & MarcoOT)[] | null;
};
export type VentaChequeo = VentaParaCierre & { operativo_id: string; venta_items?: ItemChequeo[] | null };

function uno<T>(valor: T | T[] | null | undefined) {
  return Array.isArray(valor) ? valor[0] : valor;
}

export function contarLentesYMarcos(items: ItemChequeo[]) {
  let pares = 0;
  let marcos = 0;
  const stock = new Map<string, number>();
  const asignados = new Map<string, number>();
  for (const item of items) {
    const ot = uno(item.ordenes_trabajo);
    if (ot) {
      pares += item.cantidad;
      const segundo = item.cristal_slot === 2;
      if (segundo ? ot.marco_propio_2 : ot.marco_propio) continue;
      marcos += item.cantidad;
      const id = segundo ? ot.armazon_producto_id_2 : ot.armazon_producto_id;
      if (id) asignados.set(id, (asignados.get(id) ?? 0) + item.cantidad);
    } else if (item.producto_id && uno(item.productos)?.categoria === "armazon") {
      stock.set(item.producto_id, (stock.get(item.producto_id) ?? 0) + item.cantidad);
    }
  }
  for (const [id, cantidad] of stock) marcos += Math.max(0, cantidad - (asignados.get(id) ?? 0));
  return { pares, marcos };
}

export function resumirChequeo(
  sedes: SedeChequeo[], atenciones: AtencionChequeo[], ventas: VentaChequeo[],
  gastosCompartidos: number, ahorroPct: number, debito: number, credito: number,
  reglas?: { comisionIsadoraPct: number; parteMadrePct: number },
  reservaCompraPersonal = 0,
) {
  const atendidos = new Set<string>();
  let vendidoAcumulado = 0;
  const filas = sedes.map(sede => {
    const pacientes = new Set(atenciones.filter(a => a.operativo_id === sede.id).map(a => a.paciente_id));
    for (const p of pacientes) atendidos.add(p);
    const operaciones = ventas.filter(v => v.operativo_id === sede.id);
    let porCobrar = 0;
    let conSaldo = 0;
    let porCobrarEntrega = 0;
    let pares = 0;
    let marcos = 0;
    let ventasProductos = 0;
    for (const v of operaciones) {
      const saldo = Math.max(0, v.total - (v.pagos_abonos ?? []).reduce((suma, pago) => suma + pago.monto, 0));
      if (saldo > 0) conSaldo++;
      porCobrar += saldo;
      const items: ItemChequeo[] = v.venta_items ?? [];
      if (items.some(item => {
        const ot = uno(item.ordenes_trabajo);
        return ot?.estado && ot.estado !== "entregado" && ot.estado !== "cancelado";
      })) porCobrarEntrega += saldo;
      if (!esVentaDeConsulta(items)) ventasProductos++;
      const cantidades = contarLentesYMarcos(items);
      pares += cantidades.pares;
      marcos += cantidades.marcos;
    }
    const numeros = numerosDeOperativo(sede, operaciones, debito, credito, marcos);
    let comisionVentas = numeros.cierre.isadora;
    if (reglas) {
      const tasa = reglas.comisionIsadoraPct / 100;
      const anterior = Math.round(vendidoAcumulado * tasa);
      vendidoAcumulado += numeros.vendido;
      comisionVentas = Math.round(vendidoAcumulado * tasa) - anterior;
    }
    return {
      sede, pacientes: pacientes.size, ventas: ventasProductos, pares, marcos, conSaldo,
      vendido: numeros.vendido, cobrado: numeros.cobrado, porCobrar, porCobrarEntrega,
      desglose: numeros.desglose, comisionTarjeta: numeros.cierre.comisionTarjeta,
      utilidad: numeros.cierre.utilidad - comisionVentas, comisionVentas,
    };
  });
  const total = (campo: "ventas" | "pares" | "marcos" | "conSaldo" | "vendido" | "cobrado" | "porCobrar" | "porCobrarEntrega" | "utilidad" | "comisionVentas") =>
    filas.reduce((suma, sede) => suma + sede[campo], 0);
  const utilidad = total("utilidad") - gastosCompartidos;
  const reparto = calcularSueldos(0, utilidad - reservaCompraPersonal, { comisionVendedoraPct: 0, comisionVendedoraBase: "venta_total", ahorroPct, parteMadrePct: reglas?.parteMadrePct });
  return {
    filas, pacientes: atendidos.size, ventas: total("ventas"), pares: total("pares"), marcos: total("marcos"),
    conSaldo: total("conSaldo"), vendido: total("vendido"), cobrado: total("cobrado"), porCobrar: total("porCobrar"), porCobrarEntrega: total("porCobrarEntrega"),
    utilidad, comisionVentas: total("comisionVentas"), reparto, gastosCompartidos, reservaCompraPersonal,
  };
}
