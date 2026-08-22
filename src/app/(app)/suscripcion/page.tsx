import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { diasRestantes, estaVigente, type Suscripcion } from "@/lib/suscripcion";
import SelectorPlanes from "./selector-planes";

// Vive dentro de (app) para heredar el header con menú, pero fuera de
// (protegido): si estuviera ahí, el bloqueo por suscripción vencida taparía
// la única pantalla desde la que se puede renovar.

const PLANES = [
  {
    id: "una-sucursal",
    nombre: "Una sucursal",
    precio: 19900,
    detalle: ["Pacientes, recetas y órdenes ilimitadas", "Punto de venta y stock", "Modo terreno sin conexión", "Hasta 3 usuarios"],
  },
  {
    id: "multi-sucursal",
    nombre: "Multi-sucursal",
    precio: 34900,
    detalle: ["Todo lo del plan anterior", "Sucursales ilimitadas", "Usuarios ilimitados", "Reportes por sucursal y vendedor"],
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

  const { data: suscripcionData } = await supabase
    .from("suscripciones")
    .select("plan, estado, fecha_inicio, fecha_renovacion, medio_pago")
    .maybeSingle();

  const suscripcion = suscripcionData as Suscripcion | null;
  const vigente = estaVigente(suscripcion);
  const dias = suscripcion ? diasRestantes(suscripcion.fecha_renovacion) : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Suscripción</h1>

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

      <div>
        <h2 className="mb-3 font-semibold">Planes</h2>
        <SelectorPlanes planes={PLANES} />
      </div>
    </div>
  );
}
