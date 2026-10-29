"use client";
import { useState } from "react";
export default function AdjuntarBoleta() {
 const [imagenes, setImagenes] = useState<{ nombre: string; url: string }[]>([]);
 const [error, setError] = useState("");
 const [cargando, setCargando] = useState(false);
 return <section><div className="space-y-3 rounded-xl border p-4 print:hidden"><h2 className="font-bold">Adjuntar boleta y otros respaldos</h2><p className="text-sm">Selecciona fotos JPG, PNG o WebP de la boleta, receta u otros respaldos. Se incorporan al PDF de esta sesión; vuelve a seleccionarlas si cierras la página.</p><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={cargando} aria-label="Imágenes de boleta y respaldos" onChange={async e => {
 const input = e.currentTarget; const archivos = Array.from(input.files || []); setError(""); setCargando(true);
 try {
 const nuevas: { nombre: string; url: string }[] = [];
 for (const file of archivos) {
 if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024) throw new Error("Usa JPG, PNG o WebP de hasta 15 MB por imagen.");
 const url = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("No se pudo leer la imagen.")); reader.readAsDataURL(file); });
 await new Promise<void>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(); img.onerror = () => reject(new Error("La imagen no se puede abrir.")); img.src = url; });
 nuevas.push({ nombre: file.name, url });
 }
 setImagenes(prev => [...prev, ...nuevas]);
 } catch (err) { setError(err instanceof Error ? err.message : "No se pudo adjuntar."); } finally { setCargando(false); input.value = ""; }
 }}/>{error && <p role="alert">{error}</p>}{imagenes.map((img, i) => <p key={i}>{img.nombre} <button className="underline" onClick={() => setImagenes(prev => prev.filter((_, n) => n !== i))}>Quitar</button></p>)}<button disabled={cargando} onClick={async () => { await Promise.all(Array.from(document.images).map(i => i.decode().catch(() => {}))); window.print(); }} className="rounded-lg bg-brand px-4 py-3 font-semibold text-white">Guardar expediente completo en PDF</button><p className="text-xs">En la ventana de impresión selecciona “Guardar como PDF”. Revisa que el folio, las fechas y los originales correspondan a la misma compra.</p></div>
 {imagenes.map((img, i) => <div key={i} className="mt-4 print:break-before-page print:break-inside-avoid">
{/* Imágenes locales elegidas por el usuario, sin optimizador remoto. */}
{/* eslint-disable-next-line @next/next/no-img-element */}
<img src={img.url} alt={`Respaldo ${i + 1}: ${img.nombre}`} className="mx-auto max-h-[250mm] max-w-full object-contain"/></div>)}
 </section>;
}
