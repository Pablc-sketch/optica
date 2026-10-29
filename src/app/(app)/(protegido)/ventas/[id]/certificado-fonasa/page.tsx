import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRolPagina } from "@/lib/autorizacion";
import { formatearRut } from "@/lib/rut";
import { diaEnChile, edadEnAnios, fechaLegible } from "@/lib/fechas";
import BotonImprimir from "@/components/boton-imprimir";
import { validarVoucher, requiereVoucher } from "@/lib/voucher";
import { fechaCertificadoFonasa } from "@/lib/fecha-certificado-fonasa";
import { rutReembolso } from "@/lib/reembolso";

// Certificado de compra para el reembolso de Fonasa.
//
// Fonasa devuelve parte de lo que costaron los lentes, pero pide un
// certificado de compra cuando la boleta no detalla QUÉ se compró — que es
// justo el caso de una boleta de óptica, donde sale un monto y nada más.
// El formulario lo llena y lo firma la tienda, no el paciente.
//
// Se llena solo con los datos de la venta: nombre y RUT del paciente,
// razón social y RUT de la óptica, fecha de compra, cuántos cristales y
// de qué tipo. Las referencias de los vouchers salen de los pagos reales;
// la boleta emitida fuera de Lentia debe cotejarse con su original.
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

export default async function CertificadoFonasaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ prestacion?: string }>;
}) {
  const { id } = await params;
  // "?prestacion=mano" imprime la fila de prestación sin marcar, para
  // anotarla a mano al momento de entregar — igual que el número de
  // boleta. Es útil cuando el papel se prepara antes de que el paciente
  // decida si se lleva también el de cerca.
  const { prestacion } = await searchParams;
  const marcarAMano = prestacion === "mano";
  const { supabase, tenantId } = await exigirRolPagina(["admin", "ventas"]);

  const [ventaRes, tenantRes] = await Promise.all([
    supabase
      .from("ventas")
      .select(
        `id, fecha, anulada, boleta_folio, boleta_fecha, ocultar_voucher,
         pacientes:paciente_id (nombre, rut, fecha_nacimiento),
         venta_items (
           cristal_slot, cantidad,
           ordenes_trabajo:ot_id (tipo_lente, posicion, tipo_lente_2, posicion_2)
         ), pagos_abonos (monto, medio_pago, numero_voucher, fecha)`
      )
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single(),
    supabase.from("tenants").select("nombre_comercial, razon_social, rut_empresa").eq("id", tenantId).single(),
  ]);

  const venta = ventaRes.data;
  if (!venta) notFound();

  const optica = tenantRes.data;
  const paciente = venta.pacientes as unknown as {
    nombre: string;
    rut: string | null;
    fecha_nacimiento: string | null;
  } | null;
  // La edad relevante es la de la compra. El operador confirma los demás
  // requisitos del beneficio con Fonasa, sin inferir cobertura de la ficha.
  const edad = paciente?.fecha_nacimiento
    ? edadEnAnios(paciente.fecha_nacimiento, diaEnChile(venta.fecha))
    : null;
  const tieneEdad = edad !== null && edad >= 55;
  // En los documentos formales manda la razón social; el nombre de
  // fantasía solo sirve de respaldo si todavía no se cargó.
  const nombreTienda = optica?.razon_social || optica?.nombre_comercial || "";

  // La cantidad describe la compra real; el tope del beneficio lo evalúa
  // Fonasa y no debe alterar lo que certificamos que se vendió.
  const itemsCristal = (venta.venta_items ?? []).filter((i) => i.cristal_slot !== null);
  const pares = itemsCristal.reduce((s, i) => s + i.cantidad, 0);
  const cantidadArticulos = pares * 2;
  const pagos = venta.pagos_abonos ?? [];
  const sinVoucher = !venta.boleta_folio && !venta.ocultar_voucher && pagos.some(p => requiereVoucher(p.medio_pago, p.monto) && validarVoucher(p.medio_pago, p.monto, p.numero_voucher).error);
  const referencias = venta.ocultar_voucher ? [] : [...new Set(pagos.map(p => p.numero_voucher).filter((n): n is string => Boolean(n)))];

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
    else if (posicion === "lejos") marcadas.add("Lejos");
  }

  // Si se compraron pares de cerca y de lejos, el detalle debe decirlo.
  const tiposVendidos = [...marcadas].filter((m) => m === "Lejos" || m === "Cerca");
  const dosParesDistintos = pares >= 2 && tiposVendidos.length >= 2;
  const articuloEspecifico =
    dosParesDistintos && !marcarAMano
      ? "Lentes ópticos según receta médica (lejos y cerca, por separado)"
      : "Lentes ópticos según receta médica";

  const fechaCompra = fechaLegible(fechaCertificadoFonasa(venta.fecha, pagos));
  const listo = Boolean(paciente?.nombre && rutReembolso(paciente?.rut) && optica?.razon_social && rutReembolso(optica?.rut_empresa) && pares > 0 && !sinVoucher && !venta.anulada && (marcarAMano || marcadas.size > 0));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <Link href={`/ventas/${venta.id}/comprobante`} className="text-xs font-medium text-sky-700 hover:underline">
            ← Volver al comprobante
          </Link>
          <h1 className="mt-1 text-xl font-bold">Certificado de compra Fonasa</h1>
        </div>
        <div className="text-right">
          {listo && <BotonImprimir />}
          <p className="mt-1 text-xs text-tinta-suave">
            Para mandarlo por WhatsApp, elige <strong>Guardar como PDF</strong> en el destino.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-crema-claro p-3 text-sm print:hidden">
        <Link href={`/ventas/${venta.id}`} className="font-semibold underline">Editar fechas: el certificado toma el último abono</Link>
        <span className="font-medium">Prestación:</span>
        <Link
          href={`/ventas/${venta.id}/certificado-fonasa`}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            marcarAMano ? "border border-tinta-suave/30 hover:bg-white" : "bg-sky-700 text-white"
          }`}
        >
          Marcada según la venta
        </Link>
        <Link
          href={`/ventas/${venta.id}/certificado-fonasa?prestacion=mano`}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            marcarAMano ? "bg-sky-700 text-white" : "border border-tinta-suave/30 hover:bg-white"
          }`}
        >
          En blanco, para marcar a mano
        </Link>
        <span className="text-xs text-tinta-suave">
          {marcarAMano
            ? "Se imprime sin marcar: usted marca el tipo de lente al entregar."
            : `Se marca ${[...marcadas].join(" y ") || "lo que tenga la orden"}, según lo que registra esta venta.`}
        </span>
      </div>

      {!tieneEdad && (
        <p className="rounded-2xl bg-amber-100 p-4 text-sm font-medium text-amber-900 print:hidden">
          {edad === null
            ? "Falta la fecha de nacimiento. Confirma con Fonasa si el paciente cumple los requisitos del beneficio."
            : `Edad registrada a la fecha de compra: ${edad} años. Verifica con Fonasa si corresponde el beneficio antes de presentar el certificado.`}
        </p>
      )}

      {!listo && (
        <p className="rounded-2xl bg-amber-100 p-4 text-sm font-medium text-amber-900 print:hidden">
          Faltan datos para que el certificado sirva:{" "}
          {[
            !paciente?.nombre && "el nombre del paciente",
            !rutReembolso(paciente?.rut) && "un RUT válido del paciente",
            !optica?.razon_social && "la razón social de la óptica",
            !rutReembolso(optica?.rut_empresa) && "un RUT válido de la óptica",
            pares === 0 && "esta venta no tiene cristales",
            sinVoucher && "los números de voucher de los pagos con tarjeta",
            venta.anulada && "la venta está anulada",
            !marcarAMano && marcadas.size === 0 && "la prestación en la orden (o elige marcar a mano después de cotejar la receta)",
          ]
            .filter(Boolean)
            .join(", ")}
          . Completa los datos y coteja los originales antes de entregar.
        </p>
      )}

      {venta.anulada && (
        <p className="rounded-2xl bg-neutral-200 p-4 text-center text-sm font-semibold text-neutral-700 print:hidden">
          Esta venta está ANULADA — no corresponde emitir certificado.
        </p>
      )}

      <p className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-900 print:hidden">
        Fonasa lo pide cuando la boleta no detalla qué se compró. Lo presenta el paciente junto a su
        receta y los demás antecedentes exigidos. Confirma edad a la fecha de compra, tramo, vigencia de la receta y cobertura con Fonasa.
        <strong> Coteja los vouchers y el RUT del comercio con los originales; firma y timbra al entregar.</strong>{" "}
        <Link href={`/ventas/${venta.id}/reembolso`} className="font-semibold underline">Preparar y revisar documentos</Link>
      </p>

      {/* Hoja del certificado: mismo orden y mismas palabras del formulario
          impreso de Fonasa, para que se pueda cotejar campo por campo. */}
      {!listo && <p className="hidden print:block">Certificado pendiente: completa los datos de la compra antes de imprimir.</p>}
      <div className={`rounded-2xl bg-white p-8 text-neutral-900 shadow-sm print:rounded-none print:p-0 print:shadow-none ${!listo ? "print:hidden" : ""}`}>
        <h2 className="mb-6 text-center text-lg font-bold tracking-wide">CERTIFICADO DE COMPRA</h2>

        <div className="flex flex-col gap-1">
          <Linea etiqueta="Certifica que el Sr. (a):" valor={paciente?.nombre ?? ""} />
          <Linea etiqueta="Rut:" valor={formatearRut(paciente?.rut)} />
          <Linea etiqueta="Nombre de la tienda:" valor={nombreTienda} />
          <Linea etiqueta="Rut de la tienda:" valor={formatearRut(optica?.rut_empresa)} />
          <Linea etiqueta={pagos.some(p => p.monto > 0) ? "Fecha del último abono:" : "Fecha de compra:"} valor={fechaCompra} />
          <Linea
            etiqueta="Cantidad de artículos:"
            valor={cantidadArticulos > 0 ? `${cantidadArticulos} lentes ópticos` : ""}
          />
          <Linea etiqueta="Artículo específico:" valor={articuloEspecifico} />
          {!venta.ocultar_voucher && <Linea etiqueta="Número(s) de voucher:" valor={referencias.join(", ")} />}
          <Linea etiqueta="Número de boleta (si corresponde):" valor={venta.boleta_folio || ""} />
          {venta.boleta_fecha && <Linea etiqueta="Fecha de emisión de boleta:" valor={fechaLegible(venta.boleta_fecha)} />}
        </div>

        <div className="mt-8">
          <p className="text-[15px] font-bold underline">MARCAR PRESTACIÓN</p>
          <p className="mt-2 text-[15px] leading-7">
            Lentes de:{" "}
            {PRESTACIONES.map((p, i) => (
              <span key={p}>
                {i > 0 && " - "}
                <span
                  className={
                    !marcarAMano && marcadas.has(p) ? "font-bold underline decoration-2 underline-offset-2" : ""
                  }
                >
                  {!marcarAMano && marcadas.has(p) ? `[X] ${p}` : p}
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
