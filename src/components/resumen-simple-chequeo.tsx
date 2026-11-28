import type { ReactNode } from "react";
import { cuentasDelChequeo } from "@/lib/resumen-chequeo";
import type { cargarCajaChequeo } from "@/lib/datos-caja-chequeo";
import type { saldosReparto } from "@/lib/datos-reparto-disponible";
import type { Chequeo } from "@/lib/chequeos";
import { clp } from "@/lib/clp";
import { etiquetasReparto } from "@/lib/etiquetas-reparto";

// Resumen del chequeo en tres recuadros: lo cobrado (verde), los gastos
// (rojo) y los sueldos (azul). Todo sale del mismo cálculo del reparto
// (lib/resumen-chequeo.ts), así que los totales siempre cuadran entre sí.

type Datos = NonNullable<Awaited<ReturnType<typeof cargarCajaChequeo>>>;
type Saldos = Awaited<ReturnType<typeof saldosReparto>>;

function Fila({ titulo, valor, nota, fuerte }: { titulo: string; valor: number; nota?: string; fuerte?: boolean }) {
  return <div className="flex items-start justify-between gap-3 py-2">
    <dt className="min-w-0">
      <span className={fuerte ? "font-bold" : "font-medium"}>{titulo}</span>
      {nota && <span className="block text-xs opacity-80">{nota}</span>}
    </dt>
    <dd className={`shrink-0 tabular-nums ${fuerte ? "text-lg font-bold" : "font-semibold"}`}>{clp(valor)}</dd>
  </div>;
}

