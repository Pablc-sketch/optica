import { describe, expect, it } from "vitest";
import { resolverContextoVenta } from "../src/lib/contexto-venta";

describe("resolverContextoVenta (F01)", () => {
  it("A con OP_A y luego B sin operativo, sin jornada fijada: B no arrastra OP_A", () => {
    expect(resolverContextoVenta(null, "OP_A").operativoId).toBe("OP_A");
    expect(resolverContextoVenta(null, null)).toEqual({ operativoId: null, origen: "particular", recetaDeOtroOperativo: null });
  });

  it("jornada OP_B y receta histórica de OP_A: la venta va a OP_B y se avisa el origen", () => {
    expect(resolverContextoVenta("OP_B", "OP_A")).toEqual({
      operativoId: "OP_B",
      origen: "sesion_activa",
      recetaDeOtroOperativo: "OP_A",
    });
  });

  it("jornada fijada y paciente sin receta: sigue en la jornada", () => {
    expect(resolverContextoVenta("OP_B", undefined).operativoId).toBe("OP_B");
  });
});
