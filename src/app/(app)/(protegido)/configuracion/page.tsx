import { createClient } from "@/lib/supabase/server";
import {
  actualizarOptica,
  actualizarPerfilProfesional,
  cambiarEstadoUsuario,
  cambiarRol,
} from "@/lib/actions/configuracion";
import NuevoUsuario from "./nuevo-usuario";
import SubirLogo from "./subir-logo";
import SesionDebug from "./sesion-debug";
import NuevaSucursal from "./nueva-sucursal";
import { CampoRut, CampoTelefono } from "@/components/campos";
import { formatearTelefono } from "@/lib/formato";

const ROLES = [
  { valor: "admin", etiqueta: "Administrador" },
  { valor: "clinico", etiqueta: "Clínico" },
  { valor: "ventas", etiqueta: "Ventas" },
  { valor: "bodega", etiqueta: "Bodega" },
];

// Resumen legible de la matriz de permisos que aplica la base de datos
// (migración 20260725000009_permisos_por_rol.sql).
const PERMISOS = [
  { rol: "Administrador", puede: "Todo, incluida la configuración y los precios" },
  { rol: "Clínico", puede: "Pacientes y recetas; ve ventas e inventario sin editarlos" },
  { rol: "Ventas", puede: "Vende, cobra y mueve inventario; ve fichas sin editarlas" },
  { rol: "Bodega", puede: "Solo inventario y avance de órdenes; no ve fichas clínicas" },
];

