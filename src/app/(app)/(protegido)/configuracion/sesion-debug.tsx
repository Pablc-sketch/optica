"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// El rol ya se revisa en vivo contra la base (jwt_rol() ya no depende del
// token), pero el tenant_id de las políticas de Storage todavía se lee del
// token de sesión. Si alguna vez ese token quedó desactualizado (p. ej. tras
// cambios hechos a mano en la base durante alguna prueba), las subidas a
// Storage —el logo— fallan con "row-level security policy" aunque todo lo
// demás se vea bien. Este panel solo aparece cuando detecta esa diferencia,
// para no ser ruido en el caso normal.
export default function SesionDebug({ dbTenantId }: { dbTenantId: string }) {
  const [claims, setClaims] = useState<{ rol?: string; tenant_id?: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      try {
        const payload = token.split(".")[1];
        const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
        setClaims({ rol: json.rol, tenant_id: json.tenant_id });
      } catch {
        // Panel de diagnóstico nada más: si no se puede leer, no pasa nada.
      }
    });
  }, []);

  if (!claims) return null;

  const tenantCoincide = claims.tenant_id === dbTenantId;
  if (tenantCoincide) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      <p className="font-semibold">Tu sesión quedó desactualizada — por eso falla la subida del logo.</p>
      <p className="mt-1">
        Óptica según tu sesión actual: <b>{claims.tenant_id ?? "(vacío)"}</b>
        <br />
        Óptica según la base de datos: <b>{dbTenantId}</b>
      </p>
      <p className="mt-2 font-semibold">Cierra sesión y vuelve a entrar para arreglarlo.</p>
    </div>
  );
}
