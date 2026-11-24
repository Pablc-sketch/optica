type ProductoBuscable = {
  nombre: string;
  marca: string | null;
  sku?: string | null;
  modelo?: string | null;
  codigo_color?: string | null;
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
  const coincidencias = !codigo ? [...productos] : productos.filter((producto) => {
    const variante = [producto.modelo, producto.codigo_color].filter(Boolean).join(" ");
    const campos = [producto.sku ?? "", producto.nombre, variante, producto.marca ?? ""];
    return normalizar(campos.join(" ")).includes(consulta) || campos.some((campo) => compacto(campo).includes(codigo));
  });
  const exacto = (producto: T) => Number(Boolean(codigo && compacto(producto.sku ?? "") === codigo));
  return coincidencias.sort((a, b) => exacto(b) - exacto(a) || Number((b.stock ?? 0) > 0) - Number((a.stock ?? 0) > 0));
}
