// Tarjeta de número/resumen reutilizable — antes cada pantalla (Inicio,
// Operativos, Reportes) definía su propia versión casi idéntica en texto
// plano. Una sola versión, con más vida: barra superior en degradado y
// sombra suave que se levanta un poco al pasar el mouse.
export default function Tarjeta({
  titulo,
  valor,
  detalle,
  acento,
  icono,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  acento?: boolean;
  icono?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-tinta/10 bg-white p-4 shadow-[0_1px_2px_rgba(23,21,15,0.06)] transition hover:shadow-[0_10px_28px_-12px_rgba(23,21,15,0.25)]">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-tinta-suave">
        {icono && <span className="text-base">{icono}</span>}
        {titulo}
      </p>
      <p className={`mt-1 text-3xl font-bold tracking-tight tabular-nums ${acento ? "text-brand-dark" : "text-tinta"}`}>{valor}</p>
      {detalle && <p className="text-xs text-tinta-suave">{detalle}</p>}
    </div>
  );
}
