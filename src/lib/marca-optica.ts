export const MARCA_GLOBAL = {
 nombre: "Óptica Global",
 eslogan: "Visión sin fronteras",
 url: "https://lentiaapp.cl/optica-global",
 imagen: "/optica-global/opengraph-image",
};
export function esOpticaGlobal(nombre: string): boolean {
 return nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === "optica global";
}
export function agregarTarjetaGlobal(texto: string): string {
 return texto.includes(MARCA_GLOBAL.url) ? texto : `${MARCA_GLOBAL.url}\n\n${texto}`;
}
