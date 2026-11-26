import { redirect, RedirectType } from "next/navigation";

export default async function Gastos({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const anteriores = await searchParams;
  const filtros = new URLSearchParams({ ver: "gastos" });
  for (const [clave, valor] of Object.entries(anteriores)) {
    for (const item of Array.isArray(valor) ? valor : [valor]) {
      if (item !== undefined) filtros.append(clave === "ver" ? "detalle" : clave, item);
    }
  }
  redirect(`/caja?${filtros}${anteriores.personal === "1" ? "#adelantos-personales" : ""}`, RedirectType.replace);
}
