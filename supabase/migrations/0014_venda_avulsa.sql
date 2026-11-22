-- Branch 5 (feature/pdv-busca-venda-avulsa), item 8: vender "diversos" -- um
-- item avulso sem codigo de barras, cobrado so pelo preco, sem vinculo a
-- estoque. Decisao do dono: custo R$ 0 (100% margem nos relatorios).
--
-- Aditiva: stock_item_id de sale_items vira nullable e ganha uma coluna
-- `description` (nome do item avulso). Um check garante que toda linha e' OU
-- um item de estoque (stock_item_id) OU um avulso (description) -- nunca as
-- duas nulas. As linhas existentes (todas com stock_item_id) passam no check.

alter table sale_items alter column stock_item_id drop not null;
alter table sale_items add column description text;
alter table sale_items add constraint sale_items_stock_or_desc
  check (stock_item_id is not null or description is not null);

-- ---------------------------------------------------------------------------
-- create_sale: mesma assinatura (create or replace, grant persiste), agora
-- aceitando itens avulsos. Cada elemento de p_items e' OU
-- {stock_item_id, quantity} (item de estoque, caminho de sempre) OU
-- {description, unit_price, quantity} (avulso: sem baixa de estoque, custo 0).
-- ---------------------------------------------------------------------------
create or replace function create_sale(
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
    select * from jsonb_to_recordset(p_items)
      as x(stock_item_id uuid, quantity int, description text, unit_price numeric)
  loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Quantidade inválida';
    end if;

    if v_item.stock_item_id is null then
      -- Item avulso ("diversos"): sem baixa de estoque, custo congelado 0.
      if v_item.unit_price is null or v_item.unit_price < 0 then
        raise exception 'Preço inválido para item avulso';
      end if;

      insert into sale_items (sale_id, stock_item_id, quantity, unit_price, cost_at_sale, description)
      values (
        v_sale_id, null, v_item.quantity, v_item.unit_price, 0,
        coalesce(nullif(btrim(v_item.description), ''), 'Diversos')
      );

      v_total := v_total + v_item.unit_price * v_item.quantity;
    else
      -- Item de estoque: caminho de sempre (baixa, custo rateado, validade).
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
    end if;
  end loop;

  update sales set total = v_total - coalesce(p_discount, 0) where id = v_sale_id;

  return (select s from sales s where id = v_sale_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_sale: guarda explicito pra so reestocar itens de estoque (avulsos
-- tem stock_item_id null e nao tem estoque pra devolver). O `where id = null`
-- ja seria no-op, mas deixar explicito evita surpresa.
-- ---------------------------------------------------------------------------
create or replace function cancel_sale(p_sale_id uuid)
returns sales
language plpgsql
as $$
declare
  v_rows int;
  v_item record;
begin
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
