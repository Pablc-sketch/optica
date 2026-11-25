import type { AtencionTerreno, ResultadoTerreno, SolicitudTerreno, TipoAtencion } from "./datos-terreno";

const ALMACEN = "atenciones";
export const ATENCIONES_EVENTO = "lentia-atenciones-cambio";
let base: Promise<IDBDatabase> | undefined;
let canal: BroadcastChannel | undefined;
let plazoEnvio = 8000;

function abrir() {
  base ??= new Promise<IDBDatabase>((resolve, reject) => {
    const solicitud = indexedDB.open("lentia-terreno", 1);
    solicitud.onupgradeneeded = () => {
      solicitud.result.createObjectStore(ALMACEN, { keyPath: ["usuarioId", "id"] }).createIndex("usuario", "usuarioId");
    };
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  }).catch((error: unknown) => {
    base = undefined;
    throw error;
  });
  return base;
}

function conectarCanal() {
  if (!canal && typeof BroadcastChannel !== "undefined") {
    canal = new BroadcastChannel(ATENCIONES_EVENTO);
    canal.onmessage = () => window.dispatchEvent(new Event(ATENCIONES_EVENTO));
  }
  return canal;
}

export function suscribirAtenciones(cambio: () => void) {
  conectarCanal();
  window.addEventListener(ATENCIONES_EVENTO, cambio);
  return () => window.removeEventListener(ATENCIONES_EVENTO, cambio);
}

async function modificar(escritura: (almacen: IDBObjectStore) => void) {
  const db = await abrir();
  await new Promise<void>((resolve, reject) => {
    const transaccion = db.transaction(ALMACEN, "readwrite");
    transaccion.oncomplete = () => resolve();
    transaccion.onabort = () => reject(transaccion.error);
    escritura(transaccion.objectStore(ALMACEN));
  });
  conectarCanal()?.postMessage(null);
  window.dispatchEvent(new Event(ATENCIONES_EVENTO));
}

export async function leerAtenciones(usuarioId: string): Promise<AtencionTerreno[]> {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const lectura = db.transaction(ALMACEN).objectStore(ALMACEN).index("usuario").getAll(usuarioId);
    lectura.onsuccess = () => resolve((lectura.result as AtencionTerreno[]).sort((a, b) => a.creada.localeCompare(b.creada)));
    lectura.onerror = () => reject(lectura.error);
  });
}

export async function encolarAtencion(usuarioId: string, tipo: TipoAtencion, formulario: FormData, id: string) {
  const campos = Object.fromEntries(Array.from(formulario, ([campo, valor]) => [campo, String(valor)]));
  const atencion: AtencionTerreno = { id, usuarioId, tipo, campos, creada: new Date().toISOString() };
  await modificar(almacen => almacen.put(atencion));
}

export async function reintentarAtencion(atencion: AtencionTerreno) {
  await modificar(almacen => almacen.put({ ...atencion, error: undefined }));
}

export async function enviarTerreno(solicitud: SolicitudTerreno): Promise<ResultadoTerreno> {
  const respuesta = await fetch("/api/terreno", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(solicitud),
    redirect: "error", signal: AbortSignal.timeout(plazoEnvio),
  }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "TimeoutError") plazoEnvio = Math.min(plazoEnvio * 2, 30_000);
    throw error;
  });
  if (respuesta.status !== 200) throw new Error("Sin confirmación del servidor");
  const resultado = await respuesta.json() as ResultadoTerreno;
  if (!resultado.ok && resultado.transitorio) throw new Error(resultado.error);
  return resultado;
}

async function enviarAtenciones(usuarioId: string) {
  const atenciones = await leerAtenciones(usuarioId);
  const bloqueadas = new Set(atenciones.filter(a => a.error).map(a => a.id));
  const ordenadas = [...atenciones.filter(a => a.tipo === "paciente"), ...atenciones.filter(a => a.tipo === "receta")];
  for (const atencion of ordenadas) {
    if (atencion.error || bloqueadas.has(atencion.campos.paciente_id)) continue;
    const resultado = await enviarTerreno(atencion);
    if (resultado.ok) {
      await modificar(almacen => almacen.delete([usuarioId, atencion.id]));
    } else {
      bloqueadas.add(atencion.id);
      await modificar(almacen => almacen.put({ ...atencion, error: resultado.error }));
    }
  }
}

export async function sincronizarAtenciones(usuarioId: string) {
  if (navigator.locks) await navigator.locks.request(`lentia-atenciones-${usuarioId}`, () => enviarAtenciones(usuarioId));
  else await enviarAtenciones(usuarioId);
}
