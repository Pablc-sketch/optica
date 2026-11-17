import CalendarioOperativos from "@/components/calendario-operativos";
import CabeceraPagina from "@/components/cabecera-pagina";
import { esPilotoTerreno } from "@/lib/piloto-terreno";
import { redirect } from "next/navigation";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { exigirRolPagina } from "@/lib/autorizacion";
import { cargarAgenda } from "@/lib/agenda-servidor";
import { fechaAgendaValida, mostrarFechas, rangosDisponibles, urlAgenda, vistaAgenda } from "@/lib/agenda";
import { horaCorta, hoyEnChile, primerDiaDelMes, ultimoDiaDelMes } from "@/lib/fechas";
import { borrarDisponibilidad } from "@/lib/actions/agenda";
import FormularioAgenda from "./formulario";

export default async function Agenda({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, tenantId } = await exigirRolPagina(["admin"]);
  if (esPilotoTerreno(tenantId)) redirect("/agenda/equipos");
  const params = await searchParams;
  const param = (k: string) => typeof params[k] === "string" ? params[k] as string : "";
  const hoy = hoyEnChile();
  const mesParam = param("mes");
  const mes = fechaAgendaValida(mesParam + "-01") ? mesParam : hoy.slice(0, 7);
  const diaParam = param("dia");
  const dia = fechaAgendaValida(diaParam) && diaParam.startsWith(mes) ? diaParam : hoy.startsWith(mes) ? hoy : primerDiaDelMes(mes);
  const { eventos, disponibilidad, nombreOptica, error } = await cargarAgenda(supabase, tenantId, primerDiaDelMes(mes), ultimoDiaDelMes(mes));
  const libres = rangosDisponibles(disponibilidad, eventos, hoy > primerDiaDelMes(mes) ? hoy : primerDiaDelMes(mes), ultimoDiaDelMes(mes));
  const vista = vistaAgenda(param("vista"));
  const editar = eventos.find(o => o.id === param("editar") && o.estado !== "realizado");
  const editarBloque = disponibilidad.find(b => b.id === param("editar"));
  const modo = param("nuevo");
  const mostrarFormulario = !error && (editar || editarBloque || modo === "operativo" || modo === "disponible");
  const tipo = editar?.tipo ?? (editarBloque || modo === "disponible" ? "disponible" : param("tipo") === "externo" ? "externo" : "propio");
  const registro = editar ?? editarBloque;

  return <div className={`mx-auto flex flex-col gap-4 ${mostrarFormulario ? "max-w-3xl" : ""}`}>
    <div>
      <CabeceraPagina seccion="En terreno" titulo="Calendario" />
      <p className="text-sm text-tinta-suave">Sedes y horarios · {nombreOptica}</p>
    </div>
    {error ? <p role="alert" className="rounded-xl bg-amber-100 p-4 text-sm">No se pudo cargar la agenda. Vuelve a intentar.</p> : mostrarFormulario ? (
      <FormularioAgenda key={registro?.id ?? `${dia}-${modo}`} dia={dia} vista={vista}
        edicion={!!registro} nombreOptica={nombreOptica} eventos={eventos} inicial={{
          id: registro?.id ?? randomUUID(), tipo, fecha: registro?.fecha ?? dia,
          fecha_fin: registro?.fecha_fin ?? (tipo === "propio" ? "" : registro?.fecha ?? ""),
          hora_inicio: horaCorta(editar?.hora_inicio) ?? "", hora_fin: horaCorta(editar?.hora_fin) ?? "", nombre: editar?.nombre ?? "",
          optica: editar?.tipo === "externo" ? editar.optica ?? "" : "", direccion: editar?.direccion ?? "",
          notas: editar?.notas ?? "", estado: editar?.estado ?? "pendiente",
        }} />
    ) : <>
      {param("eliminado") === "1" && <p role="status" className="rounded-xl bg-green-100 p-3 text-sm text-green-950">Operativo eliminado del calendario.</p>}
      {param("guardado") === "1" && <p role="status" className="rounded-xl bg-green-100 p-3 text-sm text-green-950">Agenda actualizada.</p>}
      {param("error") === "cruce" && <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm text-amber-950">El operativo se cruza con otro horario. Elige un bloque libre en la agenda.</p>}
      {param("error") === "borrar" && <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm">No se pudo quitar el bloque.</p>}
      <CalendarioOperativos key={`${mes}-${dia}-${vista}`} eventos={eventos} bloques={disponibilidad} hoy={hoy} mes={mes} diaInicial={dia} nombreOptica={nombreOptica} vistaInicial={vista} />
      <details id="disponibilidad" className="scroll-mt-32 rounded-2xl border border-green-200 bg-green-50 p-4 sm:p-5">
        <summary className="cursor-pointer font-bold text-green-950">Disponibilidad del tecnólogo</summary>
        <div className="mt-4 space-y-3">
          <Link href={urlAgenda(dia, { nuevo: "disponible", vista })} className="inline-flex rounded-xl bg-green-800 px-4 py-3 text-sm font-bold text-white">＋ Marcar disponibilidad</Link>
          {libres.length > 0 ? <ul className="grid gap-2 sm:grid-cols-2">
            {libres.map(b => <li key={b.fecha} className="rounded-xl bg-white p-3 font-semibold text-green-950">{mostrarFechas(b)}</li>)}
          </ul> : <p className="text-sm text-green-950">No hay días libres confirmados en lo que queda de este mes.</p>}
          {disponibilidad.length > 0 && <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-green-950">Editar disponibilidad registrada</summary>
            {disponibilidad.map(b => <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-green-200 py-3">
              <span>{mostrarFechas(b)}</span>
              <div className="flex items-center gap-2">
                <Link href={urlAgenda(b.fecha.startsWith(mes) ? b.fecha : primerDiaDelMes(mes), { editar: b.id, vista })} className="px-2 font-semibold text-brand-dark">Editar</Link>
                <form action={borrarDisponibilidad}>
                  <input type="hidden" name="id" value={b.id} /><input type="hidden" name="fecha" value={b.fecha} />
                  <input type="hidden" name="vista" value={vista} />
                  <button className="rounded-lg bg-white px-3 py-2 font-semibold text-brand-dark">Quitar</button>
                </form>
              </div>
            </div>)}
          </details>}
        </div>
      </details>
      <Link href={`/operativos/calendario?mes=${mes}`} className="self-start text-sm font-semibold text-brand-dark">Metas y resultados del mes →</Link>
    </>}
  </div>;
}
