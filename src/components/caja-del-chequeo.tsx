import Link from "next/link";
import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import CajaFormulario from "@/components/caja-formulario";
import GastosPersonales from "@/components/gastos-personales";
import { GastoGeneralForm, GastoOperativoForm } from "@/components/registro-gasto";
import { confirmarSaldoBanco } from "@/lib/actions/caja";
import { disponibleParaRepartir } from "@/lib/caja-verificada";
import { guardarRepartoChequeo } from "@/lib/actions/chequeos";
import { guardarPagoCostosChequeo } from "@/lib/actions/cierre";
import type { Chequeo, SedeChequeo } from "@/lib/chequeos";
import { clp } from "@/lib/clp";
import type { cargarCajaChequeo } from "@/lib/datos-caja-chequeo";
import { etiquetasReparto } from "@/lib/etiquetas-reparto";
import { fechaLegible } from "@/lib/fechas";
import type { SaldoMercadoPago } from "@/lib/mercadopago-saldo";
import { conceptoDeGasto } from "@/lib/pagos-operativo";

type Datos = NonNullable<Awaited<ReturnType<typeof cargarCajaChequeo>>>;
const panel = "min-w-0 rounded-2xl p-4 shadow-sm sm:p-5";
const campo = "mt-1 block w-full min-w-0 rounded-xl border border-tinta/20 bg-white px-3 py-2.5";
const resumen = "flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl font-semibold transition hover:text-brand-dark motion-safe:active:scale-[0.99]";
const colores = {
  verde: "bg-emerald-50 text-emerald-950",
  azul: "bg-sky-100 text-sky-950",
  blanco: "bg-white text-tinta",
  ambar: "bg-amber-50 text-amber-950",
  rojo: "bg-red-50 text-red-950",
};

function Indicador({ titulo, valor, detalle, tono = "blanco" }: {
  titulo: string; valor: number | null; detalle?: string; tono?: keyof typeof colores;
}) {
  return <div className={`min-w-0 rounded-2xl p-3 shadow-sm sm:p-4 ${colores[tono]}`}>
    <dt className="text-sm font-semibold">{titulo}</dt>
    <dd className="mt-1 break-words text-xl font-bold tracking-tight tabular-nums sm:text-2xl">{valor === null ? "Por verificar" : clp(valor)}</dd>
    {detalle && <dd className="mt-1 text-xs">{detalle}</dd>}
  </div>;
}

function Desplegable({ titulo, tono = "blanco", children }: { titulo: ReactNode; tono?: keyof typeof colores; children: ReactNode }) {
  return <details className={`group ${panel} ${colores[tono]}`}>
    <summary className={resumen}>{titulo}<span aria-hidden="true" className="transition-transform group-open:rotate-180">⌄</span></summary>
    <div className="mt-3">{children}</div>
  </details>;
}

type CostoSede = { id: string; nombre: string; total: number; pagado: number; pendiente: number };
function PagoCostos({ filas, clave, chequeo, hoy }: {
  filas: CostoSede[]; clave: "fides" | "marcos"; chequeo: Chequeo; hoy: string;
}) {
  const total = filas.reduce((s, fila) => s + fila.pendiente, 0);
  if (total <= 0) return null;
  return <details className="rounded-xl border border-tinta/20 bg-white px-3">
    <summary className="cursor-pointer py-2 text-sm font-semibold text-brand-dark">
      {filas.length > 1 ? "Registrar pago global" : "Registrar pago"} · {clp(total)}
    </summary>
    <div className="pb-3 pt-1">
      <CajaFormulario guardar={guardarPagoCostosChequeo} texto="Confirmar pago realizado">
        <input type="hidden" name="chequeo_id" value={chequeo.id} />
        <input type="hidden" name="clave" value={clave} />
        {filas.map(f => <input key={f.id} type="hidden" name="sede" value={`${f.id}|${f.pagado}|${f.pendiente}`} />)}
        {filas.length > 1 && <p className="text-sm">{filas.length} sedes · {clp(total)}</p>}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">Salió de<select name="caja" className={campo}>
            <option value="digital">Cuenta óptica</option><option value="efectivo">Efectivo</option>
          </select></label>
          <label className="text-sm">Fecha del pago<input required type="date" name="fecha" defaultValue={hoy} max={hoy} className={campo} /></label>
        </div>
      </CajaFormulario>
    </div>
  </details>;
}

