export function coincidePaciente(p: { nombre: string; rut: string | null }, entrada: string) {
  const t=entrada.trim();
  if (!t) return true;
  if (/^[\d.kK\s-]+$/.test(t)) {
    const rut=t.replace(/[^0-9kK]/g,'').toUpperCase();
    return Boolean(rut && p.rut?.replace(/[^0-9kK]/g,'').toUpperCase().includes(rut));
  }
  const limpio=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es-CL');
  return limpio(p.nombre).includes(limpio(t));
}
