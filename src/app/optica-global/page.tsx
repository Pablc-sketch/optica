import type { Metadata } from "next";
import Image from "next/image";
import { MARCA_GLOBAL } from "@/lib/marca-optica";
export const metadata: Metadata = {
 metadataBase: new URL("https://lentiaapp.cl"),
 title: "Óptica Global | Cerca para que veas lejos",
 description: MARCA_GLOBAL.eslogan,
 alternates: { canonical: MARCA_GLOBAL.url },
 robots: { index: false, follow: false },
 openGraph: { title: MARCA_GLOBAL.nombre, description: MARCA_GLOBAL.eslogan, url: MARCA_GLOBAL.url, siteName: MARCA_GLOBAL.nombre, type: "website", locale: "es_CL" },
};
export default function MarcaGlobal() {
 return <main className="flex min-h-screen flex-col items-center justify-center bg-[#faf8f4] px-6 py-12 text-center text-[#27271c]">
 <Image src="/marca/optica-global-logo.png" alt="Óptica Global" width={400} height={400} priority className="h-auto w-full max-w-sm"/>
 <h1 className="text-3xl font-bold">{MARCA_GLOBAL.nombre}</h1>
 <p className="mt-3 text-xl">{MARCA_GLOBAL.eslogan}</p>
 <p className="mt-10 max-w-md text-sm leading-6">Para retirar tus lentes, revisa la fecha, el horario y el lugar indicados en el mensaje de WhatsApp de la óptica.</p>
 </main>;
}
