import Link from "next/link";
import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import CajaFormulario from "@/components/caja-formulario";
import GastosPersonales from "@/components/gastos-personales";
import { GastoGeneralForm, GastoOperativoForm } from "@/components/registro-gasto";
import { guardarRepartoChequeo } from "@/lib/actions/chequeos";
import { guardarPagoCostosChequeo } from "@/lib/actions/cierre";
import type { Chequeo, SedeChequeo } from "@/lib/chequeos";
import { clp } from "@/lib/clp";
import type { cargarCajaChequeo, cargarSiiMensual } from "@/lib/datos-caja-chequeo";
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
  const saldo = pendientes.reduce((sum, f) => sum + f.pendiente, 0);
  return <details className={`group ${panel} ${clave === "fides" ? colores.azul : colores.ambar}`}>
    <summary className={resumen}>
      <span>
        <span className="block text-sm">{titulo}</span>
        <b className="block text-2xl tabular-nums">{clp(total)}</b>
        <span className={`mt-1 inline-block rounded-md px-2 py-1 text-xs ${saldo ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}>
          {saldo ? `Por pagar ${clp(saldo)}` : total ? "Pagado" : "Sin costos"}
        </span>
      </span>
      <span className="shrink-0 text-right text-xs">Por sede <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-180">⌄</span></span>
    </summary>
    <div className="mt-3 space-y-3">
      {clave === "marcos" && <p className="text-xs">Usa Reintegros para devolver compras hechas con dinero personal.</p>}
      {pendientes.length > 1 && <PagoCostos filas={pendientes} clave={clave} chequeo={chequeo} hoy={hoy} />}
      <ul className="divide-y divide-tinta/10">
        {filas.filter(f => f.total || f.pagado).map(f => <li key={f.id} className="space-y-1.5 py-2.5 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3"><b>{f.nombre}</b><strong className="tabular-nums">{clp(f.total)}</strong></div>
          <p className="text-xs text-tinta-suave">Pagado {clp(f.pagado)} · Pendiente {clp(f.pendiente)}</p>
          <PagoCostos filas={[f]} clave={clave} chequeo={chequeo} hoy={hoy} />
        </li>)}
      </ul>
      {total === 0 && <p className="text-sm text-tinta-suave">Sin costos calculados para las sedes.</p>}
    </div>
  </details>;
}

export default function CajaDelChequeo({ chequeo, opciones, sedes, datos, hoy, efectivo, efectivoVerificado, cuenta, bancoRegistrado, sii }: {
  chequeo: Chequeo; opciones: Chequeo[]; sedes: SedeChequeo[]; datos: Datos; hoy: string;
  efectivo: number | null; efectivoVerificado: boolean; cuenta: SaldoMercadoPago; bancoRegistrado: number | null;
  sii: Awaited<ReturnType<typeof cargarSiiMensual>>;
}) {
  const { caja, n } = datos;
  const nombres = etiquetasReparto(datos.tenant?.reparto_etiquetas);
  const saldoEnVivo = cuenta.estado === "disponible";
  const saldo = saldoEnVivo ? cuenta.disponible : bancoRegistrado;
  const total = saldo !== null && efectivo !== null ? saldo + efectivo : null;
  const comision = Number(chequeo.comision_isadora_pct ?? 10);
  const ahorro = Number(chequeo.ahorro_pct);
  const partePamela = Number(chequeo.reparto_pamela_pct ?? 50);
  const gastosPagados = caja.pagados.toSorted((a, b) => b.gasto.fecha.localeCompare(a.gasto.fecha));
  const sedesPorId = new Map(sedes.map(s => [s.id, s.nombre]));
  const mesSii = sii && new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(sii.periodo));

  return <>
    <section aria-label="Saldos de la óptica" className="space-y-2">
      <h2 className="text-lg font-bold">Dinero de la óptica</h2>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Indicador titulo="Cuenta óptica" valor={saldo} tono="verde" detalle={saldoEnVivo ? "Disponible en Mercado Pago" : "Según movimientos registrados"} />
        <Indicador titulo="Efectivo" valor={efectivo} detalle={efectivoVerificado ? "Según último conteo" : "Según movimientos registrados"} />
        <Indicador titulo="Total disponible" valor={total} tono="azul" detalle={saldoEnVivo && efectivoVerificado ? "Cuenta + efectivo" : "Estimado · cuenta + efectivo"} />
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
          <Link href="/caja?ver=cuadrar" className="mt-2 inline-block text-sm font-semibold underline">Cuadrar efectivo y cuenta</Link>
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
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Indicador titulo={nombres.isadora} valor={n.comisionVentas} detalle={`${comision}% de las ventas`} tono="azul" />
        <Indicador titulo="Ahorro" valor={n.reparto.ahorro} detalle={`${ahorro}% del líquido`} tono="verde" />
        <Indicador titulo={nombres.madre} valor={n.reparto.parteMadre} detalle={`${partePamela}% del resto`} />
        <Indicador titulo={nombres.pablo} valor={n.reparto.partePablo} detalle={`${100 - partePamela}% del resto`} />
      </dl>
      <p className="text-sm text-tinta-suave">
        Vendido <b>{clp(n.vendido)}</b> · Líquido estimado para reparto <b>{clp(n.reparto.utilidadDisponible)}</b>
        {n.reservaCompraPersonal > 0 && <> · Incluye reserva para devolver {clp(n.reservaCompraPersonal)} de inventario</>}
      </p>
      <p className="text-sm text-tinta-suave">Caja del chequeo después de compromisos <b>{clp(caja.saldoTrasPagos)}</b></p>
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

    <Desplegable titulo={sii ? `SII mensual · ${sii.declarado ? "Saldo declarado" : "Reserva estimada"} ${clp(sii.saldo)}` : "SII mensual"}>
      {sii && <p className="text-sm capitalize">{mesSii}{sii.venceEl && ` · Vence el ${fechaLegible(sii.venceEl)}`}</p>}
      {sii && !sii.declarado && <p className="mt-1 text-sm text-tinta-suave">Confirma el monto y el vencimiento del F29 con el contador.</p>}
      <Link href="/impuestos" className="mt-2 inline-block text-sm font-semibold underline">Ver control del SII</Link>
    </Desplegable>
  </>;
}
