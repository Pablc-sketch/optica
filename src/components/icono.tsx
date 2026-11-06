import type { SVGProps } from "react";

const trazos = {
  inicio: "M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3Z",
  venta: "M3 4h2l3 12h11l2-9H6m3 13h.01m9 0h.01",
  cobros: "M3 5h18v14H3zM3 10h18m-14 5h4",
  entregas: "M3 7 12 3l9 4v10l-9 4-9-4ZM3 7l9 4 9-4m-9 4v10M7.5 5l9 4",
  caja: "M3 6h18v14H3zm2 0V4h13m3 7h-5v4h5",
  pacientes: "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m16 0v-2a4 4 0 0 0-3-3.87M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm3-3.87a4 4 0 0 1 0 7.75",
  agenda: "M3 6h18v15H3zm0 5h18M8 3v6m8-6v6m-9 6h2m3 0h2m3 0h1m-11 3h2m3 0h2",
  ordenes: "M9 4H5v17h14V4h-4M9 3h6v4H9zm0 9h6m-6 4h6",
  inventario: "M4 4h16v5H4zm1 5v11h14V9m-9 5h4",
  laboratorio: "M9 3h6m-5 0v7l-6 9a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3m-6 12h8",
  reembolsos: "M8 5 4 9l4 4M4 9h11a5 5 0 0 1 0 10h-3",
  configuracion: "M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4",
  opticas: "M3 21h18M5 21V8l8-5v18m0-12h6v12M8 11h2m-2 4h2m5-1h2m-2 3h2",
  flecha: "M4 12h15m-6-6 6 6-6 6",
  salir: "M10 4H4v16h6m4-12 4 4-4 4m-5-4h9",
  mas: "M5 12h.01m7 0h.01m7 0h.01",
} as const;

export type NombreIcono = keyof typeof trazos;

export default function Icono({ nombre, ...props }: SVGProps<SVGSVGElement> & { nombre: NombreIcono }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d={trazos[nombre]} />
    </svg>
  );
}