function Recuadro({ tono, titulo, valor, detalle, children, abierto }: {
  tono: "verde" | "rojo" | "azul"; titulo: string; valor: number; detalle?: string; children: ReactNode; abierto?: boolean;
}) {
  const colores = {
    verde: "border-emerald-200 bg-emerald-50 text-emerald-950",
    rojo: "border-red-200 bg-red-50 text-red-950",
    azul: "border-sky-300 bg-sky-100 text-sky-950",
  }[tono];
  return <details open={abierto} className={`group rounded-2xl border p-4 shadow-sm sm:p-5 ${colores}`}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{titulo}</span>
        <b className="block break-words text-2xl tabular-nums sm:text-3xl">{clp(valor)}</b>
        {detalle && <span className="mt-0.5 block text-xs">{detalle}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold">
        <span className="group-open:hidden">Ver</span><span className="hidden group-open:inline">Cerrar</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 transition-transform group-open:rotate-180"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    </summary>
    <dl className="mt-3 divide-y divide-current/10 border-t border-current/15 text-sm">{children}</dl>
  </details>;
}

export default function ResumenSimpleChequeo({ chequeo, datos, saldos }: {
  chequeo: Chequeo; datos: Datos; saldos: Saldos;
}) {
  const c = cuentasDelChequeo(datos, saldos, chequeo);
  const nombres = etiquetasReparto(datos.tenant?.reparto_etiquetas);
  const hora = (fecha: string) => new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit",
  }).format(new Date(fecha));
  const cuenta = saldos.cuenta;
  const notaCuenta = cuenta.estado === "disponible"
    ? `Saldo real de Mercado Pago · ${hora(cuenta.consultadoEn)}`
    : cuenta.estado === "reporte" ? `Último reporte de Mercado Pago · ${hora(cuenta.hasta)}`
      : "Sin conexión con Mercado Pago ahora";

  return <section aria-label={`Resumen de ${chequeo.nombre}`} className="space-y-3">
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <div className="rounded-2xl border border-tinta/15 bg-white p-4 shadow-sm">
        <dt className="text-sm font-semibold">Total vendido</dt>
        <dd className="text-2xl font-bold tabular-nums">{clp(c.vendido)}</dd>
        <dd className="text-xs text-tinta-suave">Cobrado + por cobrar</dd>
      </div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm">
        <dt className="text-sm font-semibold">Por cobrar</dt>
        <dd className="text-2xl font-bold tabular-nums">{clp(c.porCobrar)}</dd>
        <dd className="text-xs">{c.conSaldo} {c.conSaldo === 1 ? "venta con saldo" : "ventas con saldo"}</dd>
      </div>
      <div className="rounded-2xl border border-tinta/15 bg-white p-4 shadow-sm">
        <dt className="text-sm font-semibold">Queda para sueldos y ahorro</dt>
        <dd className={`text-2xl font-bold tabular-nums ${c.resultado < 0 ? "text-red-700" : ""}`}>{clp(c.resultado)}</dd>
        <dd className="text-xs text-tinta-suave">Vendido − gastos, al terminar de cobrar</dd>
      </div>
    </dl>

    <Recuadro tono="verde" titulo="Cobrado hasta ahora" valor={c.cobrado}
      detalle={`${clp(c.cobradoDigital)} con tarjeta o transferencia · ${clp(c.cobradoEfectivo)} en efectivo`}>
      <Fila titulo="Con tarjeta o transferencia" valor={c.cobradoDigital} nota="Entra a la cuenta de Mercado Pago" />
      <Fila titulo="En efectivo" valor={c.cobradoEfectivo} nota="Lo cobrado en efectivo en este chequeo" />
      <div className="py-2 text-xs font-semibold uppercase tracking-wide">Hoy en la óptica (toda la plata, no solo de este chequeo)</div>
      {c.cuentaDisponible !== null
        ? <Fila titulo="Cuenta Mercado Pago" valor={c.cuentaDisponible} nota={notaCuenta} />
        : <p className="py-2">Cuenta Mercado Pago · {notaCuenta}</p>}
      {c.cuentaPorLiberar > 0 && <Fila titulo="Mercado Pago aún no libera" valor={c.cuentaPorLiberar}
        nota="Ventas con tarjeta que todavía no llegan al saldo disponible" />}
      {c.efectivo !== null && <Fila titulo="Efectivo" valor={c.efectivo}
        nota={saldos.efectivoVerificado ? "Contado hoy" : "Según lo registrado · falta contarlo hoy"} />}
    </Recuadro>

    <Recuadro tono="rojo" titulo="Gastos del chequeo" valor={c.gastos.total}
      detalle={c.gastos.porPagar > 0 ? `Falta pagar ${clp(c.gastos.porPagar)}` : "Todo pagado"}>
      {c.gastos.filas.map(f => <Fila key={f.clave} titulo={f.titulo} valor={f.monto} nota={f.nota} />)}
      <Fila titulo="Total gastos" valor={c.gastos.total} fuerte />
      {c.compraStock > 0 && <p className="py-2 text-xs">
        Compras de stock: {clp(c.compraStock)}. No se descuentan de los sueldos: quedan como marcos para los próximos chequeos.
      </p>}
    </Recuadro>

    <Recuadro tono="azul" titulo="Sueldos del chequeo" valor={c.sueldos.total}
      detalle={c.porCobrar > 0 ? `Incluye ${clp(c.porCobrar)} que falta cobrar` : "Con todo cobrado"}>
      {c.sueldos.personas.map(p => <Fila key={p.persona} titulo={p.persona === "ahorro" ? "Ahorro" : nombres[p.persona]}
        valor={p.total} nota={p.nota} />)}
      <Fila titulo="Total" valor={c.sueldos.total} fuerte />
      {c.perdida && <p className="py-2 text-xs font-semibold text-red-800">
        Este chequeo da pérdida: los gastos superan lo vendido sin la comisión. No queda sueldo para socios ni ahorro.
      </p>}
      <p className="py-2 text-xs">{c.hoyPagable === null
        ? "Para saber cuánto se puede pagar hoy, cuenta el efectivo y actualiza Mercado Pago en Caja."
        : `Se puede pagar hoy: ${clp(c.hoyPagable)}. El resto cuando se cobre lo pendiente y se paguen los gastos.`}</p>
    </Recuadro>
  </section>;
}
