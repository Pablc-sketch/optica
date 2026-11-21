// ¿Este mensaje de WhatsApp es una inscripción? ¿A qué operativo? ¿Quién?
// Todo con reglas, dentro de Lentia: el texto, los nombres y los teléfonos
// NO se mandan a Claude ni a ningún otro servicio de IA. Sin red ni base de
// datos, para poder probarlo.

export type OperativoProximo = {
  id: string;
  nombre: string;
  fecha: string; // AAAA-MM-DD
  fecha_fin: string | null;
  comuna: string | null;
  direccion: string | null;
  sectores: string | null;
};

export type SugerenciaLocal = {
  operativo_id: string | null; // null = hay duda
  candidatos: string[];
  nombre: string | null;
  nombre_origen: "mensaje" | "perfil" | null;
  lugar: string | null;
};

const normal = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").replace(/\s+/g, " ").trim();

const contiene = (texto: string, frase: string) => ` ${texto} `.includes(` ${frase} `);

// Palabras que no identifican un lugar por sí solas.
const GENERICAS = new Set([
  "junta", "vecinos", "vecinal", "de", "del", "la", "el", "los", "las", "y", "en", "sede", "operativo", "operativos",
  "condominio", "villa", "poblacion", "colegio", "escuela", "liceo", "jardin", "sala", "cuna", "apr", "comite",
  "agua", "potable", "rural", "club", "centro", "comunitario", "social", "supermercado", "plaza", "parque", "calle",
  "avenida", "av", "pasaje", "n", "nro", "numero", "unidad", "vecinal", "comunal", "municipal", "salud", "cesfam",
  "posta", "iglesia", "capilla", "san", "santa", "lo", "sector", "barrio", "dia", "optica", "examen", "visual",
]);

// Comienzos de palabra que indican que quieren atenderse.
const INTENCION = [
  "inscrib", "inscripc", "anot", "agend", "reserv", "cupo", "hora", "operativo", "examen", "lente", "receta",
  "asistir", "atender", "atiend", "atencion", "oftalm", "control", "medir", "operat",
];
const FRASES_INTENCION = ["quiero ir", "puedo ir", "como participo", "me interesa"];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function esInscripcion(texto: string): boolean {
  const t = normal(texto);
  const palabras = t.split(" ");
  return palabras.some((w) => INTENCION.some((k) => w.startsWith(k))) || FRASES_INTENCION.some((f) => contiene(t, f));
}

function terminosDe(o: OperativoProximo): { frases: string[]; palabras: string[]; comuna: string | null } {
  const frases = new Set<string>();
  const palabras = new Set<string>();
  const fuentes = [o.nombre, ...(o.sectores ?? "").split(/[,;\n/]+|\s+y\s+/)];
  for (const f of fuentes) {
    const n = normal(f);
    if (!n) continue;
    const propias = n.split(" ").filter((w) => w.length >= 4 && !GENERICAS.has(w) && !/^\d+$/.test(w));
    if (propias.length) frases.add(propias.join(" "));
    for (const w of propias) palabras.add(w);
  }
  return { frases: [...frases], palabras: [...palabras], comuna: o.comuna ? normal(o.comuna) : null };
}


