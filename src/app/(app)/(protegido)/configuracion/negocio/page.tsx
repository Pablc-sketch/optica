import Link from "next/link";
import CabeceraPagina from "@/components/cabecera-pagina";
import FormularioAgenda from "@/components/formulario-agenda";
import { exigirRolPagina } from "@/lib/autorizacion";
import { agregarCristalCatalogo, agregarLaboratorio, guardarNegocio, guardarReparto, guardarTarifa } from "@/lib/actions/negocio";
import { leerConfiguracion, TIPOS_LENTE } from "@/lib/configuracion-optica";
import { costoParDeTarifa, type TarifaLaboratorio } from "@/lib/tarifa-laboratorio";
import { clp } from "@/lib/clp";

// Lo propio de cada óptica: precio de consulta y su descuento, costo de
// marco, premium, abono mínimo, reparto, laboratorios y sus tarifas, y el
// precio al cliente de cada cristal. El costo de compra (tarifa) y el
// precio al cliente (catálogo) son cosas distintas.
const campo = "w-full rounded-xl border bg-white px-3 py-2.5 text-base";
const RANGOS = ["±2.00 / ±2.00", "±4.00 / ±2.00", "±4.00 / ±4.00", "±6.00 / ±4.00", "±6.00 / ±6.00"];

