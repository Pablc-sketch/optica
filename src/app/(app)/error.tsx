'use client';
import Link from 'next/link';

export default function ErrorApp({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <div role="alert" className="mx-auto my-8 max-w-md rounded-2xl bg-white p-6 shadow-sm">
    <h1 className="text-xl font-bold">No pudimos cargar esta pantalla</h1>
    <p className="mt-2 text-sm text-tinta-suave">Revisa la conexión y vuelve a intentar.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <button onClick={retry} className="rounded-xl bg-brand px-4 py-2.5 font-semibold text-white">Reintentar</button>
      <Link href="/" className="rounded-xl border px-4 py-2.5 font-semibold">Ir al inicio</Link>
    </div>
  </div>;
}
