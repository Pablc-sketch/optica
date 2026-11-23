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
