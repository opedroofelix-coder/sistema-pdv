-- Decisao #53, item 3: pagamento misto (PIX + cartao e outras combinacoes),
-- com quantas formas o operador precisar.
--
-- Ate aqui a venda guardava UMA forma em sales.payment_method. Entra uma
-- tabela com uma linha por forma. A coluna antiga FICA (regra 5: nada de
-- remover coluna em uso) marcando a forma unica, ou 'misto' quando ha mais de
-- uma -- e' o que Receipt/SalesHistory leem pra decidir se abrem a lista.

create table sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales (id) on delete cascade,
  method text not null check (method in ('dinheiro', 'pix', 'credito', 'debito')),
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index sale_payments_sale_id_idx on sale_payments (sale_id);

alter table sale_payments enable row level security;

create policy "sale_payments: authenticated all" on sale_payments
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on sale_payments to authenticated;
grant select, insert, update, delete on sale_payments to service_role;

-- Backfill: uma linha por venda ja existente. Sem isso os relatorios, que
-- passam a ler daqui, perderiam todo o historico de formas de pagamento.
-- `total > 0` porque a tabela exige amount > 0 (venda zerada nao tem forma
-- de pagamento util pra registrar).
insert into sale_payments (sale_id, method, amount, created_at)
select id, payment_method, total, created_at
  from sales
  where payment_method is not null and total > 0;

-- Amplia o check pra aceitar 'misto' na coluna antiga. So alarga o dominio --
-- toda linha existente continua valida.
alter table sales drop constraint if exists sales_payment_method_check;
alter table sales add constraint sales_payment_method_check
  check (payment_method in ('dinheiro', 'pix', 'credito', 'debito', 'misto'));

-- ---------------------------------------------------------------------------
-- create_sale: ganha p_payments. Precisa de DROP + CREATE, nao `create or
-- replace`: mudar a lista de argumentos criaria uma SEGUNDA sobrecarga e o
-- PostgREST nao saberia qual chamar. O `default null` mantem funcionando as
-- chamadas no formato antigo -- vendas que ja estavam na fila offline
-- (IndexedDB do navegador) antes do deploy sao replayadas sem p_payments.
--
-- p_payments e' um array [{method, amount}]. Quando vem preenchido, a soma
-- precisa bater com o total ja com desconto; quando vem null/vazio, grava uma
-- linha unica com p_payment_method pelo total (comportamento de sempre).
--
-- Tambem corrige o fallback de sessao: com caixa por operador (0017),
-- `where closed_at is null limit 1` pegaria a sessao de qualquer um. Passa a
-- procurar a sessao aberta DO proprio caixa.
-- ---------------------------------------------------------------------------
drop function if exists create_sale(uuid, jsonb, text, numeric, uuid, uuid, boolean);

create function create_sale(
  p_cashier_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_discount numeric default 0,
  p_session_id uuid default null,
  p_idempotency_key uuid default null,
  p_override_expired boolean default false,
  p_payments jsonb default null
)
returns sales
language plpgsql
as $$
declare
  v_session_id uuid;
  v_sale_id uuid;
  v_total numeric := 0;
  v_final numeric;
  v_item record;
  v_price numeric;
  v_cost numeric;
  v_expiry date;
  v_rows int;
  v_caller_role text;
  v_pay record;
  v_pay_sum numeric := 0;
  v_pay_count int := 0;
  v_method text;
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
    select id into v_session_id from cash_sessions
      where closed_at is null and cashier_id = p_cashier_id limit 1;
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

  v_final := v_total - coalesce(p_discount, 0);

  -- Formas de pagamento -------------------------------------------------
  if p_payments is not null and jsonb_array_length(p_payments) > 0 then
    for v_pay in
      select * from jsonb_to_recordset(p_payments) as x(method text, amount numeric)
    loop
      if v_pay.method is null or v_pay.method not in ('dinheiro', 'pix', 'credito', 'debito') then
        raise exception 'Forma de pagamento inválida: %', v_pay.method;
      end if;
      if v_pay.amount is null or v_pay.amount <= 0 then
        raise exception 'Valor inválido para a forma %', v_pay.method;
      end if;

      insert into sale_payments (sale_id, method, amount)
      values (v_sale_id, v_pay.method, v_pay.amount);

      v_pay_sum := v_pay_sum + v_pay.amount;
      v_pay_count := v_pay_count + 1;
      v_method := v_pay.method;
    end loop;

    -- Tolerancia de 1 centavo: o cliente divide o total entre as formas e o
    -- arredondamento pode sobrar/faltar um centavo.
    if abs(v_pay_sum - v_final) > 0.01 then
      raise exception 'Soma das formas de pagamento (%) não fecha com o total da venda (%)',
        v_pay_sum, v_final;
    end if;

    if v_pay_count > 1 then
      v_method := 'misto';
    end if;
  else
    -- Formato antigo: uma forma so, pelo total.
    v_method := p_payment_method;
    if v_method is not null and v_final > 0 then
      insert into sale_payments (sale_id, method, amount) values (v_sale_id, v_method, v_final);
    end if;
  end if;

  update sales set total = v_final, payment_method = v_method where id = v_sale_id;

  return (select s from sales s where id = v_sale_id);
end;
$$;

grant execute on function create_sale(uuid, jsonb, text, numeric, uuid, uuid, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- close_cash_session: o esperado na gaveta passa a somar a PARCELA em
-- dinheiro de cada venda (sale_payments), nao o total das vendas cuja forma
-- e' 'dinheiro'. Sem isso uma venda mista com R$ 50 em especie sumiria da
-- conferencia -- a forma dela e' 'misto', nao 'dinheiro'.
-- ---------------------------------------------------------------------------
create or replace function close_cash_session(p_session_id uuid, p_closing_amount numeric)
returns cash_sessions
language plpgsql
as $$
declare
  v_opening numeric;
  v_cashier uuid;
  v_caller_role text;
  v_dinheiro numeric;
  v_sangria numeric;
  v_suprimento numeric;
  v_expected numeric;
  v_rows int;
begin
  select opening_amount, cashier_id into v_opening, v_cashier
    from cash_sessions where id = p_session_id;
  if not found then
    raise exception 'Sessão de caixa não encontrada';
  end if;

  select role into v_caller_role from profiles where id = auth.uid();
  if auth.uid() is distinct from v_cashier and v_caller_role is distinct from 'dono' then
    raise exception 'Somente quem abriu o caixa ou o dono pode fechar esta sessão';
  end if;

  select coalesce(sum(sp.amount), 0) into v_dinheiro
    from sale_payments sp
    join sales s on s.id = sp.sale_id
    where s.session_id = p_session_id and s.status = 'completed' and sp.method = 'dinheiro';

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
