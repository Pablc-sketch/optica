// Conversación de WhatsApp para tomar hora en un operativo. Es un menú con
// números (sin IA): predecible, barato y sin enviar datos de personas a
// terceros. Sin base de datos ni red, para poder probarlo; el webhook le
// pasa las funciones que leen y escriben.

export type OperativoAbierto = {
  id: string;
  nombre: string;
  fecha: string;
  fecha_fin: string | null;
  direccion: string | null;
  comuna: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  horas_libres: number;
};
export type HoraLibre = { fecha: string; hora: string; libres: number };
export type CitaVigente = { id: string; operativo: string; fecha: string; hora: string; direccion: string | null };
export type ResultadoAgendar = { ok: true; id: string } | { ok: false; error: "operativo" | "duplicada" | "sin_cupo" | string };

export type Estado =
  | { paso: "elegir_operativo"; ops: string[] }
  | { paso: "elegir_hora"; op: string; horas: [string, string][] }
  | { paso: "nombre"; op: string; fecha: string; hora: string }
  | { paso: "anular"; citas: string[] };

export type Fuente = {
  optica: string;
  operativos: () => Promise<OperativoAbierto[]>;
  horas: (operativoId: string) => Promise<HoraLibre[]>;
  agendar: (operativoId: string, fecha: string, hora: string, nombre: string) => Promise<ResultadoAgendar>;
  citas: () => Promise<CitaVigente[]>;
  cancelar: (citaId: string) => Promise<boolean>;
};

export const MAX_HORAS_LISTADAS = 20;

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function diaCorto(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return `${DIAS[fecha.getUTCDay()]} ${d} ${MESES[m - 1]}`;
}
const hhmm = (h: string | null) => (h ?? "").slice(0, 5);

function lugar(o: { direccion: string | null; comuna?: string | null }) {
  return [o.direccion, o.comuna].filter(Boolean).join(", ");
}

