-- Preco de referencia do Mercado Livre: a API publica de busca passou a
-- responder 403 pra qualquer chamada, autenticada ou nao (ver CLAUDE.md) --
-- a chamada migra pro servidor (Edge Function `mercado-livre-price`, mesmo
-- padrao ja usado pra Cosmos/UPCitemdb/OFF/OBF) com fluxo OAuth
-- client_credentials. Esta migration so cria o cache do token.

-- ---------------------------------------------------------------------------
-- Cache do token OAuth (renovacao lazy: busca token novo so quando o
-- cache expira, sem job separado -- mesmo padrao do cache de preco de
-- 30 dias). Linha unica (singleton via check (id)).
-- ---------------------------------------------------------------------------
create table mercado_livre_oauth_token (
  id boolean primary key default true,
  access_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint mercado_livre_oauth_token_singleton check (id)
);

alter table mercado_livre_oauth_token enable row level security;

-- Sem policy nenhuma pra authenticated/anon: essa linha guarda um bearer
-- token valido, ninguem alem da service role pode ler ou gravar.
grant select, insert, update on mercado_livre_oauth_token to service_role;
