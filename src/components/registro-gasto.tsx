import { randomUUID } from "node:crypto";
import BotonEnviar from "@/components/boton-enviar";
import CajaFormulario from "@/components/caja-formulario";
import { registrarGastoCajaOperativo } from "@/lib/actions/caja";
import { crearGastoGlobal } from "@/lib/actions/gastos";
import { CATEGORIAS_CAJA, type SedeCaja } from "@/lib/caja-operativo";
import { fechaLegible } from "@/lib/fechas";

const campo = "mt-1 block w-full min-w-0 rounded-xl border border-tinta/25 bg-white px-3 py-2.5";

function ImporteYFecha({ hoy }: { hoy: string }) {
  return <div className="grid grid-cols-2 gap-3">
    <label className="min-w-0 text-sm">Monto (CLP)<input name="monto" type="number" min="1" step="1" required className={campo} /></label>
    <label className="min-w-0 text-sm">Fecha<input name="fecha" type="date" defaultValue={hoy} max={hoy} required className={campo} /></label>
  </div>;
}

function Fuente({ digital, personal }: { digital: string; personal: string }) {
  return <label className="block text-sm">Pagaste con
    <select name="caja" defaultValue="" required className={campo}>
      <option value="" disabled>Elige el origen</option>
      <option value="digital">{digital}</option>
      <option value="efectivo">Efectivo de la óptica</option>
      <option value="personal">{personal}</option>
    </select>
  </label>;
}

export function GastoOperativoForm({ sedes, sedeInicial, hoy, desdeGastos = false }: {
  sedes: SedeCaja[]; sedeInicial?: string; hoy: string; desdeGastos?: boolean;
}) {
  const unica = sedes.length === 1 ? sedes[0] : null;
  return <CajaFormulario guardar={registrarGastoCajaOperativo} texto="Guardar gasto">
    <input type="hidden" name="id" value={randomUUID()} />
    {desdeGastos ? <input type="hidden" name="volver_gastos" value="1" />
      : sedes.map(s => <input key={s.id} type="hidden" name="sede" value={s.id} />)}
    {unica ? <>
      <input type="hidden" name="operativo_id" value={unica.id} />
      <p className="text-sm font-semibold">{unica.nombre} · {fechaLegible(unica.fecha)}</p>
    </> : <label className="block text-sm">Sede
      <select name="operativo_id" defaultValue={sedeInicial ?? ""} required className={campo}>
        <option value="" disabled>Elige una sede</option>
        {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre} · {fechaLegible(s.fecha)}</option>)}
      </select>
    </label>}
    <label className="block text-sm">Categoría
      <select name="clave" defaultValue="" required className={campo}>
        <option value="" disabled>Elige un gasto</option>
        {CATEGORIAS_CAJA.map(c => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
      </select>
    </label>
    <ImporteYFecha hoy={hoy} />
    <Fuente digital="Mercado Pago / cuenta de la óptica" personal="Dinero personal" />
  </CajaFormulario>;
}

export function GastoGeneralForm({ hoy, digital, personal }: {
  hoy: string; digital: string; personal: string;
}) {
  return <form action={crearGastoGlobal} className="grid gap-3">
    <input type="hidden" name="volver_historial" value="1" />
    <input type="hidden" name="id" value={randomUUID()} />
    <label className="block text-sm">Qué se pagó
      <input name="descripcion" placeholder="Ej. compra de bandejas" maxLength={250} required className={campo} />
    </label>
    <ImporteYFecha hoy={hoy} />
    <Fuente digital={digital} personal={personal} />
    <label className="block text-sm">Categoría
      <select name="categoria" className={campo}>
        <option value="otro">Otro gasto</option>
        <option value="compra_inventario">Inventario / equipamiento</option>
        <option value="arriendo">Arriendo</option>
      </select>
    </label>
    <details>
      <summary className="cursor-pointer py-1 text-sm font-semibold">Agregar nota</summary>
      <label className="block text-sm"><span className="sr-only">Nota de la compra</span>
        <textarea name="nota" rows={3} maxLength={1000} className={campo} />
      </label>
    </details>
    <BotonEnviar className="rounded-xl bg-brand px-4 py-3 font-semibold text-white">Guardar gasto</BotonEnviar>
  </form>;
}
