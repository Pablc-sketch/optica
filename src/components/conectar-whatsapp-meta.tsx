"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completarAltaMeta } from "@/lib/actions/whatsapp";
import { leerAvisoMeta, origenDeMeta, type Sesion } from "@/lib/meta-alta";

// Alta oficial de Meta (Embedded Signup v5) para conectar el WhatsApp
// Business que ya usas en el celular, en modo coexistencia: el número NO se
// migra ni se desconecta de la app. Meta abre su propia ventana; Lentia solo
// recibe un código de un solo uso y los identificadores del número.

type FBLoginRespuesta = { authResponse?: { code?: string } | null; status?: string };
type FB = {
  init: (o: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (cb: (r: FBLoginRespuesta) => void, o: Record<string, unknown>) => void;
};
declare global {
  interface Window { FB?: FB; fbAsyncInit?: () => void }
}

export default function ConectarWhatsappMeta({ appId, configId, version }: { appId: string; configId: string; version: string }) {
  const [estado, setEstado] = useState<"cargando" | "listo" | "abierto" | "guardando" | "ok" | "error">("cargando");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const sesion = useRef<Sesion | null>(null);
  const codigo = useRef<string | null>(null);
  const router = useRouter();

  async function completar() {
    if (!sesion.current || !codigo.current) return;
    const s = sesion.current;
    const code = codigo.current;
    codigo.current = null; // el código sirve una sola vez
    setEstado("guardando");
    const r = await completarAltaMeta({ code, ...s }).catch(() => ({ error: "Sin conexión. Vuelve a intentarlo." }) as { error?: string; mensaje?: string });
    if (r.error) {
      setEstado("error");
      setMensaje(r.error);
    } else {
      setEstado("ok");
      setMensaje(r.mensaje ?? "Conectado");
      router.refresh();
    }
  }

  useEffect(() => {
    const alAviso = (event: MessageEvent) => {
      if (!origenDeMeta(event.origin)) return;
      const aviso = leerAvisoMeta(event.data);
      if (!aviso) return;
      if (aviso.tipo === "fin") {
        sesion.current = aviso.sesion;
        void completar();
      } else {
        setEstado("listo");
        setMensaje(aviso.tipo === "cancelado" ? "Cerraste la ventana de Meta antes de terminar. No se cambió nada." : `Meta informó un error: ${aviso.detalle || "sin detalle"}.`);
      }
    };
    window.addEventListener("message", alAviso);
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: true, version });
      setEstado("listo");
    };
    if (window.FB) window.fbAsyncInit();
    else if (!document.getElementById("facebook-jssdk")) {
      const s = document.createElement("script");
      s.id = "facebook-jssdk";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      s.async = true;
      s.defer = true;
      s.crossOrigin = "anonymous";
      document.body.appendChild(s);
    }
    return () => window.removeEventListener("message", alAviso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, version]);

  function abrir() {
    if (!window.FB) return;
    setMensaje(null);
    setEstado("abierto");
    window.FB.login(
      (r) => {
        if (r.authResponse?.code) {
          codigo.current = r.authResponse.code;
          void completar();
        } else {
          setEstado("listo");
          setMensaje("No se completó la conexión en Meta. No se cambió nada.");
        }
      },
      // Embedded Signup v5: la conexión de la app WhatsApp Business
      // (coexistencia) viene activada por defecto.
      { config_id: configId, response_type: "code", override_default_response_type: true, extras: { version: "v5" } }
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={abrir}
        disabled={estado === "cargando" || estado === "abierto" || estado === "guardando"}
        className="rounded-xl bg-[#1877f2] px-4 py-2.5 font-semibold text-white disabled:opacity-60"
      >
        {estado === "cargando" ? "Cargando Meta…" : estado === "guardando" ? "Guardando…" : "Conectar mi WhatsApp Business con Meta"}
      </button>
      <p className="text-xs text-tinta-suave">
        En la ventana de Meta elige conectar la app de WhatsApp Business que ya usas y escanea el código con tu celular.
        Tu WhatsApp sigue funcionando igual en el teléfono. No se importan contactos ni historial.
      </p>
      {mensaje && <p role={estado === "error" ? "alert" : "status"} className={`text-sm ${estado === "error" ? "text-red-800" : "text-emerald-800"}`}>{mensaje}</p>}
    </div>
  );
}
