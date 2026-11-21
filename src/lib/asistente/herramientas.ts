import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { evaluarPunto, resumirPorGrupo, type FilaRentabilidad } from "@/lib/rentabilidad-operativos";
import { contarInscritos, leerBases, leerRentabilidad, operativosConContacto, type OperativoIA } from "@/lib/asistente/datos";
import { estimarCombustible, pendientesDeOperativos, promediosPropios, REFERENCIA_CHILE } from "@/lib/pendientes-operativos";
import { CAMPOS_EDITABLES, COSTOS, validarCambios, type Cambios, type Propuesta } from "@/lib/cambios-operativo";

// Herramientas de SOLO LECTURA del asistente. Cada una trabaja con la sesión
// del usuario y su óptica: no hay forma de pedir datos de otra óptica, y
// nada aquí escribe en la base.

export const TIPOS_VENUE: Record<string, string> = {
  condominio: "Condominio", junta_vecinos: "Junta de vecinos", apr: "APR", colegio: "Colegio",
  sala_cuna: "Sala cuna", supermercado: "Supermercado", otro: "Otro",
};

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function resumenOperativo(f: FilaRentabilidad<OperativoIA>, inscritos: Map<string, number>) {
  return {
    id: f.id,
    nombre: f.nombre,
    fecha: f.fecha,
    fecha_fin: f.fecha_fin,
    estado: f.estado,
    tipo_lugar: f.tipo_venue ? TIPOS_VENUE[f.tipo_venue] ?? f.tipo_venue : null,
    comuna: f.comuna,
    examinados: f.examenes,
    meta_examenes: f.meta_examenes,
    ventas: f.ventasCantidad,
    vendido: f.vendido,
    gastos_operativo: f.gastos,
    costo_cristales_y_marcos: f.costoProductos,
    utilidad: f.utilidad,
    conversion_pct: Math.round(f.conversion * 10) / 10,
    inscritos: inscritos.get(f.id) ?? 0,
  };
}

const MAX_NOTAS = 100;

// Esquema de los cambios que la IA puede proponer (solo esos campos).
const ESQUEMA_CAMBIOS = {
  type: "object",
  properties: Object.fromEntries(
    CAMPOS_EDITABLES.map((c) => [
      c,
      (COSTOS as readonly string[]).includes(c) || c === "meta_examenes"
        ? { type: "integer", minimum: 0 }
        : c === "estado"
          ? { type: "string", enum: ["planificado", "realizado", "cancelado"] }
          : c === "hora_inicio" || c === "hora_fin"
            ? { type: "string", description: "HH:MM" }
            : { type: "string" },
    ])
  ),
  additionalProperties: false,
} as const;

