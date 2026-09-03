import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Por defecto Next no guarda nada en caché del lado del cliente para
    // páginas dinámicas (como son casi todas acá, por los datos por tenant):
    // cada navegación golpeaba el servidor de nuevo, incluso yendo y
    // viniendo entre las mismas dos pantallas. Con esto, volver a una
    // pantalla visitada hace menos de 30s se siente instantáneo; una acción
    // que cambia datos (vender, anular, etc.) sigue invalidando su caché al
    // tiro vía revalidatePath, así que no se pierde información nueva.
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
