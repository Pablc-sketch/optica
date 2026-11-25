import Link from "next/link";
import type { ReactNode } from "react";
import { GastoGeneralForm } from "@/components/registro-gasto";
import type { resumirCajaChequeo } from "@/lib/caja-chequeo";
import type { resumirChequeo, VentaChequeo } from "@/lib/chequeos";
import { clp } from "@/lib/clp";
import { totalConsultas } from "@/lib/consulta";
import { COSTO_MARCO_POR_PAR } from "@/lib/costo-venta";

const colores = {
  azul: "border-sky-300 bg-sky-50 text-sky-950",
  verde: "border-emerald-300 bg-emerald-50 text-emerald-950",
  ambar: "border-amber-300 bg-amber-50 text-amber-950",
  violeta: "border-violet-300 bg-violet-50 text-violet-950",
  rosa: "border-rose-300 bg-rose-50 text-rose-950",
  indigo: "border-indigo-300 bg-indigo-50 text-indigo-950",
  cian: "border-cyan-300 bg-cyan-50 text-cyan-950",
  turquesa: "border-teal-300 bg-teal-50 text-teal-950",
  naranja: "border-orange-300 bg-orange-50 text-orange-950",
  pizarra: "border-slate-300 bg-slate-50 text-slate-950",
} as const;

type Resumen = ReturnType<typeof resumirChequeo>;
type Caja = ReturnType<typeof resumirCajaChequeo>;

function Recuadro({ etiqueta, valor, color, nota, abierto, ancho, id, children }: {
  etiqueta: string; valor: string | number; color: keyof typeof colores;
  nota?: string; abierto?: boolean; ancho?: boolean; id?: string; children: ReactNode;
}) {
  return <details
    id={id}
    open={abierto}
    className={`group/recuadro min-w-0 scroll-mt-20 rounded-lg border ${colores[color]} ${ancho ? "col-span-2" : ""}`}
  >
    <summary className="block min-h-28 cursor-pointer list-none rounded-lg p-3 shadow-[0_3px_0_rgb(15_23_42/0.12)] hover:shadow-[inset_0_2px_5px_rgb(15_23_42/0.14)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-current active:shadow-[inset_0_3px_6px_rgb(15_23_42/0.2)] motion-safe:transition-[transform,box-shadow] motion-safe:duration-150 motion-safe:hover:translate-y-0.5 motion-safe:active:translate-y-1 sm:p-4 [&::-webkit-details-marker]:hidden">
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold">{etiqueta}</span>
        <span aria-hidden="true" className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-md border border-current/20">
          <span className="-mt-0.5 size-1.5 rotate-45 border-r border-b border-current group-open/recuadro:translate-y-0.5 group-open/recuadro:rotate-225" />
        </span>
      </span>
      <span className="mt-1 block break-words text-xl leading-tight font-bold tabular-nums sm:text-2xl">{valor}</span>
      {nota && <span className="mt-1 block text-xs font-semibold">{nota}</span>}
    </summary>
    <div className="space-y-2 rounded-b-lg border-t border-current/15 bg-white/80 p-3 text-sm sm:p-4">{children}</div>
  </details>;
}

function Datos({ filas, moneda = false }: {
  filas: { id?: string; etiqueta: string; valor: number; href?: string }[]; moneda?: boolean;
}) {
  return <dl className="divide-y divide-current/10">
    {filas.map(({ id, etiqueta, valor, href }) => <div key={id ?? etiqueta} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 py-1.5 first:pt-0 last:pb-0">
      <dt className="min-w-0 break-words">{href ? <Link className="font-semibold underline underline-offset-2" href={href}>{etiqueta}</Link> : etiqueta}</dt>
      <dd className="font-semibold tabular-nums">{moneda ? clp(valor) : valor}</dd>
    </div>)}
  </dl>;
}

function PorSede({ resumen, campo, moneda = false, cobros = false }: {
  resumen: Resumen; campo: "porCobrarEntrega" | "pacientes" | "ventas" | "pares" | "marcos";
  moneda?: boolean; cobros?: boolean;
}) {
  const filas = resumen.filas.filter(f => f[campo] > 0).map(f => ({
    id: f.sede.id, etiqueta: f.sede.nombre, valor: f[campo],
    href: cobros ? `/cobros?op=${f.sede.id}&ver=deben` : undefined,
  }));
  return filas.length > 0 ? <Datos filas={filas} moneda={moneda} /> : <p>Sin registros por sede.</p>;
}

