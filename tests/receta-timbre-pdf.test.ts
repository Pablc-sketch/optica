import {expect,it} from 'vitest';
import {construirPdfReceta} from '@/lib/pdf-receta';
import {timbreDeReceta} from '@/lib/timbre-receta';
import type {DatosRecetaImpresion} from '@/lib/receta-datos';
it('exporta el timbre guardado y ajusta nombres y títulos largos',async()=>{
 const datos:DatosRecetaImpresion={opticaNombre:'Óptica ficticia',opticaDireccion:'Dirección de prueba',opticaTelefono:null,logoUrl:null,pacienteNombre:'Paciente ficticio',rut:'11.111.111-1',edad:40,tipoVision:'Lejos',fecha:'10/11/2026',od:{esfera:'-1.00',cilindro:'-0.50',eje:'180',av:'1.0'},oi:{esfera:'-1.00',cilindro:'-0.50',eje:'180',av:'1.0'},dp:'62',altura:'20',add:'—',diagnostico:null,alertas:[],observaciones:[],notas:null,profesional:timbreDeReceta({nombre:'Tecnóloga Ficticia con Nombre y Apellidos de Prueba',rut:'11111111-1',titulo_profesional:'Tecnóloga Médica con mención en Oftalmología y Optometría',registro_profesional:'REGISTRO-FICTICIO-123456'},null)};
 const pdf=await construirPdfReceta(datos);expect(pdf.output()).toContain('Tecn');expect(pdf.getNumberOfPages()).toBe(1);
});
