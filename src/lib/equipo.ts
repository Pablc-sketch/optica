// Personal, equipos y operativos: textos y lectura de formularios.
// Código puro, para probarlo sin base de datos.
export const FUNCIONES = [
  { valor: "tecnologo", titulo: "Tecnólogo/a" },
  { valor: "vendedor", titulo: "Vendedor/a" },
  { valor: "coordinador", titulo: "Coordinador/a" },
] as const;
export type Funcion = (typeof FUNCIONES)[number]["valor"];

export const CATEGORIAS_COSTO = [
  { valor: "viaticos", titulo: "Viáticos" },
  { valor: "hospedaje", titulo: "Hospedaje" },
  { valor: "transporte", titulo: "Transporte" },
  { valor: "arriendo", titulo: "Arriendos" },
  { valor: "personal", titulo: "Personal" },
  { valor: "equipos", titulo: "Equipos" },
  { valor: "otros", titulo: "Otros" },
] as const;

export type OperativoConEquipo = {
  id: string;
  nombre: string;
  direccion: string;
  notas: string;
  fecha: string;
  fecha_fin: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  personas: { id: string; funcion: Funcion }[];
  kits: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

// Campos: id, nombre, direccion, notas, fecha, fecha_fin, jornada
// ("completa" o "horario"), hora_inicio, hora_fin, persona (una por cada
// persona marcada) con funcion_<id>, y kit (uno por cada kit marcado).
export function leerFormularioOperativo(datos: FormData): OperativoConEquipo | { error: string } {
  const texto = (k: string) => String(datos.get(k) ?? "").trim();
  const id = texto("id");
  const nombre = texto("nombre");
  const fecha = texto("fecha");
  const fechaFin = texto("fecha_fin") || null;
  const conHorario = texto("jornada") === "horario";
  const horaInicio = conHorario ? texto("hora_inicio") : "";
  const horaFin = conHorario ? texto("hora_fin") : "";
  if (!UUID.test(id)) return { error: "Recarga la página e intenta de nuevo." };
  if (!nombre || nombre.length > 160) return { error: "Escribe el nombre del operativo." };
  if (!FECHA.test(fecha) || (fechaFin && !FECHA.test(fechaFin))) return { error: "Revisa las fechas." };
  if (fechaFin && fechaFin < fecha) return { error: "La fecha final no puede ser anterior a la inicial." };
  if (conHorario && (!HORA.test(horaInicio) || !HORA.test(horaFin))) return { error: "Indica hora de inicio y de término." };
  if (conHorario && !fechaFin && horaInicio >= horaFin) return { error: "La hora de término debe ser posterior al inicio." };

  const personas: OperativoConEquipo["personas"] = [];
  for (const p of datos.getAll("persona").map(String)) {
    if (!UUID.test(p)) return { error: "Revisa el personal elegido." };
    const funcion = String(datos.get(`funcion_${p}`) ?? "");
    if (!FUNCIONES.some((f) => f.valor === funcion)) return { error: "Elige la función de cada persona." };
    if (personas.some((x) => x.id === p)) continue;
    personas.push({ id: p, funcion: funcion as Funcion });
  }
  const kits = [...new Set(datos.getAll("kit").map(String))];
  if (kits.some((k) => !UUID.test(k))) return { error: "Revisa los kits elegidos." };

  return {
    id,
    nombre,
    direccion: texto("direccion").slice(0, 220),
    notas: texto("notas").slice(0, 2000),
    fecha,
    fecha_fin: fechaFin,
    hora_inicio: conHorario ? horaInicio : null,
    hora_fin: conHorario ? horaFin : null,
    personas,
    kits,
  };
}

// El tramo que ocupa un operativo, igual que tramo_operativo() en la base:
// días completos sin horario; con horario, de la hora de inicio del primer
// día a la de término del último. Sirve para mostrar quién está ocupado.
export function tramoOperativo(o: { fecha: string; fecha_fin: string | null; hora_inicio: string | null; hora_fin: string | null }): [string, string] {
  const fin = o.fecha_fin ?? o.fecha;
  const hi = o.hora_inicio?.slice(0, 5), hf = o.hora_fin?.slice(0, 5);
  if (hi && hf && `${o.fecha}T${hi}` < `${fin}T${hf}`) return [`${o.fecha}T${hi}`, `${fin}T${hf}`];
  const siguiente = new Date(`${fin}T00:00:00Z`);
  siguiente.setUTCDate(siguiente.getUTCDate() + 1);
  return [`${o.fecha}T00:00`, `${siguiente.toISOString().slice(0, 10)}T00:00`];
}

export function seCruzan(a: [string, string], b: [string, string]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}
