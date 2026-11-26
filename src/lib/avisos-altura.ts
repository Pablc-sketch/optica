export const COOKIE_AVISOS_ALTURA = "lentia-avisos-altura";

export type AvisoAltura = {
  id: string;
  otId: string;
  folio: number;
  paciente: string;
  sede: string | null;
  tipo: "Bifocal" | "Multifocal";
  par: number;
};

export function tipoConAltura(tipo: string | null | undefined) {
  switch (tipo?.trim().toLowerCase()) {
    case "bifocal": return "Bifocal";
    case "multifocal": return "Multifocal";
    default: return null;
  }
}
