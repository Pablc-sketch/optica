import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Permisos por rol (spec sección 2). Se prueba contra la base, no contra
// la interfaz: ocultar un botón no protege nada si la API sigue abierta.
// El caso más importante es bodega, que NO debe poder leer fichas
// clínicas — son datos sensibles de salud bajo la Ley 21.719.

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_PASSWORD = "Test1234!Segura";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let tenantId: string;
let pacienteId: string;
let productoId: string;
let sucursalId: string;
const userIds: string[] = [];
const clientes: Record<string, SupabaseClient> = {};

async function crearUsuarioConRol(rol: string) {
  const email = `${crypto.randomUUID()}@permisos.example.com`;
  const { data: cuenta, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  userIds.push(cuenta.user.id);

  await admin.from("users").insert({
    id: cuenta.user.id,
    tenant_id: tenantId,
    nombre: `Usuario ${rol}`,
    email,
    rol,
  });

  const cliente = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: loginError } = await cliente.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (loginError) throw loginError;
  clientes[rol] = cliente;
}

beforeAll(async () => {
  const { data: tenant } = await admin
    .from("tenants")
    .insert({ nombre_comercial: "Óptica Permisos" })
    .select()
    .single();
  tenantId = tenant!.id;

  await admin.from("suscripciones").insert({
    tenant_id: tenantId,
    plan: "activa",
    estado: "activa",
    fecha_renovacion: "2099-12-31",
  });

  const { data: sucursal } = await admin
    .from("sucursales")
    .insert({ tenant_id: tenantId, nombre: "Casa Matriz" })
    .select()
    .single();
  sucursalId = sucursal!.id;

  const { data: producto } = await admin
    .from("productos")
    .insert({ tenant_id: tenantId, categoria: "armazon", nombre: "Modelo Test", costo: 10000, precio_venta: 30000 })
    .select()
    .single();
  productoId = producto!.id;

  await admin.from("inventario").insert({
    tenant_id: tenantId,
    sucursal_id: sucursalId,
    producto_id: productoId,
    stock_actual: 10,
    stock_minimo: 2,
  });

  const { data: paciente } = await admin
    .from("pacientes")
    .insert({ tenant_id: tenantId, nombre: "Paciente Reservado", rut: "11.111.111-1" })
    .select()
    .single();
  pacienteId = paciente!.id;

  for (const rol of ["admin", "clinico", "ventas", "bodega"]) {
    await crearUsuarioConRol(rol);
  }
});

afterAll(async () => {
  if (!tenantId) return;
  for (const tabla of [
    "pagos_abonos", "venta_items", "ventas", "movimientos_inventario", "inventario",
    "ordenes_trabajo", "recetas", "pacientes", "productos", "sucursales", "users", "suscripciones",
  ]) {
    await admin.from(tabla).delete().eq("tenant_id", tenantId);
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await admin.from("tenants").delete().eq("id", tenantId);
});

describe("Permisos por rol", () => {
  it("bodega NO puede leer fichas de pacientes (dato sensible de salud)", async () => {
    const { data, error } = await clientes.bodega.from("pacientes").select("id, nombre");
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("bodega NO puede leer recetas", async () => {
    const { data } = await clientes.bodega.from("recetas").select("id");
    expect(data).toHaveLength(0);
  });

  it("clínico y ventas SÍ ven las fichas", async () => {
    for (const rol of ["clinico", "ventas"]) {
      const { data } = await clientes[rol].from("pacientes").select("id");
      expect(data, `rol ${rol}`).toHaveLength(1);
    }
  });

  it("ventas NO puede editar la ficha clínica de un paciente", async () => {
    await clientes.ventas.from("pacientes").update({ notas: "editado por ventas" }).eq("id", pacienteId);
    const { data } = await admin.from("pacientes").select("notas").eq("id", pacienteId).single();
    expect(data!.notas).toBeNull();
  });

  it("ventas NO puede crear una receta", async () => {
    const { error } = await clientes.ventas.from("recetas").insert({
      tenant_id: tenantId,
      paciente_id: pacienteId,
      od_esfera: -1.0,
    });
    expect(error).not.toBeNull();
  });

  it("clínico SÍ puede crear una receta", async () => {
    const { error } = await clientes.clinico.from("recetas").insert({
      tenant_id: tenantId,
      paciente_id: pacienteId,
      od_esfera: -1.25,
      oi_esfera: -1.0,
      dp: 62,
    });
    expect(error).toBeNull();
  });

  it("clínico NO puede registrar una venta", async () => {
    const { error } = await clientes.clinico.from("ventas").insert({
      tenant_id: tenantId,
      total: 50000,
    });
    expect(error).not.toBeNull();
  });

  it("ventas SÍ puede registrar una venta y cobrarla", async () => {
    const { data: venta, error } = await clientes.ventas
      .from("ventas")
      .insert({ tenant_id: tenantId, total: 30000 })
      .select()
      .single();
    expect(error).toBeNull();

    const { error: pagoError } = await clientes.ventas.from("pagos_abonos").insert({
      tenant_id: tenantId,
      venta_id: venta!.id,
      monto: 30000,
      medio_pago: "efectivo",
    });
    expect(pagoError).toBeNull();
  });

  it("bodega SÍ puede mover inventario", async () => {
    const { error } = await clientes.bodega.from("movimientos_inventario").insert({
      tenant_id: tenantId,
      producto_id: productoId,
      sucursal_id: sucursalId,
      tipo: "entrada",
      cantidad: 5,
      referencia: "compra a proveedor",
    });
    expect(error).toBeNull();

    const { data: inv } = await admin
      .from("inventario")
      .select("stock_actual")
      .eq("producto_id", productoId)
      .single();
    expect(inv!.stock_actual).toBe(15);
  });

  it("solo el admin cambia precios y configuración", async () => {
    const { error: errorVentas } = await clientes.ventas
      .from("sucursales")
      .insert({ tenant_id: tenantId, nombre: "Sucursal pirata" });
    expect(errorVentas).not.toBeNull();

    const { error: errorAdmin } = await clientes.admin
      .from("sucursales")
      .insert({ tenant_id: tenantId, nombre: "Sucursal Centro" });
    expect(errorAdmin).toBeNull();
  });

  it("un admin no puede ascender a nadie a superadmin del producto", async () => {
    const { data: objetivo } = await admin
      .from("users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("rol", "ventas")
      .single();

    await clientes.admin.from("users").update({ es_superadmin: true }).eq("id", objetivo!.id);

    const { data: verificado } = await admin
      .from("users")
      .select("es_superadmin")
      .eq("id", objetivo!.id)
      .single();
    expect(verificado!.es_superadmin).toBe(false);
  });

  it("el rol viaja en el JWT, no en la petición", async () => {
    const { data: sesion } = await clientes.bodega.auth.getSession();
    const claims = JSON.parse(
      Buffer.from(sesion.session!.access_token.split(".")[1], "base64url").toString()
    );
    expect(claims.rol).toBe("bodega");
    expect(claims.tenant_id).toBe(tenantId);
  });
});
