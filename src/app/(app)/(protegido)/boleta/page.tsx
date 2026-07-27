import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";

// Estado de la emisión de boletas electrónicas. Hoy el flujo es manual
// asistido (copiar datos → portal del SII). Para emitir automáticamente
// hace falta un proveedor DTE certificado + certificado digital; cuando
// estén las credenciales, esta pantalla pasa a mostrar los folios emitidos.

const PASOS = [
  {
    titulo: "Inicio de actividades y giro afecto a IVA",
    detalle: "La óptica debe estar con actividades iniciadas en el SII. La venta de lentes es afecta a IVA (19% incluido en el precio).",
  },
  {
    titulo: "Inscribirse como emisor de boleta electrónica",
    detalle: "Se hace una sola vez en sii.cl con ClaveÚnica o Clave Tributaria.",
  },
  {
    titulo: "Certificado digital",
    detalle: "Es la firma electrónica de la empresa; cuesta alrededor de $12.000 al año. Sin esto ningún programa puede emitir en tu nombre.",
  },
  {
    titulo: "Cuenta en un proveedor con API",
    detalle: "SimpleAPI es gratis hasta 500 boletas al mes; OpenFactura cobra alrededor de $360.000 al año con documentos ilimitados y varias razones sociales (mejor si la óptica factura mucho).",
  },
];

export default async function BoletaPage() {
  const supabase = await createClient();

  const { data: ventas } = await supabase
    .from("ventas")
    .select("id, fecha, total, pacientes:paciente_id (nombre, rut)")
    .order("fecha", { ascending: false })
    .limit(10);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Boleta electrónica (SII)</h1>
        <p className="text-sm text-tinta-suave">
          Cómo emitir la boleta de cada venta y qué falta para que salga sola.
        </p>
      </div>

      <section className="rounded-2xl bg-amber-50 p-4 text-sm">
        <p className="font-semibold text-amber-900">Estado actual: emisión asistida</p>
        <p className="mt-1 text-amber-900/90">
          El portal del SII pide clave y no permite que otro sitio le pase los datos por un
          link, así que no se puede rellenar solo desde acá. Lo que sí hace el sistema: en cada
          venta hay un botón <b>&ldquo;Copiar datos para la boleta&rdquo;</b> que deja el cliente,
          el RUT, el detalle y el total listos para pegar en el portal.
        </p>
        <p className="mt-2 text-amber-900/90">
          Importante para tus pacientes: la boleta debe ir <b>a nombre del paciente</b> (mismo
          nombre de la receta) para que la isapre le reembolse los lentes. El sistema ya guarda
          ese dato en cada venta.
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Para que la boleta salga automática</h2>
        <ol className="flex flex-col gap-2">
          {PASOS.map((paso, i) => (
            <li key={paso.titulo} className="flex gap-3 rounded-xl bg-crema-claro px-4 py-3 shadow-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand-dark">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold">{paso.titulo}</p>
                <p className="text-sm text-tinta-suave">{paso.detalle}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 rounded-xl bg-crema-claro px-4 py-3 text-sm text-tinta-suave shadow-sm">
          Con esos cuatro pasos listos, se conecta la emisión automática: cada venta genera su
          boleta con dos líneas (armazón y cristales, precios finales) a nombre del paciente, y
          queda guardado el folio y el PDF.
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Ventas recientes por emitir</h2>
        {!ventas || ventas.length === 0 ? (
          <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">Sin ventas registradas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ventas.map((v) => {
              const p = v.pacientes as unknown as { nombre: string; rut: string | null } | null;
              return (
                <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-crema-claro px-4 py-3 shadow-sm">
                  <span className="text-xs text-tinta-suave">
                    {new Date(v.fecha).toLocaleDateString("es-CL")}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium">
                    {p?.nombre ?? "Sin paciente"}
                    {p?.rut ? ` · ${p.rut}` : ""}
                  </span>
                  <span className="font-bold">{clp(v.total)}</span>
                  <Link
                    href={`/ventas/${v.id}/comprobante`}
                    className="rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand-dark transition hover:bg-brand hover:text-white"
                  >
                    Ver y copiar datos →
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