// Fechas que nombra el mensaje: «28/11», «28 de noviembre», «el 28».
function fechasMencionadas(t: string): Set<string> {
  const out = new Set<string>();
  const pad = (n: number) => String(n).padStart(2, "0");
  for (const m of t.matchAll(/\b(\d{1,2}) (\d{1,2})\b/g)) {
    const d = Number(m[1]), mes = Number(m[2]);
    if (d >= 1 && d <= 31 && mes >= 1 && mes <= 12) out.add(`${pad(mes)}-${pad(d)}`);
  }
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2}) de (${MESES.join("|")})\\b`, "g"))) {
    out.add(`${pad(MESES.indexOf(m[2]) + 1)}-${pad(Number(m[1]))}`);
  }
  return out;
}

const diasDe = (o: OperativoProximo): string[] => {
  const fin = o.fecha_fin && o.fecha_fin > o.fecha ? o.fecha_fin : o.fecha;
  const out: string[] = [];
  for (let d = new Date(`${o.fecha}T12:00:00Z`); d.toISOString().slice(0, 10) <= fin && out.length < 31; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(5, 10));
  }
  return out;
};

// Puntaje de cada operativo según lo que dice el mensaje.
export function puntajes(texto: string, ops: OperativoProximo[]): { op: OperativoProximo; puntos: number; lugar: string | null }[] {
  const t = normal(texto);
  const fechas = fechasMencionadas(t);
  return ops.map((op) => {
    const { frases, palabras, comuna } = terminosDe(op);
    let puntos = 0;
    let lugar: string | null = null;
    const frase = frases.filter((f) => f.includes(" ") && contiene(t, f)).sort((a, b) => b.length - a.length)[0];
    if (frase) { puntos += 3; lugar = frase; }
    const palabra = palabras.filter((w) => contiene(t, w)).sort((a, b) => b.length - a.length)[0];
    if (palabra) { puntos += 2; lugar ??= palabra; }
    if (comuna && contiene(t, comuna)) { puntos += 1; lugar ??= comuna; }
    if (fechas.size && diasDe(op).some((d) => fechas.has(d))) puntos += 1;
    return { op, puntos, lugar };
  });
}

const PALABRAS_NO_NOMBRE = new Set([
  "de", "del", "la", "el", "y", "e", "tengo", "vivo", "quiero", "para", "a", "en", "soy", "con", "mi", "su", "por", "que",
  "hola", "buenas", "buenos", "gracias", "anos", "año", "años", "y", "me", "les", "los", "las", "un", "una", "inscribir",
  "inscribirme", "ir", "al", "operativo", "sector", "villa", "junta",
]);

const capitalizar = (w: string) => w.charAt(0).toLocaleUpperCase("es-CL") + w.slice(1).toLocaleLowerCase("es-CL");

// Nombre dicho en el mensaje: «me llamo…», «mi nombre es…», «soy…» (no «soy de…»),
// «a nombre de…», «nombre: …». Hasta 4 palabras de letras.
export function nombreDelMensaje(texto: string): string | null {
  const limpio = texto.replace(/\s+/g, " ");
  const m = /(?:me llamo|mi nombre es|a nombre de|nombre\s*:|soy)\s+([^\d,.;:!?\n()]+)/i.exec(limpio);
  if (!m) return null;
  const palabras: string[] = [];
  for (const w of m[1].trim().split(" ")) {
    const base = normal(w);
    if (!/^[\p{L}'-]+$/u.test(w) || PALABRAS_NO_NOMBRE.has(base)) break;
    palabras.push(capitalizar(w));
    if (palabras.length === 4) break;
  }
  return palabras.length >= 1 && palabras.join(" ").length >= 3 ? palabras.join(" ") : null;
}

// Decide la sugerencia. null = no es inscripción (el mensaje solo se guarda).
export function sugerenciaDeMensaje(texto: string, nombrePerfil: string | null, ops: OperativoProximo[]): SugerenciaLocal | null {
  if (ops.length === 0) return null;
  const pts = puntajes(texto, ops).sort((a, b) => b.puntos - a.puntos || a.op.fecha.localeCompare(b.op.fecha));
  const max = pts[0]?.puntos ?? 0;
  const intencion = esInscripcion(texto);
  // Sin intención ni lugar reconocible: es una conversación normal.
  if (!intencion && max < 2) return null;
  const nombreMsj = nombreDelMensaje(texto);
  const perfil = (nombrePerfil ?? "").replace(/\s+/g, " ").trim().slice(0, 100) || null;
  const nombre = nombreMsj ?? perfil;
  const base = { nombre, nombre_origen: nombreMsj ? ("mensaje" as const) : perfil ? ("perfil" as const) : null };
  const empatados = pts.filter((p) => p.puntos === max);
  // Un solo operativo claramente mejor (lugar reconocido): sugerencia directa.
  if (max >= 2 && empatados.length === 1) {
    return { ...base, operativo_id: empatados[0].op.id, candidatos: [], lugar: empatados[0].lugar };
  }
  // Duda: varios operativos igual de posibles, o ninguno reconocido.
  const candidatos = (max >= 1 ? empatados : pts).map((p) => p.op.id).slice(0, 20);
  return { ...base, operativo_id: null, candidatos, lugar: max >= 1 ? empatados[0].lugar : null };
}

// Teléfono escrito a mano → formato de WhatsApp (código de país, solo dígitos).
// "9 1234 5678" o "+56 9 1234 5678" → "56912345678".
export function normalizarTelefonoChile(v: string): string | null {
  const d = v.replace(/\D/g, "");
  if (/^9\d{8}$/.test(d)) return "56" + d;
  if (/^\d{8}$/.test(d)) return "569" + d;
  if (/^\d{8,15}$/.test(d)) return d;
  return null;
}
