-- Sprint 3: PDV (ver CLAUDE.md secao 4, Sprint 3).
-- Escopo: vincular vendas a sessao de caixa, garantir sessao unica aberta,
-- e as tres funcoes transacionais: finalizar venda, cancelar venda e
-- fechar caixa.

-- ---------------------------------------------------------------------------
-- sales.session_id: em vez de correlacionar vendas a sessao por janela de
-- tempo, guarda o vinculo explicito -- evita que uma venda em dinheiro feita
-- sem sessao aberta "desapareca" do fechamento de caixa. Mesmo padrao ja
-- usado em cash_movements.session_id no modelo original.
-- ---------------------------------------------------------------------------
alter table sales add column session_id uuid references cash_sessions (id);

create index sales_session_id_idx on sales (session_id);

-- ---------------------------------------------------------------------------
-- "1 loja, 1 caixa": no maximo uma sessao de caixa aberta por vez.
-- ---------------------------------------------------------------------------
create unique index cash_sessions_one_open_idx on cash_sessions ((true))
  where closed_at is null;

-- ---------------------------------------------------------------------------
-- create_sale: finalizacao da venda em transacao atomica.
-- A trava de peca unica e a propria clausula WHERE do UPDATE -- sob READ
-- COMMITTED, um UPDATE concorrente no mesmo stock_item serializa via lock
-- de linha e reavaliacao do WHERE (EvalPlanQual), sem precisar de
-- SELECT ... FOR UPDATE separado. sale_price/allocated_cost sao capturados
-- no mesmo UPDATE...RETURNING que baixa o estoque, congelando
-- unit_price/cost_at_sale sem brecha de TOCTOU.
-- ---------------------------------------------------------------------------
create function create_sale(
  p_cashier_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_discount numeric default 0
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
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Venda sem itens';
  end if;

  select id into v_session_id from cash_sessions where closed_at is null limit 1;
  if v_session_id is null then
    raise exception 'Nenhum caixa aberto';
  end if;

  insert into sales (cashier_id, session_id, payment_method, discount, total)
  values (p_cashier_id, v_session_id, p_payment_method, coalesce(p_discount, 0), 0)
  returning id into v_sale_id;

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

grant execute on function create_sale(uuid, jsonb, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_sale: estorna o estoque vendido e marca a venda como cancelada.
-- A clausula "status = 'completed'" no UPDATE e o proprio guard atomico
-- contra cancelamento duplicado (segunda chamada casa 0 linhas).
-- ---------------------------------------------------------------------------
create function cancel_sale(p_sale_id uuid)
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

  for v_item in select stock_item_id, quantity from sale_items where sale_id = p_sale_id
  loop
    update stock_items
      set quantity_sold = quantity_sold - v_item.quantity
      where id = v_item.stock_item_id;
  end loop;

  return (select s from sales s where id = p_sale_id);
end;
$$;

grant execute on function cancel_sale(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- close_cash_session: calcula expected_amount (abertura + dinheiro -
-- sangria + suprimento) e fecha a sessao em um unico UPDATE.
-- ---------------------------------------------------------------------------
create function close_cash_session(p_session_id uuid, p_closing_amount numeric)
returns cash_sessions
language plpgsql
as $$
declare
  v_opening numeric;
  v_dinheiro numeric;
  v_sangria numeric;
  v_suprimento numeric;
  v_expected numeric;
  v_rows int;
begin
  select opening_amount into v_opening from cash_sessions where id = p_session_id;
  if not found then
    raise exception 'Sessão de caixa não encontrada';
  end if;

  select coalesce(sum(total), 0) into v_dinheiro from sales
    where session_id = p_session_id and payment_method = 'dinheiro' and status = 'completed';

  select coalesce(sum(amount) filter (where type = 'sangria'), 0),
         coalesce(sum(amount) filter (where type = 'suprimento'), 0)
    into v_sangria, v_suprimento
    from cash_movements where session_id = p_session_id;

  v_expected := v_opening + v_dinheiro - v_sangria + v_suprimento;

  update cash_sessions
    set closed_at = now(), closing_amount = p_closing_amount, expected_amount = v_expected
    where id = p_session_id and closed_at is null;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Sessão já estava fechada';
  end if;

  return (select c from cash_sessions c where id = p_session_id);
end;
$$;

grant execute on function close_cash_session(uuid, numeric) to authenticated;
