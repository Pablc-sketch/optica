import { describe, expect, it } from "vitest";
import { esInscripcion, nombreDelMensaje, normalizarTelefonoChile, sugerenciaDeMensaje, type OperativoProximo } from "@/lib/whatsapp-inscripcion";

// Operativos ficticios: dos sedes el MISMO día en la misma comuna, y la
// misma sede en dos fechas.
const LABRADOR: OperativoProximo = { id: "op-labrador", nombre: "Junta de Vecinos Labrador", fecha: "2030-05-10", fecha_fin: null, comuna: "Talagante", direccion: "Sede Labrador s/n", sectores: "Villa El Bosque" };
const ROSARIO: OperativoProximo = { id: "op-rosario", nombre: "Sede Social El Rosario", fecha: "2030-05-10", fecha_fin: null, comuna: "Talagante", direccion: null, sectores: null };
const MAIPU_1: OperativoProximo = { id: "op-maipu-1", nombre: "Condominio Las Acacias", fecha: "2030-05-17", fecha_fin: null, comuna: "Maipú", direccion: null, sectores: null };
const MAIPU_2: OperativoProximo = { id: "op-maipu-2", nombre: "Condominio Las Acacias", fecha: "2030-05-24", fecha_fin: null, comuna: "Maipú", direccion: null, sectores: null };
const OPS = [LABRADOR, ROSARIO, MAIPU_1, MAIPU_2];

describe("detección de inscripciones (sin IA)", () => {
  it("mensaje con la sede: sugiere ese operativo con el nombre dicho", () => {
    expect(sugerenciaDeMensaje("Hola, me llamo Marta Soto, quiero inscribirme en el operativo de Labrador", "Marti", OPS)).toEqual({
      operativo_id: "op-labrador", candidatos: [], nombre: "Marta Soto", nombre_origen: "mensaje", lugar: "labrador",
    });
  });

  it("dos sedes el mismo día: cada una se reconoce por su nombre", () => {
    expect(sugerenciaDeMensaje("quiero hora en El Rosario", "Juan", OPS)?.operativo_id).toBe("op-rosario");
    expect(sugerenciaDeMensaje("soy de la villa el bosque, quiero anotarme", "Juan", OPS)?.operativo_id).toBe("op-labrador");
  });

  it("si solo dice la comuna que comparten dos sedes: queda en duda con ambas", () => {
    const s = sugerenciaDeMensaje("Quiero inscribirme, soy de Talagante", "Ana Pérez", OPS);
    expect(s).toMatchObject({ operativo_id: null, nombre: "Ana Pérez", nombre_origen: "perfil" });
    expect(s?.candidatos.sort()).toEqual(["op-labrador", "op-rosario"]);
  });

  it("misma sede en dos fechas: la fecha decide; sin fecha queda en duda", () => {
    expect(sugerenciaDeMensaje("quiero hora en Las Acacias el 24 de mayo", null, OPS)?.operativo_id).toBe("op-maipu-2");
    expect(sugerenciaDeMensaje("quiero hora en Las Acacias para el 17/05", null, OPS)?.operativo_id).toBe("op-maipu-1");
    const duda = sugerenciaDeMensaje("quiero hora en Las Acacias", null, OPS);
    expect(duda?.operativo_id).toBeNull();
    expect(duda?.candidatos.sort()).toEqual(["op-maipu-1", "op-maipu-2"]);
  });

  it("quiere inscribirse pero no dice dónde: duda con todos los próximos", () => {
    const s = sugerenciaDeMensaje("Hola, quiero agendar una hora para examen de la vista", "Pedro", OPS);
    expect(s?.operativo_id).toBeNull();
    expect(s?.candidatos).toHaveLength(4);
  });

  it("una conversación normal no genera sugerencia", () => {
    expect(sugerenciaDeMensaje("Gracias, ahora estoy ocupado", "Pedro", OPS)).toBeNull();
    expect(sugerenciaDeMensaje("ok 👍", "Pedro", OPS)).toBeNull();
    expect(esInscripcion("ahora no puedo")).toBe(false);
    expect(esInscripcion("me quiero inscribir")).toBe(true);
  });

  it("sin operativos próximos no hay a qué inscribir", () => {
    expect(sugerenciaDeMensaje("quiero inscribirme", "Pedro", [])).toBeNull();
  });

  it("extrae el nombre solo cuando lo dice", () => {
    expect(nombreDelMensaje("me llamo rosa díaz y tengo 60")).toBe("Rosa Díaz");
    expect(nombreDelMensaje("Mi nombre es Juan Carlos Pérez, de Labrador")).toBe("Juan Carlos Pérez");
    expect(nombreDelMensaje("soy de Labrador")).toBeNull();
    expect(nombreDelMensaje("a nombre de Marta")).toBe("Marta");
    expect(nombreDelMensaje("hola buenas")).toBeNull();
  });

  it("teléfonos escritos a mano", () => {
    expect(normalizarTelefonoChile("9 1234 5678")).toBe("56912345678");
    expect(normalizarTelefonoChile("+56 9 1234 5678")).toBe("56912345678");
    expect(normalizarTelefonoChile("123")).toBeNull();
  });
});
