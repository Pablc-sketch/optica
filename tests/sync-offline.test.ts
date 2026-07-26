import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Spec sección 8.2 / 8.4 (test #4): sincronización offline y resolución de
// conflictos. Simula el outbox del cliente llamando a la RPC
// sync_aplicar_cambios con sesiones reales de usuario (SECURITY INVOKER:
// RLS aplica dentro de la sincronización).

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_PASSWORD = "Test1234!Segura";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let tenantId: string;
let tenantAjenoId: string;
let userId: string;
let sucursalId: string;
let productoId: string;
// Dos "dispositivos" del mismo usuario (tablet en terreno + PC del local)
let dispositivoA: SupabaseClient;
let dispositivoB: SupabaseClient;

beforeAll(async () => {
  const { data: tenant } = await admin
    .from("tenants")
    .insert({ nombre_comercial: "Óptica Sync Offline" })
    .select()
    .single();
  tenantId = tenant!.id;

  const { data: ajeno } = await admin
    .from("tenants")
    .insert({ nombre_comercial: "Óptica Ajena" })
    .select()
    .single();
  tenantAjenoId = ajeno!.id;

  const email = `${crypto.randomUUID()}@sync.example.com`;
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (authError) throw authError;
  userId = authUser.user.id;

  await admin.from("users").insert({
    id: userId,
    tenant_id: tenantId,
    nombre: "Tecnólogo Terreno",
    email,
    rol: "admin",
  });

  const { data: sucursal } = await admin
    .from("sucursales")
    .insert({ tenant_id: tenantId, nombre: "Casa Matriz" })
    .select()
    .single();
  sucursalId = sucursal!.id;

  const { data: producto } = await admin
    .from("productos")
    .insert({
      tenant_id: tenantId,
      categoria: "armazon",
      nombre: "Classic Round",
      marca: "Optiland",
      costo: 18000,
      precio_venta: 45000,
    })
    .select()
    .single();
  productoId = producto!.id;

  await admin.from("inventario").insert({
    tenant_id: tenantId,
    sucursal_id: sucursalId,
    producto_id: productoId,
    stock_actual: 5,
    stock_minimo: 1,
  });

  dispositivoA = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  dispositivoB = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [a, b] = await Promise.all([
    dispositivoA.auth.signInWithPassword({ email, password: TEST_PASSWORD }),
    dispositivoB.auth.signInWithPassword({ email, password: TEST_PASSWORD }),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
});

afterAll(async () => {
  if (!tenantId) return;
  for (const tabla of [
    "pagos_abonos", "venta_items", "ventas", "movimientos_inventario",
    "inventario", "ordenes_trabajo", "recetas", "pacientes", "productos",
    "sucursales", "users",
  ]) {
    await admin.from(tabla).delete().eq("tenant_id", tenantId);
  }
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("tenants").delete().in("id", [tenantId, tenantAjenoId]);
});

describe("Sincronización offline (spec 8.2)", () => {
  it("una venta completa capturada offline sincroniza entera y el trigger descuenta stock", async () => {
    const ventaId = crypto.randomUUID();
    const ahora = new Date().toISOString();

    const lote = [
      {
        tabla: "ventas",
        op: "insert",
        id: ventaId,
        datos: {
          tenant_id: tenantId, sucursal_id: sucursalId, vendedor_id: userId,
          fecha: ahora, total: 45000, estado_pago: "abono_parcial",
        },
      },
      {
        tabla: "venta_items",
        op: "insert",
        id: crypto.randomUUID(),
        datos: {
          tenant_id: tenantId, venta_id: ventaId, producto_id: productoId,
          descripcion: "Armazón Optiland Classic Round", cantidad: 1, precio_unitario: 45000,
        },
      },
      {
        tabla: "pagos_abonos",
        op: "insert",
        id: crypto.randomUUID(),
        datos: { tenant_id: tenantId, venta_id: ventaId, monto: 20000, medio_pago: "efectivo", fecha: ahora },
      },
      {
        tabla: "movimientos_inventario",
        op: "insert",
        id: crypto.randomUUID(),
        datos: {
          tenant_id: tenantId, producto_id: productoId, sucursal_id: sucursalId,
          tipo: "salida", cantidad: 1, referencia: `venta:${ventaId}`, fecha: ahora,
        },
      },
    ];

    const { data, error } = await dispositivoA.rpc("sync_aplicar_cambios", { p_cambios: lote });
    expect(error).toBeNull();
    expect(data.aplicados).toHaveLength(4);
    expect(data.conflictos).toHaveLength(0);
    expect(data.errores).toHaveLength(0);

    const { data: inv } = await admin
      .from("inventario")
      .select("stock_actual")
      .eq("producto_id", productoId)
      .single();
    expect(inv!.stock_actual).toBe(4); // 5 - 1 por el trigger
  });

  it("reintentar el mismo lote tras un corte no duplica nada (idempotencia)", async () => {
    const pacienteId = crypto.randomUUID();
    const lote = [
      {
        tabla: "pacientes",
        op: "insert",
        id: pacienteId,
        datos: { tenant_id: tenantId, nombre: "Paciente Operativo Rural" },
      },
    ];

    const r1 = await dispositivoA.rpc("sync_aplicar_cambios", { p_cambios: lote });
    const r2 = await dispositivoA.rpc("sync_aplicar_cambios", { p_cambios: lote });
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();

    const { data: filas } = await admin.from("pacientes").select("id").eq("id", pacienteId);
    expect(filas).toHaveLength(1);
  });

  it("dos dispositivos editan el mismo paciente: el segundo recibe conflicto y no pisa al primero", async () => {
    const pacienteId = crypto.randomUUID();
    await admin.from("pacientes").insert({
      id: pacienteId,
      tenant_id: tenantId,
      nombre: "Paciente Conflicto",
      telefono: "+56 9 1111 1111",
    });

    // Ambos dispositivos leen la misma versión base.
    const { data: base } = await dispositivoA
      .from("pacientes")
      .select("updated_at")
      .eq("id", pacienteId)
      .single();

    // Dispositivo A actualiza primero (gana).
    const rA = await dispositivoA.rpc("sync_aplicar_cambios", {
      p_cambios: [{
        tabla: "pacientes", op: "update", id: pacienteId,
        datos: { telefono: "+56 9 2222 2222" },
        base_updated_at: base!.updated_at,
      }],
    });
    expect(rA.error).toBeNull();
    expect(rA.data.aplicados).toHaveLength(1);

    // Dispositivo B llega tarde con la base vieja → conflicto, sin aplicar.
    const rB = await dispositivoB.rpc("sync_aplicar_cambios", {
      p_cambios: [{
        tabla: "pacientes", op: "update", id: pacienteId,
        datos: { telefono: "+56 9 3333 3333" },
        base_updated_at: base!.updated_at,
      }],
    });
    expect(rB.error).toBeNull();
    expect(rB.data.aplicados).toHaveLength(0);
    expect(rB.data.conflictos).toHaveLength(1);
    expect(rB.data.conflictos[0].id).toBe(pacienteId);
    // El conflicto trae la fila actual del servidor para que el usuario decida.
    expect(rB.data.conflictos[0].servidor.telefono).toBe("+56 9 2222 2222");

    const { data: final } = await admin
      .from("pacientes")
      .select("telefono")
      .eq("id", pacienteId)
      .single();
    expect(final!.telefono).toBe("+56 9 2222 2222");
  });

  it("con la base correcta, el update offline sí aplica (avance de OT en terreno)", async () => {
    const { data: paciente } = await admin
      .from("pacientes")
      .insert({ tenant_id: tenantId, nombre: "Paciente OT Terreno" })
      .select()
      .single();
    const { data: ot } = await admin
      .from("ordenes_trabajo")
      .insert({ tenant_id: tenantId, paciente_id: paciente!.id, sucursal_id: sucursalId })
      .select()
      .single();

    const { data: r } = await dispositivoA.rpc("sync_aplicar_cambios", {
      p_cambios: [{
        tabla: "ordenes_trabajo", op: "update", id: ot!.id,
        datos: { estado: "laboratorio" },
        base_updated_at: ot!.updated_at,
      }],
    });
    expect(r.aplicados).toHaveLength(1);

    const { data: otFinal } = await admin
      .from("ordenes_trabajo")
      .select("estado")
      .eq("id", ot!.id)
      .single();
    expect(otFinal!.estado).toBe("laboratorio");
  });

  it("la sincronización NO permite colar datos de otro tenant (RLS dentro del sync)", async () => {
    const intrusoId = crypto.randomUUID();
    const { data, error } = await dispositivoA.rpc("sync_aplicar_cambios", {
      p_cambios: [{
        tabla: "pacientes", op: "insert", id: intrusoId,
        datos: { tenant_id: tenantAjenoId, nombre: "Paciente inyectado en tenant ajeno" },
      }],
    });
    expect(error).toBeNull();
    expect(data.aplicados).toHaveLength(0);
    expect(data.errores).toHaveLength(1);

    const { data: filas } = await admin.from("pacientes").select("id").eq("id", intrusoId);
    expect(filas).toHaveLength(0);
  });

  it("una tabla fuera de la lista blanca es rechazada", async () => {
    const { data } = await dispositivoA.rpc("sync_aplicar_cambios", {
      p_cambios: [{
        tabla: "users", op: "insert", id: crypto.randomUUID(),
        datos: { tenant_id: tenantId, nombre: "hacker", email: "x@x.cl", rol: "admin" },
      }],
    });
    expect(data.aplicados).toHaveLength(0);
    expect(data.errores).toHaveLength(1);
  });
});
