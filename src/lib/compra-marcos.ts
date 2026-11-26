import { createHash } from "node:crypto";

type MarcoVendido = {
  orden: string;
  folio: number;
  par: number;
  sede: string | null;
  propio: boolean | null;
  producto: string | null;
  codigo: string | null;
  descripcion: string | null;
  codigosVenta: string[];
  ventasActivas: number;
};

type MarcoCatalogo = {
  id: string;
  sku: string | null;
  marca: string | null;
  proveedor: string | null;
  stock: number | null;
};

export type ConteoMarcos = {
  clave: string;
  revision: string;
  en_mano: number | null;
  comprados: number;
};

export type FilaCompraMarcos = {
  clave: string;
  revision: string;
  codigo: string;
  proveedor: string;
  descripcion: string;
  folios: number[];
  pedidos: number;
  stock: number | null;
  enMano: number | null;
  porComprar: number | null;
  comprado: boolean;
};

export type RevisionMarco = {
  orden: string;
  folio: number;
  par: number;
  sede: string | null;
  codigo: string | null;
  descripcion: string | null;
  motivo: string;
};

const normalizar = (codigo: string) => codigo.toUpperCase().replace(/[\s-]+/g, "");

export function codigoEnDescripcion(descripcion: string | null) {
  const texto = descripcion?.trim() ?? "";
  const anotado = texto.match(/\bc[oó]d(?:igo)?\.?\s*[:#-]?\s*([^·]+)$/i)?.[1]?.trim();
  const primero = texto.split(/\s/)[0];
  const candidato = anotado ?? primero;
  return /^[A-Z0-9][A-Z0-9 -]{2,79}$/i.test(candidato) && /\d/.test(candidato) ? candidato : null;
}

function descripcionMarco(descripcion: string | null) {
  return (descripcion ?? "")
    .replace(/^(esencial|selección|premium|especial)\s*(?:·\s*|$)/i, "")
    .replace(/\s*·\s*c[oó]d(?:igo)?\.?.*$/i, "").trim();
}

function colores(descripcion: string | null) {
  return new Set((descripcionMarco(descripcion).toLowerCase().match(
    /\b(?:azul|negro|negra|rojo|roja|dorado|dorada|gris|café|rosado|rosada|verde|lila|transparente|blanco|blanca)\b/g,
  ) ?? []).map(color => color.replace(/^(negr|roj|dorad|rosad|blanc)a$/, "$1o")));
}

function colorEnConflicto(ordenes: MarcoVendido[]) {
  const observaciones = ordenes.filter(ot => !ot.codigo?.trim()).map(ot => colores(ot.descripcion)).filter(set => set.size > 0);
  return observaciones.some((unColor, index) => observaciones.slice(index + 1)
    .some(otroColor => [...unColor].every(color => !otroColor.has(color))));
}

function huella(texto: string) {
  return createHash("sha256").update(texto).digest("hex");
}

export function prepararCompraMarcos(
  marcos: MarcoVendido[],
  catalogo: MarcoCatalogo[],
  conteos: ConteoMarcos[],
  proveedorSinAsignar: string,
) {
  const porId = new Map(catalogo.map(p => [p.id, p]));
  const porCodigo = new Map<string, MarcoCatalogo[]>();
  for (const producto of catalogo) {
    if (!producto.sku?.trim()) continue;
    const clave = normalizar(producto.sku);
    const coincidencias = porCodigo.get(clave) ?? [];
    coincidencias.push(producto);
    porCodigo.set(clave, coincidencias);
  }

  type Grupo = { codigo: string; proveedor: string; producto?: MarcoCatalogo; marcos: MarcoVendido[]; sinRebaja: number };
  const grupos = new Map<string, Grupo>();
  const revisar: RevisionMarco[] = [];
  const agregarRevision = ({ orden, folio, par, sede, descripcion }: MarcoVendido, codigo: string | null, motivo: string) => {
    revisar.push({ orden, folio, par, sede, codigo, descripcion: descripcionMarco(descripcion), motivo });
  };

  for (const marco of marcos) {
    if (marco.propio || marco.ventasActivas === 0) continue;
    const registrado = marco.producto ? porId.get(marco.producto) : undefined;
    const corregido = marco.codigo?.trim() || null;
    const codigo = corregido ?? registrado?.sku ?? codigoEnDescripcion(marco.descripcion);
    if (marco.ventasActivas > 1 || !codigo) {
      agregarRevision(marco, codigo, marco.ventasActivas > 1 ? "La OT está vinculada a más de una venta." : "Falta el código del marco.");
      continue;
    }
    const codigoNormal = normalizar(codigo);
    if (corregido && registrado?.sku && normalizar(registrado.sku) !== codigoNormal) {
      agregarRevision(marco, codigo, `El inventario descontó el código ${registrado.sku}.`);
      continue;
    }
    if (!corregido && !registrado && marco.codigosVenta.length > 0
      && !marco.codigosVenta.some(c => normalizar(c) === codigoNormal)) {
      agregarRevision(marco, codigo, `En la venta figura ${marco.codigosVenta.join(" / ")}.`);
      continue;
    }
    const coincidencias = porCodigo.get(codigoNormal) ?? [];
    if (!registrado && coincidencias.length > 1) {
      agregarRevision(marco, codigo, "El código coincide con más de un producto del catálogo.");
      continue;
    }
    const producto = registrado ?? coincidencias[0];
    const proveedor = producto?.proveedor ?? proveedorSinAsignar;
    const clave = huella(`${proveedor}\0${codigoNormal}`);
    const grupo = grupos.get(clave) ?? { codigo: producto?.sku ?? codigo, proveedor, producto, marcos: [], sinRebaja: 0 };
    grupo.marcos.push(marco);
    if (!registrado) grupo.sinRebaja++;
    grupos.set(clave, grupo);
  }

  const notas = new Map(conteos.map(conteo => [conteo.clave, conteo]));
  const filas: FilaCompraMarcos[] = [];
  for (const [clave, grupo] of grupos) {
    if (colorEnConflicto(grupo.marcos)) {
      for (const marco of grupo.marcos) agregarRevision(marco, grupo.codigo, "El mismo código figura con colores distintos en las OT.");
      continue;
    }
    const revision = huella(grupo.marcos.map(marco => `${marco.orden}:${marco.par}`).sort().join(","));
    const nota = notas.get(clave);
    const conteo = nota?.revision === revision ? nota : null;
    const stock = grupo.producto?.proveedor ? grupo.producto.stock : null;
    const pedidos = grupo.marcos.length;
    const enMano = stock === null ? conteo?.en_mano ?? null : null;
    const porComprar = stock !== null ? Math.min(pedidos, Math.max(0, grupo.sinRebaja - stock))
      : enMano === null ? null : Math.max(0, pedidos - enMano);
    const descripcion = grupo.producto?.marca || grupo.marcos.map(m => descripcionMarco(m.descripcion)).find(Boolean) || "";
    filas.push({
      clave, revision, codigo: grupo.codigo, proveedor: grupo.proveedor, descripcion,
      folios: [...new Set(grupo.marcos.map(m => m.folio))].sort((a, b) => a - b),
      pedidos, stock, enMano, porComprar,
      comprado: porComprar !== null && porComprar > 0 && conteo?.comprados === porComprar,
    });
  }
  filas.sort((a, b) => a.proveedor.localeCompare(b.proveedor, "es") || (b.porComprar ?? b.pedidos) - (a.porComprar ?? a.pedidos)
    || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  revisar.sort((a, b) => a.folio - b.folio || a.par - b.par);
  return { filas, revisar };
}
