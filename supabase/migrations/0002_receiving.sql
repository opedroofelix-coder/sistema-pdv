-- Sprint 2: entrada de mercadoria (ver CLAUDE.md secao 4, Sprint 2).
-- Escopo: bucket de fotos, geracao de codigo interno, e recalculo em tempo
-- real do rateio de custo (allocated_cost) via triggers.

-- ---------------------------------------------------------------------------
-- Storage: bucket de fotos (catalogo e itens de estoque).
-- Publico para leitura (fotos nao sao sensiveis, evita URL assinada no <img>);
-- escrita restrita a usuarios autenticados.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "photos: public read" on storage.objects
  for select using (bucket_id = 'photos');

create policy "photos: authenticated insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');

create policy "photos: authenticated update" on storage.objects
  for update to authenticated using (bucket_id = 'photos') with check (bucket_id = 'photos');

create policy "photos: authenticated delete" on storage.objects
  for delete to authenticated using (bucket_id = 'photos');

-- ---------------------------------------------------------------------------
-- stock_items.sale_price: item nasce ao ser bipado, antes de ter preco
-- definido na tela de conferencia.
-- ---------------------------------------------------------------------------
alter table stock_items alter column sale_price set default 0;

-- ---------------------------------------------------------------------------
-- Codigo interno automatico para itens sem EAN (etiqueta propria).
-- ---------------------------------------------------------------------------
create sequence stock_item_code_seq;

create function generate_internal_code()
returns trigger
language plpgsql
as $$
begin
  if new.internal_code is null then
    new.internal_code := 'EST-' || lpad(nextval('stock_item_code_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger stock_items_generate_internal_code
  before insert on stock_items
  for each row execute function generate_internal_code();

-- ---------------------------------------------------------------------------
-- Rateio de custo (regra de negocio central, CLAUDE.md secao 1):
--   custo_do_item = valor_pago_no_lote x (preco_venda_item / soma(preco_venda x quantidade))
-- Recalculado em tempo real via trigger sempre que um item do lote e
-- inserido/removido/alterado (preco ou quantidade) ou o valor pago no lote
-- muda. So grava em linhas com unidades ainda nao vendidas
-- (quantity_sold < quantity) -- linhas totalmente vendidas ficam congeladas
-- (o congelamento fino por venda, via sale_items.cost_at_sale, e Sprint 3).
-- Precisao total (sem arredondar) para a soma bater exatamente com
-- purchase_value; arredondamento para exibicao fica por conta da UI.
-- ---------------------------------------------------------------------------
create function recalc_lot_allocated_cost(p_lot_id uuid)
returns void
language plpgsql
as $$
declare
  v_purchase_value numeric;
  v_total_value numeric;
begin
  select purchase_value into v_purchase_value from lots where id = p_lot_id;

  if v_purchase_value is null then
    return;
  end if;

  select coalesce(sum(sale_price * quantity), 0) into v_total_value
    from stock_items where lot_id = p_lot_id;

  if v_total_value = 0 then
    update stock_items set allocated_cost = 0
      where lot_id = p_lot_id and quantity_sold < quantity;
    return;
  end if;

  update stock_items
    set allocated_cost = v_purchase_value * sale_price / v_total_value
    where lot_id = p_lot_id and quantity_sold < quantity;
end;
$$;

create function trg_stock_items_recalc()
returns trigger
language plpgsql
as $$
begin
  perform recalc_lot_allocated_cost(coalesce(new.lot_id, old.lot_id));
  return null;
end;
$$;

create trigger stock_items_recalc
  after insert or delete or update of sale_price, quantity on stock_items
  for each row execute function trg_stock_items_recalc();

create function trg_lots_recalc()
returns trigger
language plpgsql
as $$
begin
  perform recalc_lot_allocated_cost(new.id);
  return null;
end;
$$;

create trigger lots_recalc
  after update of purchase_value on lots
  for each row execute function trg_lots_recalc();