export function IndicadoresChequeo({ resumen: n, ventas }: { resumen: Resumen; ventas: VentaChequeo[] }) {
  const consultas = ventas.reduce((suma, venta) => suma + totalConsultas(venta.venta_items ?? []), 0);
  const abonos = ventas.flatMap(venta => venta.pagos_abonos ?? []);
  const medios = [
    { etiqueta: "Efectivo", tipos: ["efectivo"] },
    { etiqueta: "Tarjetas", tipos: ["debito", "credito"] },
    { etiqueta: "Transferencias", tipos: ["transferencia"] },
  ];
  const porMedio = medios.map(({ etiqueta, tipos }) => ({
    etiqueta, valor: abonos.reduce((suma, pago) => tipos.includes(pago.medio_pago ?? "") ? suma + pago.monto : suma, 0),
  }));
  const otrosMedios = n.cobrado - porMedio.reduce((suma, pago) => suma + pago.valor, 0);
  if (otrosMedios !== 0) porMedio.push({ etiqueta: "Otros medios", valor: otrosMedios });

  return <section aria-label="Resumen del chequeo" className="grid grid-cols-2 items-start gap-3 sm:grid-cols-4">
    <Recuadro etiqueta="Total vendido" valor={clp(n.vendido)} color="azul">
      <Datos moneda filas={[
        { etiqueta: "Productos", valor: n.vendido - consultas },
        { etiqueta: "Consultas y recetas", valor: consultas },
      ]} />
    </Recuadro>
    <Recuadro etiqueta="Ya cobrado" valor={clp(n.cobrado)} color="verde">
      <Datos moneda filas={porMedio} />
    </Recuadro>
    <Recuadro etiqueta="Cobrar al entregar" valor={clp(n.porCobrarEntrega)} color="ambar"
      nota={n.porCobrar > n.porCobrarEntrega ? `Otros cobros · ${clp(n.porCobrar - n.porCobrarEntrega)}` : undefined}>
      {n.porCobrarEntrega ? <PorSede resumen={n} campo="porCobrarEntrega" moneda cobros /> : <p>Sin cobros pendientes en entregas.</p>}
    </Recuadro>
    <Recuadro etiqueta="Utilidad estimada" valor={clp(n.utilidad)} color="violeta">
      <Datos moneda filas={[
        { etiqueta: "Total vendido", valor: n.vendido },
        { etiqueta: "Costos y comisiones", valor: n.vendido - n.utilidad },
      ]} />
      <p>Antes del ahorro y el reparto.</p>
    </Recuadro>
    <Recuadro etiqueta="Pacientes atendidos" valor={n.pacientes} color="rosa">
      <PorSede resumen={n} campo="pacientes" />
    </Recuadro>
    <Recuadro etiqueta="Ventas de productos" valor={n.ventas} color="indigo">
      <PorSede resumen={n} campo="ventas" />
    </Recuadro>
    <Recuadro etiqueta="Pares de lentes" valor={n.pares} color="cian">
      <PorSede resumen={n} campo="pares" />
    </Recuadro>
    <Recuadro etiqueta="Marcos" valor={n.marcos} color="turquesa">
      <PorSede resumen={n} campo="marcos" />
    </Recuadro>
  </section>;
}

