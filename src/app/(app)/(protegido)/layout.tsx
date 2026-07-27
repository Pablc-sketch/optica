import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { estaVigente, type Suscripcion } from "@/lib/suscripcion";

// Al vencer, la óptica conserva sus datos pero no puede seguir operando.
// El bloqueo cubre todas las pantallas de trabajo de golpe, sin depender
// de que cada página se acuerde de comprobarlo — pero /suscripcion queda
// afuera de este grupo para poder verse y renovar sin quedar atrapada
// detrás de este mismo aviso.
export default async function ProtegidoLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: suscripcion } = await supabase
    .from("suscripciones")
    .select("plan, estado, fecha_inicio, fecha_renovacion, medio_pago")
    .maybeSingle();

  const vigente = estaVigente(suscripcion as Suscripcion | null);
  if (vigente) return <>{children}</>;

  return <SuscripcionVencida suscripcion={suscripcion as Suscripcion} />;
}

function SuscripcionVencida({ suscripcion }: { suscripcion: Suscripcion }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl bg-crema-claro p-6 text-center shadow-sm">
      <h1 className="text-lg font-bold">
        {suscripcion.estado === "cancelada" ? "Suscripción cancelada" : "Tu suscripción venció"}
      </h1>
      <p className="mt-2 text-sm text-tinta-suave">
        Los datos de tu óptica están guardados y seguros. Para volver a usar el sistema,
        renueva la suscripción.
      </p>
      <p className="mt-1 text-sm text-tinta-suave">
        Venció el{" "}
        {new Date(suscripcion.fecha_renovacion + "T00:00:00").toLocaleDateString("es-CL")}.
      </p>
      <Link
        href="/suscripcion"
        className="mt-4 inline-block rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark"
      >
        Ver planes y renovar
      </Link>
    </div>
  );
}
