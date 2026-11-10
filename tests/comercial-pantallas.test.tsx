import {beforeEach,describe,expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const ctx=vi.hoisted(()=>({tablas:{} as Record<string,unknown[]>}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),refresh:vi.fn()}),notFound:()=>{throw new Error('NOT_FOUND')}}));
vi.mock('@/lib/actions/agenda-terreno',()=>({guardarEquipoFisico:vi.fn(),guardarKit:vi.fn()}));
vi.mock('@/lib/actions/precios-comerciales',()=>({guardarPrecioPropio:vi.fn()}));
vi.mock('@/lib/autorizacion',()=>({exigirRolPagina:async()=>({tenantId:'ficticia',supabase:{from:(t:string)=>{const q={select:()=>q,eq:()=>q,order:()=>q,range:(a:number,b:number)=>Promise.resolve({data:(ctx.tablas[t]??[]).slice(a,b+1),error:null}),single:()=>Promise.resolve({data:ctx.tablas[t]?.[0],error:null}),then:(r:(x:unknown)=>unknown)=>Promise.resolve({data:ctx.tablas[t]??[],error:null}).then(r)};return q;}}})}));
import PreciosComerciales from '@/components/precios-comerciales';
import Kits from '@/app/(app)/(protegido)/agenda/equipos/kits/page';
import CamposTurno from '@/components/campos-turno';
beforeEach(()=>{ctx.tablas={tenants:[{id:'ficticia',modelo_operacion:'comercial',precio_consulta:8500}],productos:[{id:'marco',nombre:'Marco de ejemplo',costo:7300,precio_venta:18000}],costos_cristales:[],proveedores:[{id:'lab',nombre:'Laboratorio de ejemplo'}],equipos_fisicos:[{id:'auto',nombre:'Autorefractómetro de ejemplo',tipo:'autorefractometro',identificador:'AUTO-01',estado:'disponible'}],agenda_recursos:[],kit_componentes:[]}});
describe('pantallas comerciales',()=>{
 it('muestra tarifas propias sin opciones del negocio original',async()=>{const html=renderToStaticMarkup(await PreciosComerciales());expect(html).toContain('Precios de mi óptica');expect(html).toContain('8500');expect(html).toContain('7300');expect(html).not.toMatch(/Fides|Óptica Global|Isadora|Pamela|Pablo|Marco premium/);});
 it('conecta kits con unidades identificables',async()=>{const html=renderToStaticMarkup(await Kits());expect(html).toContain('AUTO-01');expect(html).toContain('Componentes del inventario');});
 it('señala personal ocupado y permite seleccionar otra cuadrilla',()=>{const html=renderToStaticMarkup(<CamposTurno id="nuevo" inicial={{fecha:'2035-03-10',fecha_fin:'',inicio:'',fin:'',asignados:{}}} equipo={[{id:'tech-1',tipo:'tecnologo',nombre:'Tecnólogo uno',detalle:''},{id:'tech-2',tipo:'tecnologo',nombre:'Tecnólogo dos',detalle:''}]} reservas={[{id:'op-1',nombre:'Sede de ejemplo',fecha:'2035-03-10',fecha_fin:null,hora_inicio:null,hora_fin:null,recursos:['tech-1']}]}/>);expect(html).toContain('disabled=""');expect(html).toContain('Ocupado: Sede de ejemplo');expect(html).toContain('Tecnólogo dos');});
});
