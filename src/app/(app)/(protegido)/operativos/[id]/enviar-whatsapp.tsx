"use client";

import { useEffect, useState } from "react";
import { clp } from "@/lib/clp";
import { linkWhatsapp, normalizarParaWhatsapp, type ModoEnvio } from "@/lib/whatsapp";

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

function modoPorDefecto(): ModoEnvio {
  if (typeof navigator === "undefined") return "auto";
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "business";
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))) return "auto";
  return "web";
}

function useModoEnvio(): [ModoEnvio, (m: ModoEnvio) => void] {
  const [modo, setModo] = useState<ModoEnvio>("auto");
  useEffect(() => {
    let guardado: string | null = null;
    try {
      guardado = localStorage.getItem("lentia.wsp.modo");
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia de este aparato, solo existe en el navegador
    setModo(guardado === "auto" || guardado === "business" || guardado === "web" ? guardado : modoPorDefecto());
  }, []);
  return [
    modo,
    (m) => {
      setModo(m);
      try {
        localStorage.setItem("lentia.wsp.modo", m);
      } catch {}
    },
  ];
}

function aplicar(plantilla: string, d: DestinatarioWsp): string {
  let texto = plantilla.replaceAll("{nombre}", primerNombre(d.nombre));
  for (const [clave, valor] of Object.entries(d.valores)) {
    texto = texto.replaceAll(`{${clave}}`, valor);
  }
  return normalizarParaWhatsapp(texto);
}

export default function EnviarWhatsapp({
  titulo,
  descripcion,
  plantillaInicial,
  destinatarios,
  ayudaMarcadores,
  colorBoton = "bg-green-600 hover:bg-green-700",
  abierto = false,
  arriba,
  bloqueo = null,
}: {
  titulo: string;
  descripcion: string;
  plantillaInicial: string;
  destinatarios: DestinatarioWsp[];
  ayudaMarcadores: string;
  colorBoton?: string;
  abierto?: boolean;
  // Algo que va arriba del mensaje (por ejemplo, editar fecha y hora).
  arriba?: React.ReactNode;
  // Si hay un motivo, no se abre ningún chat (ej. cambios sin guardar).
  bloqueo?: string | null;
}) {
  const [modo, setModo] = useModoEnvio();
  const [plantilla, setPlantilla] = useState(plantillaInicial);
  // Quiénes ya se mandaron en esta sesión. No se guarda en la base: es
  // solo para no perder la cuenta cuando son quince y se van abriendo de
  // a uno, que es justo donde se salta gente sin darse cuenta.
  const [enviados, setEnviados] = useState<Set<string>>(new Set());
  const [verPrevia, setVerPrevia] = useState<string | null>(null);

  const conTelefono = destinatarios.filter((d) => d.telefonoWsp);
  const sinTelefono = destinatarios.filter((d) => !d.telefonoWsp);
  // Los que faltan por mandar, en el mismo orden en que aparecen en la
  // lista. WhatsApp no deja mandar un mensaje sin que una persona apriete
  // enviar adentro de la conversación — eso no se puede saltar — así que
  // "mandar a todos" no es un solo clic mágico, es una cola: cada clic
  // abre al siguiente ya escrito, y con eso alcanza para no tener que ir
  // fila por fila buscando a quién le falta.
  const pendientes = conTelefono.filter((d) => !enviados.has(d.id));
  const siguiente = pendientes[0];

  return (
    <details open={abierto || undefined} className="rounded-2xl border border-green-200 bg-green-50 p-4 shadow-sm print:hidden">
      <summary className="cursor-pointer font-semibold text-green-900">
        💬 {titulo}{" "}
        <span className="font-normal text-green-700">
          ({destinatarios.length} {destinatarios.length === 1 ? "persona" : "personas"})
        </span>
      </summary>

      <p className="mt-2 text-sm text-green-900">{descripcion}</p>

      {arriba}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="font-semibold text-green-900">Enviar con:</span>
        {(
          [
            { valor: "business", titulo: "WhatsApp Business (Android)" },
            { valor: "web", titulo: "WhatsApp Web (computador)" },
            { valor: "auto", titulo: "El de este aparato" },
          ] as const
        ).map((op) => (
          <button
            key={op.valor}
            type="button"
            onClick={() => setModo(op.valor)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              modo === op.valor ? "border-green-800 bg-green-800 text-white" : "border-green-800/25 bg-white text-green-900"
            }`}
          >
            {op.titulo}
          </button>
        ))}
      </div>

      {bloqueo && conTelefono.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2.5 text-sm font-semibold text-amber-900">{bloqueo}</p>
      )}

      {conTelefono.length > 0 && !bloqueo && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2">
          {siguiente ? (
            <button
              type="button"
              onClick={() => {
                // OJO: se captura "siguiente" en esta variable ANTES de
                // tocar el estado. Si en vez de esto el link se arma con
                // href={...siguiente...} y el onClick actualiza ese mismo
                // "enviados", React re-renderiza (y recalcula quién es
                // "siguiente") ANTES de que el navegador siga el link — y
                // termina abriendo al que quedó siguiente después de ese cambio, no al que decía
                // el botón. Fue justo el bug: decía "Raúl" y mandaba a
                // "Lucila". Con window.open acá adentro no hay esa carrera:
                // se abre a quien de verdad se capturó en este clic.
                const destinatario = siguiente;
                const texto = aplicar(plantilla, destinatario);
                const url = linkWhatsapp(modo, destinatario.telefonoWsp!, texto);
                // El link de Android (intent://) solo funciona en la misma
                // pestaña; los demás se abren aparte para no salir de la app.
                if (modo === "business") window.location.assign(url);
                else window.open(url, "_blank", "noopener,noreferrer");
                setEnviados((prev) => new Set(prev).add(destinatario.id));
              }}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${colorBoton}`}
            >
              📨 Abrir el siguiente: {primerNombre(siguiente.nombre)} ({conTelefono.length - pendientes.length + 1}
              /{conTelefono.length})
            </button>
          ) : (
            <span className="flex flex-wrap items-center gap-2 rounded-lg bg-green-100 px-4 py-2 text-sm font-semibold text-green-800">
              ✓ Se abrió el chat de los {conTelefono.length} con celular — revisa en WhatsApp que se hayan enviado
              <button
                type="button"
                onClick={() => setEnviados(new Set())}
                className="rounded-md border border-green-700 px-2 py-0.5 text-xs font-semibold text-green-900"
              >
                Volver a empezar
              </button>
            </span>
          )}
          <span className="text-xs text-tinta-suave">
            Cada clic abre el chat del siguiente con el mensaje ya escrito. &quot;Abierto&quot; no quiere decir
            enviado: hay que apretar enviar adentro de WhatsApp, eso no se puede automatizar ni confirmar
            desde acá.
          </span>
        </div>
      )}

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
                <span className={`min-w-32 flex-1 text-sm font-medium ${enviado ? "text-tinta-suave" : ""}`}>
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
                {!bloqueo && <a
                  href={linkWhatsapp(modo, d.telefonoWsp!, texto)}
                  target={modo === "business" ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  onClick={() => setEnviados((prev) => new Set(prev).add(d.id))}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition ${enviado ? "bg-tinta-suave" : colorBoton}`}
                >
                  {enviado ? "Abierto ✓ · reabrir" : "Abrir chat"}
                </a>}
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