export function IndicadoresCaja({ resumen, caja, hoy, chequeoId, comidaGuardada }: {
  resumen: Resumen; caja: Caja; hoy: string; chequeoId: string; comidaGuardada: boolean;
}) {
  const marcosPorCosto = new Map<number, number>();
  for (const f of resumen.filas) {
    if (f.marcos === 0) continue;
    const costo = f.sede.costo_marco_unitario ?? COSTO_MARCO_POR_PAR;
    marcosPorCosto.set(costo, (marcosPorCosto.get(costo) ?? 0) + f.marcos);
  }
  const costos = [...marcosPorCosto].sort(([a], [b]) => a - b);
  const menor = costos[0]?.[0];
  const mayor = costos.at(-1)?.[0];
  const costoPorMarco = menor === undefined || mayor === undefined ? undefined
    : menor === mayor ? `${clp(menor)} por marco` : `${clp(menor)} a ${clp(mayor)} por marco`;

  return <section aria-labelledby="caja-chequeo" className="space-y-3">
    <h2 id="caja-chequeo" className="text-lg font-bold">Caja del chequeo</h2>
    <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3">
      <Recuadro etiqueta="Caja registrada" valor={clp(caja.cajaRegistrada)} color="azul">
        <Datos moneda filas={[
          { etiqueta: "Ya cobrado", valor: resumen.cobrado },
          { etiqueta: "Comisión de tarjeta estimada", valor: caja.comisionTarjeta },
          { etiqueta: "Gastos y reintegros pagados", valor: caja.salidas },
          ...(caja.retirosNetos ? [{ etiqueta: "Retiros netos", valor: caja.retirosNetos }] : []),
        ]} />
      </Recuadro>
      <Recuadro etiqueta="Queda tras pagar" valor={clp(caja.saldoTrasPagos)} color="verde">
        <Datos moneda filas={[
          { etiqueta: "Caja registrada", valor: caja.cajaRegistrada },
          { etiqueta: "Pagos pendientes", valor: caja.cajaRegistrada - caja.saldoTrasPagos },
        ]} />
        <p>Antes del ahorro y el reparto.</p>
      </Recuadro>
      <Recuadro etiqueta="Quedaría tras cobrar todo" valor={clp(caja.proyectado)} color="violeta">
        <Datos moneda filas={[
          { etiqueta: "Saldo tras pagar", valor: caja.saldoTrasPagos },
          { etiqueta: "Cobros pendientes", valor: resumen.porCobrar },
        ]} />
      </Recuadro>
    </div>
    <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-4">
      <Recuadro etiqueta="Cristales" valor={clp(caja.cristales)} color="cian">
        <Datos filas={[{ etiqueta: "Pares de lentes", valor: resumen.pares }]} />
        {caja.cristales > 0 && (caja.fidesPendiente === caja.cristales
          ? <p>Pendiente de pago al laboratorio.</p>
          : <Datos moneda filas={[{ etiqueta: "Saldo en laboratorio", valor: caja.fidesPendiente }]} />)}
      </Recuadro>
      <Recuadro etiqueta="Marcos usados (estimado)" valor={clp(caja.marcos)} color="turquesa" nota={costoPorMarco}>
        {costos.length ? <Datos moneda filas={costos.map(([costo, cantidad]) => ({
          etiqueta: `${cantidad} ${cantidad === 1 ? "marco" : "marcos"} × ${clp(costo)}`, valor: costo * cantidad,
        }))} /> : <p>Sin marcos usados.</p>}
      </Recuadro>
      <Recuadro etiqueta="Comida registrada" valor={caja.comida ? clp(caja.comida) : "Sin registrar"} color="naranja" nota="Registrar comida" id="comida-chequeo" abierto={comidaGuardada || undefined} ancho>
        {comidaGuardada && <p role="status" className="font-semibold text-emerald-800">Comida guardada.</p>}
        <GastoGeneralForm hoy={hoy} digital="Cuenta de la óptica" personal="Dinero personal" chequeoId={chequeoId} comida />
      </Recuadro>
      <Recuadro etiqueta="Gastos y reintegros pagados" valor={clp(caja.salidas)} color="pizarra">
        <Datos moneda filas={[
          { etiqueta: "Gastos pagados", valor: caja.gastosPagados },
          { etiqueta: "Reembolsos ya pagados", valor: caja.reintegrosPagados },
        ]} />
        <Link href="#gastos-compartidos" className="font-semibold underline underline-offset-2">Ir a gastos compartidos</Link>
      </Recuadro>
      <Recuadro etiqueta="Reembolsos por pagar" valor={clp(caja.porReembolsar)} color="rosa">
        {caja.adelantos.length ? <Datos moneda filas={caja.adelantos.map(({ gasto, saldo }) => ({
          id: gasto.id, etiqueta: gasto.descripcion, valor: saldo,
        }))} /> : <p>Sin reembolsos pendientes.</p>}
      </Recuadro>
      <Recuadro etiqueta="Otros gastos por pagar" valor={clp(caja.terrenoPendiente)} color="ambar">
        {caja.otrosPendientes.length ? <Datos moneda filas={caja.otrosPendientes} /> : <p>Sin otros gastos pendientes.</p>}
      </Recuadro>
      <Recuadro etiqueta="Comisión de venta pendiente" valor={clp(caja.comisionPendiente)} color="indigo">
        {caja.comisionPendiente !== resumen.comisionVentas ? <Datos moneda filas={[
          { etiqueta: "Comisión calculada", valor: resumen.comisionVentas },
        ]} /> : <p>{caja.comisionPendiente ? "Pendiente de pago." : "Sin comisión pendiente."}</p>}
      </Recuadro>
    </div>
  </section>;
}
