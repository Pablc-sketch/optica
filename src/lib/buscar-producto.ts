type ProductoBuscable = {
  nombre: string;
  marca: string | null;
  sku?: string | null;
  modelo?: string | null;
  codigo_color?: string | null;
  color?: string | null;
  material?: string | null;
  stock?: number;
};

const normalizar = (texto: string) => texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const compacto = (texto: string) => normalizar(texto).replace(/[^a-z0-9]/g, "");

export const claveCodigoMarco = (codigo: string) =>
  codigo.normalize("NFD").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

export function marcoPorCodigo<T extends ProductoBuscable>(marcos: readonly T[], codigo: string): T | undefined {
  const clave = claveCodigoMarco(codigo);
  if (!clave) return undefined;
  const coincidencias = marcos.filter(m => claveCodigoMarco(m.sku ?? "") === clave);
  return coincidencias.length === 1 ? coincidencias[0] : undefined;
}

export function filtrarProductos<T extends ProductoBuscable>(productos: readonly T[], entrada: string): T[] {
  const consulta = normalizar(entrada.trim());
  const codigo = compacto(consulta);
  const palabras = consulta.split(/\s+/).map(compacto).filter(Boolean);
  const coincidencias = !codigo ? [...productos] : productos.filter((producto) => {
    const variante = [producto.modelo, producto.codigo_color].filter(Boolean).join(" ");
    const campos = [producto.sku ?? "", producto.nombre, variante, producto.marca ?? "",
      producto.material ?? "", producto.color ?? "", producto.codigo_color ?? ""].map(compacto);
    return campos.some(campo => campo.includes(codigo)) || palabras.every(palabra => campos.some(campo => campo.includes(palabra)));
  });
  const exacto = (producto: T) => Number(Boolean(codigo && compacto(producto.sku ?? "") === codigo));
  return coincidencias.sort((a, b) => exacto(b) - exacto(a) || Number((b.stock ?? 0) > 0) - Number((a.stock ?? 0) > 0));
}

export function sugerirMarcosPorCodigo<T extends ProductoBuscable>(marcos: readonly T[], entrada: string): T[] {
  const clave = claveCodigoMarco(entrada);
  if (!clave) return [];
  const exacto = marcoPorCodigo(marcos, entrada);
  if (exacto) return [exacto];
  return marcos.filter(marco => claveCodigoMarco(marco.sku ?? "").startsWith(clave))
    .sort((a, b) => Number((b.stock ?? 0) > 0) - Number((a.stock ?? 0) > 0)).slice(0, 6);
}

export function sugerirDetallesMarco(opciones: readonly (string | null | undefined)[], entrada: string): string[] {
  const busca = normalizar(entrada.trim());
  const vistos = new Set<string>();
  return opciones.flatMap(opcion => {
    const valor = opcion?.trim();
    if (!valor) return [];
    const clave = normalizar(valor);
    if (vistos.has(clave) || !clave.includes(busca)) return [];
    vistos.add(clave);
    return [valor];
  }).slice(0, 10);
}
