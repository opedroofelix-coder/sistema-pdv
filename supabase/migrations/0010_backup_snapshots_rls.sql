-- Corrige gap de seguranca encontrado na preparacao do ambiente de producao:
-- backup_snapshots (migration 0004) guarda uma copia JSON completa de TODAS
-- as tabelas de negocio (vendas, perfis, caixa, etc.) a cada backup diario,
-- e nunca teve RLS ligado -- ficava exposta pra qualquer um com a chave
-- anonima publica (a mesma que vai pro bundle do frontend).
--
-- create_backup_snapshot() (0004) nao usa security definer, roda como
-- postgres via pg_cron, que ignora RLS -- ligar RLS aqui nao quebra o
-- job diario. Sem policy nenhuma pra anon/authenticated, mesmo padrao ja
-- usado pra mercado_livre_oauth_token (0008): so service_role acessa.
alter table backup_snapshots enable row level security;

grant select, insert, delete on backup_snapshots to service_role;
