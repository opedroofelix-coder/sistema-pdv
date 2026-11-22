-- Pacote de melhorias no catalogo (ver CLAUDE.md). Escopo desta migration:
-- rastreio de enriquecimento em product_catalog, log de tentativas de busca
-- (alimenta fila de retry e relatorio de taxa de acerto), validade em
-- stock_items, e bloqueio de venda de item vencido em create_sale.

-- ---------------------------------------------------------------------------
-- product_catalog: rastreio de enriquecimento. 'not_found' (cascata
-- completou sem erro e nenhuma fonte tinha o produto) nao e um estado
-- persistido aqui -- nesse caso nao ha linha de product_catalog nenhuma
-- ainda, o operador cadastra manual e a linha nasce direto como 'manual'.
-- ---------------------------------------------------------------------------
alter table product_catalog
  add column enrichment_status text not null default 'resolved'
    check (enrichment_status in ('resolved', 'pending', 'manual')),
  add column enrichment_attempts int not null default 0,
  add column enrichment_last_attempt_at timestamptz;

-- Backfill: linhas ja existentes com source='manual' viram 'manual'; as
-- demais ja tem dados de alguma fonte externa, entao o default 'resolved'
-- ja esta correto pra elas sem precisar de UPDATE.
update product_catalog set enrichment_status = 'manual' where source = 'manual';

-- ---------------------------------------------------------------------------
-- catalog_lookup_log: uma linha por FONTE EFETIVAMENTE CONSULTADA (nao por
-- lookup) -- cache hit conta como uma linha (source='cache'), e cada fonte
-- externa realmente chamada durante a cascata (mesmo as que erraram/nao
-- acharam no caminho ate outra fonte resolver) conta a sua propria linha.
-- Isso importa pra dois consumidores: a cota diaria da Cosmos (uma fonte
-- tentada-e-perdida ainda gastou uma chamada real, precisa contar) e o
-- relatorio de taxa de acerto (consultas consumidas por API). "Nao
-- encontrado" nao e um source: um lookup que nao acha nada em fonte nenhuma
-- fica visivel como uma sequencia de linhas outcome='miss' sem nenhum 'hit'
-- entre elas, sem precisar de uma linha sintetica separada.
-- Escrita e feita pela Edge Function com a service role key -- so ela grava
-- (RLS aqui so libera leitura autenticada).
-- ---------------------------------------------------------------------------
create table catalog_lookup_log (
  id uuid primary key default gen_random_uuid(),
  ean text not null,
  origin text check (origin in ('nacional', 'importado')),
  source text not null
    check (source in ('cache', 'cosmos', 'upcitemdb', 'openbeautyfacts', 'off')),
  outcome text not null check (outcome in ('hit', 'miss', 'error')),
  error_detail text,
  created_at timestamptz not null default now()
);

create index catalog_lookup_log_created_at_idx on catalog_lookup_log (created_at);
create index catalog_lookup_log_source_idx on catalog_lookup_log (source);
create index catalog_lookup_log_ean_idx on catalog_lookup_log (ean);

alter table catalog_lookup_log enable row level security;

create policy "catalog_lookup_log: authenticated read" on catalog_lookup_log
  for select to authenticated using (true);

grant select on catalog_lookup_log to authenticated;

-- ---------------------------------------------------------------------------
-- service_role: tem BYPASSRLS (ignora as policies acima), mas isso nao
-- supre GRANT de tabela -- sao camadas independentes no Postgres. Nenhuma
-- migration anterior concedeu nada pra service_role (so "authenticated" era
-- usado ate agora); a Edge Function catalog-lookup e o primeiro consumidor
-- desse papel no projeto, entao o gap so aparece agora.
-- ---------------------------------------------------------------------------
grant select, insert, update on product_catalog to service_role;
grant select, insert on catalog_lookup_log to service_role;
-- catalog-enrichment-job junta stock_items pra priorizar produtos com
-- estoque ainda nao vendido (so leitura, nunca grava nessa tabela).
grant select on stock_items to service_role;

