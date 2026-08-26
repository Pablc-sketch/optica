// Se muestra al instante al navegar entre pantallas mientras el servidor
// trae los datos (Next.js reemplaza esto solo por la página real cuando
// termina el fetch) — sin esto la app se sentía "trabada" un momento en
// blanco entre un clic y el siguiente.
export default function Cargando() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="h-7 w-48 rounded-lg bg-tinta-suave/15" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-crema-claro" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-crema-claro" />
        ))}
      </div>
    </div>
  );
}