export function crearHerramientas(
  supabase: SupabaseClient,
  tenantId: string,
  hoy: string,
  opciones: { propuestas?: Propuesta[]; usuarioId?: string } = {}
) {
  // Una sola lectura por pregunta, compartida entre herramientas.
  let cache: Promise<{ filas: FilaRentabilidad<OperativoIA>[]; citas: Map<string, number> }> | null = null;
  const datos = () =>
    (cache ??= Promise.all([leerRentabilidad(supabase, tenantId), contarInscritos(supabase, tenantId)]).then(([filas, citas]) => ({ filas, citas })));

  const listar = betaTool({
    name: "listar_operativos",
    description:
      "Lista los operativos de la óptica con sus números (examinados, ventas, vendido, gastos, costo de cristales y marcos, utilidad, conversión) ordenados por fecha o utilidad descendente. Úsala para ver el historial, los próximos operativos o buscar uno por nombre o comuna.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Fecha mínima AAAA-MM-DD (opcional)" },
        hasta: { type: "string", description: "Fecha máxima AAAA-MM-DD (opcional)" },
        texto: { type: "string", description: "Parte del nombre, comuna o tipo de lugar (opcional)" },
        incluir_cancelados: { type: "boolean" },
        estado: { type: "string", enum: ["planificado", "realizado", "cancelado"] },
        orden: { type: "string", enum: ["fecha", "utilidad"] },
        limite: { type: "integer", minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
    run: async (input) => {
      const { filas, citas } = await datos();
      const t = input.texto ? normalizar(input.texto) : "";
      const lista = filas
        .filter((f) => input.incluir_cancelados || input.estado === "cancelado" || f.estado !== "cancelado")
        .filter((f) => !input.estado || f.estado === input.estado)
        .filter((f) => !input.desde || f.fecha >= input.desde)
        .filter((f) => !input.hasta || f.fecha <= input.hasta)
        .filter((f) => !t || normalizar([f.nombre, f.comuna, f.tipo_venue && TIPOS_VENUE[f.tipo_venue]].filter(Boolean).join(" ")).includes(t))
        .sort((a, b) => (input.orden === "utilidad" ? b.utilidad - a.utilidad : 0) || b.fecha.localeCompare(a.fecha))
        .slice(0, input.limite ?? 40)
        .map((f) => resumenOperativo(f, citas));
      return JSON.stringify({ hoy, total: lista.length, operativos: lista });
    },
  });

  const detalle = betaTool({
    name: "detalle_operativo",
    description:
      "Desglose completo de un operativo por id: gastos por categoría (transporte, arriendo, viáticos, ayudante, equipos, hospedaje, comida, peajes, otros), costo de cristales y marcos, ventas, utilidad, conversión, ticket promedio y personas inscritas.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "id del operativo (de listar_operativos)" } },
      required: ["id"],
      additionalProperties: false,
    },
    run: async ({ id }) => {
      const { filas, citas } = await datos();
      const f = filas.find((x) => x.id === id);
      if (!f) return JSON.stringify({ error: "No existe un operativo con ese id en esta óptica." });
      return JSON.stringify({
        ...resumenOperativo(f, citas),
        direccion: f.direccion,
        sectores: f.sectores,
        horario: f.hora_inicio ? `${f.hora_inicio.slice(0, 5)}-${(f.hora_fin ?? "").slice(0, 5)}` : null,
        ticket_promedio: f.ventasCantidad > 0 ? Math.round(f.vendido / f.ventasCantidad) : null,
        gastos_detalle: {
          transporte: f.costo_transporte, arriendo: f.costo_arriendo, viaticos: f.costo_viaticos,
          ayudante: f.costo_ayudante ?? 0, equipos: f.costo_equipos ?? 0, hospedaje: f.costo_hospedaje ?? 0,
          comida: f.costo_comida ?? 0, peajes: f.costo_peajes ?? 0, otros: f.costo_otros,
        },
      });
    },
  });

  const comparar = betaTool({
    name: "comparar_lugares",
    description:
      "Agrupa los operativos ya realizados por tipo de lugar, comuna o nombre del lugar y entrega totales y promedios (utilidad promedio, conversión, ticket promedio). Úsala para saber qué lugares o comunas convienen.",
    inputSchema: {
      type: "object",
      properties: {
        agrupar_por: { type: "string", enum: ["tipo_lugar", "comuna", "nombre"] },
        desde: { type: "string", description: "Fecha mínima AAAA-MM-DD (opcional)" },
      },
      required: ["agrupar_por"],
      additionalProperties: false,
    },
    run: async ({ agrupar_por, desde }) => {
      const { filas } = await datos();
      const base = filas.filter((f) => f.estado === "realizado" && f.fecha <= hoy && (!desde || f.fecha >= desde));
      const grupoDe =
        agrupar_por === "comuna"
          ? (f: FilaRentabilidad) => f.comuna ?? ""
          : agrupar_por === "nombre"
            ? (f: FilaRentabilidad) => f.nombre.trim()
            : (f: FilaRentabilidad) => (f.tipo_venue ? TIPOS_VENUE[f.tipo_venue] ?? f.tipo_venue : "");
      const grupos = resumirPorGrupo(base, grupoDe)
        .sort((a, b) => b.utilidadPromedio - a.utilidadPromedio || b.operativos - a.operativos)
        .slice(0, 40);
      return JSON.stringify({ grupos });
    },
  });

  const evaluar = betaTool({
    name: "evaluar_punto",
    description:
      "Proyecta si un punto (lugar nuevo o repetido) sería rentable usando el historial real de la óptica: examinados por día, conversión, ticket y margen de cristales/marcos de operativos parecidos, menos los gastos estimados que indiques. Entrega utilidad esperada, escenarios bajo/esperado/alto y examinados necesarios para no perder plata. Los cálculos los hace el sistema; no los rehagas.",
    inputSchema: {
      type: "object",
      properties: {
        dias: { type: "integer", minimum: 1, maximum: 30 },
        tipo_lugar: { type: "string", enum: Object.keys(TIPOS_VENUE), description: "Para comparar solo con lugares de ese tipo (opcional)" },
        comuna: { type: "string", description: "Para comparar solo con esa comuna (opcional)" },
        nombre_lugar: { type: "string", description: "Para usar solo operativos anteriores en ese mismo lugar (opcional)" },
        examenes_esperados: { type: "integer", minimum: 1, description: "Si el usuario sabe cuántas personas espera (opcional)" },
        costo_transporte: { type: "integer", minimum: 0 },
        costo_arriendo: { type: "integer", minimum: 0 },
        costo_viaticos: { type: "integer", minimum: 0 },
        costo_personal: { type: "integer", minimum: 0 },
        costo_equipos: { type: "integer", minimum: 0 },
        costo_otros: { type: "integer", minimum: 0 },
      },
      required: ["dias"],
      additionalProperties: false,
    },
    run: async (i) => {
      const { filas } = await datos();
      const pasados = filas.filter((f) => f.estado !== "cancelado" && f.fecha <= hoy);
      // Del filtro más parecido al más general, usando el primero con al
      // menos 2 operativos con examinados.
      const candidatos: [string, FilaRentabilidad<OperativoIA>[]][] = [];
      if (i.nombre_lugar) candidatos.push([`mismo lugar «${i.nombre_lugar}»`, pasados.filter((f) => normalizar(f.nombre).includes(normalizar(i.nombre_lugar!)))]);
      if (i.comuna && i.tipo_lugar) candidatos.push([`${TIPOS_VENUE[i.tipo_lugar]} en ${i.comuna}`, pasados.filter((f) => f.tipo_venue === i.tipo_lugar && normalizar(f.comuna ?? "") === normalizar(i.comuna!))]);
      if (i.comuna) candidatos.push([`comuna ${i.comuna}`, pasados.filter((f) => normalizar(f.comuna ?? "") === normalizar(i.comuna!))]);
      if (i.tipo_lugar) candidatos.push([`lugares tipo ${TIPOS_VENUE[i.tipo_lugar]}`, pasados.filter((f) => f.tipo_venue === i.tipo_lugar)]);
      candidatos.push(["todos los operativos de la óptica", pasados]);
      const [criterio, base] = candidatos.find(([, b]) => b.filter((f) => f.examenes > 0).length >= 2) ?? candidatos[candidatos.length - 1];
      return JSON.stringify(
        evaluarPunto(base, {
          dias: i.dias,
          examenesEsperados: i.examenes_esperados ?? null,
          costos: {
            transporte: i.costo_transporte, arriendo: i.costo_arriendo, viaticos: i.costo_viaticos,
            personal: i.costo_personal, equipos: i.costo_equipos, otros: i.costo_otros,
          },
        }, criterio)
      );
    },
  });

  const pendientes = betaTool({
    name: "revisar_pendientes",
    description:
      "Revisa qué les falta a los operativos: ubicación, horario, gente inscrita, costos (transporte, hospedaje en operativos de varios días), contacto del lugar, y operativos pasados sin cerrar o sin costos. Úsala cuando pregunten qué falta, qué está incompleto o qué hay que hacer.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      const [{ filas, citas }, contactos] = await Promise.all([datos(), operativosConContacto(supabase, tenantId)]);
      const lista = pendientesDeOperativos(filas, citas, hoy, contactos);
      return JSON.stringify({ hoy, operativos_con_pendientes: lista.length, pendientes: lista.slice(0, 40) });
    },
  });

  const costos = betaTool({
    name: "costos_referencia_chile",
    description:
      "Datos para presupuestar un operativo en Chile: lo que esta óptica ha gastado por día en cada categoría (transporte, viáticos, comida, hospedaje, equipos, arriendo, ayudante, peajes) en el último año, desde dónde sale el equipo (sucursales) y valores de respaldo aproximados de Chile (combustible, rendimiento, colación, hospedaje). Prefiere siempre el historial propio; para el precio actual del combustible usa la búsqueda web si está disponible.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      const [{ filas }, bases] = await Promise.all([datos(), leerBases(supabase, tenantId)]);
      return JSON.stringify({ hoy, historial_propio_por_dia: promediosPropios(filas, hoy), bases, respaldo_chile: REFERENCIA_CHILE });
    },
  });

  const combustible = betaTool({
    name: "estimar_combustible",
    description:
      "Calcula el gasto en combustible de un operativo: kilómetros de ida desde la base, días, precio por litro y rendimiento del vehículo. Si el equipo duerme en el lugar, es un solo viaje ida y vuelta; si no, uno por día. Usa esta herramienta en vez de hacer la cuenta tú.",
    inputSchema: {
      type: "object",
      properties: {
        km_ida: { type: "number", minimum: 0, maximum: 3000 },
        dias: { type: "integer", minimum: 1, maximum: 30 },
        precio_litro: { type: "number", minimum: 300, maximum: 5000 },
        rendimiento_km_litro: { type: "number", minimum: 3, maximum: 30 },
        se_aloja: { type: "boolean" },
      },
      required: ["km_ida", "dias", "precio_litro", "rendimiento_km_litro"],
      additionalProperties: false,
    },
    run: async (i) => JSON.stringify(estimarCombustible(i)),
  });

  const proponer = betaTool({
    name: "proponer_cambio_operativo",
    description:
      "Prepara un cambio a un operativo (dirección, comuna, horario, meta, sectores, estado, nombre o costos) cuando el usuario lo pide o da el dato que faltaba. NO lo aplica: aparece en el chat con un botón «Aplicar» que el administrador debe presionar. Fechas, equipo y ventas no se cambian por acá.",
    inputSchema: {
      type: "object",
      properties: {
        operativo_id: { type: "string" },
        cambios: ESQUEMA_CAMBIOS as unknown as { type: "object" },
        motivo: { type: "string", description: "Frase corta: qué se cambia y por qué" },
      },
      required: ["operativo_id", "cambios", "motivo"],
      additionalProperties: false,
    },
    run: async (i) => {
      if (!opciones.propuestas) return JSON.stringify({ error: "En esta conversación no se pueden preparar cambios." });
      if (opciones.propuestas.length >= 5) return JSON.stringify({ error: "Máximo 5 cambios por respuesta." });
      const { filas } = await datos();
      const f = filas.find((x) => x.id === i.operativo_id);
      if (!f) return JSON.stringify({ error: "No existe un operativo con ese id en esta óptica." });
      const v = validarCambios(i.cambios);
      if ("error" in v) return JSON.stringify({ error: v.error });
      const actual = f as unknown as Record<string, unknown>;
      const antes: Cambios = {};
      for (const k of Object.keys(v.cambios)) {
        const a = actual[k];
        antes[k as keyof Cambios] = typeof a === "string" && /^hora_/.test(k) ? a.slice(0, 5) : (a as string | number | null) ?? null;
      }
      opciones.propuestas.push({ operativo_id: f.id, operativo: f.nombre, cambios: v.cambios, antes, motivo: String(i.motivo).slice(0, 200) });
      return JSON.stringify({ ok: true, aviso: "Cambio preparado. El administrador debe presionar «Aplicar» en el chat para guardarlo." });
    },
  });

  const recordar = betaTool({
    name: "recordar",
    description:
      "Guarda una nota permanente sobre cómo trabaja esta óptica, cuando el usuario pide que la recuerdes o corrige algo que debes saber siempre (ej. «Labrador es un sector de Talagante», «los equipos se arriendan a $52.000 por día»). Solo datos del negocio, nunca de pacientes.",
    inputSchema: {
      type: "object",
      properties: { texto: { type: "string", minLength: 3, maxLength: 300 } },
      required: ["texto"],
      additionalProperties: false,
    },
    run: async ({ texto }) => {
      if (!opciones.usuarioId) return JSON.stringify({ error: "No disponible." });
      const n = await supabase.from("ia_conocimiento").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      if ((n.count ?? 0) >= MAX_NOTAS) return JSON.stringify({ error: `Ya hay ${MAX_NOTAS} notas; borra algunas en Configuración → Lo que sabe la IA.` });
      const r = await supabase.from("ia_conocimiento").insert({ tenant_id: tenantId, texto: texto.trim().slice(0, 300), origen: "manual", creado_por: opciones.usuarioId });
      return JSON.stringify(r.error ? { error: "No se pudo guardar la nota." } : { ok: true });
    },
  });

  return [listar, detalle, comparar, evaluar, pendientes, costos, combustible, proponer, recordar] as const;
}
