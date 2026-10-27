import { exigirRolPagina } from "@/lib/autorizacion";
import BuscadorSeguros from "./buscador";

export default async function SegurosPage() {
  await exigirRolPagina(["admin", "ventas"]);
  return <BuscadorSeguros />;
}
