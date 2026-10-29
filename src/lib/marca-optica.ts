export const MARCA_GLOBAL = {
 nombre: "Óptica Global",
 eslogan: "Visión sin fronteras",
 url: "https://lentiaapp.cl/optica-global",
 imagen: "/optica-global/opengraph-image?v=vision-sin-fronteras-1",
};
export function esOpticaGlobal(nombre: string): boolean {
 return nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === "optica global";
}
