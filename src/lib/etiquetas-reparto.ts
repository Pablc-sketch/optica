export function etiquetasReparto(valor:unknown){
 const dato=valor&&typeof valor==='object'?valor as Record<string,unknown>:{};
 const nombre=(clave:string,defecto:string)=>typeof dato[clave]==='string'&&String(dato[clave]).trim()?String(dato[clave]).trim().slice(0,60):defecto;
 return {pablo:nombre('pablo','Tecnólogo'),madre:nombre('madre','Coordinación'),isadora:nombre('isadora','Ventas')};
}
