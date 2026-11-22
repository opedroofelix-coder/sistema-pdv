-- Job diario que reprocessa product_catalog.enrichment_status='pending'
-- (ver supabase/functions/catalog-enrichment-job). Mesmo padrao de pg_cron
-- ja usado pelo backup diario (0004_gestao_qualidade.sql), mas este job
-- precisa fazer uma chamada HTTP de verdade (pg_net) pra Edge Function, nao
-- so rodar SQL local -- por isso depende de dois segredos no Vault:
--
--   functions_base_url    -- ex.: http://127.0.0.1:54331/functions/v1 (local)
--   service_role_key      -- a service role key do projeto
--
-- Os VALORES desses segredos NAO ficam nesta migration (isso commitaria a
-- service role key no git). Configurar uma vez por ambiente com:
--
--   select vault.create_secret('http://127.0.0.1:54331/functions/v1', 'functions_base_url');
--   select vault.create_secret('<service_role_key>', 'service_role_key');
--
-- Sem os dois segredos cadastrados, cron.schedule abaixo ainda roda, mas a
-- chamada http_post falha silenciosamente (fica só no log do pg_net) --
-- nao trava nada, só o job de enriquecimento nao processa nada naquele dia.
select cron.schedule(
  'catalog-enrichment-job',
  '0 4 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url')
      || '/catalog-enrichment-job',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
