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
  abierto?: boolean;
}) {
  const [fecha, setFecha] = useState(operativo.fecha_entrega_estimada ?? "");
  const [hora, setHora] = useState(operativo.hora_entrega ?? "");
  const [lugar, setLugar] = useState(operativo.lugar_entrega ?? operativo.direccion ?? "");
  const [estado, setEstado] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();

  // Un solo lugar: el que se escribe acá; si queda vacío, la dirección del
  // operativo. Antes se juntaban los dos y salía el nombre repetido.
  const lugarTexto = lugar.trim() || operativo.direccion || "";

  const conDatos = destinatarios.map((d) => ({
    ...d,
    valores: {
      ...d.valores,
      fecha: fecha ? fechaConDia(fecha) : "(falta definir la fecha)",
      hora: hora || "(falta definir la hora)",
      lugar: lugarTexto || "(falta definir el lugar)",
    },
  }));

  const campo = "rounded-lg border bg-white px-3 py-2 text-base outline-none focus:border-green-700";

  const editor = (
    <form
      action={(fd) =>
        iniciar(async () => {
          setEstado(null);
          const r = await actualizarEntregaOperativo(fd);
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
        <span className="text-xs text-tinta-suave">El mensaje de abajo ya usa lo que escribas.</span>
      </div>
    </form>
  );

  return (
    <EnviarWhatsapp
      titulo="Avisar la entrega"
      descripcion="A quienes compraron en este operativo. Ajusta la fecha y el horario, revisa el mensaje y ábrelos uno por uno."
      abierto={abierto}
      arriba={editor}
      plantillaInicial={[
        "Hola {nombre}, sus lentes están listos.",
        "",
        "Retiro: *{fecha}, {hora}*",
        "Lugar: *{lugar}*",
        "Saldo a pagar: *{saldo}*",
        "",
        "{optica}",
      ].join("\n")}
      ayudaMarcadores="{nombre} {fecha} {hora} {lugar} {saldo} {optica} se reemplazan solos. Entre *asteriscos* sale en negrita al enviarlo. Los emojis se quitan solos porque WhatsApp Web los muestra como signos."
      destinatarios={conDatos}
    />
  );
}
