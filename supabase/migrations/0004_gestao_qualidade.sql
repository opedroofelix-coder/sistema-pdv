-- Sprint 4: gestao e qualidade (ver CLAUDE.md secao 4, Sprint 4).
-- Escopo: views de relatorio, idempotencia para sincronizacao offline do
-- PDV, e backup automatico via pg_cron.

-- ---------------------------------------------------------------------------
-- Relatorio de margem por lote: vendido, custo do vendido (congelado em
-- cost_at_sale), e valor/quantidade restante em estoque.
-- ---------------------------------------------------------------------------
create view lot_margin_report as
select
  l.id as lot_id,
  l.supplier,
  l.purchase_value,
  l.status,
  coalesce(rev.revenue, 0) as revenue,
  coalesce(rev.cost, 0) as cost_of_sold,
  coalesce(rem.remaining_value, 0) as remaining_stock_value,
  coalesce(rem.remaining_units, 0) as remaining_units
from lots l
left join lateral (
  select sum(si.quantity * si.unit_price) as revenue,
         sum(si.quantity * si.cost_at_sale) as cost
  from sale_items si
  join stock_items sti on sti.id = si.stock_item_id
  join sales s on s.id = si.sale_id
  where sti.lot_id = l.id and s.status = 'completed'
) rev on true
left join lateral (
  select sum(allocated_cost * (quantity - quantity_sold)) as remaining_value,
         sum(quantity - quantity_sold) as remaining_units
  from stock_items where lot_id = l.id
) rem on true;

-- ---------------------------------------------------------------------------
-- Data da ultima venda por stock_item, usada pelo relatorio de estoque
-- parado (o front cruza isso com listAllStockItems() para calcular "dias
-- parado" e filtrar por limiar).
-- ---------------------------------------------------------------------------
create view stock_last_sale as
select si.stock_item_id, max(s.created_at) as last_sold_at
from sale_items si
join sales s on s.id = si.sale_id
where s.status = 'completed'
group by si.stock_item_id;

grant select on lot_margin_report, stock_last_sale to authenticated;

-- ---------------------------------------------------------------------------
-- Idempotencia para sincronizacao offline do PDV: create_sale ganha
-- p_idempotency_key (gerada uma vez no cliente ao finalizar, reenviada em
-- cada tentativa de sincronizacao) e p_session_id explicito (em vez de
-- redescobrir "qual sessao esta aberta agora", que atribuiria a venda a
-- sessao errada se ela for fechada entre a venda offline e a sincronizacao).
--
-- A garantia contra duplicidade e a constraint unique capturada via
-- "exception when unique_violation" -- um SELECT seguido de INSERT teria
-- uma janela de corrida entre duas chamadas concorrentes com a mesma chave.
-- ---------------------------------------------------------------------------
alter table sales add column idempotency_key uuid unique;

create or replace function create_sale(
  p_cashier_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_discount numeric default 0,
  p_session_id uuid default null,
  p_idempotency_key uuid default null
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
  v_rows int;
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

grant execute on function create_sale(uuid, jsonb, text, numeric, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Backup automatico: pg_cron roda diariamente uma funcao que serializa as
-- tabelas de negocio para uma linha JSONB, com limpeza de snapshots com
-- mais de 30 dias. Backup fica dentro do mesmo projeto Supabase (protege
-- contra corrupcao/exclusao acidental de dados, nao contra perda do
-- projeto inteiro) -- GitHub Actions nao esta disponivel neste ambiente
-- para um backup externo de verdade.
-- ---------------------------------------------------------------------------
create table backup_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  data jsonb not null
);

create function create_backup_snapshot()
returns void
language plpgsql
as $$
begin
  insert into backup_snapshots (data)
  values (jsonb_build_object(
    'stores', (select jsonb_agg(t) from stores t),
    'profiles', (select jsonb_agg(t) from profiles t),
    'product_catalog', (select jsonb_agg(t) from product_catalog t),
    'lots', (select jsonb_agg(t) from lots t),
    'stock_items', (select jsonb_agg(t) from stock_items t),
    'sales', (select jsonb_agg(t) from sales t),
    'sale_items', (select jsonb_agg(t) from sale_items t),
    'cash_sessions', (select jsonb_agg(t) from cash_sessions t),
    'cash_movements', (select jsonb_agg(t) from cash_movements t)
  ));
  delete from backup_snapshots where created_at < now() - interval '30 days';
end;
$$;

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- cron.schedule faz upsert por nome do job; a migration pode rodar de novo
-- sem duplicar o agendamento.
select cron.schedule('daily-backup', '0 3 * * *', $$select public.create_backup_snapshot();$$);
