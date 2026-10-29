import { PDFDocument } from "pdf-lib";
export type AdjuntoExpediente = { nombre: string; bytes: Uint8Array; tipo: "png" | "jpg" | "pdf"; paginas?: number };
export function tipoAdjunto(bytes: Uint8Array): AdjuntoExpediente["tipo"] {
 if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) return "png";
 if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
 if (new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-")) return "pdf";
 throw new Error("El archivo no es un PNG, JPG o PDF válido.");
}
export async function crearPdfExpediente(paginas: readonly Uint8Array[], adjuntos: readonly AdjuntoExpediente[]) {
 const doc = await PDFDocument.create();
 doc.setTitle("Expediente de reembolso");
 async function imagen(bytes: Uint8Array, tipo: "png" | "jpg") {
  const img = tipo === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const page = doc.addPage([595.28, 841.89]);
  const scale = Math.min(555.28 / img.width, 801.89 / img.height);
  const width = img.width * scale, height = img.height * scale;
  page.drawImage(img, { x: (595.28 - width) / 2, y: 841.89 - 20 - height, width, height });
 }
 for (const pagina of paginas) await imagen(pagina, "png");
 for (const adjunto of adjuntos) {
  if (adjunto.tipo === "pdf") {
   const original = await PDFDocument.load(adjunto.bytes);
   if (!original.getPageCount()) throw new Error(`${adjunto.nombre}: el PDF no tiene páginas.`);
   const pages = await doc.copyPages(original, original.getPageIndices());
   pages.forEach(p => doc.addPage(p));
  } else await imagen(adjunto.bytes, adjunto.tipo);
 }
 if (!doc.getPageCount()) throw new Error("No hay documentos para descargar.");
 return doc.save();
}
