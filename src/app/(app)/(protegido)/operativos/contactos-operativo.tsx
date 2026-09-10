import {
  actualizarCadenciaOperativo,
  actualizarContactoOperativo,
  crearContactoOperativo,
  eliminarContactoOperativo,
} from "@/lib/actions/operativos";
import { CampoTelefono } from "@/components/campos";
import { formatearTelefono, telefonoParaWhatsapp } from "@/lib/formato";

// Ficha de dirigentes de un operativo: con quién hay que hablar para
// volver a ese lugar. Se usa igual en el detalle del operativo y en la
// agenda general, para que agregar un contacto se vea y se haga igual en
// los dos lados.

export type ContactoOperativo = {
  id: string;
  nombre: string;
  cargo: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
};

const input =
  "rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-600";

export default function ContactosOperativo({
  operativoId,
  contactos,
  volverEnMeses,
  mostrarCadencia = true,
}: {
  operativoId: string;
  contactos: ContactoOperativo[];
  volverEnMeses: number;
  // En la agenda general la cadencia se edita una vez por lugar, arriba;
  // repetirla dentro de cada ficha solo confunde.
  mostrarCadencia?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {contactos.length === 0 && (
        <p className="rounded-lg bg-white px-3 py-2 text-sm text-tinta-suave">
          Todavía no hay dirigentes anotados. Sin esto, para volver a este lugar hay que
          empezar de nuevo buscando a quién preguntarle.
        </p>
      )}

      {contactos.map((c) => {
        const wsp = telefonoParaWhatsapp(c.telefono);
        return (
          <details key={c.id} className="rounded-lg bg-white px-3 py-2">
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium text-sky-950">{c.nombre}</span>
              {c.cargo && <span className="text-xs text-sky-700">{c.cargo}</span>}
              {c.telefono ? (
                <span className="text-sm text-sky-800">{formatearTelefono(c.telefono)}</span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                  sin teléfono
                </span>
              )}
            </summary>

            {c.notas && <p className="mt-2 text-xs text-sky-800">{c.notas}</p>}

            {wsp && (
              <a
                href={`https://wa.me/${wsp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700"
              >
                💬 Escribirle por WhatsApp
              </a>
            )}

            <form
              action={actualizarContactoOperativo}
              className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="operativo_id" value={operativoId} />
              <label className="flex flex-col gap-1 text-xs font-medium text-sky-900">
                Nombre
                <input name="nombre" required defaultValue={c.nombre} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-sky-900">
                Cargo
                <input
                  name="cargo"
                  defaultValue={c.cargo ?? ""}
                  placeholder="Presidente de la directiva"
                  className={input}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-sky-900">
                Teléfono
                <CampoTelefono name="telefono" defaultValue={c.telefono ?? ""} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-sky-900">
                Correo
                <input name="email" type="email" defaultValue={c.email ?? ""} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-sky-900 sm:col-span-2">
                Notas
                <textarea
                  name="notas"
                  rows={2}
                  defaultValue={c.notas ?? ""}
                  placeholder="Pidió avisar con dos semanas. Hay que pasar por la conserjería."
                  className={input}
                />
              </label>
              <div className="flex items-center gap-2 sm:col-span-2">
                <button className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-800">
                  Guardar
                </button>
              </div>
            </form>

            <form action={eliminarContactoOperativo} className="mt-1">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="operativo_id" value={operativoId} />
              <button className="text-xs font-medium text-red-700 underline">Borrar este contacto</button>
            </form>
          </details>
        );
      })}

      <details className="rounded-lg bg-white px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-sky-800">
          ＋ Agregar dirigente
        </summary>
        <form action={crearContactoOperativo} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input type="hidden" name="operativo_id" value={operativoId} />
          <label className="flex flex-col gap-1 text-xs font-medium text-sky-900">
            Nombre *
            <input name="nombre" required placeholder="Luigino" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-sky-900">
            Cargo
            <input name="cargo" placeholder="Presidente de la directiva" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-sky-900">
            Teléfono
            <CampoTelefono name="telefono" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-sky-900">
            Correo
            <input name="email" type="email" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-sky-900 sm:col-span-2">
            Notas
            <textarea name="notas" rows={2} className={input} />
          </label>
          <div className="sm:col-span-2">
            <button className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-800">
              Agregar
            </button>
          </div>
        </form>
      </details>

      {mostrarCadencia && (
        <form
          action={actualizarCadenciaOperativo}
          className="flex flex-wrap items-end gap-2 rounded-lg bg-white px-3 py-2"
        >
          <input type="hidden" name="id" value={operativoId} />
          <label className="flex flex-col gap-1 text-xs font-medium text-sky-900">
            Volver a este lugar cada (meses)
            <input
              name="volver_en_meses"
              inputMode="numeric"
              defaultValue={volverEnMeses}
              className={`${input} w-24`}
            />
          </label>
          <button className="rounded-lg border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-50">
            Guardar
          </button>
          <span className="text-xs text-tinta-suave">
            La agenda avisa cuando se cumple el plazo desde este operativo.
          </span>
        </form>
      )}
    </div>
  );
}