export default async function Negocio() {
  const { supabase } = await exigirRolPagina(["admin"]);
  const [configRes, labsRes, tarifasRes, cristalesRes] = await Promise.all([
    supabase.from("configuracion_optica").select("*").maybeSingle(),
    supabase.from("proveedores").select("id, nombre").eq("tipo", "laboratorio").order("nombre"),
    supabase.from("tarifas_laboratorio").select("*").order("tipo_lente").order("tratamiento"),
    supabase.from("costos_cristales").select("tipo_lente, tratamiento, rango_receta, precio_venta").order("tipo_lente").order("tratamiento"),
  ]);
  if (configRes.error || labsRes.error || tarifasRes.error || cristalesRes.error) throw new Error("No pudimos cargar la configuración");
  const c = leerConfiguracion(configRes.data);
  const labs = labsRes.data ?? [];
  const tarifas = (tarifasRes.data ?? []) as (TarifaLaboratorio & { id: string; activo: boolean })[];
  const cristales = cristalesRes.data ?? [];
  const filasReparto = c.reparto
    ? [
        { tipo: "vendedora", ...c.reparto.vendedora, pct: "" },
        ...c.reparto.socios.map((s) => ({ tipo: "socio", clave: s.clave, nombre: s.nombre, pct: String(s.pct) })),
        { tipo: "ahorro", ...c.reparto.ahorro, pct: "" },
      ]
    : [{ tipo: "vendedora", clave: "", nombre: "", pct: "" }, { tipo: "ahorro", clave: "", nombre: "", pct: "" }];
  // Espacio para agregar hasta dos socios más.
  const filas = [...filasReparto, { tipo: "socio", clave: "", nombre: "", pct: "" }, { tipo: "socio", clave: "", nombre: "", pct: "" }];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/configuracion" className="text-sm underline">← Configuración</Link>
      <CabeceraPagina seccion="Configuración" titulo="Negocio y precios" />

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-bold">Consulta, marcos y abonos</h2>
        <FormularioAgenda accion={guardarNegocio}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Precio de consulta / receta<input name="precio_consulta" inputMode="numeric" defaultValue={c.precioConsulta ?? ""} placeholder="Vacío = no se cobra" className={campo} /></label>
            <label className="text-sm font-medium">
              Si compra lentes, la consulta…
              <select name="consulta_descuento" defaultValue={c.consultaDescuento} className={campo}>
                <option value="ninguno">Se cobra igual</option>
                <option value="total">Va incluida (no se cobra)</option>
                <option value="monto">Se descuenta un monto</option>
              </select>
            </label>
            <label className="text-sm font-medium">Monto a descontar<input name="consulta_descuento_monto" inputMode="numeric" defaultValue={c.consultaDescuentoMonto || ""} placeholder="Solo si se descuenta un monto" className={campo} /></label>
            <label className="text-sm font-medium">Costo de marco por par<input name="costo_marco_por_par" inputMode="numeric" defaultValue={c.costoMarcoPorPar || ""} placeholder="0" className={campo} /></label>
            <label className="text-sm font-medium">Recargo marco premium<input name="precio_marco_premium" inputMode="numeric" defaultValue={c.precioMarcoPremium ?? ""} placeholder="Vacío = sin opción premium" className={campo} /></label>
          </div>
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-1 text-sm font-medium">Abono mínimo fijo por tipo de lente (opcional)</legend>
            {TIPOS_LENTE.map((t) => (
              <label key={t} className="text-sm">{t}<input name={`abono_${t}`} inputMode="numeric" defaultValue={c.abonoMinimoPorTipo[t] ?? ""} placeholder="—" className={campo} /></label>
            ))}
          </fieldset>
          <p className="text-xs text-tinta-suave">Los cambios valen para ventas nuevas: las ventas hechas conservan sus precios y costos.</p>
        </FormularioAgenda>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">Reparto de utilidades</h2>
        <p className="mb-3 text-sm text-tinta-suave">
          Quién vende recibe su comisión, se separa el ahorro y el resto se divide entre los socios. Los porcentajes de
          comisión y ahorro se ajustan en cada operativo. Deja todos los nombres vacíos si no repartes desde Lentia.
        </p>
        <FormularioAgenda accion={guardarReparto}>
          <div className="space-y-2">
            {filas.map((f, i) => (
              <div key={i} className="grid grid-cols-[7rem_1fr_5rem] items-center gap-2">
                <input type="hidden" name={`tipo_${i}`} value={f.tipo} />
                <input type="hidden" name={`clave_${i}`} value={f.clave} />
                <span className="text-sm font-medium">{f.tipo === "vendedora" ? "Vende" : f.tipo === "ahorro" ? "Ahorro" : "Socio"}</span>
                <input name={`nombre_${i}`} defaultValue={f.nombre} maxLength={60} aria-label="Nombre" className={campo} />
                {f.tipo === "socio" ? (
                  <input name={`pct_${i}`} defaultValue={f.pct} inputMode="decimal" placeholder="%" aria-label="Porcentaje" className={campo} />
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        </FormularioAgenda>
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">Laboratorios y tarifas</h2>
        <p className="text-sm text-tinta-suave">
          Lo que te cobra el laboratorio. Con esto se calcula el costo de cada venta.
          {c.usaCatalogoCompartido && " Esta óptica usa además la lista compartida de laboratorio cargada antes."}
        </p>
        <FormularioAgenda accion={agregarLaboratorio} limpiar etiqueta="Agregar laboratorio">
          <label className="text-sm font-medium">Nuevo laboratorio<input name="nombre" maxLength={100} required className={campo} /></label>
        </FormularioAgenda>
        {labs.length > 0 && (
          <details className="rounded-xl bg-crema-claro p-3">
            <summary className="cursor-pointer font-semibold">＋ Agregar tarifa</summary>
            <div className="mt-3">
              <FormularioAgenda accion={guardarTarifa} limpiar etiqueta="Agregar tarifa">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-sm">Laboratorio<select name="proveedor_id" className={campo}>{labs.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></label>
                  <label className="text-sm">Tipo de lente<select name="tipo_lente" className={campo}>{TIPOS_LENTE.map((t) => <option key={t}>{t}</option>)}</select></label>
                  <label className="text-sm">Tratamiento<input name="tratamiento" required maxLength={80} placeholder="Antirreflejo" className={campo} /></label>
                  <label className="text-sm">Rango (opcional)<select name="rango_receta" className={campo}><option value="">Cualquiera</option>{RANGOS.map((r) => <option key={r}>{r}</option>)}</select></label>
                  <label className="text-sm">Costo<input name="costo" inputMode="numeric" required className={campo} /></label>
                  <label className="text-sm">Cobra por<select name="unidad" className={campo}><option value="unidad">Cristal (unidad)</option><option value="par">Par</option></select></label>
                  <label className="text-sm">Montaje<select name="montaje" className={campo}><option value="incluido">Incluido</option><option value="aparte">Se cobra aparte</option><option value="no_aplica">No aplica</option></select></label>
                  <label className="text-sm">Costo del montaje<input name="montaje_costo" inputMode="numeric" placeholder="Si es aparte" className={campo} /></label>
                  <label className="text-sm">IVA<select name="iva" className={campo}><option value="incluido">Incluido</option><option value="mas_iva">Más IVA</option></select></label>
                </div>
              </FormularioAgenda>
            </div>
          </details>
        )}
        {tarifas.length > 0 && (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-tinta-suave"><th className="py-1">Cristal</th><th>Tarifa</th><th className="text-right">Costo del par</th></tr></thead>
            <tbody>
              {tarifas.map((t) => (
                <tr key={t.id} className={`border-t border-tinta/10 ${t.activo ? "" : "text-tinta-suave line-through"}`}>
                  <td className="py-1.5">{t.tipo_lente} · {t.tratamiento}{t.rango_receta ? ` · ${t.rango_receta}` : ""}<span className="block text-xs text-tinta-suave">{labs.find((l) => l.id === t.proveedor_id)?.nombre}</span></td>
                  <td>{clp(t.costo)} por {t.unidad === "par" ? "par" : "cristal"}{t.montaje === "aparte" ? ` + montaje ${clp(t.montaje_costo)}` : t.montaje === "incluido" ? " · montaje incluido" : ""}{t.iva === "mas_iva" ? " + IVA" : ""}</td>
                  <td className="text-right font-semibold tabular-nums">{clp(costoParDeTarifa(t))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">Precio al cliente de los cristales</h2>
        <p className="text-sm text-tinta-suave">{cristales.length} cristales en el catálogo. Se editan en <Link href="/precios" className="underline">Precios</Link>.</p>
        <FormularioAgenda accion={agregarCristalCatalogo} limpiar etiqueta="Agregar cristal">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-sm">Tipo<select name="tipo_lente" className={campo}>{TIPOS_LENTE.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="text-sm">Tratamiento<input name="tratamiento" required maxLength={80} className={campo} /></label>
            <label className="text-sm">Rango<select name="rango_receta" className={campo}>{RANGOS.map((r) => <option key={r}>{r}</option>)}</select></label>
            <label className="text-sm">Precio al cliente<input name="precio_venta" inputMode="numeric" required className={campo} /></label>
          </div>
        </FormularioAgenda>
      </section>
    </div>
  );
}
