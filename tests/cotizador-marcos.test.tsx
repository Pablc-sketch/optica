import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import NuevaReceta from '../src/app/(app)/(protegido)/pacientes/[id]/nueva-receta';
import SimuladorSalida from '../src/components/simulador-salida';
import {RECARGOS_OPTICA_GLOBAL as tarifas} from '../src/lib/niveles-marco';
import type {CatalogoLaboratorio} from '../src/lib/costo-fides';
import type {ComponentProps} from 'react';
vi.mock('@/lib/actions/pacientes',()=>({crearReceta:vi.fn(),actualizarReceta:vi.fn()}));
const catalogo:CatalogoLaboratorio={stock:[{material:'CR AR 1.56',diseno:'MONOFOCAL',esfera_max:2,cilindro_max:2,precio_unitario:670}],laboratorio:[],montaje:[],recargos:[],promociones:[],descuentoPct:0};
const fila={tipo_lente:'Monofocal',tratamiento:'Orgánico Antirreflejo',rango_receta:'±2.00 / ±2.00',costo:3975,precio_venta:55000,precio_venta_stock:38000,material_stock:'CR AR 1.56',material_laboratorio:'ORGANICO 1.56 HMC',diseno_laboratorio:'MONOFOCAL CONFORT',montaje_material:'ORGANICO SIMPLE'};
const receta:NonNullable<ComponentProps<typeof NuevaReceta>['receta']>={id:'r',tipo:'lejos',od_esfera:-1,oi_esfera:-1,od_cilindro:0,oi_cilindro:0,od_eje:null,oi_eje:null,od_add:null,oi_add:null,av_od:null,av_oi:null,dp:null,altura:null,notas:null,operativo_id:null,sugerencia_tipo_lente:'Monofocal',sugerencia_tratamiento:'Orgánico Antirreflejo',sugerencia_tipo_lente_cerca:null,sugerencia_tratamiento_cerca:null};
describe('Cotizador visible del tecnólogo',()=>{
 it('edición muestra las mismas tres tarifas de AR que venta',()=>{
  const html=renderToStaticMarkup(<NuevaReceta pacienteId="p" operativos={[]} costos={[fila]} catalogoLab={catalogo} recargosMarcos={tarifas} receta={receta}/>);
  for(const t of ['Esencial','Selección','Premium','38.000','49.990','59.990'])expect(html).toContain(t);
  expect(html).not.toMatch(/básico|estándar/i);
 });
 it('nueva receta también muestra los tres niveles antes de guardar',()=>{
  const html=renderToStaticMarkup(<NuevaReceta pacienteId="p" operativos={[]} costos={[fila]} catalogoLab={catalogo} recargosMarcos={tarifas}/>);
  expect(html).toContain('Selección');expect(html).toContain('Premium');
 });
 it('dos pares y extra precargado conservan sus propios cotizadores',()=>{
  const html=renderToStaticMarkup(<NuevaReceta pacienteId="p" operativos={[]} costos={[fila]} catalogoLab={catalogo} recargosMarcos={tarifas} receta={{...receta,tipo:'lejos_y_cerca',od_add:1,oi_add:1,sugerencia_tipo_lente_cerca:'Monofocal',sugerencia_tratamiento_cerca:'Orgánico Antirreflejo',sugerencias_extra:[{tipo_lente:'Monofocal',tratamiento:'Orgánico Antirreflejo',posicion:'lejos'}]}}/>);
  expect((html.match(/49\.990/g)??[]).length).toBeGreaterThanOrEqual(3);
 });
});
describe('Evaluación de rentabilidad',()=>{
 const props={titulo:'Salida',fijosRegistrados:100000,equiposRegistrados:0,esSalidaNoviembre:true,perfiles:[{id:'ar',nombre:'Monofocal · Orgánico Antirreflejo',precio:38000,costo:3975,origen:'stock'}],recargosMarcos:tarifas,debito:2.13,credito:2.96,historica:2.02208,comisionVenta:10};
 it('no inventa viáticos y avisa que faltan completar',()=>{
  const html=renderToStaticMarkup(<SimuladorSalida {...props}/>);
  expect(html).toContain('Presupuesto incompleto');expect(html).toContain('Resultado parcial');
  expect(html).not.toContain('1.100.000');expect(html).toContain('2.13%');expect(html).toContain('2.96%');expect(html).toContain('3.975');
 });
 it('agrega solo equipos faltantes a los fijos ya registrados',()=>{
  const html=renderToStaticMarkup(<SimuladorSalida {...props}/>);
  expect(html).toContain('400.000');
  const conEquipos=renderToStaticMarkup(<SimuladorSalida {...props} fijosRegistrados={400000} equiposRegistrados={300000}/>);
  expect(conEquipos).toContain('400.000');expect(conEquipos).not.toContain('700.000');
 });
 it('sin catálogo no entrega resultado ficticio',()=>expect(renderToStaticMarkup(<SimuladorSalida {...props} perfiles={[]}/>)).toContain('Falta el catálogo'));
});
