// Texto y links de WhatsApp, sin React para poder probarlo.

// Deja el texto SOLO con letras (con tildes y ñ), números y puntuación de
// teclado. Sin emojis: WhatsApp Web los recibe rotos desde el link y los
// muestra como "?" (pasó con el aviso de entrega de Mi Familia Educa).
export function normalizarParaWhatsapp(texto: string): string {
  const base = texto
    .normalize("NFC")
    .replace(/[\u2014\u2013\u2012\u2212]/g, "-")
    .replace(/[\u2018\u2019\u00b4`]/g, "'")
    .replace(/[\u201c\u201d\u00ab\u00bb]/g, '"')
    .replace(/[\u2022\u00b7]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00a0\u2007\u202f]/g, " ");
  let limpio = "";
  for (const ch of base) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x250 || ch === "\n") limpio += ch;
  }
  return limpio
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Con qué WhatsApp se abre cada mensaje. Se recuerda en cada aparato.
//  - auto: el que el teléfono tenga por defecto (wa.me).
//  - business: WhatsApp Business en Android (fuerza esa app aunque el
//    teléfono tenga también el WhatsApp normal).
//  - web: WhatsApp Web en el computador, con la cuenta que esté abierta ahí
//    (se vincula una vez con el número de Business).
export type ModoEnvio = "auto" | "business" | "web";

export function linkWhatsapp(modo: ModoEnvio, telefono: string, texto: string): string {
  const t = encodeURIComponent(texto);
  if (modo === "business") return `intent://send/?phone=${telefono}&text=${t}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;end`;
  if (modo === "web") return `https://web.whatsapp.com/send?phone=${telefono}&text=${t}`;
  return `https://wa.me/${telefono}?text=${t}`;
}

