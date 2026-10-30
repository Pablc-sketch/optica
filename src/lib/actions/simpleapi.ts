"use server";

import { requerirPerfil } from "@/lib/autorizacion";
import { consultarSimpleApi } from "@/lib/simpleapi";

export async function comprobarConexionSimpleApi() {
  const { tenantId } = await requerirPerfil({ roles: ["admin"], suscripcion: true });
  return consultarSimpleApi(tenantId);
}
