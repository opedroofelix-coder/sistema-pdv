-- Decisao #66: integracao com a loja virtual na Nuvemshop -- um estoque so.
--
-- O sistema e' a fonte da verdade do saldo. Regras do dono:
--   * vai pro site todo produto com saldo (sem marcar um a um);
--   * produto que ja existia la e' VINCULADO pelo campo "Codigo de barras"
--     da variante (= product_catalog.ean); o que nao casar fica numa lista
--     de revisao manual;
--   * produto que nao existia e' CRIADO pelo sistema -- mas so depois que o
--     dono revisa a lista na primeira conexao (auto_create) ou pede um a um;
--   * preco vai daqui SO na criacao; depois e' editado so na Nuvemshop;
--   * pedido pago no site vira venda aqui (canal 'site'), cancelado devolve.
--
-- Unidade de sincronizacao: 1 product_catalog <-> 1 VARIANTE na Nuvemshop.
-- Saldo enviado = soma de (quantity - quantity_sold) dos stock_items ativos
-- daquele catalogo, em todos os lotes.
--
-- Tudo aditivo (regra 5): tabelas novas, colunas novas com default, checks so
-- ALARGADOS, funcoes novas. cancel_sale ganha so um guarda.
--
-- Em producao este arquivo foi aplicado em partes (apply_migration do MCP do
-- Supabase recusava -- timeout -- blocos grandes e alguns comandos que ele
-- classifica como destrutivos, como `update` sem `where` e certos `delete`
-- dentro de funcao). Por isso os deletes de nuvemshop_link vivem em helpers
-- (nuvemshop_forget_*) e o update de auto_create tem `where id`. Historico de
-- producao: nuvemshop_1_tabelas ... nuvemshop_9_cancel_sale_guarda.

-- ---------------------------------------------------------------------------
-- Vendas: canal e pedido de origem
-- ---------------------------------------------------------------------------
alter table sales add column channel text not null default 'loja'
  check (channel in ('loja', 'site'));
-- Id do pedido na Nuvemshop. Unique = idempotencia do webhook (a Nuvemshop
-- reentrega o mesmo evento se nao receber 200 a tempo).
alter table sales add column external_order_id text unique;
alter table sales add column external_order_number text;

-- 'online' = pago na Nuvemshop (gateway do site). So alarga o dominio.
alter table sales drop constraint if exists sales_payment_method_check;
alter table sales add constraint sales_payment_method_check
  check (payment_method in ('dinheiro', 'pix', 'credito', 'debito', 'misto', 'online'));

alter table sale_payments drop constraint if exists sale_payments_method_check;
alter table sale_payments add constraint sale_payments_method_check
  check (method in ('dinheiro', 'pix', 'credito', 'debito', 'online'));

