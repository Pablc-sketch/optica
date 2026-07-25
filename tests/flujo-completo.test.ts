import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Spec sección 8.4, test #3: flujo completo paciente → receta → OT →
// venta → pago, operando como un usuario autenticado normal (todas las
// escrituras pasan por RLS, nada usa el service role salvo setup/teardown).
//
// Los montos son reales, tomados del SGO del usuario:
// - Cristal Monofocal ±2.00/±2.00 Orgánico Antirreflejo: costo $2.740 CLP
//   (matriz COSTOS_CRISTALES), precio de venta = costo × factor 6 = $16.440.
// - Armazón Luxe "Oval Slim": costo $28.000, precio venta $70.000 CLP
//   (hoja INVENTARIO).

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_PASSWORD = "Test1234!Segura";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let tenantId: string;
let userId: string;
let sucursalId: string;
let proveedorLabId: string;
let armazonId: string;
let client: SupabaseClient;

beforeAll(async () => {
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({ nombre_comercial: "Óptica Flujo Completo" })
    .select()
    .single();
  if (tenantError) throw tenantError;
  tenantId = tenant.id;

  const email = `${crypto.randomUUID()}@flujo.test`;
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (authError) throw authError;
  userId = authUser.user.id;

  const { error: profileError } = await admin.from("users").insert({
    id: userId,
    tenant_id: tenantId,
    nombre: "Admin Flujo",
    email,
    rol: "admin",
  });
  if (profileError) throw profileError;

  client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInError) throw signInError;
});

afterAll(async () => {
  if (!tenantId) return;
  // El orden respeta las FKs; venta_items/pagos caen en cascada con ventas.
  for (const tabla of [
    "pagos_abonos", "venta_items", "ventas", "ordenes_trabajo",
    "movimientos_inventario", "inventario", "recetas", "pacientes",
    "costos_cristales", "productos", "proveedores", "sucursales", "users",
  ]) {
    await admin.from(tabla).delete().eq("tenant_id", tenantId);
  }
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("tenants").delete().eq("id", tenantId);
});

