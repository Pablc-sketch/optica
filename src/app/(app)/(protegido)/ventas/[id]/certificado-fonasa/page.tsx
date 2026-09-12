import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatearRut } from "@/lib/rut";
import { diaEnChile, fechaLegible } from "@/lib/fechas";
import BotonImprimir from "@/components/boton-imprimir";

// Certificado de compra para el reembolso de Fonasa.
//
// Fonasa devuelve parte de lo que costaron los lentes, pero pide un
// certificado de compra cuando la boleta no detalla QUÉ se compró — que es
// justo el caso de una boleta de óptica, donde sale un monto y nada más.
// El formulario lo llena y lo firma la tienda, no el paciente.
//
// Se llena solo con los datos de la venta: nombre y RUT del paciente,
// razón social y RUT de la óptica, fecha de compra, cuántos cristales y
// de qué tipo. El número de boleta/voucher queda en blanco a propósito,
// para escribirlo a mano al momento de entregar (es el único dato que no
// vive en el sistema).
//
// Lo que se marca en "prestación" sale de la orden de trabajo real, no de
// una casilla fija: si el paciente llevó solo lentes de lejos, se marca
// solo lejos. Un certificado que dice de más es justo lo que hace que
// Fonasa rechace el reembolso.

type OtRel = {
  tipo_lente: string | null;
  posicion: string | null;
  tipo_lente_2: string | null;
  posicion_2: string | null;
} | null;

function uno<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

// Las casillas tal como vienen impresas en el formulario de Fonasa.
const PRESTACIONES = [
  "Cerca",
  "Lejos",
  "Bifocales",
  "Multifocales",
  "Intraocular",
  "Contacto",
] as const;

// Una línea del formulario: la etiqueta impresa y, al lado, el dato sobre
// la raya — igual que el formulario en papel, para poder cotejarlo campo
// por campo con el original de Fonasa.
function Linea({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <p className="flex items-end gap-2 text-[15px] leading-8">
      <span className="shrink-0">{etiqueta}</span>
      <span className="min-w-0 flex-1 border-b border-neutral-500 pb-0.5 font-medium">{valor}</span>
    </p>
  );
}

