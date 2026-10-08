"use client";

import { useState, useTransition } from "react";
import { actualizarEntregaOperativo } from "@/lib/actions/operativos";
import EnviarWhatsapp, { type DestinatarioWsp } from "./enviar-whatsapp";

// "15/10/2026 (jueves)" armado a mano, igual en el servidor y en el
// navegador (toLocaleDateString puede dar formatos distintos en cada uno).
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
function fechaConDia(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${dia} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

// Aviso de entrega por WhatsApp con la fecha, la hora y el lugar editables
// ahí mismo: se cambian, se guardan y el mensaje de cada persona se
// actualiza al tiro.
export default function RecordarEntrega({
  operativo,
  destinatarios,
  enProceso = [],
  error = null,
  abierto = false,
}: {
  operativo: {
    id: string;
    direccion: string | null;
    fecha_entrega_estimada: string | null;
    hora_entrega: string | null;
    lugar_entrega: string | null;
  };
  destinatarios: DestinatarioWsp[];
  // Compraron pero ningún par está listo: no se les dice "listo".
  enProceso?: string[];
  error?: string | null;
  abierto?: boolean;
}) {
  const [fecha, setFecha] = useState(operativo.fecha_entrega_estimada ?? "");
  const [hora, setHora] = useState(operativo.hora_entrega ?? "");
  const [lugar, setLugar] = useState(operativo.lugar_entrega ?? operativo.direccion ?? "");
  const [estado, setEstado] = useState<string | null>(null);
  // Lo último guardado en la base: el mensaje usa SOLO esto (F06). Lo que
  // se está escribiendo y no se guardó no viaja a nadie.
  const [guardado, setGuardado] = useState({
    fecha: operativo.fecha_entrega_estimada ?? "",
    hora: operativo.hora_entrega ?? "",
    lugar: operativo.lugar_entrega ?? operativo.direccion ?? "",
  });
  const sinGuardar = fecha !== guardado.fecha || hora !== guardado.hora || lugar !== guardado.lugar;
  const [guardando, iniciar] = useTransition();

  // Un solo lugar: el que se escribe acá; si queda vacío, la dirección del
  // operativo. Antes se juntaban los dos y salía el nombre repetido.
  const lugarTexto = guardado.lugar.trim() || operativo.direccion || "";

  const conDatos = destinatarios.map((d) => ({
    ...d,
    valores: {
      ...d.valores,
      fecha: guardado.fecha ? fechaConDia(guardado.fecha) : "",
      hora: guardado.hora,
      lugar: lugarTexto,
    },
  }));

  const campo = "rounded-lg border bg-white px-3 py-2 text-base outline-none focus:border-green-700";

  const editor = (
    <form
      action={(fd) =>
        iniciar(async () => {
          setEstado(null);
          const r = await actualizarEntregaOperativo(fd);
          if (r.ok) setGuardado({ fecha, hora, lugar });
          setEstado(r.ok ? "✓ Guardado" : (r.error ?? "No se pudo guardar"));
        })
      }
      className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-white p-3 sm:grid-cols-3"
    >
      <input type="hidden" name="id" value={operativo.id} />
      <label className="flex flex-col gap-1 text-xs font-semibold text-green-900">
        Fecha de entrega
        <input type="date" name="fecha_entrega_estimada" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-green-900">
        Horario
        <input name="hora_entrega" value={hora} onChange={(e) => setHora(e.target.value)} placeholder="10:00 a 13:00" className={campo} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-green-900">
        Lugar de retiro
        <input
          name="lugar_entrega"
          value={lugar}
          onChange={(e) => setLugar(e.target.value)}
          placeholder={operativo.direccion ?? "Ej. Escuela Mi Familia Educa"}
          className={campo}
        />
      </label>
      <div className="flex items-center gap-3 sm:col-span-3">
        <button
          disabled={guardando}
          className="rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Guardar fecha y horario"}
        </button>
        {estado && <span className="text-sm font-medium text-green-900">{estado}</span>}
        <span className="text-xs text-tinta-suave">
          Este es el único lugar donde se anota la entrega. El mensaje ya usa lo que escribas.
        </span>
      </div>
    </form>
  );

  // No se abre ningún chat con datos sin guardar o incompletos.
  const bloqueo = sinGuardar
    ? "Hay cambios sin guardar en la fecha, el horario o el lugar. Toca \"Guardar fecha y horario\" antes de enviar."
    : !guardado.fecha || !guardado.hora.trim() || !lugarTexto
      ? "Falta la fecha, el horario o el lugar de retiro. Complétalos y guarda antes de enviar."
      : null;

  const extra = (
    <>
      {editor}
      {error && (
        <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-800">
          No se pudieron leer las ventas de este operativo: {error}. Recarga la página; no es que no haya nadie.
        </p>
      )}
      {enProceso.length > 0 && (
        <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-tinta-suave">
          <b>Todavía no están listos</b> (no reciben este aviso): {enProceso.join(", ")}.
        </p>
      )}
    </>
  );

  return (
    <EnviarWhatsapp
      bloqueo={bloqueo}
      titulo="Avisar la entrega"
      descripcion="Solo a quienes tienen al menos un par LISTO para retirar. Ajusta la fecha y el horario, guarda, y ábrelos uno por uno."
      abierto={abierto}
      arriba={extra}
      plantillaInicial={[
        "Hola {nombre}, {listos}.",
        "",
        "Retiro: *{fecha}, {hora}*",
        "Lugar: *{lugar}*",
        "Saldo a pagar: *{saldo}*",
        "",
        "{optica}",
      ].join("\n")}
      ayudaMarcadores="{nombre} {listos} {fecha} {hora} {lugar} {saldo} {optica} se reemplazan solos. Entre *asteriscos* sale en negrita al enviarlo. Los emojis se quitan solos porque WhatsApp Web los muestra como signos."
      destinatarios={conDatos}
    />
  );
}
