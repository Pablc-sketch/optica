type Ubicacion = { direccion?: string | null; comuna?: string | null; region?: string | null };

export function textoUbicacion(lugar: Ubicacion) {
  const partes = [lugar.direccion, lugar.comuna, lugar.region].map(p => p?.trim()).filter((p): p is string => !!p);
  return [...new Set(partes)].join(", ");
}

function consulta(lugar: Ubicacion) {
  const texto = textoUbicacion(lugar);
  return texto ? /\bchile\b/i.test(texto) ? texto : `${texto}, Chile` : null;
}

export function mapaUbicacion(lugar: Ubicacion) {
  const query = consulta(lugar);
  return query ? `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query })}` : null;
}

export function comoLlegar(lugar: Ubicacion) {
  const destination = consulta(lugar);
  return destination ? `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination, travelmode: "driving" })}` : null;
}

// La lista llega ordenada por horario. No se cambian sus paradas ni se
// elimina una sede sin ubicación para aparentar una ruta completa.
// Hasta cinco sedes mantienen el máximo de tres paradas intermedias móvil.
export function rutaDelDia(lugares: Ubicacion[]) {
  if (lugares.length < 2 || lugares.length > 5) return null;
  const puntos = lugares.map(consulta);
  if (puntos.some(p => !p)) return null;
  const params = new URLSearchParams({ api: "1", origin: puntos[0]!, destination: puntos[puntos.length - 1]!, travelmode: "driving" });
  if (puntos.length > 2) params.set("waypoints", puntos.slice(1, -1).join("|"));
  const url = `https://www.google.com/maps/dir/?${params}`;
  return url.length <= 2048 ? url : null;
}
