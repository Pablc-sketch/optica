// Tarjeta de resumen compartida por las vistas de operación y reportes.
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
    <div className="min-w-0 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-tinta-suave">
        {icono && <span className="text-base">{icono}</span>}
        {titulo}
      </p>
      <p className={`mt-1 text-3xl font-bold tracking-tight tabular-nums ${acento ? "text-brand-dark" : "text-tinta"}`}>{valor}</p>
      {detalle && <p className="text-xs text-tinta-suave">{detalle}</p>}
    </div>
  );
}
