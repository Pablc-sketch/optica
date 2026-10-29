import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { crearPdfExpediente, tipoAdjunto } from "../src/lib/pdf-expediente";
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=", "base64"));
const jpg = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAEAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==", "base64"));
it("reconoce archivos por contenido aunque Android no entregue MIME", () => {
 expect(tipoAdjunto(png)).toBe("png");
 expect(tipoAdjunto(new Uint8Array([255,216,255,224]))).toBe("jpg");
 expect(tipoAdjunto(new TextEncoder().encode("%PDF-1.7"))).toBe("pdf");
 expect(() => tipoAdjunto(new TextEncoder().encode("no es un PDF"))).toThrow();
});
it("une certificado, imagen y todas las páginas de la boleta PDF en orden", async () => {
 const boleta = await PDFDocument.create();
 boleta.addPage([300,400]); boleta.addPage([320,420]);
 const bytes = await crearPdfExpediente([png], [
 { nombre: "imagen.PNG", bytes: png, tipo: "png" },
 { nombre: "foto.jpg", bytes: jpg, tipo: "jpg" },
 { nombre: "boleta.pdf", bytes: await boleta.save(), tipo: "pdf" },
 ]);
 const pdf = await PDFDocument.load(bytes);
 expect(pdf.getPageCount()).toBe(5);
 expect(pdf.getPage(3).getWidth()).toBe(300);
 expect(pdf.getPage(4).getWidth()).toBe(320);
});
it("rechaza exportaciones sin documentos", async () => {
 await expect(crearPdfExpediente([], [])).rejects.toThrow("No hay documentos");
});
