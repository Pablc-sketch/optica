import { beforeEach, describe, expect, it } from "vitest";
import type { VentaInput } from "../src/lib/actions/ventas";

// localStorage mínimo para correr la cola real en Node.
const almacen = new Map<string, string>();
Object.assign(globalThis, {
  window: {
    localStorage: {
      getItem: (k: string) => almacen.get(k) ?? null,
      setItem: (k: string, v: string) => void almacen.set(k, v),
    },
    dispatchEvent: () => true,
  },
});

const { encolarVenta, fallidas, pendientes, reintentarFallida, sincronizar } = await import("../src/lib/offline/outbox");

const venta = (id: string): VentaInput => ({
  ventaId: id,
  pacienteId: null,
  items: [{ descripcion: "Marco", cantidad: 1, precioUnitario: 10000 }],
  cristales: [],
  armazones: [],
  abonoInicial: 0,
  medioPago: "efectivo",
});

describe("cola offline (A04)", () => {
  beforeEach(() => almacen.clear());

  it("una venta encolada MIENTRAS se sincroniza otra no se pierde", async () => {
    encolarVenta("u1", venta("A"));
    let soltar!: () => void;
    const esperando = new Promise<void>((r) => (soltar = r));
    const enviadas: string[] = [];

    const sync = sincronizar("u1", async (input) => {
      enviadas.push(input.ventaId);
      if (input.ventaId === "A") await esperando;
      return { ok: true, ventaId: input.ventaId, otFolio: null };
    });
    // Mientras A espera respuesta del servidor, se encola B.
    encolarVenta("u1", venta("B"));
    soltar();
    await sync;

    // Antes: la cola quedaba vacía y B desaparecía. Ahora B también se envió.
    expect(enviadas).toEqual(["A", "B"]);
    expect(pendientes("u1")).toEqual([]);
  });

  it("si B llega después de terminar, queda pendiente (no se borra)", async () => {
    encolarVenta("u1", venta("A"));
    await sincronizar("u1", async (i) => ({ ok: true, ventaId: i.ventaId, otFolio: null }));
    encolarVenta("u1", venta("B"));
    expect(pendientes("u1").map((p) => p.id)).toEqual(["B"]);
  });

  it("un rechazo del servidor conserva TODO el contenido para reintentar", async () => {
    encolarVenta("u1", venta("A"));
    await sincronizar("u1", async () => ({ ok: false, error: "La receta cambió" }));
    const [f] = fallidas("u1");
    expect(f.error).toBe("La receta cambió");
    expect(f.input.items[0].precioUnitario).toBe(10000);
    reintentarFallida("u1", "A");
    expect(pendientes("u1").map((p) => p.id)).toEqual(["A"]);
    expect(fallidas("u1")).toEqual([]);
  });

  it("sin conexión la venta queda tal cual", async () => {
    encolarVenta("u1", venta("A"));
    const r = await sincronizar("u1", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(r.sinConexion).toBe(true);
    expect(pendientes("u1").map((p) => p.id)).toEqual(["A"]);
  });

  it("cada usuario tiene su propia cola", () => {
    encolarVenta("u1", venta("A"));
    expect(pendientes("u2")).toEqual([]);
  });

  it("encolar dos veces la misma venta no la duplica", () => {
    encolarVenta("u1", venta("A"));
    encolarVenta("u1", venta("A"));
    expect(pendientes("u1")).toHaveLength(1);
  });

  it("dos sincronizaciones a la vez no mandan la misma venta dos veces", async () => {
    encolarVenta("u1", venta("A"));
    let envios = 0;
    const enviar = async (i: VentaInput) => {
      envios++;
      await new Promise((r) => setTimeout(r, 5));
      return { ok: true as const, ventaId: i.ventaId, otFolio: null };
    };
    await Promise.all([sincronizar("u1", enviar), sincronizar("u1", enviar)]);
    expect(envios).toBe(1);
  });
});
