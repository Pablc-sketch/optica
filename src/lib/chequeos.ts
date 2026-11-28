import { numerosDeOperativo, type OperativoParaCierre, type VentaParaCierre } from "./cierre-operativo";
import { esVentaDeConsulta, totalConsultas } from "./consulta";
import { COSTO_MARCO_POR_PAR, type ItemConCosto } from "./costo-venta";

export type Chequeo = { id: string; nombre: string; desde: string; hasta: string; ahorro_pct: number; comision_isadora_pct?: number; reparto_pamela_pct?: number; independiente?: boolean };
export type SedeChequeo = OperativoParaCierre & {
  id: string; nombre: string; fecha: string; fecha_fin: string | null; hora_inicio?: string | null;
  direccion: string | null; estado: string; pagos_saldados_en?: string | null; cierre_financiero_en?: string | null; chequeo_id: string | null;
};
export type AtencionChequeo = { operativo_id: string; paciente_id: string };
type CostoProducto = { costo: number | null } | { costo: number | null }[] | null;
type MarcoOT = {
  marco_propio: boolean; marco_propio_2: boolean; estado?: string;
  armazon_producto_id: string | null; armazon_producto_id_2: string | null;
  // Costo del marco en Inventario (lo que se pagó al proveedor).
  marco_1?: CostoProducto; marco_2?: CostoProducto;
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

// Cuenta pares y marcos que hay que reponer. El costo de cada marco es el
// de Inventario; si el marco no tiene costo cargado, se usa el costo por
// marco de la sede (o $5.000). El marco del paciente no se repone.
export function contarLentesYMarcos(items: ItemChequeo[], costoPorDefecto = COSTO_MARCO_POR_PAR) {
  let pares = 0;
  let marcos = 0;
  let costoMarcos = 0;
  const costoDe = (producto: CostoProducto | undefined) => {
    const costo = Number(uno(producto)?.costo ?? 0);
    return Number.isFinite(costo) && costo > 0 ? costo : costoPorDefecto;
  };
  const stock = new Map<string, { cantidad: number; costo: number }>();
  const asignados = new Map<string, number>();
  for (const item of items) {
    const ot = uno(item.ordenes_trabajo);
    if (ot) {
      pares += item.cantidad;
      const segundo = item.cristal_slot === 2;
      if (segundo ? ot.marco_propio_2 : ot.marco_propio) continue;
      marcos += item.cantidad;
      costoMarcos += item.cantidad * costoDe(segundo ? ot.marco_2 : ot.marco_1);
      const id = segundo ? ot.armazon_producto_id_2 : ot.armazon_producto_id;
      if (id) asignados.set(id, (asignados.get(id) ?? 0) + item.cantidad);
    } else if (item.producto_id && uno(item.productos)?.categoria === "armazon") {
      const previo = stock.get(item.producto_id);
      stock.set(item.producto_id, { cantidad: (previo?.cantidad ?? 0) + item.cantidad, costo: costoDe(item.productos) });
    }
  }
  for (const [id, { cantidad, costo }] of stock) {
    const sueltos = Math.max(0, cantidad - (asignados.get(id) ?? 0));
    marcos += sueltos;
    costoMarcos += sueltos * costo;
  }
  return { pares, marcos, costoMarcos };
}

export function resumirChequeo(
  sedes: SedeChequeo[], atenciones: AtencionChequeo[], ventas: VentaChequeo[],
  gastosCompartidos: number, debito: number, credito: number,
  comisionChequeoPct?: number,
  reservaCompraPersonal = 0,
  iva = 0,
) {
  const atendidos = new Set<string>();
  let baseComisionAcumulada = 0;
  const filas = sedes.map(sede => {
    const pacientes = new Set(atenciones.filter(a => a.operativo_id === sede.id).map(a => a.paciente_id));
    for (const p of pacientes) atendidos.add(p);
    const operaciones = ventas.filter(v => v.operativo_id === sede.id);
    let porCobrar = 0;
    let conSaldo = 0;
    let porCobrarEntrega = 0;
    let pares = 0;
    let marcos = 0;
    let costoMarcos = 0;
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
      const cantidades = contarLentesYMarcos(items, sede.costo_marco_unitario ?? COSTO_MARCO_POR_PAR);
      pares += cantidades.pares;
      marcos += cantidades.marcos;
      costoMarcos += cantidades.costoMarcos;
    }
    const numeros = numerosDeOperativo(sede, operaciones, debito, credito, marcos, costoMarcos);
    let comisionVentas = numeros.cierre.isadora;
    if (comisionChequeoPct !== undefined) {
      const tasa = comisionChequeoPct / 100;
      const anterior = Math.round(baseComisionAcumulada * tasa);
      const consultas = totalConsultas(operaciones.flatMap(v => v.venta_items ?? []));
      baseComisionAcumulada += Math.max(0, numeros.vendido - consultas);
      comisionVentas = Math.round(baseComisionAcumulada * tasa) - anterior;
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
  return {
    filas, pacientes: atendidos.size, ventas: total("ventas"), pares: total("pares"), marcos: total("marcos"),
    conSaldo: total("conSaldo"), vendido: total("vendido"), cobrado: total("cobrado"), porCobrar: total("porCobrar"), porCobrarEntrega: total("porCobrarEntrega"),
    utilidad, iva, comisionVentas: total("comisionVentas"), gastosCompartidos, reservaCompraPersonal,
  };
}
