import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Registro de ópticas nuevas (spec pantalla 1). Es el punto más delicado
// del multi-tenant: crear_optica() corre como SECURITY DEFINER, así que
// tiene que defenderse sola de un usuario que intente crearse más de una
// óptica, o entrar a la de otro.

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_PASSWORD = "Test1234!Segura";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const emailsCreados: string[] = [];
const tenantsCreados: string[] = [];

// La cuenta se crea con la API de administración y no con signUp() a
// propósito: signUp dispara un correo de confirmación y el plan gratuito
// de Supabase permite muy pocos por hora, así que los tests quedarían a
// merced de esa cuota. Lo que importa verificar acá es crear_optica(), que
// es nuestra lógica; el alta de la cuenta la resuelve Supabase.
async function registrarOptica(nombreOptica: string) {
  const email = `${crypto.randomUUID()}@onboarding.example.com`;
  emailsCreados.push(email);

  const { error: altaError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (altaError) throw altaError;

  const cliente = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: loginError } = await cliente.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (loginError) throw loginError;

  const { data: tenantId, error } = await cliente.rpc("crear_optica", {
    p_nombre_comercial: nombreOptica,
    p_rut_empresa: "77.888.999-1",
    p_nombre_usuario: "Dueño de prueba",
  });
  if (error) throw error;
  tenantsCreados.push(tenantId);

  return { cliente, email, tenantId: tenantId as string };
}

let opticaA: { cliente: SupabaseClient; email: string; tenantId: string };
// Paciente de la óptica vecina: sirve para comprobar que ni siquiera el
// superadmin del producto ve fichas clínicas de otra óptica.
let pacienteAjenoId: string;

beforeAll(async () => {
  opticaA = await registrarOptica("Óptica Recién Registrada");
});

afterAll(async () => {
  for (const tabla of [
    "pagos_abonos", "venta_items", "ventas", "movimientos_inventario", "inventario",
    "ordenes_trabajo", "recetas", "pacientes", "costos_cristales", "productos",
    "proveedores", "sucursales", "users",
  ]) {
    if (tenantsCreados.length > 0) await admin.from(tabla).delete().in("tenant_id", tenantsCreados);
  }
  const { data: usuarios } = await admin.auth.admin.listUsers();
  for (const u of usuarios.users) {
    if (u.email && emailsCreados.includes(u.email)) await admin.auth.admin.deleteUser(u.id);
  }
  if (tenantsCreados.length > 0) {
    await admin.from("suscripciones").delete().in("tenant_id", tenantsCreados);
    await admin.from("tenants").delete().in("id", tenantsCreados);
  }
});