// Número elegido en un menú: acepta "2", "2.", " 2) ", "opción 2".
export function numeroElegido(texto: string, maximo: number): number | null {
  const m = /^\D{0,10}?(\d{1,2})\D{0,3}$/.exec(texto.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= maximo ? n : null;
}

// Nombre y apellido razonable: letras, espacios, apóstrofes y guiones.
export function nombreValido(texto: string): string | null {
  const t = texto.normalize("NFC").replace(/\s+/g, " ").trim();
  if (t.length < 3 || t.length > 80) return null;
  if (!/^[\p{L}][\p{L} '.-]*$/u.test(t)) return null;
  return t;
}

const pideAnular = (t: string) => /\b(anular|cancelar|cancela|anula)\b/i.test(t.normalize("NFD").replace(/[̀-ͯ]/g, ""));
const pideMenu = (t: string) => /^(0|menu|menú|inicio|volver|hola|buenas?|buenos dias|buenas tardes|buenas noches)\W*$/i.test(t.trim());

async function menuOperativos(f: Fuente, prefijo = ""): Promise<{ respuesta: string; estado: Estado | null }> {
  const ops = (await f.operativos()).filter((o) => o.horas_libres > 0);
  if (ops.length === 0) {
    return {
      respuesta: `${prefijo}Hola, te saluda ${f.optica}. Por ahora no tenemos operativos con horas disponibles por este medio. Vuelve a escribirnos pronto.`,
      estado: null,
    };
  }
  const lineas = ops.map((o, i) => {
    const dias = o.fecha_fin && o.fecha_fin !== o.fecha ? `${diaCorto(o.fecha)} al ${diaCorto(o.fecha_fin)}` : diaCorto(o.fecha);
    const donde = lugar(o);
    return `${i + 1}. ${o.nombre} - ${dias}, ${hhmm(o.hora_inicio)} a ${hhmm(o.hora_fin)}${donde ? ` (${donde})` : ""}`;
  });
  return {
    respuesta: `${prefijo}Hola, te saluda ${f.optica}. Para tomar hora de examen visual, responde con el número del operativo:\n\n${lineas.join("\n")}\n\nPara anular una hora escribe ANULAR.`,
    estado: { paso: "elegir_operativo", ops: ops.map((o) => o.id) },
  };
}

async function menuHoras(f: Fuente, opId: string): Promise<{ respuesta: string; estado: Estado | null }> {
  const horas = (await f.horas(opId)).slice(0, MAX_HORAS_LISTADAS);
  if (horas.length === 0) return menuOperativos(f, "Ese operativo ya no tiene horas libres.\n\n");
  let dia = "";
  const lineas: string[] = [];
  horas.forEach((h, i) => {
    if (h.fecha !== dia) {
      dia = h.fecha;
      lineas.push(`${lineas.length ? "\n" : ""}${diaCorto(h.fecha)}:`);
    }
    lineas.push(`${i + 1}. ${hhmm(h.hora)}`);
  });
  return {
    respuesta: `Elige tu hora respondiendo con el número:\n${lineas.join("\n")}\n\n0 para volver.`,
    estado: { paso: "elegir_hora", op: opId, horas: horas.map((h) => [h.fecha, h.hora]) },
  };
}

export async function responder(estado: Estado | null, texto: string, f: Fuente): Promise<{ respuesta: string; estado: Estado | null }> {
  const t = texto.trim();
  if (pideAnular(t)) {
    const citas = await f.citas();
    if (citas.length === 0) return { respuesta: "No tienes horas agendadas. Escribe MENU para ver los operativos.", estado: null };
    const lineas = citas.map((c, i) => `${i + 1}. ${c.operativo} - ${diaCorto(c.fecha)} ${hhmm(c.hora)}`);
    return {
      respuesta: `¿Cuál hora quieres anular? Responde con el número:\n${lineas.join("\n")}\n\n0 para volver.`,
      estado: { paso: "anular", citas: citas.map((c) => c.id) },
    };
  }
  if (!estado || pideMenu(t)) return menuOperativos(f);

  switch (estado.paso) {
    case "elegir_operativo": {
      const n = numeroElegido(t, estado.ops.length);
      if (!n) return menuOperativos(f, "No entendí. ");
      return menuHoras(f, estado.ops[n - 1]);
    }
    case "elegir_hora": {
      const n = numeroElegido(t, estado.horas.length);
      if (!n) return { respuesta: `Responde con un número del 1 al ${estado.horas.length}, o 0 para volver.`, estado };
      const [fecha, hora] = estado.horas[n - 1];
      return {
        respuesta: `Hora elegida: ${diaCorto(fecha)} a las ${hhmm(hora)}.\n¿A nombre de quién? Escribe nombre y apellido.`,
        estado: { paso: "nombre", op: estado.op, fecha, hora },
      };
    }
    case "nombre": {
      const nombre = nombreValido(t);
      if (!nombre) return { respuesta: "Escribe solo el nombre y apellido de la persona que se atenderá (o 0 para volver).", estado };
      const r = await f.agendar(estado.op, estado.fecha, estado.hora, nombre);
      if (r.ok) {
        const op = (await f.operativos()).find((o) => o.id === estado.op);
        const donde = op ? lugar(op) : "";
        return {
          respuesta: `Listo, ${nombre}. Tu hora quedó agendada:\n${op ? `${op.nombre}\n` : ""}${diaCorto(estado.fecha)} a las ${hhmm(estado.hora)}${donde ? `\n${donde}` : ""}\n\nSi no puedes asistir, escribe ANULAR.`,
          estado: null,
        };
      }
      if (r.error === "duplicada") return { respuesta: "Este número ya tiene una hora en ese operativo. Para cambiarla, escribe ANULAR y vuelve a agendar.", estado: null };
      if (r.error === "sin_cupo") return menuHoras(f, estado.op).then((m) => ({ ...m, respuesta: `Esa hora se acaba de llenar.\n\n${m.respuesta}` }));
      return menuOperativos(f, "Ese operativo ya no está disponible.\n\n");
    }
    case "anular": {
      const n = numeroElegido(t, estado.citas.length);
      if (!n) return { respuesta: `Responde con un número del 1 al ${estado.citas.length}, o 0 para volver.`, estado };
      const ok = await f.cancelar(estado.citas[n - 1]);
      return { respuesta: ok ? "Tu hora fue anulada. Escribe MENU si quieres tomar otra." : "Esa hora ya no estaba vigente.", estado: null };
    }
  }
}

// El estado guardado viene de la base: se valida antes de usarlo.
export function leerEstado(paso: string, datos: unknown): Estado | null {
  const d = (datos ?? {}) as Record<string, unknown>;
  const ids = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
  if (paso === "elegir_operativo" && ids(d.ops)) return { paso, ops: d.ops as string[] };
  if (paso === "anular" && ids(d.citas)) return { paso, citas: d.citas as string[] };
  if (paso === "elegir_hora" && typeof d.op === "string" && Array.isArray(d.horas)
    && d.horas.every((h) => Array.isArray(h) && h.length === 2 && h.every((x) => typeof x === "string"))) {
    return { paso, op: d.op, horas: d.horas as [string, string][] };
  }
  if (paso === "nombre" && typeof d.op === "string" && typeof d.fecha === "string" && typeof d.hora === "string") {
    return { paso, op: d.op, fecha: d.fecha, hora: d.hora };
  }
  return null;
}

// Teléfono como lo manda Meta (solo dígitos, con código de país).
export function telefonoValido(v: unknown): string | null {
  return typeof v === "string" && /^[0-9]{8,15}$/.test(v) ? v : null;
}
