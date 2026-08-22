"use client";

import { useState } from "react";

// Genera el PDF en el navegador (sin pasar por el diálogo de impresión del
// sistema), con el mismo contenido que se ve en pantalla. jsPDF no sabe leer
// SVG, así que el logo solo se incluye cuando la óptica subió uno propio en
// PNG; si no, el PDF queda sin logo (no con el ícono genérico de la app).
type DatosReceta = {
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

async function imagenABase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const lector = new FileReader();
      lector.onloadend = () => resolve(lector.result as string);
      lector.onerror = () => resolve(null);
      lector.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export default function DescargarPdf({ datos }: { datos: DatosReceta }) {
  const [generando, setGenerando] = useState(false);

  async function descargar() {
    setGenerando(true);
    try {
      const [{ default: jsPDF }, autoTableMod] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const autoTable = autoTableMod.default;

      const doc = new jsPDF();
      let y = 20;

      if (datos.logoUrl) {
        const base64 = await imagenABase64(datos.logoUrl);
        if (base64) {
          try {
            doc.addImage(base64, "PNG", 15, 12, 18, 18);
          } catch {
            // Si el archivo no es un PNG válido para jsPDF, se sigue sin logo.
          }
        }
      }

      const xTexto = datos.logoUrl ? 38 : 15;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(datos.opticaNombre, xTexto, 20);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const contacto = [datos.opticaDireccion, datos.opticaTelefono].filter(Boolean).join(" · ");
      if (contacto) doc.text(contacto, xTexto, 26);

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Receta óptica", 195, 18, { align: "right" });
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(datos.fecha, 195, 24, { align: "right" });

      y = 36;
      doc.setDrawColor(60, 60, 60);
      doc.line(15, y, 195, y);
      y += 8;

      doc.setFontSize(10);
      const filaDatos = [
        `Paciente: ${datos.pacienteNombre}`,
        `RUT: ${datos.rut}`,
        datos.edad !== null ? `Edad: ${datos.edad} años` : null,
        `Tipo de visión: ${datos.tipoVision}`,
      ].filter(Boolean) as string[];
      filaDatos.forEach((linea, i) => {
        doc.text(linea, 15 + (i % 2) * 90, y + Math.floor(i / 2) * 6);
      });
      y += Math.ceil(filaDatos.length / 2) * 6 + 6;

      autoTable(doc, {
        startY: y,
        head: [["", "Esfera", "Cilindro", "Eje", "Agudeza visual"]],
        body: [
          ["OD", datos.od.esfera, datos.od.cilindro, datos.od.eje, datos.od.av],
          ["OI", datos.oi.esfera, datos.oi.cilindro, datos.oi.eje, datos.oi.av],
        ],
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [235, 235, 235], textColor: 20 },
        margin: { left: 15, right: 15 },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 6;

      doc.setFontSize(9);
      doc.text(`DP: ${datos.dp} mm · Altura: ${datos.altura} mm`, 15, y);
      doc.text(`ADD: ${datos.add}`, 195, y, { align: "right" });
      y += 8;

      if (datos.alertas.length > 0 || datos.observaciones.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text("OBSERVACIONES", 15, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        if (datos.alertas.length > 0) {
          const texto = doc.splitTextToSize(datos.alertas.join(" · "), 180);
          doc.text(texto, 15, y);
          y += texto.length * 5;
        }
        datos.observaciones.forEach((o) => {
          const texto = doc.splitTextToSize(o, 180);
          doc.text(texto, 15, y);
          y += texto.length * 5;
        });
        y += 3;
      }

      if (datos.notas) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("Notas de la receta:", 15, y);
        doc.setFont("helvetica", "normal");
        const texto = doc.splitTextToSize(datos.notas, 165);
        doc.text(texto, 47, y);
        y += texto.length * 5 + 4;
      }

      y = Math.max(y + 25, 250);
      doc.setDrawColor(180, 180, 180);
      doc.line(15, y, 90, y);
      doc.line(120, y, 195, y);
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text("Firma del profesional", 52.5, y + 4, { align: "center" });
      doc.text("Firma y timbre", 157.5, y + 4, { align: "center" });

      doc.save(`receta-${datos.pacienteNombre.replace(/\s+/g, "-").toLowerCase()}.pdf`);
    } finally {
      setGenerando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={descargar}
      disabled={generando}
      className="rounded-lg border border-tinta-suave/30 px-3 py-1.5 text-sm font-medium text-tinta-suave transition hover:bg-crema disabled:opacity-60"
    >
      {generando ? "Generando…" : "⬇️ Guardar como PDF"}
    </button>
  );
}
