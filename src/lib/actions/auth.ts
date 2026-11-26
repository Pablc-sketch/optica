"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE_AVISOS_ALTURA } from "@/lib/avisos-altura";
import { createClient } from "@/lib/supabase/server";

export async function cerrarSesion() {
  const supabase = await createClient();
  const jar = await cookies();
  const dispositivo = jar.get(COOKIE_AVISOS_ALTURA)?.value;
  if (dispositivo) {
    await supabase.from("dispositivos_avisos_altura").delete().eq("huella", dispositivo);
    jar.delete(COOKIE_AVISOS_ALTURA);
  }
  await supabase.auth.signOut();
  redirect("/login");
}
