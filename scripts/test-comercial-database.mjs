// PostgreSQL efímero local. No usa credenciales ni datos reales.
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
const db=new PGlite({extensions:{btree_gist}});
await db.exec(`
create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;
create schema auth;create schema extensions;create schema storage;create schema net;create schema vault;
create table auth.users(id uuid primary key,email text);
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
grant usage on schema auth,public,extensions,storage to authenticated,anon,service_role,supabase_auth_admin;
grant execute on all functions in schema auth to authenticated,anon,service_role,supabase_auth_admin;
create table storage.buckets(id text primary key,name text,public boolean);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
`);
let count=0;
for(const name of(await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort()){
 if(name==='20261102014358_mercadopago_sincronizacion_programada.sql')continue; // Servicios externos cron/net.
 if(name==='20260725000060_datos_comerciales_y_folio62.sql')await db.exec("insert into public.tenants(id,nombre_comercial) values('7e4b2a1a-8926-4262-92e2-1f0e75951b9a','Óptica ficticia de regresión');");
 if(name==='20261110055348_lentia_comercial_configuracion_y_timbres.sql')await db.exec(`
 insert into auth.users(id,email) values('dddddddd-dddd-4ddd-dddd-dddddddddddd','legacy@ficticia.invalid');
 insert into public.users(id,tenant_id,nombre,email,rol,rut,titulo_profesional) values('dddddddd-dddd-4ddd-dddd-dddddddddddd','7e4b2a1a-8926-4262-92e2-1f0e75951b9a','Autor histórico ficticio','legacy@ficticia.invalid','admin','44444444-4','Tecnólogo Médico');
 insert into public.pacientes(id,tenant_id,nombre) values('eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee','7e4b2a1a-8926-4262-92e2-1f0e75951b9a','Paciente histórico ficticio');
 insert into public.recetas(tenant_id,paciente_id,profesional_id) values('7e4b2a1a-8926-4262-92e2-1f0e75951b9a','eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee','dddddddd-dddd-4ddd-dddd-dddddddddddd');
 insert into public.costos_cristales(tenant_id,tipo_lente,rango_receta,tratamiento,costo,precio_venta) values('7e4b2a1a-8926-4262-92e2-1f0e75951b9a','Monofocal','±2.00 / ±2.00','Regresión ficticia',21111,53333);
 `);
 try{await db.exec(await readFile('supabase/migrations/'+name,'utf8'));count++;}catch(e){console.error('Falló migración:',name,e.message);process.exit(1);}
}
try{await db.exec(await readFile('tests/comercial-database.sql','utf8'));}catch(e){console.error('Falló prueba comercial:',e.message,e.code,e.where);process.exit(1);}
console.log(`${count} migraciones y pruebas comerciales verificadas en PostgreSQL local.`);await db.close();