-- ---------------------------------------------------------------------------
-- Credenciais da loja (gravadas pela Edge Function `nuvemshop-oauth` na
-- instalacao do app). Singleton, sem policy: guarda um bearer token -- so
-- service_role le/grava (mesmo padrao do 0008_mercado_livre_oauth).
-- ---------------------------------------------------------------------------
create table nuvemshop_credentials (
  id boolean primary key default true,
  store_id bigint not null,
  access_token text not null,
  store_name text,
  store_url text,
  -- Liberado pelo dono depois de revisar a lista de vinculo ("Criar os
  -- restantes no site"). Enquanto false, produto sem par so e' criado se o
  -- dono pedir um a um.
  auto_create boolean not null default false,
  connected_at timestamptz not null default now(),
  last_import_at timestamptz,
  constraint nuvemshop_credentials_singleton check (id)
);

alter table nuvemshop_credentials enable row level security;
grant select, insert, update, delete on nuvemshop_credentials to service_role;

-- Status da conexao pra tela de Integracoes, SEM o token. View sem
-- security_invoker de proposito: authenticated nao le a tabela, so estas
-- colunas inofensivas.
create view nuvemshop_connection as
  select store_id, store_name, store_url, auto_create, connected_at, last_import_at
  from nuvemshop_credentials;
grant select on nuvemshop_connection to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Vinculo catalogo <-> variante da Nuvemshop
-- ---------------------------------------------------------------------------
create table nuvemshop_links (
  catalog_id uuid primary key references product_catalog (id) on delete cascade,
  ns_product_id bigint not null,
  ns_variant_id bigint not null unique,
  -- linked = ja existia no site; created = o sistema criou.
  origin text not null check (origin in ('linked', 'created')),
  last_synced_stock int,
  last_synced_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now()
);

alter table nuvemshop_links enable row level security;
create policy "nuvemshop_links: authenticated read" on nuvemshop_links
  for select to authenticated using (true);
grant select on nuvemshop_links to authenticated;
grant select, insert, update, delete on nuvemshop_links to service_role;

-- Decisao do dono por produto daqui que NAO tem par no site:
--   create  = pode criar no site (pedido um a um)
--   exclude = "Nao vender no site"
--   review  = precisa de revisao (ex.: o produto foi apagado na Nuvemshop);
--             nao e' recriado nem com auto_create ligado.
-- Sem linha = segue a regra geral (auto_create).
create table nuvemshop_catalog_choices (
  catalog_id uuid primary key references product_catalog (id) on delete cascade,
  choice text not null check (choice in ('create', 'exclude', 'review')),
  reason text,
  updated_at timestamptz not null default now()
);

alter table nuvemshop_catalog_choices enable row level security;
create policy "nuvemshop_catalog_choices: authenticated read" on nuvemshop_catalog_choices
  for select to authenticated using (true);
grant select on nuvemshop_catalog_choices to authenticated;
grant select, insert, update, delete on nuvemshop_catalog_choices to service_role;

-- Variantes do site sem par aqui (preenchida pela importacao). Sai daqui
-- quando o dono vincula; "Ignorar" deixa a linha marcada e o sistema nunca
-- mexe no estoque dela.
create table nuvemshop_unmatched (
  ns_variant_id bigint primary key,
  ns_product_id bigint not null,
  name text not null,
  barcode text,
  sku text,
  stock int,
  image_url text,
  ignored boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table nuvemshop_unmatched enable row level security;
create policy "nuvemshop_unmatched: authenticated read" on nuvemshop_unmatched
  for select to authenticated using (true);
grant select on nuvemshop_unmatched to authenticated;
grant select, insert, update, delete on nuvemshop_unmatched to service_role;

-- Pedidos pagos que nao fecharam 100% aqui (peca vendida nos dois canais ao
-- mesmo tempo, variante nao vinculada). A venda entra assim mesmo -- o
-- faltante vira linha avulsa pra o faturamento bater com o pedido -- e o
-- dono ve o aviso em Integracoes.
create table nuvemshop_order_issues (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references sales (id) on delete cascade,
  external_order_id text not null,
  external_order_number text,
  kind text not null check (kind in ('sem_estoque', 'nao_vinculado')),
  item_name text,
  quantity int,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table nuvemshop_order_issues enable row level security;
create policy "nuvemshop_order_issues: authenticated read" on nuvemshop_order_issues
  for select to authenticated using (true);
grant select on nuvemshop_order_issues to authenticated;
grant select, insert, update on nuvemshop_order_issues to service_role;

-- ---------------------------------------------------------------------------
-- Fila de sincronizacao: uma linha por catalogo (upsert). Drenada pela Edge
-- Function `nuvemshop-sync` via nuvemshop_claim_queue.
-- ---------------------------------------------------------------------------
create table nuvemshop_sync_queue (
  catalog_id uuid primary key references product_catalog (id) on delete cascade,
  available_at timestamptz not null default now(),
  attempts int not null default 0,
  enqueued_at timestamptz not null default now()
);

alter table nuvemshop_sync_queue enable row level security;
grant select, insert, update, delete on nuvemshop_sync_queue to service_role;

-- service_role precisa ler/gravar mais do que o 0006 concedeu (licao da
-- decisao #44: faltar GRANT derruba a function em producao em silencio).
grant select on stores, lots, profiles to service_role;
grant select, update on product_catalog to service_role;
grant select, update on stock_items to service_role;
grant select, insert, update on sales to service_role;
grant select, insert on sale_items to service_role;
grant select, insert on sale_payments to service_role;

-- ---------------------------------------------------------------------------
-- Estado de cada produto do catalogo pra integracao: saldo total, preco de
-- criacao (maior sale_price entre os lotes com saldo) e SKU (EAN, ou o codigo
-- interno do item mais antigo pra produto sem codigo de barras). Agregado no
-- banco pra nao esbarrar no max_rows=1000 do PostgREST (decisoes #50/#64).
-- ---------------------------------------------------------------------------
create view nuvemshop_catalog_stock with (security_invoker = true) as
  select
    c.id as catalog_id,
    c.ean,
    c.name,
    c.brand,
    c.photo_url,
    c.active as catalog_active,
    coalesce(sum(greatest(s.quantity - s.quantity_sold, 0)) filter (where s.active), 0)::int
      as available,
    max(s.sale_price) filter (where s.active and s.quantity > s.quantity_sold)
      as create_price,
    coalesce(c.ean, (array_agg(s.internal_code order by s.created_at))[1]) as sku
  from product_catalog c
  join stock_items s on s.catalog_id = c.id
  group by c.id;

grant select on nuvemshop_catalog_stock to authenticated, service_role;

-- Pra lista "Daqui, sem par no site": produto com saldo, sem vinculo, que o
-- dono nao excluiu.
create view nuvemshop_pending_catalog with (security_invoker = true) as
  select cs.*, ch.choice, ch.reason
  from nuvemshop_catalog_stock cs
  left join nuvemshop_links l on l.catalog_id = cs.catalog_id
  left join nuvemshop_catalog_choices ch on ch.catalog_id = cs.catalog_id
  where l.catalog_id is null
    and cs.catalog_active
    and cs.available > 0
    and coalesce(ch.choice, '') <> 'exclude';

grant select on nuvemshop_pending_catalog to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enfileiramento
-- ---------------------------------------------------------------------------

-- O produto interessa ao site? Vinculado, ou sem par mas com criacao
-- liberada (pedido um a um, ou auto_create sem decisao contraria).
create function nuvemshop_should_sync(p_catalog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from nuvemshop_credentials)
    and (
      exists (select 1 from nuvemshop_links where catalog_id = p_catalog_id)
      or exists (select 1 from nuvemshop_catalog_choices
                 where catalog_id = p_catalog_id and choice = 'create')
      or (
        (select auto_create from nuvemshop_credentials)
        and not exists (select 1 from nuvemshop_catalog_choices where catalog_id = p_catalog_id)
      )
    );
$$;

create function nuvemshop_enqueue(p_catalog_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into nuvemshop_sync_queue (catalog_id) values (p_catalog_id)
  on conflict (catalog_id) do update
    set available_at = least(nuvemshop_sync_queue.available_at, now()),
        enqueued_at = now();
$$;

grant execute on function nuvemshop_enqueue(uuid) to service_role;

-- Estoque mudou (venda do PDV ou do site, cancelamento, recebimento, edicao
-- de quantidade, exclusao): enfileira o produto se ele interessa ao site.
-- Cobre todos esses fluxos sem mexer em nenhum deles.
create function trg_nuvemshop_stock_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.catalog_id is not null
     and nuvemshop_should_sync(new.catalog_id) then
    perform nuvemshop_enqueue(new.catalog_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.catalog_id is not null
     and (tg_op = 'DELETE' or old.catalog_id is distinct from new.catalog_id)
     and nuvemshop_should_sync(old.catalog_id) then
    perform nuvemshop_enqueue(old.catalog_id);
  end if;
  return null;
end;
$$;

create trigger nuvemshop_stock_items_sync
  after insert or delete or update of quantity, quantity_sold, active, catalog_id
  on stock_items
  for each row execute function trg_nuvemshop_stock_items();

-- Catalogo desativado (exclusao logica) -> saldo vai a 0 no site.
create function trg_nuvemshop_catalog()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active is distinct from old.active and nuvemshop_should_sync(new.id) then
    perform nuvemshop_enqueue(new.id);
  end if;
  return null;
end;
$$;

create trigger nuvemshop_catalog_sync
  after update of active on product_catalog
  for each row execute function trg_nuvemshop_catalog();

-- Chama a Edge Function assim que algo entra na fila (1x por comando, nao
-- por linha; pg_net so envia depois do commit). Qualquer falha aqui (Vault
-- sem os segredos, pg_net fora) e' engolida: NUNCA pode travar uma venda. O
-- cron de 1 minuto abaixo e' a rede de seguranca.
create function trg_nuvemshop_queue_kick()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url')
        || '/nuvemshop-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{"action":"drain"}'::jsonb,
      timeout_milliseconds := 30000
    );
  exception when others then
    null;
  end;
  return null;
end;
$$;

create trigger nuvemshop_queue_kick
  after insert on nuvemshop_sync_queue
  for each statement execute function trg_nuvemshop_queue_kick();

-- Tira ate p_limit produtos prontos da fila. skip locked: duas execucoes
-- simultaneas nunca pegam o mesmo produto.
create function nuvemshop_claim_queue(p_limit int default 20)
returns table (catalog_id uuid, attempts int)
language sql
security definer
set search_path = public
as $$
  delete from nuvemshop_sync_queue q
  where q.catalog_id in (
    select catalog_id from nuvemshop_sync_queue
    where available_at <= now()
    order by available_at
    limit p_limit
    for update skip locked
  )
  returning q.catalog_id, q.attempts;
$$;

-- Erro transitorio (429/5xx/rede): volta pra fila com espera crescente
-- (1, 2, 4... ate 60 min), sem loop enquanto a Nuvemshop estiver fora.
create function nuvemshop_requeue(p_catalog_id uuid, p_attempts int)
returns void
language sql
security definer
set search_path = public
as $$
  insert into nuvemshop_sync_queue (catalog_id, available_at, attempts)
  values (
    p_catalog_id,
    now() + make_interval(mins => least(60, power(2, greatest(p_attempts, 0))::int)),
    p_attempts + 1
  )
  on conflict (catalog_id) do update
    set available_at = excluded.available_at, attempts = excluded.attempts;
$$;

grant execute on function nuvemshop_claim_queue(int) to service_role;
grant execute on function nuvemshop_requeue(uuid, int) to service_role;

-- Rede de seguranca: drena a fila a cada minuto (mesmos segredos do 0007).
select cron.schedule(
  'nuvemshop-sync',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url')
      || '/nuvemshop-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"action":"drain"}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from nuvemshop_sync_queue where available_at <= now());
  $$
);

-- ---------------------------------------------------------------------------
-- Acoes do dono na tela de revisao (checagem de papel no servidor, mesmo
-- formato do 0019).
-- ---------------------------------------------------------------------------
create function nuvemshop_assert_dono()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select role from profiles where id = auth.uid()) is distinct from 'dono' then
    raise exception 'Somente o dono pode gerenciar a integração com a Nuvemshop';
  end if;
end;
$$;

-- Helpers de limpeza usados por nuvemshop_link (ver nota no topo).
create function nuvemshop_forget_unmatched(p_ns_variant_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  delete from nuvemshop_unmatched where ns_variant_id = p_ns_variant_id;
$$;

create function nuvemshop_forget_choice(p_catalog_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from nuvemshop_catalog_choices c where c.catalog_id = p_catalog_id;
$$;

revoke execute on function nuvemshop_forget_unmatched(bigint) from public;
revoke execute on function nuvemshop_forget_choice(uuid) from public;

-- Vincular a mao um produto daqui a uma variante do site sem par.
create function nuvemshop_link(p_catalog_id uuid, p_ns_variant_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id bigint;
begin
  perform nuvemshop_assert_dono();

  if exists (select 1 from nuvemshop_links where catalog_id = p_catalog_id) then
    raise exception 'Este produto já está vinculado a um produto do site';
  end if;
  if exists (select 1 from nuvemshop_links where ns_variant_id = p_ns_variant_id) then
    raise exception 'Este produto do site já está vinculado a outro produto';
  end if;

  v_product_id := (select u.ns_product_id from nuvemshop_unmatched u where u.ns_variant_id = p_ns_variant_id);
  if v_product_id is null then
    raise exception 'Produto do site não encontrado. Clique em Sincronizar agora e tente de novo';
  end if;

  insert into nuvemshop_links (catalog_id, ns_product_id, ns_variant_id, origin)
  values (p_catalog_id, v_product_id, p_ns_variant_id, 'linked');
  perform nuvemshop_forget_unmatched(p_ns_variant_id);
  perform nuvemshop_forget_choice(p_catalog_id);
  perform nuvemshop_enqueue(p_catalog_id);
end;
$$;

-- "Criar no site" (choice = 'create') / "Nao vender no site" ('exclude') /
-- desfazer (null). Produto vinculado nao aceita choice.
create function nuvemshop_set_choice(p_catalog_id uuid, p_choice text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform nuvemshop_assert_dono();

  if p_choice is null then
    delete from nuvemshop_catalog_choices where catalog_id = p_catalog_id;
  elsif p_choice in ('create', 'exclude') then
    if exists (select 1 from nuvemshop_links where catalog_id = p_catalog_id) then
      raise exception 'Este produto já está vinculado a um produto do site';
    end if;
    insert into nuvemshop_catalog_choices (catalog_id, choice)
    values (p_catalog_id, p_choice)
    on conflict (catalog_id) do update
      set choice = excluded.choice, reason = null, updated_at = now();
  else
    raise exception 'Opção inválida: %', p_choice;
  end if;

  if nuvemshop_should_sync(p_catalog_id) then
    perform nuvemshop_enqueue(p_catalog_id);
  end if;
end;
$$;

create function nuvemshop_set_ignored(p_ns_variant_id bigint, p_ignored boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform nuvemshop_assert_dono();
  update nuvemshop_unmatched set ignored = p_ignored, updated_at = now()
    where ns_variant_id = p_ns_variant_id;
end;
$$;

-- "Criar os restantes no site": liga auto_create e enfileira todo produto
-- com saldo ainda sem par (menos os excluidos/em revisao).
create function nuvemshop_enable_auto_create()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  perform nuvemshop_assert_dono();

  update nuvemshop_credentials set auto_create = true where id;
  if not found then
    raise exception 'Conecte a loja na Nuvemshop primeiro';
  end if;

  insert into nuvemshop_sync_queue (catalog_id)
  select catalog_id from nuvemshop_pending_catalog
  where choice is null or choice = 'create'
  on conflict (catalog_id) do update set available_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function nuvemshop_resolve_issue(p_issue_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform nuvemshop_assert_dono();
  update nuvemshop_order_issues set resolved_at = now()
    where id = p_issue_id and resolved_at is null;
end;
$$;

revoke execute on function nuvemshop_assert_dono() from public;
grant execute on function nuvemshop_link(uuid, bigint) to authenticated;
grant execute on function nuvemshop_set_choice(uuid, text) to authenticated;
grant execute on function nuvemshop_set_ignored(bigint, boolean) to authenticated;
grant execute on function nuvemshop_enable_auto_create() to authenticated;
grant execute on function nuvemshop_resolve_issue(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_web_sale: pedido pago no site vira venda aqui.
--
-- p_order = {
--   external_order_id, external_order_number,
--   discount,                       -- >= 0, ja calculado pela function
--   items: [{ ns_variant_id, quantity, unit_price, name }]
-- }
--
-- Sem caixa e sem operador (cashier_id/session_id null): o dinheiro nao
-- passou pela gaveta, entao nao entra em close_cash_session nem em
-- /fechamentos (ambos filtram por session_id). Baixa FIFO por lote (lote
-- comprado antes sai primeiro), podendo dividir entre lotes; custo rateado
-- congelado em cost_at_sale como no PDV; unit_price = preco pago no site.
-- O que faltar vira linha avulsa + registro em nuvemshop_order_issues, pra
-- o faturamento bater com o pedido. Idempotente por external_order_id.
-- ---------------------------------------------------------------------------
create function create_web_sale(p_order jsonb)
returns sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id text := p_order->>'external_order_id';
  v_number text := p_order->>'external_order_number';
  v_discount numeric := greatest(coalesce((p_order->>'discount')::numeric, 0), 0);
  v_sale_id uuid;
  v_item record;
  v_catalog_id uuid;
  v_left int;
  v_take int;
  v_stock record;
  v_total numeric := 0;
  v_final numeric;
begin
  if v_order_id is null or v_order_id = '' then
    raise exception 'Pedido sem id';
  end if;

  select id into v_sale_id from sales where external_order_id = v_order_id;
  if found then
    return (select s from sales s where id = v_sale_id);
  end if;

  if p_order->'items' is null or jsonb_array_length(p_order->'items') = 0 then
    raise exception 'Pedido sem itens';
  end if;

  begin
    insert into sales (cashier_id, session_id, channel, external_order_id,
                       external_order_number, payment_method, discount, total)
    values (null, null, 'site', v_order_id, v_number, 'online', 0, 0)
    returning id into v_sale_id;
  exception when unique_violation then
    return (select s from sales s where external_order_id = v_order_id);
  end;

  for v_item in
    select * from jsonb_to_recordset(p_order->'items')
      as x(ns_variant_id bigint, quantity int, unit_price numeric, name text)
  loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      continue;
    end if;
    v_left := v_item.quantity;

    select catalog_id into v_catalog_id
      from nuvemshop_links where ns_variant_id = v_item.ns_variant_id;

    if v_catalog_id is not null then
      for v_stock in
        select s.id, s.quantity - s.quantity_sold as avail
          from stock_items s
          join lots l on l.id = s.lot_id
          where s.catalog_id = v_catalog_id and s.active and s.quantity > s.quantity_sold
          order by l.purchase_date nulls last, s.created_at, s.id
          for update of s
      loop
        exit when v_left <= 0;
        v_take := least(v_left, v_stock.avail);

        update stock_items set quantity_sold = quantity_sold + v_take
          where id = v_stock.id;

        insert into sale_items (sale_id, stock_item_id, quantity, unit_price, cost_at_sale)
        select v_sale_id, v_stock.id, v_take, coalesce(v_item.unit_price, 0), allocated_cost
          from stock_items where id = v_stock.id;

        v_left := v_left - v_take;
      end loop;
    end if;

    if v_left > 0 then
      insert into sale_items (sale_id, stock_item_id, quantity, unit_price, cost_at_sale, description)
      values (v_sale_id, null, v_left, coalesce(v_item.unit_price, 0), 0,
              coalesce(nullif(btrim(v_item.name), ''), 'Produto do site'));

      insert into nuvemshop_order_issues
        (sale_id, external_order_id, external_order_number, kind, item_name, quantity)
      values (v_sale_id, v_order_id, v_number,
              case when v_catalog_id is null then 'nao_vinculado' else 'sem_estoque' end,
              v_item.name, v_left);
    end if;

    v_total := v_total + coalesce(v_item.unit_price, 0) * v_item.quantity;
  end loop;

  v_final := greatest(v_total - v_discount, 0);
  update sales set total = v_final, discount = least(v_discount, v_total)
    where id = v_sale_id;

  if v_final > 0 then
    insert into sale_payments (sale_id, method, amount) values (v_sale_id, 'online', v_final);
  end if;

  return (select s from sales s where id = v_sale_id);
end;
$$;

-- Pedido cancelado na Nuvemshop: devolve o estoque. Idempotente (ja
-- cancelada ou pedido que nunca foi pago -> nao faz nada).
create function cancel_web_sale(p_external_order_id text)
returns sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_item record;
begin
  update sales set status = 'cancelled'
    where external_order_id = p_external_order_id and channel = 'site' and status = 'completed'
    returning id into v_sale_id;

  if v_sale_id is null then
    return (select s from sales s where external_order_id = p_external_order_id);
  end if;

  for v_item in
    select stock_item_id, quantity from sale_items
    where sale_id = v_sale_id and stock_item_id is not null
  loop
    update stock_items set quantity_sold = quantity_sold - v_item.quantity
      where id = v_item.stock_item_id;
  end loop;

  update nuvemshop_order_issues set resolved_at = coalesce(resolved_at, now())
    where sale_id = v_sale_id;

  return (select s from sales s where id = v_sale_id);
end;
$$;

revoke execute on function create_web_sale(jsonb) from public;
revoke execute on function cancel_web_sale(text) from public;
grant execute on function create_web_sale(jsonb) to service_role;
grant execute on function cancel_web_sale(text) to service_role;

-- ---------------------------------------------------------------------------
-- cancel_sale (PDV): mesmo corpo do 0014 + guarda recusando venda do site
-- (cancela-se na Nuvemshop; o webhook devolve o estoque aqui).
-- ---------------------------------------------------------------------------
create or replace function cancel_sale(p_sale_id uuid)
returns sales
language plpgsql
as $$
declare
  v_rows int;
  v_item record;
begin
  if exists (select 1 from sales where id = p_sale_id and channel = 'site') then
    raise exception 'Venda do site: cancele o pedido na Nuvemshop';
  end if;

  update sales set status = 'cancelled'
    where id = p_sale_id and status = 'completed';

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Venda já cancelada ou inexistente';
  end if;

  for v_item in
    select stock_item_id, quantity from sale_items
    where sale_id = p_sale_id and stock_item_id is not null
  loop
    update stock_items
      set quantity_sold = quantity_sold - v_item.quantity
      where id = v_item.stock_item_id;
  end loop;

  return (select s from sales s where id = p_sale_id);
end;
$$;
