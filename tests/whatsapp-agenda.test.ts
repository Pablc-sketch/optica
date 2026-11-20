import { describe, expect, it, vi } from "vitest";
import {
  diaCorto, leerEstado, nombreValido, numeroElegido, responder, telefonoValido,
  type Estado, type Fuente, type HoraLibre, type OperativoAbierto,
} from "@/lib/whatsapp-agenda";

// Datos ficticios.
const OPS: OperativoAbierto[] = [
  { id: "op-1", nombre: "Junta Vecinos Las Flores", fecha: "2030-03-07", fecha_fin: null, direccion: "Calle Uno 123", comuna: "Maipú", hora_inicio: "10:00:00", hora_fin: "12:00:00", horas_libres: 4 },
  { id: "op-2", nombre: "Condominio El Roble", fecha: "2030-03-08", fecha_fin: "2030-03-09", direccion: null, comuna: "Puente Alto", hora_inicio: "09:00:00", hora_fin: "13:00:00", horas_libres: 8 },
  { id: "op-3", nombre: "Colegio Lleno", fecha: "2030-03-10", fecha_fin: null, direccion: null, comuna: null, hora_inicio: "09:00:00", hora_fin: "10:00:00", horas_libres: 0 },
];
const HORAS: HoraLibre[] = [
  { fecha: "2030-03-07", hora: "10:00:00", libres: 3 },
  { fecha: "2030-03-07", hora: "10:30:00", libres: 1 },
];

function fuente(extra: Partial<Fuente> = {}): Fuente {
  return {
    optica: "Óptica Ficticia",
    operativos: vi.fn(async () => OPS),
    horas: vi.fn(async () => HORAS),
    agendar: vi.fn(async () => ({ ok: true as const, id: "cita-1" })),
    citas: vi.fn(async () => []),
    cancelar: vi.fn(async () => true),
    ...extra,
  };
}

describe("agendar por WhatsApp", () => {
  it("flujo completo: menú → operativo → hora → nombre → agendada", async () => {
    const f = fuente();
    const r1 = await responder(null, "hola", f);
    expect(r1.respuesta).toContain("Óptica Ficticia");
    expect(r1.respuesta).toContain("1. Junta Vecinos Las Flores - jue 7 mar, 10:00 a 12:00 (Calle Uno 123, Maipú)");
    expect(r1.respuesta).toContain("2. Condominio El Roble - vie 8 mar al sáb 9 mar");
    expect(r1.respuesta).not.toContain("Colegio Lleno"); // sin horas libres
    expect(r1.estado).toEqual({ paso: "elegir_operativo", ops: ["op-1", "op-2"] });

    const r2 = await responder(r1.estado, "1", f);
    expect(f.horas).toHaveBeenCalledWith("op-1");
    expect(r2.respuesta).toContain("1. 10:00");
    expect(r2.respuesta).toContain("2. 10:30");
    expect(r2.estado).toEqual({ paso: "elegir_hora", op: "op-1", horas: [["2030-03-07", "10:00:00"], ["2030-03-07", "10:30:00"]] });

    const r3 = await responder(r2.estado, "2", f);
    expect(r3.estado).toEqual({ paso: "nombre", op: "op-1", fecha: "2030-03-07", hora: "10:30:00" });

    const r4 = await responder(r3.estado, "  maría   josé pérez ", f);
    expect(f.agendar).toHaveBeenCalledWith("op-1", "2030-03-07", "10:30:00", "maría josé pérez");
    expect(r4.respuesta).toContain("Tu hora quedó agendada");
    expect(r4.respuesta).toContain("jue 7 mar a las 10:30");
    expect(r4.estado).toBeNull();
  });

  it("sin operativos abiertos lo dice y no deja estado", async () => {
    const r = await responder(null, "hola", fuente({ operativos: async () => [] }));
    expect(r.respuesta).toContain("no tenemos operativos");
    expect(r.estado).toBeNull();
  });

  it("respuestas fuera de rango no avanzan", async () => {
    const f = fuente();
    const e: Estado = { paso: "elegir_hora", op: "op-1", horas: [["2030-03-07", "10:00:00"]] };
    const r = await responder(e, "5", f);
    expect(r.estado).toEqual(e);
    expect(f.agendar).not.toHaveBeenCalled();
    const r2 = await responder({ paso: "nombre", op: "op-1", fecha: "2030-03-07", hora: "10:00:00" }, "12345", f);
    expect(r2.respuesta).toContain("nombre y apellido");
    expect(f.agendar).not.toHaveBeenCalled();
  });

  it("si la hora se llenó mientras escribía, vuelve a ofrecer horas", async () => {
    const f = fuente({ agendar: async () => ({ ok: false as const, error: "sin_cupo" }) });
    const r = await responder({ paso: "nombre", op: "op-1", fecha: "2030-03-07", hora: "10:30:00" }, "Juan Soto", f);
    expect(r.respuesta).toContain("se acaba de llenar");
    expect(r.estado?.paso).toBe("elegir_hora");
  });

  it("no permite dos horas del mismo teléfono en un operativo", async () => {
    const f = fuente({ agendar: async () => ({ ok: false as const, error: "duplicada" }) });
    const r = await responder({ paso: "nombre", op: "op-1", fecha: "2030-03-07", hora: "10:30:00" }, "Juan Soto", f);
    expect(r.respuesta).toContain("ya tiene una hora");
  });

  it("ANULAR lista las horas y anula la elegida", async () => {
    const f = fuente({ citas: async () => [{ id: "c-9", operativo: "Junta Vecinos Las Flores", fecha: "2030-03-07", hora: "10:00:00", direccion: null }] });
    const r1 = await responder({ paso: "elegir_operativo", ops: ["op-1"] }, "quiero anular", f);
    expect(r1.estado).toEqual({ paso: "anular", citas: ["c-9"] });
    const r2 = await responder(r1.estado, "1", f);
    expect(f.cancelar).toHaveBeenCalledWith("c-9");
    expect(r2.respuesta).toContain("anulada");
  });

  it("0 o MENU vuelve al inicio desde cualquier paso", async () => {
    const r = await responder({ paso: "nombre", op: "op-1", fecha: "2030-03-07", hora: "10:00:00" }, "0", fuente());
    expect(r.estado?.paso).toBe("elegir_operativo");
  });

  it("valida el estado guardado antes de usarlo", () => {
    expect(leerEstado("elegir_operativo", { ops: ["a"] })).toEqual({ paso: "elegir_operativo", ops: ["a"] });
    expect(leerEstado("elegir_operativo", { ops: [1] })).toBeNull();
    expect(leerEstado("nombre", { op: "a", fecha: "2030-01-01" })).toBeNull();
    expect(leerEstado("otro", {})).toBeNull();
  });

  it("ayudantes", () => {
    expect(numeroElegido("2", 3)).toBe(2);
    expect(numeroElegido("opción 3", 3)).toBe(3);
    expect(numeroElegido("4", 3)).toBeNull();
    expect(numeroElegido("dos", 3)).toBeNull();
    expect(nombreValido("Ana")).toBe("Ana");
    expect(nombreValido("x")).toBeNull();
    expect(nombreValido("<script>")).toBeNull();
    expect(telefonoValido("56912345678")).toBe("56912345678");
    expect(telefonoValido("+56 9")).toBeNull();
    expect(diaCorto("2030-03-07")).toBe("jue 7 mar");
  });
});
