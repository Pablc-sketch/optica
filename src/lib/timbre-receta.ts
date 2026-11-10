import {formatearRut} from './rut';
import type {DatosRecetaImpresion} from './receta-datos';
export type PerfilTimbre={nombre:string;rut:string|null;titulo_profesional:string|null;registro_profesional:string|null};
export function timbreDeReceta(snapshot:unknown,autor:PerfilTimbre|null):DatosRecetaImpresion['profesional']{
 const p=snapshot&&typeof snapshot==='object'?snapshot as Partial<PerfilTimbre>:autor;
 if(!p?.nombre||!p.titulo_profesional)return null;
 return {nombre:p.nombre,rut:p.rut?formatearRut(p.rut):null,tituloProfesional:p.titulo_profesional,registroProfesional:p.registro_profesional??null};
}
