import { randomUUID } from "node:crypto";
import { clp } from "@/lib/clp";
import { registrarPagoReparto } from "@/lib/actions/reparto";
import { PERSONAS_SUELDO } from "@/lib/reparto-operativos";
import type { MontosReparto } from "@/lib/reparto";
import CajaFormulario from "./caja-formulario";

export default function SueldosReparto({ nombres, pagado, pendiente, disponible, registro }: {
  nombres: Record<typeof PERSONAS_SUELDO[number], string>;
  pagado: MontosReparto;
  pendiente: MontosReparto;
  disponible?: MontosReparto | null;
  registro?: { ambito: "operativo" | "chequeo"; id: string; version: string; limite: MontosReparto };
}) {
  const verifica = disponible !== undefined;
  return <div className="overflow-x-auto rounded-xl bg-white text-sm">
    <table className="w-full whitespace-nowrap text-right tabular-nums">
      <thead className="text-tinta-suave">
        <tr><th scope="col" className="py-2 pr-3 text-left">Sueldo</th>
          <th scope="col" className="px-2">Total</th><th scope="col" className="px-2">Pagado</th>
          <th scope="col" className="px-2">Por pagar</th>
          {verifica && <th scope="col" className="px-2">Disponible hoy</th>}
        </tr>
      </thead>
      {PERSONAS_SUELDO.map(persona => {
        const limite = registro ? Math.min(registro.limite[persona], pendiente[persona]) : 0;
        return <tbody key={persona} className="border-t border-tinta/10">
          <tr>
            <th scope="row" className="py-3 pr-3 text-left">{nombres[persona]}</th>
            <td className="px-2">{clp(pagado[persona] + pendiente[persona])}</td>
            <td className="px-2">{clp(pagado[persona])}</td>
            <td className="px-2 font-semibold">{pendiente[persona] === 0 && pagado[persona] > 0
              ? <span className="text-emerald-800">Pagado</span> : clp(pendiente[persona])}</td>
            {verifica && <td className="px-2">{disponible ? clp(disponible[persona]) : "Por verificar"}</td>}
          </tr>
          {registro && limite > 0 && <tr><td colSpan={verifica ? 5 : 4} className="pb-2 text-left">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-brand-dark">Marcar pagado · {nombres[persona]}</summary>
              <div className="my-2 max-w-sm rounded-lg border border-tinta/10 p-3">
                <CajaFormulario guardar={registrarPagoReparto} texto="Pagado">
                  <input type="hidden" name="id" value={randomUUID()} />
                  <input type="hidden" name="version" value={registro.version} />
                  <input type="hidden" name={registro.ambito} value={registro.id} />
                  <input type="hidden" name="persona" value={persona} />
                  <p className="whitespace-normal text-sm text-tinta-suave">Confirma el monto que ya entregaste. Se anotará como salida de la caja seleccionada.</p>
                  <label className="text-sm">Monto pagado
                    <input type="number" name="monto" min="1" max={limite} step="1" required
                      defaultValue={limite} className="block w-full rounded-lg border px-2 py-1.5" />
                  </label>
                  <label className="text-sm">Caja
                    <select name="caja" className="block w-full rounded-lg border px-2 py-1.5">
                      <option value="digital">Cuenta de la óptica</option><option value="efectivo">Efectivo</option>
                    </select>
                  </label>
                </CajaFormulario>
              </div>
            </details>
          </td></tr>}
        </tbody>;
      })}
    </table>
  </div>;
}
