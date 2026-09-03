// Formatos de entrada de datos. Se aplican mientras se escribe (en los
// campos del formulario) y también al guardar, para que el dato quede
// normalizado en la base aunque venga de un flujo distinto.

// Teléfono móvil chileno: +56 9 1234 5678. Acepta que se escriba con o sin
// el 56, con o sin espacios, y va armando el formato a medida que se teclea.
export function formatearTelefono(valor: string | null | undefined): string {
  if (!valor) return "";
  let digitos = valor.replace(/\D/g, "");
  if (digitos.startsWith("56")) digitos = digitos.slice(2);
  digitos = digitos.slice(0, 9);
  if (digitos.length === 0) return "";

  const partes = [digitos.slice(0, 1), digitos.slice(1, 5), digitos.slice(5, 9)].filter(Boolean);
  return `+56 ${partes.join(" ")}`;
}

// Miles con punto, como se escriben los pesos en Chile: 82000 → "82.000".
// Sin el signo $ porque se usa dentro de campos editables, donde el símbolo
// estorba al escribir; para mostrar montos ya guardados está clp().
export function formatearMonto(valor: string | number | null | undefined): string {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  return Number(digitos).toLocaleString("es-CL");
}

// Inverso de formatearMonto: "82.000" → 82000. Lo usan las server actions,
// que reciben el texto tal como quedó en el campo.
export function montoANumero(valor: FormDataEntryValue | string | null | undefined): number {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  return digitos ? Number(digitos) : 0;
}

// Dioptrías (esfera, cilindro, adición): el signo es parte del dato clínico,
// así que se muestra mientras se escribe en vez de recién al guardar.
// "signo" fuerza siempre el mismo signo (cilindro es siempre negativo,
// adición siempre positiva); "libre" respeta el que haya escrito la persona,
// con "+" por omisión si no escribió ninguno.
export function formatearDioptria(
  valor: string | null | undefined,
  signo: "+" | "-" | "libre"
): string {
  const texto = String(valor ?? "").replace(",", ".");
  const negativo = signo === "-" || (signo === "libre" && texto.trim().startsWith("-"));
  const numero = texto.replace(/[^0-9.]/g, "");
  if (!numero) return "";
  return `${negativo ? "-" : "+"}${numero}`;
}

// Al salir del campo: una dioptría siempre se anota con dos decimales
// ("+1.00", no "+1"), así que si no se escribió el punto (o quedó con
// menos de dos decimales) se completa solo. No se toca mientras se sigue
// escribiendo, para no pelear con quien todavía va a agregar ",25/,50/,75".
export function completarDosDecimales(valor: string): string {
  if (!valor) return valor;
  const signo = valor.startsWith("-") ? "-" : valor.startsWith("+") ? "+" : "";
  const resto = signo ? valor.slice(1) : valor;
  const [entero, decimales = ""] = resto.split(".");
  if (!entero) return valor;
  const decimalesFinal = (decimales + "00").slice(0, 2);
  return `${signo}${entero}.${decimalesFinal}`;
}

// Agudeza visual como fracción (20/20, 6/9…): inserta el "/" solo si la
// persona no lo escribió ella misma, apenas hay 2 dígitos en el numerador
// (el caso más común, "20/xx"); con un numerador de un dígito ("6/9") basta
// con escribir el "/" a mano.
export function formatearAgudezaVisual(valor: string | null | undefined): string {
  const texto = String(valor ?? "");
  if (texto.includes("/")) return texto.replace(/[^0-9/]/g, "");
  const digitos = texto.replace(/\D/g, "");
  if (digitos.length <= 2) return digitos;
  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}`;
}

// Fecha corta día/mes/año, como se escribe a mano en Chile. Mucho más
// rápido en el mesón que el selector nativo de calendario.
export function formatearFechaCorta(valor: string | null | undefined): string {
  const digitos = String(valor ?? "").replace(/\D/g, "").slice(0, 8);
  const partes = [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4, 8)].filter(Boolean);
  return partes.join("/");
}

// "15/08/1990" → "1990-08-15", el formato que espera la columna date. null
// si todavía no está completa (se sigue escribiendo).
export function fechaCortaAISO(valor: string | null | undefined): string | null {
  const m = String(valor ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, aaaa] = m;
  return `${aaaa}-${mm}-${dd}`;
}

// Inverso, para precargar el campo cuando ya existe una fecha guardada.
export function isoAFechaCorta(valor: string | null | undefined): string {
  const m = String(valor ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const [, aaaa, mm, dd] = m;
  return `${dd}/${mm}/${aaaa}`;
}