function RecuadroCostos({ datos, titulo, clave, chequeo, hoy }: {
  datos: Datos; titulo: string; clave: "fides" | "marcos"; chequeo: Chequeo; hoy: string;
}) {
  const filas = datos.caja.costosPorSede.map(({ sede, costos }) => {
    const costo = costos.find(c => c.clave === clave);
    const total = costo?.total ?? 0;
    const pagado = costo?.pagado ?? 0;
    return { id: sede.id, nombre: sede.nombre, total, pagado, pendiente: Math.max(0, total - pagado) };
  });
  const total = filas.reduce((sum, f) => sum + f.total, 0);
  const pendientes = filas.filter(f => f.pendiente > 0);
  const coberturaGlobal = clave === "marcos" && datos.caja.coberturaMarcos > 0;
  const saldo = clave === "marcos" ? datos.caja.marcosPendientes : pendientes.reduce((sum, f) => sum + f.pendiente, 0);
  return <details className={`group ${panel} ${clave === "fides" ? colores.azul : colores.ambar}`}>
    <summary className={resumen}>
      <span>
        <span className="block text-sm">{titulo}</span>
        <b className="block text-2xl tabular-nums">{clp(total)}</b>
        <span className={`mt-1 inline-block rounded-md px-2 py-1 text-xs ${saldo ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}>
          {saldo ? `${clave === "marcos" ? "Reserva pendiente" : "Por pagar"} ${clp(saldo)}` : coberturaGlobal ? "Cubierto por reposición" : total ? "Pagado" : "Sin costos"}
        </span>
      </span>
      <span className="shrink-0 text-right text-xs">Por sede <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-180">⌄</span></span>
    </summary>
    <div className="mt-3 space-y-3">
      {clave === "marcos" && <p className="text-xs">
        {datos.caja.reposicionMarcos > 0 ? `Reposición registrada ${clp(datos.caja.reposicionMarcos)} · Cubre ${clp(datos.caja.coberturaMarcos)} de la reserva.`
          : "Si compraste marcos para reponer los vendidos, registra una reposición en Gastos."}
      </p>}
      {!coberturaGlobal && pendientes.length > 1 && <PagoCostos filas={pendientes} clave={clave} chequeo={chequeo} hoy={hoy} />}
      <ul className="divide-y divide-tinta/10">
        {filas.filter(f => f.total || f.pagado).map(f => <li key={f.id} className="space-y-1.5 py-2.5 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3"><b>{f.nombre}</b><strong className="tabular-nums">{clp(f.total)}</strong></div>
          {!coberturaGlobal && <>
            <p className="text-xs text-tinta-suave">Pagado {clp(f.pagado)} · Pendiente {clp(f.pendiente)}</p>
            <PagoCostos filas={[f]} clave={clave} chequeo={chequeo} hoy={hoy} />
          </>}
        </li>)}
      </ul>
      {total === 0 && <p className="text-sm text-tinta-suave">Sin costos calculados para las sedes.</p>}
    </div>
  </details>;
}

export default function CajaDelChequeo({ chequeo, opciones, sedes, datos, hoy, efectivo, efectivoVerificado, cuenta, bancoRegistrado, bancoManual }: {
  chequeo: Chequeo; opciones: Chequeo[]; sedes: SedeChequeo[]; datos: Datos; hoy: string;
  efectivo: number | null; efectivoVerificado: boolean; cuenta: SaldoMercadoPago; bancoRegistrado: number | null;
  bancoManual: { saldo: number; confirmado_en: string } | null;
}) {
  const { caja, n, sii } = datos;
  const nombres = etiquetasReparto(datos.tenant?.reparto_etiquetas);
  const hora = (fecha: string) => new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(fecha));
  const saldoConfirmado = cuenta.estado === "disponible" ? cuenta.disponible : bancoManual?.saldo ?? null;
  const saldo = saldoConfirmado ?? (cuenta.estado === "reporte" ? cuenta.disponible : bancoRegistrado);
  const fuenteBanco = cuenta.estado === "disponible" ? "Mercado Pago en vivo"
    : bancoManual ? `Confirmado · ${hora(bancoManual.confirmado_en)}`
    : cuenta.estado === "reporte" ? `Último reporte · ${hora(cuenta.hasta)}` : "Según movimientos registrados";
  const ivaPorReservar = Math.max(caja.ivaPendienteCaja, sii?.saldo ?? 0);
  const compromisos = caja.fidesPendiente + caja.marcosPendientes + caja.terrenoPendiente
    + caja.porReembolsar + caja.comisionPendiente + ivaPorReservar;
  const pendiente = Object.values(caja.repartoPendiente).reduce((a, b) => a + b, 0);
  const disponibleHoy = sii ? disponibleParaRepartir(saldoConfirmado, efectivoVerificado ? efectivo : null,
    compromisos, caja.saldoTrasPagos, pendiente) : null;
  const total = saldo !== null && efectivo !== null ? saldo + efectivo : null;
  const comision = Number(chequeo.comision_isadora_pct ?? 10);
  const ahorro = Number(chequeo.ahorro_pct);
  const partePamela = Number(chequeo.reparto_pamela_pct ?? 50);
  const gastosPagados = caja.pagados.toSorted((a, b) => b.gasto.fecha.localeCompare(a.gasto.fecha));
  const sedesPorId = new Map(sedes.map(s => [s.id, s.nombre]));
  const formatoMes = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" });
  const mesSii = sii && formatoMes.format(new Date(sii.periodo));
  const mesPago = sii && formatoMes.format(new Date(sii.siguiente));

  return <>
    <section id="saldos" aria-label="Saldos de la óptica" className="scroll-mt-20 space-y-2">
      <h2 className="text-lg font-bold">Dinero de la óptica</h2>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Indicador titulo="Cuenta óptica" valor={saldo} tono="verde" detalle={fuenteBanco} />
        <Indicador titulo="Efectivo" valor={efectivo} detalle={efectivoVerificado ? "Contado hoy" : "Estimado · falta contar"} />
        <Indicador titulo="Total disponible" valor={total} tono="azul" detalle={saldoConfirmado !== null && efectivoVerificado ? "Cuenta + efectivo contado" : "Referencia · verificar saldos"} />
        <Indicador titulo="Por cobrar" valor={n.porCobrar} tono="ambar" detalle={chequeo.nombre} />
      </dl>
      <div className="grid gap-2 sm:grid-cols-2">
        <Desplegable titulo="Marcar efectivo depositado">
          <CajaFormulario texto="Guardar depósito realizado">
            <input type="hidden" name="id" value={randomUUID()} />
            <input type="hidden" name="tipo" value="deposito" />
            <input type="hidden" name="caja" value="digital" />
            <input type="hidden" name="volver_chequeo" value={chequeo.id} />
            <input type="hidden" name="descripcion" value="Efectivo depositado en cuenta de la óptica" />
            <p className="text-sm text-tinta-suave">Regístralo cuando el dinero llegue a la cuenta de la óptica.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">Monto (CLP)<input type="number" required min="1" step="1" name="monto" className={campo} /></label>
              <label className="text-sm">Fecha<input type="date" required max={hoy} defaultValue={hoy} name="fecha" className={campo} /></label>
            </div>
          </CajaFormulario>
        </Desplegable>
        <Desplegable titulo="Detalle de saldos">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2"><dt>Cuenta registrada en Lentia</dt><dd>{bancoRegistrado === null ? "Por verificar" : clp(bancoRegistrado)}</dd></div>
            {cuenta.estado === "reporte" && <div className="flex justify-between gap-2"><dt>Último reporte de Mercado Pago</dt><dd>{clp(cuenta.disponible)}</dd></div>}
          </dl>
          <Link href="/caja?ver=cuadrar" className="mt-2 inline-block text-sm font-semibold underline">Contar efectivo</Link>
          {cuenta.estado !== "disponible" && <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold">Confirmar saldo de Mercado Pago</summary>
            <div className="mt-2">
              <CajaFormulario guardar={confirmarSaldoBanco} texto="Guardar saldo confirmado">
                <input type="hidden" name="id" value={randomUUID()} />
                <input type="hidden" name="chequeo" value={chequeo.id} />
                <label className="text-sm">Saldo que ves en Mercado Pago (CLP)
                  <input required type="number" name="saldo" min="0" max="999999999999" step="1" className={campo} />
                </label>
              </CajaFormulario>
            </div>
          </details>}
        </Desplegable>
      </div>
    </section>

    <section id="gastos" className="space-y-3 scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-xl font-bold">Costos y gastos</h2><p className="text-sm text-tinta-suave">{chequeo.nombre} · {fechaLegible(chequeo.desde)} al {fechaLegible(chequeo.hasta)}</p></div>
        <form action="/caja" className="flex items-center gap-2">
          <label className="sr-only" htmlFor="selector-chequeo">Chequeo</label>
          <select name="chequeo" id="selector-chequeo" defaultValue={chequeo.id} className="max-w-56 rounded-lg border border-tinta/20 bg-white p-2 text-sm">
            {opciones.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <button className="rounded-lg bg-tinta px-3 py-2 text-sm font-semibold text-white transition motion-safe:active:scale-95">Ver</button>
        </form>
      </div>
      <div id="costos" className="grid scroll-mt-20 items-start gap-3 sm:grid-cols-2">
        <RecuadroCostos datos={datos} titulo="Cristales" clave="fides" chequeo={chequeo} hoy={hoy} />
        <RecuadroCostos datos={datos} titulo="Marcos estimados" clave="marcos" chequeo={chequeo} hoy={hoy} />
      </div>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Desplegable tono="rojo" titulo={<span className="text-red-800">Gastos pagados <b className="block text-xl tabular-nums">{clp(-caja.gastosPagados)}</b></span>}>
          {gastosPagados.length ? <ul className="divide-y divide-tinta/10">
            {gastosPagados.map(({ gasto: g, importe }) => <li key={g.id} className="flex justify-between gap-2 py-2 text-sm">
              <span>{conceptoDeGasto(g.descripcion)}
                <small className="block text-tinta-suave">{fechaLegible(g.fecha)} · {g.caja === "digital" ? "Cuenta" : "Efectivo"}{g.operativo_id && sedesPorId.has(g.operativo_id) ? ` · ${sedesPorId.get(g.operativo_id)}` : ""}</small>
              </span>
              <b className="text-red-800 tabular-nums">{clp(-importe)}</b>
            </li>)}
          </ul> : <p className="text-sm">Sin gastos pagados en este chequeo.</p>}
        </Desplegable>
        <Desplegable tono="ambar" titulo={<span className="text-amber-950">Reintegros pendientes <b className="block text-xl tabular-nums">{clp(caja.porReembolsar)}</b></span>}>
          {caja.adelantos.length ? <GastosPersonales gastos={caja.adelantos.map(({ gasto, saldoReal }) => ({ ...gasto, pendiente: saldoReal }))}
            hoy={hoy} cajaChequeoId={chequeo.id} /> : <p className="text-sm">Sin reintegros pendientes.</p>}
        </Desplegable>
      </div>
      <Desplegable titulo="Registrar gasto">
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <details className="rounded-xl border border-tinta/15 px-3">
            <summary className="cursor-pointer py-2 text-sm font-semibold">De todo el chequeo</summary>
            <div className="pb-3"><GastoGeneralForm hoy={hoy} chequeoId={chequeo.id} digital="Cuenta de la óptica" personal="Dinero personal" desdeCaja /></div>
          </details>
          {sedes.some(s => s.fecha <= hoy) && <details className="rounded-xl border border-tinta/15 px-3">
            <summary className="cursor-pointer py-2 text-sm font-semibold">De una sede</summary>
            <div className="pb-3"><GastoOperativoForm sedes={sedes.filter(s => s.fecha <= hoy)} hoy={hoy} cajaChequeoId={chequeo.id} /></div>
          </details>}
        </div>
      </Desplegable>
    </section>

    <section id="reparto" className="space-y-3 scroll-mt-20" aria-labelledby="titulo-reparto">
      <h2 id="titulo-reparto" className="text-xl font-bold">Reparto del chequeo</h2>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <Indicador titulo="Disponible para repartir hoy" valor={disponibleHoy} tono="verde"
          detalle={disponibleHoy === null ? "Requiere saldo y efectivo confirmados e IVA calculado" : "Después de reservar los compromisos"} />
        <Indicador titulo="Reparto si cobramos todo" valor={Math.max(0, caja.proyectado)} tono="azul" detalle="Proyección sobre ventas registradas" />
        <Indicador titulo="IVA reservado del chequeo" valor={n.iva} tono="ambar" detalle={datos.ivaSinCredito ? "Estimado sin crédito fiscal de los meses sin datos" : "Incluido en el cálculo del líquido"} />
      </dl>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Indicador titulo={nombres.isadora} valor={caja.comisionPendiente} detalle={`${comision}% de las ventas`} tono="azul" />
        <Indicador titulo="Ahorro" valor={caja.repartoPendiente.ahorro} detalle={`${ahorro}% del líquido`} tono="verde" />
        <Indicador titulo={nombres.madre} valor={caja.repartoPendiente.madre} detalle={`${partePamela}% del resto`} />
        <Indicador titulo={nombres.pablo} valor={caja.repartoPendiente.pablo} detalle={`${100 - partePamela}% del resto`} />
      </dl>
      <p className="text-sm text-tinta-suave">
        Vendido <b>{clp(n.vendido)}</b> · Reparto estimado pendiente de pago
      </p>
      <Desplegable titulo="Ver el cálculo del reparto">
        <dl className="space-y-1 text-sm">
          {[
            ["Cobrado del chequeo", n.cobrado],
            ["Gastos y reintegros pagados", -caja.salidas],
            ["Comisiones de tarjeta", -caja.comisionTarjeta],
            ["Sueldos y ahorro ya retirados, netos", -caja.retirosNetos],
            ["Cristales por pagar", -caja.fidesPendiente],
            ["Reposición de marcos aún reservada", -caja.marcosPendientes],
            ["Gastos de terreno por pagar", -caja.terrenoPendiente],
            ["Reintegros por pagar", -caja.porReembolsar],
            ["Comisión de ventas por pagar", -caja.comisionPendiente],
            ["IVA pendiente del chequeo", -caja.ivaPendienteCaja],
            ["Caja cobrada después de compromisos", caja.saldoTrasPagos],
            ["Ventas pendientes de cobro", n.porCobrar],
          ].filter(([, valor]) => valor !== 0).map(([etiqueta, valor]) => (
            <div key={etiqueta} className="flex justify-between gap-2"><dt>{etiqueta}</dt><dd className="tabular-nums">{clp(Number(valor))}</dd></div>
          ))}
        </dl>
        {sii && <p className="mt-2 text-xs text-tinta-suave">Para el disponible de hoy se reservan {clp(ivaPorReservar)} en impuestos.</p>}
      </Desplegable>
      <Desplegable titulo="Editar porcentajes">
        <CajaFormulario guardar={guardarRepartoChequeo} texto="Guardar reparto">
          <input type="hidden" name="chequeo_id" value={chequeo.id} />
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-sm">{nombres.isadora} (%)<input className={campo} name="comision_isadora_pct" type="number" min="0" max="100" step=".01" required defaultValue={comision} /></label>
            <label className="text-sm">Ahorro (%)<input className={campo} name="ahorro_pct" type="number" min="0" max="100" step=".01" required defaultValue={ahorro} /></label>
            <label className="text-sm">{nombres.madre} (% del resto)<input className={campo} name="reparto_pamela_pct" type="number" min="0" max="100" step=".01" required defaultValue={partePamela} /></label>
          </div>
        </CajaFormulario>
      </Desplegable>
    </section>

    <section aria-labelledby="iva-mensual" className="space-y-2">
      <h2 id="iva-mensual" className="text-lg font-bold">IVA mensual de la óptica</h2>
      <Desplegable tono="ambar" titulo={<span>
        IVA estimado por reservar <b className="block text-2xl tabular-nums">{sii ? clp(sii.ivaPendiente) : "Por verificar"}</b>
        {sii && <span className="block text-sm font-normal">{mesSii} · Pago en {mesPago}</span>}
      </span>}>
        {sii && <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-2"><dt>IVA de ventas</dt><dd>{clp(sii.debito)}</dd></div>
          <div className="flex justify-between gap-2"><dt>Crédito fiscal registrado</dt><dd>{clp(sii.creditoFiscal)}</dd></div>
          <div className="flex justify-between gap-2"><dt>Saldo F29 {sii.declarado ? "declarado" : "estimado"}</dt><dd>{clp(sii.saldo)}</dd></div>
          {sii.venceEl && <div className="flex justify-between gap-2"><dt>Vencimiento registrado</dt><dd>{fechaLegible(sii.venceEl)}</dd></div>}
        </dl>}
        <Link href="/impuestos" className="mt-2 inline-block text-sm font-semibold underline">Ver control del SII</Link>
      </Desplegable>
    </section>
  </>;
}
