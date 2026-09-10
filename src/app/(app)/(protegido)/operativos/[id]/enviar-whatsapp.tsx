"use client";

import { useState } from "react";
import { clp } from "@/lib/clp";

// Mandar el mismo mensaje a varias personas por WhatsApp, desde el
// WhatsApp de quien está usando la app (wa.me abre la conversación con el
// texto ya escrito; no se envía solo, siempre hay que apretar enviar).
//
// El texto se edita UNA vez arriba y se personaliza por persona con
// marcadores {nombre}, {monto}, etc. Así no hay que reescribir el mismo
// mensaje veinte veces, pero tampoco queda un texto rígido que no se
// pueda ajustar antes de mandarlo.

export type DestinatarioWsp = {
  id: string;
  nombre: string;
  telefonoWsp: string | null;
  // Lo que reemplaza a cada marcador para esta persona. El {nombre} se
  // arma solo con el primer nombre, que es como se saluda en un WhatsApp.
  valores: Record<string, string>;
  // Línea de contexto que se muestra en la lista (no va en el mensaje).
  detalle?: string;
  monto?: number;
};

function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

function aplicar(plantilla: string, d: DestinatarioWsp): string {
  let texto = plantilla.replaceAll("{nombre}", primerNombre(d.nombre));
  for (const [clave, valor] of Object.entries(d.valores)) {
    texto = texto.replaceAll(`{${clave}}`, valor);
  }
  return texto;
}

export default function EnviarWhatsapp({
  titulo,
  descripcion,
  plantillaInicial,
  destinatarios,
  ayudaMarcadores,
  colorBoton = "bg-green-600 hover:bg-green-700",
}: {
  titulo: string;
  descripcion: string;
  plantillaInicial: string;
  destinatarios: DestinatarioWsp[];
  ayudaMarcadores: string;
  colorBoton?: string;
}) {
  const [plantilla, setPlantilla] = useState(plantillaInicial);
  // Quiénes ya se mandaron en esta sesión. No se guarda en la base: es
  // solo para no perder la cuenta cuando son quince y se van abriendo de
  // a uno, que es justo donde se salta gente sin darse cuenta.
  const [enviados, setEnviados] = useState<Set<string>>(new Set());
  const [verPrevia, setVerPrevia] = useState<string | null>(null);

  const conTelefono = destinatarios.filter((d) => d.telefonoWsp);
  const sinTelefono = destinatarios.filter((d) => !d.telefonoWsp);

  return (
    <details className="rounded-2xl border border-green-200 bg-green-50 p-4 shadow-sm print:hidden">
      <summary className="cursor-pointer font-semibold text-green-900">
        💬 {titulo}{" "}
        <span className="font-normal text-green-700">
          ({destinatarios.length} {destinatarios.length === 1 ? "persona" : "personas"})
        </span>
      </summary>

      <p className="mt-2 text-sm text-green-900">{descripcion}</p>

      <label className="mt-3 flex flex-col gap-1 text-sm font-medium text-green-900">
        Mensaje (se puede editar antes de enviar)
        <textarea
          value={plantilla}
          onChange={(e) => setPlantilla(e.target.value)}
          rows={9}
          className="rounded-lg border border-green-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-green-600"
        />
        <span className="text-xs font-normal text-green-800">{ayudaMarcadores}</span>
      </label>

      <ul className="mt-3 flex flex-col gap-1.5">
        {conTelefono.map((d) => {
          const texto = aplicar(plantilla, d);
          const enviado = enviados.has(d.id);
          return (
            <li key={d.id} className="rounded-lg bg-white px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`min-w-32 flex-1 text-sm font-medium ${enviado ? "text-tinta-suave line-through" : ""}`}>
                  {d.nombre}
                </span>
                {d.detalle && <span className="text-xs text-tinta-suave">{d.detalle}</span>}
                {d.monto !== undefined && <span className="text-sm font-semibold">{clp(d.monto)}</span>}
                <button
                  type="button"
                  onClick={() => setVerPrevia(verPrevia === d.id ? null : d.id)}
                  className="text-xs font-medium text-green-800 underline"
                >
                  {verPrevia === d.id ? "Ocultar" : "Ver"}
                </button>
                <a
                  href={`https://wa.me/${d.telefonoWsp}?text=${encodeURIComponent(texto)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setEnviados((prev) => new Set(prev).add(d.id))}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition ${enviado ? "bg-tinta-suave" : colorBoton}`}
                >
                  {enviado ? "Enviado ✓" : "Enviar"}
                </a>
              </div>
              {verPrevia === d.id && (
                <pre className="mt-2 rounded-lg bg-crema-claro px-3 py-2 text-xs whitespace-pre-wrap">{texto}</pre>
              )}
            </li>
          );
        })}
      </ul>

      {sinTelefono.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-900">
          Sin celular registrado, hay que contactarlos a mano:{" "}
          {sinTelefono.map((d) => d.nombre).join(", ")}
        </p>
      )}

      {destinatarios.length === 0 && (
        <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-tinta-suave">
          No hay a quién enviarle por ahora.
        </p>
      )}
    </details>
  );
}
