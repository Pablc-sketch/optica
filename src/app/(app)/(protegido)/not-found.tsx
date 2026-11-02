import Link from 'next/link';

export default function NoEncontrado() {
  return <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
    <h1 className="text-xl font-bold">No encontramos esta página</h1>
    <p className="mt-2 text-sm text-tinta-suave">El enlace puede haber cambiado o no estar disponible para tu cuenta.</p>
    <Link href="/" className="mt-4 inline-block rounded-xl bg-brand px-4 py-2.5 font-semibold text-white">Volver al inicio</Link>
  </div>;
}