describe("Registro de óptica nueva", () => {
  it("deja la óptica lista para trabajar: perfil admin, sucursal, matriz de costos y trial", async () => {
    // Tras crear el perfil hay que refrescar: el token del signup se emitió
    // antes de que existiera la fila en users, así que no trae tenant_id.
    const { error: refreshError } = await opticaA.cliente.auth.refreshSession();
    expect(refreshError).toBeNull();

    const { data: sesion } = await opticaA.cliente.auth.getSession();
    const claims = JSON.parse(
      Buffer.from(sesion.session!.access_token.split(".")[1], "base64url").toString()
    );
    expect(claims.tenant_id).toBe(opticaA.tenantId);
    expect(claims.rol).toBe("admin");
    expect(claims.es_superadmin).toBe(false);

    const [{ data: sucursales }, { count: costos }, { data: suscripcion }] = await Promise.all([
      opticaA.cliente.from("sucursales").select("nombre"),
      opticaA.cliente.from("costos_cristales").select("*", { count: "exact", head: true }),
      opticaA.cliente.from("suscripciones").select("estado, fecha_renovacion").single(),
    ]);

    expect(sucursales).toHaveLength(1);
    expect(costos).toBe(150);
    expect(suscripcion!.estado).toBe("trial");

    const dias = Math.round(
      (new Date(suscripcion!.fecha_renovacion).getTime() - Date.now()) / (24 * 3600 * 1000)
    );
    expect(dias).toBeGreaterThanOrEqual(29);
  });

  it("la óptica nueva empieza vacía y no ve datos de otras ópticas", async () => {
    const [{ data: pacientes }, { data: tenants }] = await Promise.all([
      opticaA.cliente.from("pacientes").select("id"),
      opticaA.cliente.from("tenants").select("id"),
    ]);
    expect(pacientes).toHaveLength(0);
    // Solo su propia fila de tenants, nunca las demás del sistema.
    expect(tenants).toHaveLength(1);
    expect(tenants![0].id).toBe(opticaA.tenantId);
  });

  it("un usuario que ya tiene óptica no puede crearse otra", async () => {
    const { error } = await opticaA.cliente.rpc("crear_optica", {
      p_nombre_comercial: "Óptica Duplicada",
      p_rut_empresa: null,
      p_nombre_usuario: "Intruso",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("ya pertenece");
  });

  it("sin sesión no se puede registrar una óptica", async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await anon.rpc("crear_optica", {
      p_nombre_comercial: "Óptica Anónima",
      p_rut_empresa: null,
      p_nombre_usuario: null,
    });
    expect(error).not.toBeNull();
  });

  it("dos ópticas registradas por separado quedan aisladas entre sí", async () => {
    const opticaB = await registrarOptica("Óptica Vecina");
    await opticaB.cliente.auth.refreshSession();

    const { data: paciente } = await admin
      .from("pacientes")
      .insert({ tenant_id: opticaB.tenantId, nombre: "Paciente de la óptica vecina" })
      .select()
      .single();
    pacienteAjenoId = paciente!.id;

    const { data: visto } = await opticaA.cliente.from("pacientes").select("id").eq("id", pacienteAjenoId);
    expect(visto).toHaveLength(0);

    const { data: suscripciones } = await opticaA.cliente.from("suscripciones").select("tenant_id");
    expect(suscripciones).toHaveLength(1);
    expect(suscripciones![0].tenant_id).toBe(opticaA.tenantId);
  });

  it("con la suscripción vencida la base rechaza escrituras pero deja leer", async () => {
    const { data: paciente } = await opticaA.cliente
      .from("pacientes")
      .insert({ tenant_id: opticaA.tenantId, nombre: "Paciente antes del vencimiento" })
      .select()
      .single();
    expect(paciente).not.toBeNull();

    await admin
      .from("suscripciones")
      .update({ estado: "vencida", fecha_renovacion: "2020-01-01" })
      .eq("tenant_id", opticaA.tenantId);

    const { error: altaError } = await opticaA.cliente
      .from("pacientes")
      .insert({ tenant_id: opticaA.tenantId, nombre: "Paciente con suscripción vencida" });
    expect(altaError).not.toBeNull();

    const { error: ventaError } = await opticaA.cliente
      .from("ventas")
      .insert({ tenant_id: opticaA.tenantId, total: 50000 });
    expect(ventaError).not.toBeNull();

    // Los datos siguen siendo suyos: la lectura no se corta.
    const { data: leidos, error: lecturaError } = await opticaA.cliente
      .from("pacientes")
      .select("id");
    expect(lecturaError).toBeNull();
    expect(leidos!.length).toBeGreaterThan(0);

    // Al renovar, vuelve a operar sin intervención manual.
    await admin
      .from("suscripciones")
      .update({ estado: "activa", fecha_renovacion: "2099-12-31" })
      .eq("tenant_id", opticaA.tenantId);

    const { error: reactivadoError } = await opticaA.cliente
      .from("pacientes")
      .insert({ tenant_id: opticaA.tenantId, nombre: "Paciente después de renovar" });
    expect(reactivadoError).toBeNull();
  });

  it("un usuario de óptica no puede abrir el panel de ópticas cliente", async () => {
    const { error } = await opticaA.cliente.rpc("listar_opticas");
    expect(error).not.toBeNull();
    expect(error!.message).toContain("soporte");
  });

  it("el superadmin sí ve todas las ópticas registradas", async () => {
    const { data: perfil } = await admin
      .from("users")
      .select("id")
      .eq("tenant_id", opticaA.tenantId)
      .single();
    await admin.from("users").update({ es_superadmin: true }).eq("id", perfil!.id);
    await opticaA.cliente.auth.refreshSession();

    const { data, error } = await opticaA.cliente.rpc("listar_opticas");
    expect(error).toBeNull();
    const ids = (data as { tenant_id: string }[]).map((o) => o.tenant_id);
    for (const t of tenantsCreados) expect(ids).toContain(t);

    // Ver el panel no rompe el aislamiento de datos clínicos: el superadmin
    // sabe qué ópticas existen y cuánto usan el sistema, pero las fichas de
    // sus pacientes le siguen estando vedadas.
    const { data: fichaAjena } = await opticaA.cliente
      .from("pacientes")
      .select("id")
      .eq("id", pacienteAjenoId);
    expect(fichaAjena).toHaveLength(0);

    await admin.from("users").update({ es_superadmin: false }).eq("id", perfil!.id);
  });
});
