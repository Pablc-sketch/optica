import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Prueba de punta a punta con datos ficticios, usando el código real
// (webhook → detección → base de datos → pantalla → «Aprobar» → lista) y la
// base local de pruebas (tests/db/rehacer.sh). Si no hay base local, se salta.

const PG = ["-h", "/var/tmp/pgtest", "-p", "54329", "-U", "postgres", "-d", "lentia_test", "-At", "-q", "-v", "ON_ERROR_STOP=1"];
// Resultado de la última consulta, marcado con «FIN:» (antes puede haber otras salidas).
const resultado = (salida: string) => salida.slice(salida.lastIndexOf("FIN:") + 4);
function sql(q: string): string {
  return execFileSync("psql", [...PG, "-c", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
const hayBase = (() => {
  try { return sql("select to_regclass('public.whatsapp_sugerencias') is not null") === "t"; } catch { return false; }
})();

const lit = (v: unknown): string =>
  v === null || v === undefined ? "null"
  : typeof v === "number" || typeof v === "boolean" ? String(v)
  : typeof v === "object" && !Array.isArray(v) ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
  : `'${String(v).replace(/'/g, "''")}'`;

// Cliente de Supabase mínimo sobre psql. `como` = usuario con RLS (null = llave de servicio).
function cliente(como: string | null) {
  const envolver = (q: string) => como
    ? `set role authenticated; select set_config('request.jwt.claims', '${JSON.stringify({ sub: como, role: "authenticated" })}', true); ${q}`
    : q;
  const tabla = (nombre: string) => {
    const filtros: string[] = [];
    const orden: string[] = [];
    let cols = "*", lim = "", borrar = false;
    const ejecutar = () => {
      const donde = filtros.length ? ` where ${filtros.join(" and ")}` : "";
      if (borrar) { sql(envolver(`delete from public.${nombre}${donde}`)); return []; }
      const salida = sql(envolver(`select 'FIN:' || coalesce(json_agg(t), '[]') from (select ${cols} from public.${nombre}${donde}${orden.length ? ` order by ${orden.join(", ")}` : ""}${lim}) t`));
      return JSON.parse(resultado(salida));
    };
    const q: Record<string, unknown> = {
      select: (c: string) => ((cols = c), q),
      eq: (c: string, v: unknown) => (filtros.push(`${c} = ${lit(v)}`), q),
      gte: (c: string, v: unknown) => (filtros.push(`${c} >= ${lit(v)}`), q),
      lt: (c: string, v: unknown) => (filtros.push(`${c} < ${lit(v)}`), q),
      in: (c: string, vs: unknown[]) => (filtros.push(`${c} in (${vs.map(lit).join(", ")})`), q),
      or: (e: string) => (filtros.push(`(${e.split(",").map((p) => { const [c, op, ...v] = p.split("."); return `${c} ${op === "gte" ? ">=" : "="} ${lit(v.join("."))}`; }).join(" or ")})`), q),
      order: (c: string, o?: { ascending?: boolean }) => (orden.push(`${c}${o?.ascending === false ? " desc" : ""}`), q),
      limit: (n: number) => ((lim = ` limit ${n}`), q),
      delete: () => ((borrar = true), q),
      maybeSingle: async () => ({ data: ejecutar()[0] ?? null, error: null }),
      then: (ok: (r: unknown) => unknown, mal: (e: unknown) => unknown) => Promise.resolve().then(() => ({ data: ejecutar(), error: null })).then(ok, mal),
    };
    return q;
  };
  const rpc = async (nombre: string, args: Record<string, unknown>) => {
    const params = Object.entries(args).map(([k, v]) => {
      if (Array.isArray(v)) return `${k} => array[${v.map(lit).join(", ")}]::${k === "p_edades" ? "integer" : "text"}[]`;
      return `${k} => ${lit(v)}`;
    });
    try {
      const salida = sql(envolver(`select 'FIN:' || coalesce(public.${nombre}(${params.join(", ")})::text, '')`));
      const ultimo = resultado(salida);
      return { data: /^\d+$/.test(ultimo) ? Number(ultimo) : ultimo, error: null };
    } catch (e) {
      return { data: null, error: { message: String((e as { stderr?: string }).stderr ?? e), code: "P0001" } };
    }
  };
  return { from: tabla, rpc };
}

const ctx = vi.hoisted(() => ({ pendientes: [] as Promise<unknown>[], admin: null as unknown, perfil: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (f: () => Promise<unknown>) => { ctx.pendientes.push(f()); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ctx.admin }));
vi.mock("@/lib/autorizacion", () => ({
  requerirPerfil: async () => ctx.perfil,
  exigirRolPagina: async () => ctx.perfil,
  SinPermiso: class SinPermiso extends Error {},
}));

import { POST } from "../src/app/api/whatsapp/webhook/route";
import WhatsApp from "../src/app/(app)/(protegido)/whatsapp/page";
import { aprobarSugerencia } from "@/lib/actions/whatsapp";

// Ids ficticios propios de esta prueba.
const sufijo = randomUUID().slice(0, 8);
const TENANT = `00000000-0000-4000-8000-0000${sufijo}`;
const ADMIN = `00000000-0000-4000-9000-0000${sufijo}`;
const OP_LABRADOR = `00000000-0000-4000-a000-0000${sufijo}`;
const OP_ROSARIO = `00000000-0000-4000-b000-0000${sufijo}`;
const NUMERO = `71${parseInt(sufijo, 16) % 100000000}`.padEnd(10, "0");
const SECRETO = "secreto-ficticio";

function aviso(wamid: string, de: string, texto: string, perfil: string) {
  return JSON.stringify({ entry: [{ changes: [{ field: "messages", value: {
    metadata: { phone_number_id: NUMERO }, contacts: [{ wa_id: de, profile: { name: perfil } }],
    messages: [{ from: de, id: wamid, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: texto } }],
  } }] }] });
}
async function llega(cuerpo: string) {
  const firma = "sha256=" + createHmac("sha256", SECRETO).update(cuerpo).digest("hex");
  const r = await POST(new Request("https://lentia.test/api/whatsapp/webhook", { method: "POST", body: cuerpo, headers: { "x-hub-signature-256": firma } }));
  await Promise.all(ctx.pendientes.splice(0));
  return r.status;
}
async function pantalla(ver?: string) {
  return renderToStaticMarkup(await WhatsApp({ searchParams: Promise.resolve(ver ? { ver } : {}) }));
}

describe.skipIf(!hayBase)("WhatsApp de punta a punta (base local, datos ficticios)", () => {
  beforeAll(() => {
    vi.stubEnv("WHATSAPP_APP_SECRET", SECRETO);
    sql(`insert into public.tenants (id, nombre_comercial, agenda_paralela) values ('${TENANT}', 'Óptica Ficticia ${sufijo}', true);
      insert into public.suscripciones (tenant_id, estado, fecha_renovacion) values ('${TENANT}', 'activa', current_date + 30);
      insert into auth.users (id, email) values ('${ADMIN}', 'admin-${sufijo}@ejemplo.invalid');
      insert into public.users (id, tenant_id, nombre, email, rol) values ('${ADMIN}', '${TENANT}', 'Admin', 'admin-${sufijo}@ejemplo.invalid', 'admin');
      insert into public.operativos (id, tenant_id, nombre, fecha, comuna, estado) values
        ('${OP_LABRADOR}', '${TENANT}', 'Junta de Vecinos Labrador', '2030-06-14', 'Talagante', 'planificado'),
        ('${OP_ROSARIO}', '${TENANT}', 'Sede Social El Rosario', '2030-06-14', 'Talagante', 'planificado');
      insert into public.whatsapp_numeros (tenant_id, phone_number_id, coexistencia) values ('${TENANT}', '${NUMERO}', true);`);
    ctx.admin = cliente(null);
    ctx.perfil = { supabase: cliente(ADMIN), tenantId: TENANT, user: { id: ADMIN }, rol: "admin" };
  });
  afterAll(() => vi.unstubAllEnvs());

  it("mensaje recibido → sugerencia visible → Aprobar → lista correcta, sin duplicados ni IA", async () => {
    const fetchEspia = vi.spyOn(globalThis, "fetch");
    const cuerpo = aviso(`wamid.${sufijo}.1`, "56922220001", "Hola, me llamo Marta Soto y quiero inscribirme en el operativo de Labrador", "Marti");
    expect(await llega(cuerpo)).toBe(200);
    // Meta reenvía el mismo aviso.
    expect(await llega(cuerpo)).toBe(200);
    expect(sql(`select count(*) || ',' || max(nombre) || ',' || max(operativo_id::text) from public.whatsapp_sugerencias where telefono = '56922220001' and tenant_id = '${TENANT}'`))
      .toBe(`1,Marta Soto,${OP_LABRADOR}`);
    expect(sql(`select count(*) from public.whatsapp_mensajes where telefono = '56922220001' and tenant_id = '${TENANT}'`)).toBe("1");

    const html = await pantalla();
    expect(html).toContain("Marta Soto");
    expect(html).toContain("+56922220001");
    expect(html).toContain("Operativo: <b>Junta de Vecinos Labrador · 14-06-2030 (");
    expect(html).toContain("Aprobar");
    expect(sql(`select count(*) from public.inscritos_operativo where telefono = '56922220001'`)).toBe("0");

    const id = sql(`select id from public.whatsapp_sugerencias where telefono = '56922220001' and tenant_id = '${TENANT}'`);
    const f = new FormData();
    f.set("id", id); f.set("operativo_id", OP_LABRADOR); f.set("nombre_0", "Marta Soto"); f.set("edad_0", "67");
    expect(await aprobarSugerencia(f)).toEqual({ mensaje: "Marta Soto quedó en la lista para llamar" });
    expect(sql(`select string_agg(operativo_id || ':' || nombre || ':' || telefono, ';') from public.inscritos_operativo where telefono = '56922220001'`))
      .toBe(`${OP_LABRADOR}:Marta Soto:56922220001`);
    // Después de aprobada, otro mensaje igual no vuelve a sugerir.
    await llega(aviso(`wamid.${sufijo}.2`, "56922220001", "me inscribo en Labrador", "Marti"));
    expect(sql(`select count(*) from public.whatsapp_sugerencias where telefono = '56922220001' and estado = 'pendiente'`)).toBe("0");
    expect(await pantalla("aprobadas")).toContain("Marta Soto");
    // Nada se mandó a servicios externos (ni IA ni WhatsApp).
    expect(fetchEspia).not.toHaveBeenCalled();
    fetchEspia.mockRestore();
  });

  it("dos sedes el mismo día: duda para elegir y luego la sede correcta", async () => {
    await llega(aviso(`wamid.${sufijo}.3`, "56922220002", "Quiero inscribirme, soy de Talagante", "Ana Pérez"));
    const html = await pantalla();
    expect(html).toContain("Ana Pérez");
    expect(html).toContain("Hay duda");
    expect(html).toContain('<optgroup label="Posibles">');
    expect(html).toContain("Junta de Vecinos Labrador · 14-06-2030");
    expect(html).toContain("Sede Social El Rosario · 14-06-2030");

    const id = sql(`select id from public.whatsapp_sugerencias where telefono = '56922220002' and estado = 'pendiente'`);
    const f = new FormData();
    f.set("id", id); f.set("operativo_id", OP_ROSARIO); f.set("nombre_0", "Ana Pérez");
    expect((await aprobarSugerencia(f)).mensaje).toContain("Ana Pérez");
    expect(sql(`select count(*) from public.inscritos_operativo where operativo_id = '${OP_ROSARIO}' and telefono = '56922220002'`)).toBe("1");
    expect(sql(`select count(*) from public.inscritos_operativo where operativo_id = '${OP_LABRADOR}' and telefono = '56922220002'`)).toBe("0");
  });
});
