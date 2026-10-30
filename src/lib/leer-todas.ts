// Cada consulta debe ordenar por una clave única antes de paginar.
export async function leerTodas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{
  data: T[] | null; error: { message: string } | null;
}>) {
  const filas: T[] = [];
  const cantidad = 500;
  for (let desde = 0; ; desde += cantidad) {
    const res = await consulta(desde, desde + cantidad - 1);
    if (res.error) return { data: null, error: res.error };
    filas.push(...(res.data ?? []));
    if ((res.data?.length ?? 0) < cantidad) return { data: filas, error: null };
  }
}
