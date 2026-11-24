import { clp } from "@/lib/clp";
import { formatearMonto } from "@/lib/formato";

export function CampoPresupuestoPar({ valor, onChange }: { valor: string; onChange: (valor: string) => void }) {
  return (
    <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold">
      Presupuesto por par (CLP)
      <input
        inputMode="numeric"
        maxLength={12}
        placeholder="Opcional"
        value={valor}
        onChange={e => onChange(formatearMonto(e.target.value))}
        className="min-h-10 w-32 rounded-lg border border-tinta-suave/30 bg-white px-3 text-base tabular-nums outline-none focus:border-brand"
      />
    </label>
  );
}

export function EstadoPresupuestoPar({ precio, presupuesto }: { precio: number; presupuesto: number | null }) {
  if (presupuesto === null) return null;
  return (
    <span className="block text-xs font-semibold">
      {precio <= presupuesto ? "Dentro del presupuesto" : `Excede en ${clp(precio - presupuesto)}`}
    </span>
  );
}