describe("Flujo completo: paciente → receta → OT → venta → pago", () => {
  let pacienteId: string;
  let recetaId: string;
  let otId: string;
  let ventaId: string;
  let costoCristal: number;
  let precioCristal: number;

  const PRECIO_ARMAZON = 70000; // CLP, armazón Luxe Oval Slim del inventario real

  it("setup del tenant: sucursal, proveedor, armazón y matriz de costos copiada de la plantilla", async () => {
    const { data: sucursal, error: sucError } = await client
      .from("sucursales")
      .insert({ tenant_id: tenantId, nombre: "Casa Matriz", direccion: "Av. Principal 123" })
      .select()
      .single();
    expect(sucError).toBeNull();
    sucursalId = sucursal!.id;

    const { data: proveedor, error: provError } = await client
      .from("proveedores")
      .insert({ tenant_id: tenantId, nombre: "Optiland", tipo: "laboratorio" })
      .select()
      .single();
    expect(provError).toBeNull();
    proveedorLabId = proveedor!.id;

    const { data: armazon, error: armError } = await client
      .from("productos")
      .insert({
        tenant_id: tenantId,
        categoria: "armazon",
        nombre: "Oval Slim",
        marca: "Luxe",
        color: "Negro",
        sku: "M-042",
        costo: 28000,
        precio_venta: PRECIO_ARMAZON,
      })
      .select()
      .single();
    expect(armError).toBeNull();
    armazonId = armazon!.id;

    // Stock inicial: 10 unidades (como la hoja INVENTARIO del SGO).
    const { error: invError } = await client.from("inventario").insert({
      tenant_id: tenantId,
      sucursal_id: sucursalId,
      producto_id: armazonId,
      stock_actual: 10,
      stock_minimo: 2,
    });
    expect(invError).toBeNull();

    // Onboarding de costos: copiar la plantilla global (150 combinaciones).
    const { data: copiadas, error: copiaError } = await client.rpc("copiar_plantilla_costos");
    expect(copiaError).toBeNull();
    expect(copiadas).toBe(150);
  });

  it("la matriz copiada tiene los costos reales del SGO en CLP", async () => {
    const { data, error } = await client
      .from("costos_cristales")
      .select("costo")
      .eq("tipo_lente", "Monofocal")
      .eq("rango_receta", "±2.00 / ±2.00")
      .eq("tratamiento", "Orgánico Antirreflejo")
      .single();
    expect(error).toBeNull();
    costoCristal = data!.costo;
    expect(costoCristal).toBe(2740);

    const { data: tenant } = await client
      .from("tenants")
      .select("factor_venta_cristales")
      .single();
    precioCristal = costoCristal * tenant!.factor_venta_cristales;
    expect(precioCristal).toBe(16440);
  });

  it("1. registra un paciente con RUT chileno", async () => {
    const { data, error } = await client
      .from("pacientes")
      .insert({
        tenant_id: tenantId,
        nombre: "María González López",
        rut: "16.123.873-4",
        telefono: "+56 9 8765 4321",
        fecha_nacimiento: "1985-04-12",
      })
      .select()
      .single();
    expect(error).toBeNull();
    pacienteId = data!.id;
  });

  it("2. registra la receta con valores ópticos válidos", async () => {
    const { data, error } = await client
      .from("recetas")
      .insert({
        tenant_id: tenantId,
        paciente_id: pacienteId,
        profesional_id: userId,
        od_esfera: -1.25,
        od_cilindro: -0.5,
        od_eje: 180,
        oi_esfera: -1.0,
        oi_cilindro: -0.25,
        oi_eje: 175,
        av_od: "20/20",
        av_oi: "20/20",
        dp: 63,
        altura: 20,
        tipo: "lejos",
      })
      .select()
      .single();
    expect(error).toBeNull();
    recetaId = data!.id;
  });

  it("2b. la base rechaza una receta con eje inválido (>180°)", async () => {
    const { error } = await client.from("recetas").insert({
      tenant_id: tenantId,
      paciente_id: pacienteId,
      od_esfera: -1.0,
      od_eje: 200,
    });
    expect(error).not.toBeNull();
  });

  it("3. crea la orden de trabajo y avanza por los 5 estados", async () => {
    const { data, error } = await client
      .from("ordenes_trabajo")
      .insert({
        tenant_id: tenantId,
        paciente_id: pacienteId,
        receta_id: recetaId,
        sucursal_id: sucursalId,
        armazon_producto_id: armazonId,
        tipo_lente: "Monofocal",
        rango_receta: "±2.00 / ±2.00",
        tratamiento: "Orgánico Antirreflejo",
        origen_cristal: "laboratorio",
        proveedor_lab_id: proveedorLabId,
        costo_laboratorio: 2740,
        fecha_entrega_estimada: "2026-08-01",
      })
      .select()
      .single();
    expect(error).toBeNull();
    otId = data!.id;
    expect(data!.estado).toBe("recepcion");
    expect(data!.folio).toBeGreaterThan(0);

    for (const estado of ["laboratorio", "montaje", "listo"]) {
      const { error: e } = await client
        .from("ordenes_trabajo")
        .update({ estado })
        .eq("id", otId);
      expect(e).toBeNull();
    }
  });

  it("3b. la base rechaza un estado de OT inexistente", async () => {
    const { error } = await client
      .from("ordenes_trabajo")
      .update({ estado: "perdida" })
      .eq("id", otId);
    expect(error).not.toBeNull();
  });

  it("4. registra la venta: armazón + cristales, con descuento de stock", async () => {
    const total = PRECIO_ARMAZON + precioCristal; // 70.000 + 16.440 = 86.440 CLP

    const { data: venta, error: ventaError } = await client
      .from("ventas")
      .insert({
        tenant_id: tenantId,
        paciente_id: pacienteId,
        sucursal_id: sucursalId,
        vendedor_id: userId,
        total,
      })
      .select()
      .single();
    expect(ventaError).toBeNull();
    ventaId = venta!.id;
    expect(venta!.estado_pago).toBe("pendiente");

    const { error: itemsError } = await client.from("venta_items").insert([
      {
        tenant_id: tenantId,
        venta_id: ventaId,
        producto_id: armazonId,
        descripcion: "Armazón Luxe Oval Slim Negro",
        cantidad: 1,
        precio_unitario: PRECIO_ARMAZON,
      },
      {
        tenant_id: tenantId,
        venta_id: ventaId,
        ot_id: otId,
        descripcion: "Cristales Monofocal Orgánico Antirreflejo ±2.00/±2.00",
        cantidad: 1,
        precio_unitario: precioCristal,
      },
    ]);
    expect(itemsError).toBeNull();

    // Salida de inventario por la venta del armazón.
    const { error: movError } = await client.from("movimientos_inventario").insert({
      tenant_id: tenantId,
      producto_id: armazonId,
      sucursal_id: sucursalId,
      tipo: "salida",
      cantidad: 1,
      referencia: `venta:${ventaId}`,
    });
    expect(movError).toBeNull();

    const { error: stockError } = await client
      .from("inventario")
      .update({ stock_actual: 9 })
      .eq("producto_id", armazonId)
      .eq("sucursal_id", sucursalId);
    expect(stockError).toBeNull();
  });

  it("5. abono parcial → saldo pendiente → pago final → pagada", async () => {
    // Abono inicial de $50.000 (como el flujo real del SGO).
    const { error: abono1Error } = await client.from("pagos_abonos").insert({
      tenant_id: tenantId,
      venta_id: ventaId,
      monto: 50000,
      medio_pago: "efectivo",
    });
    expect(abono1Error).toBeNull();

    await client.from("ventas").update({ estado_pago: "abono_parcial" }).eq("id", ventaId);

    // Saldo = 86.440 - 50.000 = 36.440 CLP.
    const { data: pagos } = await client.from("pagos_abonos").select("monto").eq("venta_id", ventaId);
    const abonado = pagos!.reduce((sum, p) => sum + p.monto, 0);
    const { data: venta } = await client.from("ventas").select("total").eq("id", ventaId).single();
    expect(venta!.total - abonado).toBe(36440);

    // Pago del saldo al retirar los lentes.
    const { error: abono2Error } = await client.from("pagos_abonos").insert({
      tenant_id: tenantId,
      venta_id: ventaId,
      monto: 36440,
      medio_pago: "debito",
    });
    expect(abono2Error).toBeNull();

    const { error: pagadaError } = await client
      .from("ventas")
      .update({ estado_pago: "pagada" })
      .eq("id", ventaId);
    expect(pagadaError).toBeNull();
  });

  it("6. entrega: OT a 'entregado' con fecha real, stock e historial consistentes", async () => {
    const { error } = await client
      .from("ordenes_trabajo")
      .update({ estado: "entregado", fecha_entrega_real: new Date().toISOString() })
      .eq("id", otId);
    expect(error).toBeNull();

    const { data: ot } = await client
      .from("ordenes_trabajo")
      .select("estado, fecha_entrega_real")
      .eq("id", otId)
      .single();
    expect(ot!.estado).toBe("entregado");
    expect(ot!.fecha_entrega_real).not.toBeNull();

    const { data: inv } = await client
      .from("inventario")
      .select("stock_actual")
      .eq("producto_id", armazonId)
      .single();
    expect(inv!.stock_actual).toBe(9);

    const { data: pagos } = await client.from("pagos_abonos").select("monto").eq("venta_id", ventaId);
    expect(pagos!.reduce((s, p) => s + p.monto, 0)).toBe(86440);
  });
});