export default async function ConfiguracionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [perfilRes, opticaRes, usuariosRes, sucursalesRes] = await Promise.all([
    supabase
      .from("users")
      .select("rol, tenant_id, rut, titulo_profesional, registro_profesional")
      .eq("id", user!.id)
      .single(),
    supabase.from("tenants").select("nombre_comercial, rut_empresa, factor_venta_cristales").single(),
    supabase.from("users").select("id, nombre, email, rol, estado").order("nombre"),
    supabase
      .from("sucursales")
      .select("id, nombre, direccion, tipo, fecha_operativo, contacto_nombre, contacto_telefono")
      .order("nombre"),
  ]);

  const esAdmin = perfilRes.data?.rol === "admin";
  const optica = opticaRes.data;

  // Los campos de contacto y plazo de entrega llegaron en una migración
  // posterior. Se piden aparte para que, si esa migración todavía no está
  // aplicada en la base, el formulario siga mostrando bien los datos que sí
  // existen en vez de quedar todo en blanco.
  const { data: contacto } = await supabase
    .from("tenants")
    .select("telefono, direccion, dias_entrega_default, logo_url")
    .single();
  const usuarios = usuariosRes.data ?? [];
  const sucursales = sucursalesRes.data ?? [];

  const input =
    "rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand";

  // Datos personales del profesional (para el timbre en la OT impresa): a
  // diferencia del resto de esta pantalla, no depende del rol — cada quien
  // ve y edita solo lo suyo, por eso esta sección se muestra tanto si es
  // admin como si no.
  const perfilProfesional = (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Mi perfil profesional</h2>
      <p className="-mt-2 text-xs text-tinta-suave">
        Aparece como timbre en las órdenes de trabajo que imprimas.
      </p>
      <form
        action={actualizarPerfilProfesional}
        className="grid grid-cols-1 gap-3 rounded-2xl bg-crema-claro p-4 shadow-sm sm:grid-cols-2"
      >
        <label className="flex flex-col gap-1 text-sm font-medium">
          RUT
          <CampoRut name="rut" defaultValue={perfilRes.data?.rut} placeholder="12.345.678-9" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Título profesional
          <input
            name="titulo_profesional"
            defaultValue={perfilRes.data?.titulo_profesional ?? ""}
            placeholder="Tecnólogo Médico, mención Oftalmología"
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
          Registro profesional (opcional)
          <input
            name="registro_profesional"
            defaultValue={perfilRes.data?.registro_profesional ?? ""}
            className={input}
          />
        </label>
        <div className="sm:col-span-2">
          <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark">
            Guardar
          </button>
        </div>
      </form>
    </section>
  );

  if (!esAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-bold">Configuración</h1>
        {perfilProfesional}
        <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
          Solo el administrador de la óptica puede cambiar el resto de la configuración. Si
          necesitas un cambio, pídeselo a quien administre la cuenta.
        </p>
        <section>
          <h2 className="mb-2 font-semibold">Qué puede hacer cada rol</h2>
          <ul className="flex flex-col gap-1.5 rounded-2xl bg-crema-claro p-3 shadow-sm">
            {PERMISOS.map((p) => (
              <li key={p.rol} className="rounded-lg bg-white px-3 py-2 text-sm">
                <b>{p.rol}:</b> <span className="text-tinta-suave">{p.puede}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Configuración</h1>

      {perfilProfesional}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Datos de la óptica</h2>
        <SesionDebug dbTenantId={perfilRes.data!.tenant_id} />
        <SubirLogo tenantId={perfilRes.data!.tenant_id} logoActual={contacto?.logo_url ?? null} />
        <form action={actualizarOptica} className="grid grid-cols-1 gap-3 rounded-2xl bg-crema-claro p-4 shadow-sm sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Nombre comercial
            <input name="nombre_comercial" defaultValue={optica?.nombre_comercial ?? ""} required className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            RUT de la empresa
            <CampoRut name="rut_empresa" defaultValue={optica?.rut_empresa} placeholder="77.123.456-7" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Teléfono
            <CampoTelefono name="telefono" defaultValue={contacto?.telefono} className={input} />
            <span className="text-xs font-normal text-tinta-suave">
              Aparece en el comprobante y la orden de trabajo que se lleva el cliente.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Dirección
            <input name="direccion" defaultValue={contacto?.direccion ?? ""} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Días de entrega
            <input
              name="dias_entrega_default"
              inputMode="numeric"
              defaultValue={contacto?.dias_entrega_default ?? 7}
              className={input}
            />
            <span className="text-xs font-normal text-tinta-suave">
              Cuánto demora tu laboratorio. Con esto se calcula la fecha de entrega estimada de
              cada orden de trabajo.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Factor de venta de cristales
            <input
              name="factor_venta_cristales"
              inputMode="numeric"
              defaultValue={optica?.factor_venta_cristales ?? 6}
              className={input}
            />
            <span className="text-xs font-normal text-tinta-suave">
              Multiplica el costo del laboratorio para proponer el precio de venta de cristales
              nuevos. Los precios ya guardados no cambian.
            </span>
          </label>
          <div className="sm:col-span-2">
            <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark">
              Guardar
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Usuarios</h2>
        <div className="flex flex-col gap-3">
          <NuevoUsuario />

          <ul className="flex flex-col gap-1.5 rounded-2xl bg-crema-claro p-3 shadow-sm">
            {usuarios.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2">
                <div className="min-w-40 flex-1">
                  <p className="text-sm font-medium">
                    {u.nombre}
                    {u.id === user!.id && (
                      <span className="ml-2 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand-dark">
                        tú
                      </span>
                    )}
                    {u.estado === "inactivo" && (
                      <span className="ml-2 rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-semibold text-neutral-600">
                        inactivo
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-tinta-suave">{u.email}</p>
                </div>

                <form action={cambiarRol} className="flex items-center gap-1">
                  <input type="hidden" name="user_id" value={u.id} />
                  <select name="rol" defaultValue={u.rol} className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand">
                    {ROLES.map((r) => (
                      <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
                    ))}
                  </select>
                  <button className="rounded-lg border border-tinta-suave/30 px-2 py-1.5 text-xs font-medium transition hover:bg-crema">
                    ✓
                  </button>
                </form>

                <form action={cambiarEstadoUsuario}>
                  <input type="hidden" name="user_id" value={u.id} />
                  <input type="hidden" name="estado" value={u.estado === "activo" ? "inactivo" : "activo"} />
                  <button className="rounded-lg border border-tinta-suave/30 px-3 py-1.5 text-xs font-medium transition hover:bg-crema">
                    {u.estado === "activo" ? "Desactivar" : "Reactivar"}
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <ul className="flex flex-col gap-1.5 rounded-2xl bg-crema-claro p-3 text-sm shadow-sm">
            <li className="px-1 pb-1 text-xs font-semibold text-tinta-suave">
              Qué puede hacer cada rol (lo aplica la base de datos, no solo la pantalla)
            </li>
            {PERMISOS.map((p) => (
              <li key={p.rol} className="rounded-lg bg-white px-3 py-2">
                <b>{p.rol}:</b> <span className="text-tinta-suave">{p.puede}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Sucursales y operativos</h2>
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1.5 rounded-2xl bg-crema-claro p-3 shadow-sm">
            {sucursales.map((s) => (
              <li key={s.id} className="rounded-lg bg-white px-3 py-2 text-sm">
                <p className="font-medium">
                  {s.nombre}
                  {s.tipo === "operativo" && (
                    <span className="ml-2 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand-dark">
                      Operativo
                    </span>
                  )}
                </p>
                {s.direccion && <p className="text-xs text-tinta-suave">{s.direccion}</p>}
                {s.tipo === "operativo" && (
                  <p className="text-xs text-tinta-suave">
                    {[
                      s.fecha_operativo ? new Date(s.fecha_operativo + "T00:00:00").toLocaleDateString("es-CL") : null,
                      s.contacto_nombre,
                      formatearTelefono(s.contacto_telefono),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <NuevaSucursal />
        </div>
      </section>
    </div>
  );
}
