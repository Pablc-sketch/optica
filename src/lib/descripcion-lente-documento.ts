// Nombre legible en el detalle comercial, sin cambiar la receta ni el catálogo.
export function descripcionLenteDocumento(texto: string): string {
 return texto.replace(/multifocal(?:es)?/gi, "lejos y cerca");
}
