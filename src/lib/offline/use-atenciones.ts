"use client";

import { useEffect, useState } from "react";
import { leerAtenciones, suscribirAtenciones } from "./atenciones";
import { resumirAtenciones, type AtencionTerreno, type AtencionesParaVenta } from "./datos-terreno";

export function useAtenciones(usuarioId?: string | null, registroId?: string) {
  const [resultado, setResultado] = useState<{ usuarioId: string; registroId?: string; atenciones: AtencionTerreno[] }>();
  useEffect(() => {
    if (!usuarioId) return;
    let vigente = true;
    let revision = 0;
    const cargar = () => {
      const actual = ++revision;
      void leerAtenciones(usuarioId).then(atenciones => {
        if (vigente && revision === actual) setResultado({ usuarioId, registroId, atenciones });
      }).catch(() => {});
    };
    const quitar = suscribirAtenciones(cargar);
    document.addEventListener("visibilitychange", cargar);
    cargar();
    return () => {
      vigente = false;
      quitar();
      document.removeEventListener("visibilitychange", cargar);
    };
  }, [usuarioId, registroId]);
  return resultado?.usuarioId === usuarioId && resultado?.registroId === registroId ? resultado?.atenciones : undefined;
}

export function useAtencionesParaVenta(usuarioId: string | null, operativoId: string) {
  const atenciones = useAtenciones(usuarioId);
  const [locales, setLocales] = useState<{ usuarioId: string; datos: AtencionesParaVenta }>();
  const [remotas, setRemotas] = useState<{ usuarioId: string; operativoId: string; datos: AtencionesParaVenta }>();
  useEffect(() => {
    if (!usuarioId) return;
    let vigente = true;
    const cargar = () => void leerAtenciones(usuarioId).then(entradas => {
      if (!vigente) return;
      const nuevos = resumirAtenciones(entradas);
      const rechazados = new Set(entradas.filter(a => a.error).map(a => a.id));
      setLocales(anterior => {
        const datos = anterior?.usuarioId === usuarioId ? anterior.datos : undefined;
        return { usuarioId, datos: {
          pacientes: [...new Map([...datos?.pacientes ?? [], ...nuevos.pacientes]
            .filter(p => !rechazados.has(p.id)).map(p => [p.id, p])).values()],
          recetas: Object.fromEntries(Object.entries({ ...datos?.recetas, ...nuevos.recetas })
            .filter(([paciente, receta]) => !rechazados.has(paciente) && !rechazados.has(receta.id))),
        } };
      });
    }).catch(() => {});
    const quitar = suscribirAtenciones(cargar);
    cargar();
    return () => { vigente = false; quitar(); };
  }, [usuarioId]);

  useEffect(() => {
    if (!usuarioId || !operativoId) return;
    let vigente = true;
    let ocupado = false;
    const cargar = async () => {
      if (ocupado || !navigator.onLine || document.visibilityState !== "visible") return;
      ocupado = true;
      try {
        const respuesta = await fetch(`/api/terreno?operativo=${encodeURIComponent(operativoId)}`, {
          redirect: "error", signal: AbortSignal.timeout(8000),
        });
        if (respuesta.ok && vigente) setRemotas({ usuarioId, operativoId, datos: await respuesta.json() });
      } catch {
        // Mantener la lista cargada hasta la próxima consulta.
      } finally {
        ocupado = false;
      }
    };
    const timer = window.setInterval(cargar, 12000);
    window.addEventListener("online", cargar);
    document.addEventListener("visibilitychange", cargar);
    void cargar();
    return () => {
      vigente = false;
      window.clearInterval(timer);
      window.removeEventListener("online", cargar);
      document.removeEventListener("visibilitychange", cargar);
    };
  }, [operativoId, usuarioId]);

  const delOperativo = remotas?.usuarioId === usuarioId && remotas?.operativoId === operativoId ? remotas.datos : undefined;
  return { locales: locales?.usuarioId === usuarioId ? locales?.datos : undefined, remotas: delOperativo,
    pendientes: resumirAtenciones(atenciones ?? []) };
}