-- ---------------------------------------------------------------------------
-- Validade (cosmeticos sao o forte da loja). Nullable: nem todo produto tem
-- validade (ex.: eletronicos), e o campo so passa a ser preenchido em itens
-- novos a partir de agora -- sem reconferencia retroativa, mesmo padrao ja
-- usado pro backfill de origin na Sprint 5.
-- ---------------------------------------------------------------------------
alter table stock_items add column expiry_date date;

-- ---------------------------------------------------------------------------
-- create_sale: bloqueia venda de item vencido. Liberacao (p_override_expired)
-- exige que quem esta chamando (auth.uid(), nao o p_cashier_id informado --
-- esse e so um dado do payload, nao prova quem esta autenticado) seja
-- 'dono'. Sem essa checagem no servidor, um caixa poderia contornar o
-- bloqueio chamando a RPC direto, ja que o app so esconderia o botao.
--
-- O overload de 4 argumentos da Sprint 3 (0003_pdv.sql) nunca foi removido
-- quando a Sprint 4 acrescentou p_session_id/p_idempotency_key -- ha dois
-- create_sale coexistindo hoje. Descartando o de 6 argumentos explicitamente
-- (create or replace so troca a versao com a MESMA lista de tipos) pra nao
-- acumular um terceiro overload e aproveitando pra tambem descartar o de 4,
-- que ja estava orfao.
-- ---------------------------------------------------------------------------
drop function if exists create_sale(uuid, jsonb, text, numeric);
drop function if exists create_sale(uuid, jsonb, text, numeric, uuid, uuid);

create function create_sale(
  p_cashier_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_discount numeric default 0,
  p_session_id uuid default null,
  p_idempotency_key uuid default null,
  p_override_expired boolean default false
)
returns sales
language plpgsql
as $$
declare
  v_session_id uuid;
  v_sale_id uuid;
  v_total numeric := 0;
  v_item record;
  v_price numeric;
  v_cost numeric;
  v_expiry date;
  v_rows int;
  v_caller_role text;
begin
  if p_idempotency_key is not null then
    select id into v_sale_id from sales where idempotency_key = p_idempotency_key;
    if found then
      return (select s from sales s where id = v_sale_id);
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Venda sem itens';
  end if;

  if p_override_expired then
    select role into v_caller_role from profiles where id = auth.uid();
    if v_caller_role is distinct from 'dono' then
      raise exception 'Somente o dono pode liberar a venda de item vencido';
    end if;
  end if;

  if p_session_id is not null then
    select id into v_session_id from cash_sessions where id = p_session_id and closed_at is null;
  else
    select id into v_session_id from cash_sessions where closed_at is null limit 1;
  end if;
  if v_session_id is null then
    raise exception 'Nenhum caixa aberto';
  end if;

  begin
    insert into sales (cashier_id, session_id, payment_method, discount, total, idempotency_key)
    values (p_cashier_id, v_session_id, p_payment_method, coalesce(p_discount, 0), 0, p_idempotency_key)
    returning id into v_sale_id;
  exception when unique_violation then
    return (select s from sales s where idempotency_key = p_idempotency_key);
  end;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(stock_item_id uuid, quantity int)
  loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Quantidade inválida para item %', v_item.stock_item_id;
    end if;

    select expiry_date into v_expiry from stock_items where id = v_item.stock_item_id;

    if v_expiry is not null and v_expiry < current_date and not p_override_expired then
      raise exception 'Item % vencido em % — venda requer liberação do dono', v_item.stock_item_id, v_expiry;
    end if;

    update stock_items
      set quantity_sold = quantity_sold + v_item.quantity
      where id = v_item.stock_item_id
        and quantity_sold + v_item.quantity <= quantity
      returning sale_price, allocated_cost into v_price, v_cost;

    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'Estoque insuficiente para o item %', v_item.stock_item_id;
    end if;

    insert into sale_items (sale_id, stock_item_id, quantity, unit_price, cost_at_sale)
    values (v_sale_id, v_item.stock_item_id, v_item.quantity, v_price, v_cost);

    v_total := v_total + v_price * v_item.quantity;
  end loop;

  update sales set total = v_total - coalesce(p_discount, 0) where id = v_sale_id;

  return (select s from sales s where id = v_sale_id);
end;
$$;

grant execute on function create_sale(uuid, jsonb, text, numeric, uuid, uuid, boolean) to authenticated;
