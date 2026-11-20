import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Gestión óptica en terreno | Óptica Global',
  description: 'Organiza tus operativos visuales, desde la agenda de sedes hasta la entrega de los lentes.',
};

const pasos = [
  { titulo: 'Organiza el operativo', detalle: 'Revisa fechas, sedes y equipos en el calendario de operativos.' },
  { titulo: 'Atiende y vende', detalle: 'Registra la receta, cotiza según el marco y los cristales, y guarda el abono.' },
  { titulo: 'Sigue cada pedido', detalle: 'Consulta las órdenes de laboratorio, los saldos pendientes y las entregas.' },
];

export default function ConocePage() {
  return (
    <main className="flex-1 bg-[#f8f4ed] text-[#253a31]">
      <div className="mx-auto max-w-6xl px-5 sm:px-10">
        <header className="flex items-center justify-between gap-4 border-b border-[#253a31]/15 py-5">
          <p className="text-sm font-semibold tracking-wide">Óptica Global · Software</p>
          <Link href="/login" className="rounded-full border border-[#253a31]/45 px-4 py-3 text-sm font-semibold hover:bg-white">
            Iniciar sesión
          </Link>
        </header>
        <section className="grid items-center gap-9 py-12 md:grid-cols-[1.2fr_1fr] md:py-20">
          <div>
            <p className="mb-4 text-sm font-semibold text-[#694a37]">Para ópticas en Chile</p>
            <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
              Tu óptica, de la sede a la entrega
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed">
              Coordina operativos visuales y lleva recetas, ventas, caja y entregas en una sola plataforma.
            </p>
            <Link href="/registro" className="mt-7 inline-flex rounded-full bg-[#253a31] px-6 py-3.5 font-semibold text-white hover:bg-[#365246]">
              Registrar mi óptica
            </Link>
          </div>
          <section aria-labelledby="flujo" className="rounded-3xl border border-[#253a31]/15 bg-white p-6 sm:p-8">
            <h2 id="flujo" className="text-xl font-semibold">Así funciona un operativo</h2>
            <ol className="mt-4 divide-y divide-[#253a31]/15">
              {pasos.map((paso, indice) => (
                <li key={paso.titulo} className="flex gap-4 py-4">
                  <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-[#eae0d1] font-semibold">
                    {indice + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{paso.titulo}</h3>
                    <p className="mt-1 text-sm leading-relaxed">{paso.detalle}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </section>
      </div>
    </main>
  );
}
