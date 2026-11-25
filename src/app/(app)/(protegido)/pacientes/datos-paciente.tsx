import { edadPaciente, type PacienteParaAtender } from "@/lib/datos-paciente";
import { formatearTelefono } from "@/lib/formato";
import { formatearRut } from "@/lib/rut";

export default function DatosPaciente({ paciente, hoy }: { paciente: PacienteParaAtender; hoy: string }) {
  const edad = edadPaciente(paciente.fecha_nacimiento, hoy);
  const datos = [
    { etiqueta: "RUT", valor: formatearRut(paciente.rut) || "—" },
    { etiqueta: "Edad", valor: edad === null ? "—" : `${edad} años` },
    { etiqueta: "Teléfono", valor: formatearTelefono(paciente.telefono) || "—" },
    ...(paciente.email ? [{ etiqueta: "Correo", valor: paciente.email }] : []),
  ];
  return <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Datos del paciente">
    {datos.map(({ etiqueta, valor }) => (
      <div key={etiqueta} className="min-w-0">
        <dt className="text-tinta-suave">{etiqueta}</dt>
        <dd className="break-all font-semibold">{valor}</dd>
      </div>
    ))}
  </dl>;
}
