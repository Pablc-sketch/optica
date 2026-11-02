-- Supabase programa las consultas: Vercel Hobby solo admite cron diario.
-- El secreto de este endpoint es independiente del Access Token de Mercado Pago.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
revoke all on schema net from public, anon, authenticated;
revoke all on net.http_request_queue from public, anon, authenticated;
revoke all on vault.decrypted_secrets from public, anon, authenticated;
-- La programación se activa después de publicar y guardar el secreto en Vault.
