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

// Alternativa en texto plano para el link de Gmail: ese cuadro de "compose"
// solo acepta texto, no HTML ni colores (limitación de Gmail, no hay forma
// de mandar la tabla a color por ese link). Para que igual se vea como una
// rejilla en vez de texto suelto, se arma con caracteres de línea (┌─┬─┐):
// no queda perfecto porque Gmail usa una fuente proporcional (no
// monoespaciada), pero es lo más parecido a una tabla que se puede lograr
// sin HTML.
function construirTablaTexto(encabezados: string[], filas: string[][]): string {
  const anchos = encabezados.map((h, i) => Math.max(h.length, ...filas.map((f) => f[i].length)));
  const linea = (izq: string, medio: string, der: string) =>
    izq + anchos.map((a) => "─".repeat(a + 2)).join(medio) + der;
  const fila = (celdas: string[]) => "│ " + celdas.map((c, i) => c.padEnd(anchos[i])).join(" │ ") + " │";

  return [linea("┌", "┬", "┐"), fila(encabezados), linea("├", "┼", "┤"), ...filas.map(fila), linea("└", "┴", "┘")].join(
    "\n"
  );
}

export function construirTextoReceta(datos: DatosRecetaImpresion): string {
  const tabla = construirTablaTexto(
    ["", "Esfera", "Cilindro", "Eje", "Agudeza visual"],
    [
      ["OD", datos.od.esfera, datos.od.cilindro, datos.od.eje, datos.od.av],
      ["OI", datos.oi.esfera, datos.oi.cilindro, datos.oi.eje, datos.oi.av],
    ]
  );

  return [
    `${datos.opticaNombre} — Receta óptica`,
    `Fecha: ${datos.fecha}`,
    "",
    `Paciente: ${datos.pacienteNombre}`,
    `RUT: ${datos.rut}`,
    datos.edad !== null ? `Edad: ${datos.edad} años` : null,
    `Tipo de visión: ${datos.tipoVision}`,
    "",
    tabla,
    "",
    `DP: ${datos.dp} mm · Altura: ${datos.altura} mm · ADD: ${datos.add}`,
    datos.alertas.length > 0 ? `\nObservaciones: ${datos.alertas.join(" · ")}` : null,
    datos.observaciones.length > 0 ? datos.observaciones.join("\n") : null,
    datos.notas ? `\nNotas: ${datos.notas}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
