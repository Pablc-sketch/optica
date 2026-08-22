// Forma común de los datos de una receta ya formateados para mostrar/
// imprimir, compartida por el PDF (jsPDF), el correo (HTML de Resend) y el
// texto plano (link de Gmail) — así los tres salen siempre iguales.
export type DatosRecetaImpresion = {
  opticaNombre: string;
  opticaDireccion: string | null;
  opticaTelefono: string | null;
  logoUrl: string | null;
  pacienteNombre: string;
  rut: string;
  edad: number | null;
  tipoVision: string;
  fecha: string;
  od: { esfera: string; cilindro: string; eje: string; av: string };
  oi: { esfera: string; cilindro: string; eje: string; av: string };
  dp: string;
  altura: string;
  add: string;
  alertas: string[];
  observaciones: string[];
  notas: string | null;
};

export function nombreArchivoReceta(pacienteNombre: string): string {
  return `receta-${pacienteNombre.replace(/\s+/g, "-").toLowerCase()}.pdf`;
}

// Alternativa en texto plano para el link de Gmail (ese cuadro de "compose"
// solo acepta texto, no HTML), alineada con espacios en columnas fijas. En
// Gmail no queda tan cuadrada como la tabla del correo automático o el PDF
// porque el compose usa una fuente proporcional, pero es lo más parecido
// que se puede lograr sin HTML.
function col(s: string, ancho: number): string {
  return s.length >= ancho ? s + " " : s.padEnd(ancho);
}

export function construirTextoReceta(datos: DatosRecetaImpresion): string {
  return [
    `${datos.opticaNombre} — Receta óptica`,
    `Fecha: ${datos.fecha}`,
    "",
    `Paciente: ${datos.pacienteNombre}`,
    `RUT: ${datos.rut}`,
    datos.edad !== null ? `Edad: ${datos.edad} años` : null,
    `Tipo de visión: ${datos.tipoVision}`,
    "",
    col("", 5) + col("Esfera", 10) + col("Cilindro", 10) + col("Eje", 8) + "Agudeza visual",
    col("OD", 5) + col(datos.od.esfera, 10) + col(datos.od.cilindro, 10) + col(datos.od.eje, 8) + datos.od.av,
    col("OI", 5) + col(datos.oi.esfera, 10) + col(datos.oi.cilindro, 10) + col(datos.oi.eje, 8) + datos.oi.av,
    "",
    `DP: ${datos.dp} mm · Altura: ${datos.altura} mm`,
    `ADD: ${datos.add}`,
    datos.alertas.length > 0 ? `\nObservaciones: ${datos.alertas.join(" · ")}` : null,
    datos.observaciones.length > 0 ? datos.observaciones.join("\n") : null,
    datos.notas ? `\nNotas: ${datos.notas}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
