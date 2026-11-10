// La configuración del negocio de cada óptica (tabla configuracion_optica).
// Todo lo que antes estaba fijo en el código para Óptica Global —precio de
// consulta, costo de marco, marco premium, abono mínimo, reparto— sale de
// acá. Una óptica sin fila (o con la fila vacía) no cobra consulta, no
// tiene premium ni abono fijo, y no reparte utilidades desde Lentia.

export const TIPOS_LENTE = ["Monofocal", "Bifocal", "Multifocal"] as const;

export type PersonaReparto = { clave: string; nombre: string };
export type SocioReparto = PersonaReparto & { pct: number };
export type Reparto = {
  vendedora: PersonaReparto;
  ahorro: PersonaReparto;
  socios: SocioReparto[];
};

export type ConfiguracionOptica = {
  precioConsulta: number | null;
  consultaDescuento: "ninguno" | "total" | "monto";
  consultaDescuentoMonto: number;
  costoMarcoPorPar: number;
  precioMarcoPremium: number | null;
  abonoMinimoPorTipo: Record<string, number>;
  usaCatalogoCompartido: boolean;
  reparto: Reparto | null;
};

export const CONFIGURACION_VACIA: ConfiguracionOptica = {
  precioConsulta: null,
  consultaDescuento: "ninguno",
  consultaDescuentoMonto: 0,
  costoMarcoPorPar: 0,
  precioMarcoPremium: null,
  abonoMinimoPorTipo: {},
  usaCatalogoCompartido: false,
  reparto: null,
};

const CLAVE = /^[a-z0-9_]{1,40}$/;
const entero = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
};

function persona(v: unknown): PersonaReparto | null {
  if (!v || typeof v !== "object") return null;
  const { clave, nombre } = v as Record<string, unknown>;
  if (typeof clave !== "string" || !CLAVE.test(clave) || typeof nombre !== "string" || !nombre.trim()) return null;
  return { clave, nombre: nombre.trim() };
}

// El reparto solo vale completo: claves válidas y distintas, y los socios
// suman 100%. Si algo no cuadra se trata como "sin reparto" en vez de
// repartir mal la plata.
export function leerReparto(v: unknown): Reparto | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const vendedora = persona(r.vendedora);
  const ahorro = persona(r.ahorro);
  if (!vendedora || !ahorro || !Array.isArray(r.socios) || r.socios.length === 0) return null;
  const socios: SocioReparto[] = [];
  for (const s of r.socios) {
    const p = persona(s);
    const pct = Number((s as Record<string, unknown>)?.pct);
    if (!p || !Number.isFinite(pct) || pct < 0 || pct > 100) return null;
    socios.push({ ...p, pct });
  }
  const claves = [vendedora.clave, ahorro.clave, ...socios.map((s) => s.clave)];
  if (new Set(claves).size !== claves.length) return null;
  if (Math.abs(socios.reduce((s, x) => s + x.pct, 0) - 100) > 0.001) return null;
  return { vendedora, ahorro, socios };
}

export function leerConfiguracion(fila: Record<string, unknown> | null | undefined): ConfiguracionOptica {
  if (!fila) return CONFIGURACION_VACIA;
  const abono: Record<string, number> = {};
  const crudo = fila.abono_minimo_por_tipo;
  if (crudo && typeof crudo === "object" && !Array.isArray(crudo)) {
    for (const [tipo, monto] of Object.entries(crudo)) {
      const n = entero(monto);
      if (n !== null) abono[tipo] = n;
    }
  }
  const descuento = fila.consulta_descuento;
  return {
    precioConsulta: entero(fila.precio_consulta),
    consultaDescuento: descuento === "total" || descuento === "monto" ? descuento : "ninguno",
    consultaDescuentoMonto: entero(fila.consulta_descuento_monto) ?? 0,
    costoMarcoPorPar: entero(fila.costo_marco_por_par) ?? 0,
    precioMarcoPremium: entero(fila.precio_marco_premium),
    abonoMinimoPorTipo: abono,
    usaCatalogoCompartido: fila.usa_catalogo_compartido === true,
    reparto: leerReparto(fila.reparto),
  };
}

// Las personas a las que se les paga en el cierre de un operativo, en orden.
export function personasDelReparto(r: Reparto | null): (PersonaReparto & { esAhorro: boolean })[] {
  if (!r) return [];
  return [
    { ...r.vendedora, esAhorro: false },
    ...r.socios.map((s) => ({ clave: s.clave, nombre: s.nombre, esAhorro: false })),
    { ...r.ahorro, esAhorro: true },
  ];
}

// Lo que se descuenta de la consulta cuando el paciente compra lentes.
export function descuentoConsultaAlComprar(c: ConfiguracionOptica): number {
  if (c.precioConsulta === null) return 0;
  if (c.consultaDescuento === "total") return c.precioConsulta;
  if (c.consultaDescuento === "monto") return Math.min(c.consultaDescuentoMonto, c.precioConsulta);
  return 0;
}

type Cliente = { from: (tabla: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

// Lee la configuración de la óptica de la sesión (RLS deja ver solo la propia).
export async function cargarConfiguracion(supabase: Cliente): Promise<ConfiguracionOptica> {
  const { data, error } = await supabase.from("configuracion_optica").select("*").maybeSingle();
  if (error) throw new Error(`No se pudo leer la configuración de la óptica: ${error.message}`);
  return leerConfiguracion(data);
}

// Clave estable para una persona del reparto a partir de su nombre. Las
// claves ya usadas se conservan: los pagos anotados las referencian.
export function claveDesdeNombre(nombre: string, usadas: Set<string>): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30) || "persona";
  let clave = base;
  for (let i = 2; usadas.has(clave); i++) clave = `${base}_${i}`;
  usadas.add(clave);
  return clave;
}

// Arma el reparto desde el formulario de Configuración. Las filas existentes
// traen su clave; las nuevas la reciben desde el nombre. Devuelve null si la
// óptica no reparte, o un error si los porcentajes no suman 100.
export function repartoDesdeFormulario(
  filas: { clave?: string; nombre: string; pct?: number; tipo: "vendedora" | "socio" | "ahorro" }[]
): { reparto: Reparto | null } | { error: string } {
  const validas = filas.filter((f) => f.nombre.trim());
  if (validas.length === 0) return { reparto: null };
  const usadas = new Set(validas.map((f) => f.clave).filter((c): c is string => Boolean(c && CLAVE.test(c))));
  const conClave = validas.map((f) => ({
    ...f,
    nombre: f.nombre.trim(),
    clave: f.clave && CLAVE.test(f.clave) ? f.clave : claveDesdeNombre(f.nombre, usadas),
  }));
  const vendedora = conClave.find((f) => f.tipo === "vendedora");
  const ahorro = conClave.find((f) => f.tipo === "ahorro");
  const socios = conClave.filter((f) => f.tipo === "socio");
  if (!vendedora || !ahorro || socios.length === 0) {
    return { error: "El reparto necesita quien vende, al menos un socio y el nombre del ahorro." };
  }
  const reparto = leerReparto({
    vendedora: { clave: vendedora.clave, nombre: vendedora.nombre },
    ahorro: { clave: ahorro.clave, nombre: ahorro.nombre },
    socios: socios.map((s) => ({ clave: s.clave, nombre: s.nombre, pct: s.pct ?? 0 })),
  });
  return reparto ? { reparto } : { error: "Los porcentajes de los socios deben sumar 100%." };
}
