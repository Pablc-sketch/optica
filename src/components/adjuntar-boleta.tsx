"use client";
import { useRef, useState } from "react";
import type { AdjuntoExpediente } from "@/lib/pdf-expediente";
export default function AdjuntarBoleta() {
 const [adjuntos, setAdjuntos] = useState<AdjuntoExpediente[]>([]);
 const [error, setError] = useState("");
 const [estado, setEstado] = useState("");
 const [ocupado, setOcupado] = useState(false);
 const bloqueo = useRef(false);
 async function descargar() {
  if (bloqueo.current) return;
  bloqueo.current = true; setOcupado(true); setError(""); setEstado("Preparando documentos…");
  try {
   const elementos = Array.from(document.querySelectorAll<HTMLElement>("[data-pdf-page]"));
   if (!elementos.length || elementos.some(e => e.dataset.pdfReady === "no")) throw new Error("Completa los datos pendientes del certificado o comprobante antes de descargar.");
   const [{ default: capturar }, { crearPdfExpediente }] = await Promise.all([import("html2canvas-pro"), import("@/lib/pdf-expediente")]);
   await document.fonts.ready;
   const paginas: Uint8Array[] = [];
   for (const [n, elemento] of elementos.entries()) {
    setEstado(`Preparando documento ${n + 1} de ${elementos.length}…`);
    const canvas = await capturar(elemento, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: 1024,
     onclone: (doc, clon) => {
      doc.querySelectorAll('[class~="print:hidden"]').forEach(e => e.remove());
      clon.style.width = "760px"; clon.style.maxWidth = "none"; clon.style.margin = "0";
      clon.style.boxShadow = "none";
     }
    });
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("No se pudo convertir un documento.")), "image/png"));
    paginas.push(new Uint8Array(await blob.arrayBuffer())); canvas.width = 0; canvas.height = 0;
   }
   setEstado("Uniendo boleta y respaldos…");
   const bytes = await crearPdfExpediente(paginas, adjuntos);
   const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" }));
   const a = document.createElement("a"); a.href = url; a.download = "Expediente-reembolso.pdf"; document.body.appendChild(a); a.click(); a.remove();
   setTimeout(() => URL.revokeObjectURL(url), 60000);
   setEstado("PDF generado. Revisa tus descargas.");
  } catch (err) { setError(err instanceof Error ? err.message : "No se pudo generar el PDF. Intenta nuevamente."); setEstado(""); }
  finally { bloqueo.current = false; setOcupado(false); }
 }
 return <section className="space-y-3 rounded-xl border p-4 print:hidden"><h2 className="font-bold">Adjuntar boleta y otros respaldos</h2>
 <p className="text-sm">Acepta PNG, JPG y PDF. Se unirán el certificado, comprobante, receta vinculada y todas las páginas de los archivos adjuntos. Los adjuntos duran esta sesión: descarga el PDF antes de cerrar.</p>
 <label className="block font-semibold">Seleccionar boleta o respaldos
 <input className="mt-2 block w-full" type="file" accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf" multiple disabled={ocupado} onChange={async e => {
  const input = e.currentTarget; const files = Array.from(input.files || []);
  if (!files.length || bloqueo.current) return;
  bloqueo.current = true; setError(""); setOcupado(true); setEstado("Leyendo archivos…");
  try {
   if (adjuntos.length + files.length > 20 || adjuntos.reduce((s,a) => s+a.bytes.length,0) + files.reduce((s,f) => s+f.size,0) > 60 * 1024 * 1024) throw new Error("Adjunta hasta 20 archivos y 60 MB en total.");
   const [{ tipoAdjunto }, { PDFDocument }] = await Promise.all([import("@/lib/pdf-expediente"), import("pdf-lib")]);
   const nuevos: AdjuntoExpediente[] = [];
   for (const file of files) {
    if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name}: máximo 15 MB por archivo.`);
    try {
     const bytes = new Uint8Array(await file.arrayBuffer()); const tipo = tipoAdjunto(bytes);
     // Se valida el contenido, incluso si Android entrega un MIME vacío.
     const prueba = tipo === "pdf" ? await PDFDocument.load(bytes) : await PDFDocument.create();
     if (tipo === "png") await prueba.embedPng(bytes);
     if (tipo === "jpg") await prueba.embedJpg(bytes);
     if (tipo === "pdf" && !prueba.getPageCount()) throw new Error("PDF sin páginas");
     nuevos.push({ nombre: file.name, bytes, tipo, paginas: tipo === "pdf" ? prueba.getPageCount() : 1 });
    } catch { throw new Error(`${file.name}: no se pudo abrir. Usa un PNG, JPG o PDF válido y sin contraseña.`); }
   }
   setAdjuntos(prev => [...prev, ...nuevos]); setEstado("Archivos adjuntados. Ya puedes descargar el PDF completo.");
  } catch (err) { setError(err instanceof Error ? err.message : "No se pudo adjuntar."); setEstado(""); }
  finally { bloqueo.current = false; setOcupado(false); input.value = ""; }
 }}/></label>
 {adjuntos.map((a,i) => <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-crema-claro p-2 text-sm"><span>{a.nombre} · {a.paginas} {a.paginas === 1 ? "página" : "páginas"}</span><button disabled={ocupado} className="underline" onClick={() => setAdjuntos(prev => prev.filter((_,n) => n !== i))}>Quitar</button></div>)}
 {error && <p role="alert" className="text-sm text-red-800">{error}</p>}<p role="status" className="text-sm">{estado}</p>
 <button disabled={ocupado} onClick={descargar} className="rounded-lg bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50">{ocupado ? "Preparando…" : "Descargar todo unido en PDF"}</button>
 </section>;
}