export default async function CertificadoFonasaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [ventaRes, tenantRes] = await Promise.all([
    supabase
      .from("ventas")
      .select(
        `id, fecha, anulada,
         pacientes:paciente_id (nombre, rut),
         venta_items (
           cristal_slot,
           ordenes_trabajo:ot_id (tipo_lente, posicion, tipo_lente_2, posicion_2)
         )`
      )
      .eq("id", id)
      .single(),
    supabase.from("tenants").select("nombre_comercial, razon_social, rut_empresa").single(),
  ]);

  const venta = ventaRes.data;
  if (!venta) notFound();

  const optica = tenantRes.data;
  const paciente = venta.pacientes as unknown as { nombre: string; rut: string | null } | null;
  // En los documentos formales manda la razón social; el nombre de
  // fantasía solo sirve de respaldo si todavía no se cargó.
  const nombreTienda = optica?.razon_social || optica?.nombre_comercial || "";

  // Un ítem con cristal_slot es un PAR de cristales (un ojo cada uno), así
  // que cada par cuenta como 2 artículos — que es como Fonasa los cuenta
  // para el reembolso, uno por ojo.
  const itemsCristal = (venta.venta_items ?? []).filter((i) => i.cristal_slot !== null);
  const pares = itemsCristal.length;
  const cantidadArticulos = pares * 2;

  // Qué casillas marcar, según lo que de verdad se vendió en esta venta.
  const marcadas = new Set<string>();
  for (const item of itemsCristal) {
    const ot = uno(item.ordenes_trabajo as unknown as OtRel);
    if (!ot) continue;
    const tipo = item.cristal_slot === 2 ? ot.tipo_lente_2 : ot.tipo_lente;
    const posicion = item.cristal_slot === 2 ? ot.posicion_2 : ot.posicion;
    if (tipo === "Bifocal") marcadas.add("Bifocales");
    else if (tipo === "Multifocal") marcadas.add("Multifocales");
    else if (posicion === "cerca") marcadas.add("Cerca");
    else marcadas.add("Lejos");
  }

  const fechaCompra = fechaLegible(diaEnChile(venta.fecha));
  const listo = Boolean(paciente?.nombre && paciente?.rut && nombreTienda && optica?.rut_empresa && pares > 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <Link href={`/ventas/${venta.id}/comprobante`} className="text-xs font-medium text-sky-700 hover:underline">
            ← Volver al comprobante
          </Link>
          <h1 className="mt-1 text-xl font-bold">Certificado de compra Fonasa</h1>
        </div>
        <BotonImprimir />
      </div>

      {!listo && (
        <p className="rounded-2xl bg-amber-100 p-4 text-sm font-medium text-amber-900 print:hidden">
          Faltan datos para que el certificado sirva:{" "}
          {[
            !paciente?.nombre && "el nombre del paciente",
            !paciente?.rut && "el RUT del paciente",
            !nombreTienda && "la razón social de la óptica",
            !optica?.rut_empresa && "el RUT de la óptica",
            pares === 0 && "esta venta no tiene cristales",
          ]
            .filter(Boolean)
            .join(", ")}
          . Fonasa rechaza el certificado si le falta cualquiera de esos datos.
        </p>
      )}

      {venta.anulada && (
        <p className="rounded-2xl bg-neutral-200 p-4 text-center text-sm font-semibold text-neutral-700 print:hidden">
          Esta venta está ANULADA — no corresponde emitir certificado.
        </p>
      )}

      <p className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-900 print:hidden">
        Fonasa lo pide cuando la boleta no detalla qué se compró. Lo presenta el paciente junto a su
        receta médica original (máximo un año) y su cédula. Aplica a mayores de 55 años de los tramos
        B, C y D. <strong>El número de boleta o voucher va a mano</strong> al entregar.
      </p>

      {/* Hoja del certificado: mismo orden y mismas palabras del formulario
          impreso de Fonasa, para que se pueda cotejar campo por campo. */}
      <div className="rounded-2xl bg-white p-8 text-neutral-900 shadow-sm print:rounded-none print:p-0 print:shadow-none">
        <h2 className="mb-6 text-center text-lg font-bold tracking-wide">CERTIFICADO DE COMPRA</h2>

        <div className="flex flex-col gap-1">
          <Linea etiqueta="Certifica que el Sr. (a):" valor={paciente?.nombre ?? ""} />
          <Linea etiqueta="Rut:" valor={formatearRut(paciente?.rut)} />
          <Linea etiqueta="Nombre de la tienda:" valor={nombreTienda} />
          <Linea etiqueta="Rut de la tienda:" valor={formatearRut(optica?.rut_empresa)} />
          <Linea etiqueta="Fecha de compra:" valor={fechaCompra} />
          <Linea
            etiqueta="Cantidad de artículos:"
            valor={cantidadArticulos > 0 ? `${cantidadArticulos} lentes ópticos` : ""}
          />
          <Linea etiqueta="Artículo específico:" valor="Lentes ópticos según receta médica" />
          {/* A mano: el número de boleta se anota al entregar, y esta hoja
              se imprime antes. */}
          <Linea etiqueta="Número de boleta o voucher:" valor="" />
        </div>

        <div className="mt-8">
          <p className="text-[15px] font-bold underline">MARCAR PRESTACIÓN</p>
          <p className="mt-2 text-[15px] leading-7">
            Lentes de:{" "}
            {PRESTACIONES.map((p, i) => (
              <span key={p}>
                {i > 0 && " - "}
                <span className={marcadas.has(p) ? "font-bold underline decoration-2 underline-offset-2" : ""}>
                  {marcadas.has(p) ? `[X] ${p}` : p}
                </span>
              </span>
            ))}
          </p>
          <p className="mt-1 text-[15px] leading-7 text-neutral-500">
            Audífonos - Plantillas - Ortesis - Malla - Prótesis dental removible
          </p>
        </div>

        <p className="mt-10 text-[15px]">
          Se extiende el presente certificado, dejando constancia de dicha compra.
        </p>

        <div className="mt-16 text-center">
          <p className="mx-auto w-72 border-t border-neutral-500 pt-2 text-[15px] font-semibold">
            {nombreTienda}
          </p>
          <p className="text-[15px]">{formatearRut(optica?.rut_empresa)}</p>
          <p className="mt-1 text-xs tracking-wide text-neutral-500">TIMBRE Y FIRMA VENDEDOR</p>
        </div>
      </div>
    </div>
  );
}
