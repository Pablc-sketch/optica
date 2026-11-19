import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {mercadoPagoConfigurado} from '@/lib/mercadopago-sync';
import {consultarSaldoMercadoPago} from '@/lib/mercadopago-saldo';
import {listarTerminalesMP} from '@/lib/mercadopago-point';
import {consultarApiMP,ErrorMercadoPago} from '@/lib/mercadopago-api';
export async function revisarConexionMP(tenant:string){
 if(!mercadoPagoConfigurado(tenant))return;
 const db=createAdminClient();
 const {data,error}=await db.from('mercadopago_sync').select('collector_id').eq('tenant_id',tenant).single();
 if(error||!data?.collector_id)return;
 const [saldo,terminales]=await Promise.allSettled([consultarSaldoMercadoPago(tenant,String(data.collector_id)),listarTerminalesMP(String(data.collector_id))]);
 const capacidades={consultado_en:new Date().toISOString(),saldo:saldo.status==='fulfilled'?saldo.value.estado:'error',
  point:terminales.status==='fulfilled'?terminales.value.length?terminales.value.some(t=>t.modo==='PDV')?'integrado':'requiere_pdv':'sin_terminal':terminales.reason instanceof ErrorMercadoPago?terminales.reason.codigo:'error',
  terminales:terminales.status==='fulfilled'?terminales.value.length:0};
 const {error:guardar}=await db.from('mercadopago_sync').update({capacidades}).eq('tenant_id',tenant);
 if(guardar)throw new Error('No se pudo guardar el estado de conexión.');
 return capacidades;
}

// Configuración explícita solicitada por administración, nunca durante el cron.
// No envía cargos ni cambia al modo de autoservicio.
export async function integrarTerminalUnicaMP(tenant:string){
 if(!mercadoPagoConfigurado(tenant))throw new Error('No configurado');
 const db=createAdminClient();
 const {data,error}=await db.from('mercadopago_sync').select('collector_id').eq('tenant_id',tenant).single();
 if(error||!data?.collector_id)throw new Error('Cuenta no verificada');
 const terminales=await listarTerminalesMP(String(data.collector_id));
 if(terminales.length!==1)throw new Error('Selecciona la máquina desde la compra.');
 const terminal=terminales[0];
 if(terminal.modo!=='PDV')await consultarApiMP('/terminals/v1/setup',{method:'PATCH',body:JSON.stringify({terminals:[{id:terminal.id,operating_mode:'PDV'}]})});
 return revisarConexionMP(tenant);
}
