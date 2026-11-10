import { describe, expect, it } from "vitest";
import {
  CONFIGURACION_VACIA,
  descuentoConsultaAlComprar,
  leerConfiguracion,
  leerReparto,
  personasDelReparto,
  repartoDesdeFormulario,
  claveDesdeNombre,
} from "../src/lib/configuracion-optica";

describe("configuración por óptica", () => {
  it("sin fila: todo en blanco", () => {
    expect(leerConfiguracion(null)).toEqual(CONFIGURACION_VACIA);
  });

  it("lee la fila de Óptica Global tal como la deja la migración", () => {
    const c = leerConfiguracion({
      precio_consulta: 5000, consulta_descuento: "total", consulta_descuento_monto: 0, costo_marco_por_par: 5000,
      precio_marco_premium: 10000, abono_minimo_por_tipo: { Monofocal: 10000, Bifocal: 40000, Multifocal: 80000 },
      usa_catalogo_compartido: true,
      reparto: {
        vendedora: { clave: "isadora", nombre: "Isadora" }, ahorro: { clave: "ahorro", nombre: "Ahorro del negocio" },
        socios: [{ clave: "madre", nombre: "Mamá", pct: 50 }, { clave: "pablo", nombre: "Pablo", pct: 50 }],
      },
    });
    expect(c.precioConsulta).toBe(5000);
    expect(c.costoMarcoPorPar).toBe(5000);
    expect(c.precioMarcoPremium).toBe(10000);
    expect(c.abonoMinimoPorTipo.Multifocal).toBe(80000);
    expect(personasDelReparto(c.reparto).map((p) => p.clave)).toEqual(["isadora", "madre", "pablo", "ahorro"]);
    expect(descuentoConsultaAlComprar(c)).toBe(5000);
  });

  it("descuento de consulta configurable", () => {
    const base = { ...CONFIGURACION_VACIA, precioConsulta: 8000 };
    expect(descuentoConsultaAlComprar({ ...base, consultaDescuento: "ninguno" })).toBe(0);
    expect(descuentoConsultaAlComprar({ ...base, consultaDescuento: "monto", consultaDescuentoMonto: 3000 })).toBe(3000);
    expect(descuentoConsultaAlComprar({ ...base, consultaDescuento: "monto", consultaDescuentoMonto: 99000 })).toBe(8000);
    expect(descuentoConsultaAlComprar({ ...CONFIGURACION_VACIA, consultaDescuento: "total" })).toBe(0);
  });

  it("un reparto mal formado no se usa (no se reparte mal la plata)", () => {
    const ok = {
      vendedora: { clave: "v", nombre: "V" }, ahorro: { clave: "f", nombre: "F" },
      socios: [{ clave: "a", nombre: "A", pct: 60 }, { clave: "b", nombre: "B", pct: 40 }],
    };
    expect(leerReparto(ok)).not.toBeNull();
    expect(leerReparto({ ...ok, socios: [{ clave: "a", nombre: "A", pct: 60 }] })).toBeNull();
    expect(leerReparto({ ...ok, ahorro: { clave: "a", nombre: "Repetida" } })).toBeNull();
    expect(leerReparto({ ...ok, vendedora: { clave: "Con Espacio", nombre: "X" } })).toBeNull();
  });

  it("valores inválidos en la fila se ignoran", () => {
    const c = leerConfiguracion({ precio_consulta: -1, costo_marco_por_par: "abc", abono_minimo_por_tipo: { Monofocal: -5, Bifocal: 3 } });
    expect(c.precioConsulta).toBeNull();
    expect(c.costoMarcoPorPar).toBe(0);
    expect(c.abonoMinimoPorTipo).toEqual({ Bifocal: 3 });
  });
});

describe("reparto desde el formulario", () => {
  it("conserva las claves existentes y crea claves para personas nuevas", () => {
    const r = repartoDesdeFormulario([
      { clave: "isadora", nombre: "Isadora", tipo: "vendedora" },
      { clave: "madre", nombre: "Mamá", pct: 50, tipo: "socio" },
      { nombre: "José Peña", pct: 50, tipo: "socio" },
      { clave: "ahorro", nombre: "Ahorro", tipo: "ahorro" },
    ]);
    expect("reparto" in r && r.reparto?.socios.map((s) => s.clave)).toEqual(["madre", "jose_pena"]);
  });
  it("sin nombres = la óptica no reparte; porcentajes que no suman 100 = error", () => {
    expect(repartoDesdeFormulario([{ nombre: " ", tipo: "vendedora" }])).toEqual({ reparto: null });
    expect(repartoDesdeFormulario([
      { nombre: "V", tipo: "vendedora" }, { nombre: "A", pct: 60, tipo: "socio" }, { nombre: "F", tipo: "ahorro" },
    ])).toHaveProperty("error");
  });
  it("claves repetidas por nombre se desambiguan", () => {
    const usadas = new Set<string>();
    expect([claveDesdeNombre("Ana", usadas), claveDesdeNombre("Ana", usadas)]).toEqual(["ana", "ana_2"]);
  });
});
