import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Spec sección 8.1 / 8.4: "con una sesión válida del tenant A, intentar
// leer/escribir datos del tenant B → debe fallar siempre. Sin este test
// pasando, no se sigue construyendo."
//
// tenant_id nunca se manda desde el test como si fuera el cliente confiando
// en sí mismo: el usuario de tenant A inicia sesión normalmente y el
// tenant_id que termina mandando cada request viaja embebido en el JWT,
// puesto ahí server-side por el auth hook `custom_access_token_hook`
// (ver supabase/migrations/20260725000001_init_schema.sql).

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Faltan SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY en .env.test.local. " +
      "Corré 'npm run supabase:start' (o 'npx supabase status') y completá el archivo."
  );
}

const TEST_PASSWORD = "Test1234!Segura";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let tenantAId: string;
let tenantBId: string;
let userAId: string;
let userBId: string;
let userAEmail: string;
let pacienteBId: string;
let pacienteAId: string;
let clientA: SupabaseClient;

async function crearTenantConUsuario(nombre: string) {
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({ nombre_comercial: nombre })
    .select()
    .single();
  if (tenantError) throw tenantError;

  const email = `${crypto.randomUUID()}@aislamiento.example.com`;
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (authError) throw authError;

  const { error: profileError } = await admin.from("users").insert({
    id: authUser.user.id,
    tenant_id: tenant.id,
    nombre: `Admin ${nombre}`,
    email,
    rol: "admin",
  });
  if (profileError) throw profileError;

  return { tenantId: tenant.id as string, email, userId: authUser.user.id };
}

beforeAll(async () => {
  const tenantA = await crearTenantConUsuario("Óptica Tenant A");
  const tenantB = await crearTenantConUsuario("Óptica Tenant B");
  tenantAId = tenantA.tenantId;
  tenantBId = tenantB.tenantId;
  userAId = tenantA.userId;
  userBId = tenantB.userId;
  userAEmail = tenantA.email;

  const { data: pacienteB, error: pacienteBError } = await admin
    .from("pacientes")
    .insert({ tenant_id: tenantBId, nombre: "Paciente confidencial de B" })
    .select()
    .single();
  if (pacienteBError) throw pacienteBError;
  pacienteBId = pacienteB.id;

  const { data: pacienteA, error: pacienteAError } = await admin
    .from("pacientes")
    .insert({ tenant_id: tenantAId, nombre: "Paciente propio de A" })
    .select()
    .single();
  if (pacienteAError) throw pacienteAError;
  pacienteAId = pacienteA.id;

  clientA = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInError } = await clientA.auth.signInWithPassword({
    email: userAEmail,
    password: TEST_PASSWORD,
  });
  if (signInError) throw signInError;

  // El tenant_id nunca lo mandamos nosotros: verificamos que el hook
  // efectivamente lo haya puesto en el JWT emitido por Supabase Auth.
  const claims = JSON.parse(atob(session.session!.access_token.split(".")[1]));
  if (claims.tenant_id !== tenantAId) {
    throw new Error(
      "El custom access token hook no está inyectando tenant_id en el JWT " +
        "(revisar [auth.hook.custom_access_token] en supabase/config.toml)."
    );
  }
});

afterAll(async () => {
  if (!tenantAId || !tenantBId) return;
  await admin.from("pacientes").delete().in("tenant_id", [tenantAId, tenantBId]);
  await admin.from("users").delete().in("tenant_id", [tenantAId, tenantBId]);
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  await admin.from("tenants").delete().in("id", [tenantAId, tenantBId]);
});

describe("Aislamiento entre tenants (RLS)", () => {
  it("tenant A puede leer sus propios pacientes", async () => {
    const { data, error } = await clientA.from("pacientes").select("id").eq("id", pacienteAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("tenant A NO puede leer pacientes de tenant B", async () => {
    const { data, error } = await clientA.from("pacientes").select("id").eq("id", pacienteBId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("tenant A NO puede leer pacientes de tenant B ni siquiera con un select sin filtro", async () => {
    const { data, error } = await clientA.from("pacientes").select("id");
    expect(error).toBeNull();
    expect(data?.some((p) => p.id === pacienteBId)).toBe(false);
  });

  it("tenant A NO puede insertar un paciente falsificando tenant_id de tenant B", async () => {
    const { data, error } = await clientA
      .from("pacientes")
      .insert({ tenant_id: tenantBId, nombre: "Paciente inyectado por A" })
      .select();
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("tenant A NO puede modificar un paciente de tenant B", async () => {
    const { error } = await clientA
      .from("pacientes")
      .update({ nombre: "hackeado" })
      .eq("id", pacienteBId);
    expect(error).toBeNull(); // RLS silencia el update (0 filas afectadas), no tira excepción

    const { data: check } = await admin.from("pacientes").select("nombre").eq("id", pacienteBId).single();
    expect(check?.nombre).toBe("Paciente confidencial de B");
  });

  it("tenant A NO puede borrar un paciente de tenant B", async () => {
    await clientA.from("pacientes").delete().eq("id", pacienteBId);

    const { data: check } = await admin.from("pacientes").select("id").eq("id", pacienteBId).maybeSingle();
    expect(check).not.toBeNull();
  });

  it("tenant A NO puede leer la fila de tenants de tenant B", async () => {
    const { data, error } = await clientA.from("tenants").select("id").eq("id", tenantBId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
