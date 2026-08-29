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
    <div className="relative overflow-hidden rounded-3xl bg-white p-4 shadow-[0_2px_10px_-3px_rgba(61,57,41,0.15)] transition hover:shadow-[0_8px_24px_-6px_rgba(61,57,41,0.22)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-brand to-accent" />
      <p className="flex items-center gap-1.5 text-sm text-tinta-suave">
        {icono && <span className="text-base">{icono}</span>}
        {titulo}
      </p>
      <p className={`mt-1 text-2xl font-bold ${acento ? "text-brand-dark" : "text-tinta"}`}>{valor}</p>
      {detalle && <p className="text-xs text-tinta-suave">{detalle}</p>}
    </div>
  );
}
