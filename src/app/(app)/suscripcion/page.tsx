import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cerrarSesion } from "@/lib/actions/auth";
import { diasRestantes, estaVigente, type Suscripcion } from "@/lib/suscripcion";
import { clp } from "@/lib/clp";

// Vive FUERA del grupo (app) a propósito: si estuviera dentro, el bloqueo
// por suscripción vencida taparía la única pantalla desde la que se puede
// renovar.

const PLANES = [
  {
    nombre: "Una sucursal",
    precio: 19900,
    detalle: ["Pacientes, recetas y órdenes ilimitadas", "Punto de venta y stock", "Modo terreno sin conexión", "Hasta 3 usuarios"],
  },
  {
    nombre: "Multi-sucursal",
    precio: 34900,
    detalle: ["Todo lo del plan anterior", "Sucursales ilimitadas", "Usuarios ilimitados", "Reportes por sucursal y vendedor"],
    destacado: true,
  },
];

const ESTADOS: Record<string, string> = {
  trial: "Prueba gratuita",
  activa: "Activa",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

export default async function SuscripcionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [perfilRes, suscripcionRes] = await Promise.all([
    supabase.from("users").select("nombre, tenants:tenant_id (nombre_comercial)").eq("id", user.id).single(),
    supabase
      .from("suscripciones")
      .select("plan, estado, fecha_inicio, fecha_renovacion, medio_pago")
      .maybeSingle(),
  ]);

  const suscripcion = suscripcionRes.data as Suscripcion | null;
  const nombreOptica =
    (perfilRes.data?.tenants as unknown as { nombre_comercial: string } | null)?.nombre_comercial ?? "Tu óptica";
  const vigente = estaVigente(suscripcion);
  const dias = suscripcion ? diasRestantes(suscripcion.fecha_renovacion) : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-tinta-suave/15 bg-crema-claro">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="" width={32} height={32} className="rounded-xl" />
            <span className="font-bold">{nombreOptica}</span>
          </Link>
          <form action={cerrarSesion} className="ml-auto">
            <button className="rounded-lg border border-tinta-suave/30 px-3 py-1.5 text-sm font-medium transition hover:bg-crema">
              Salir
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <h1 className="mb-4 text-xl font-bold">Suscripción</h1>

        <section className={`rounded-2xl p-4 shadow-sm ${vigente ? "bg-crema-claro" : "bg-red-50"}`}>
          {suscripcion ? (
            <>
              <p className="text-sm text-tinta-suave">Estado</p>
              <p className="text-lg font-bold">
                {ESTADOS[suscripcion.estado] ?? suscripcion.estado}
                {vigente && dias !== null && (
                  <span className="ml-2 text-sm font-medium text-tinta-suave">
                    · {dias} día{dias === 1 ? "" : "s"} restante{dias === 1 ? "" : "s"}
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm text-tinta-suave">
                {vigente ? "Vence" : "Venció"} el{" "}
                {new Date(suscripcion.fecha_renovacion + "T00:00:00").toLocaleDateString("es-CL")}
                {suscripcion.medio_pago ? ` · ${suscripcion.medio_pago}` : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-tinta-suave">Todavía no hay una suscripción registrada.</p>
          )}
        </section>

        <h2 className="mt-6 mb-3 font-semibold">Planes</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {PLANES.map((plan) => (
            <div
              key={plan.nombre}
              className={`rounded-2xl p-4 shadow-sm ${plan.destacado ? "bg-brand/10 ring-2 ring-brand" : "bg-crema-claro"}`}
            >
              <p className="font-bold">{plan.nombre}</p>
              <p className="mt-1 text-2xl font-bold">
                {clp(plan.precio)}
                <span className="text-sm font-medium text-tinta-suave"> /mes</span>
              </p>
              <ul className="mt-3 flex flex-col gap-1 text-sm text-tinta-suave">
                {plan.detalle.map((d) => (
                  <li key={d}>· {d}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <section className="mt-6 rounded-2xl bg-crema-claro p-4 text-sm shadow-sm">
          <p className="font-semibold">Cómo renovar</p>
          <p className="mt-1 text-tinta-suave">
            El pago en línea con Flow o Webpay todavía no está conectado: hace falta la cuenta de
            comercio a nombre de la óptica que vende el sistema. Mientras tanto, la renovación se
            activa manualmente por soporte una vez recibida la transferencia.
          </p>
          <p className="mt-2 text-tinta-suave">
            Escríbenos a <b>proldan643@gmail.com</b> indicando el nombre de tu óptica y el plan que
            quieres.
          </p>
        </section>
      </main>
    </div>
  );
}
