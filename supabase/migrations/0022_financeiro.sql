-- Decisao #72: modulo financeiro (/financeiro, so dono).
--
-- O app ja sabia quanto vendeu e quanto custou a mercadoria vendida
-- (sale_items.cost_at_sale), mas nao sabia nada do que sai da loja alem
-- disso: aluguel, luz, salarios, impostos, taxa da maquininha. Esta migration
-- cria o que falta pra calcular o lucro liquido, a lista de contas a pagar e o
-- fluxo de caixa:
--   * finance_categories  -- categorias de despesa
--   * finance_recurring   -- "molde" de despesa fixa (gera uma conta por mes)
--   * finance_expenses    -- contas a pagar (pagas ou em aberto)
--   * finance_fee_rates   -- taxa e prazo de cada forma de pagamento, COM
--                            vigencia (mudar a taxa nao reescreve o passado)
--   * finance_settings    -- saldo inicial do fluxo de caixa (singleton)
--
-- Compra de lote NAO ganha tabela nem gatilho: o app le direto de
-- lots.purchase_value / purchase_date. Assim editar o valor pago (#65) ou
-- excluir o lote (#57) ja se reflete sozinho.
--
-- RLS so-dono DE VERDADE nas tabelas novas (diferente da divida #25, que
-- vale pras tabelas antigas): caixa e estoquista nao leem nem gravam nada
-- daqui, nem pela API.
--
-- Aditiva (regra 5): so tabelas e funcoes novas, nada existente e' alterado.

-- ---------------------------------------------------------------------------
-- Checagem de papel usada nas policies e na RPC. security definer pra ler
-- profiles independente da policy de quem chama.
-- ---------------------------------------------------------------------------
create function is_finance_dono()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from profiles where id = auth.uid()) = 'dono', false);
$$;

grant execute on function is_finance_dono() to authenticated;

-- ---------------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------------
create table finance_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into finance_categories (name) values
  ('Aluguel'), ('Energia'), ('Água'), ('Internet/Telefone'), ('Salários'),
  ('Pró-labore'), ('Impostos'), ('Frete'), ('Embalagens'), ('Material'),
  ('Manutenção'), ('Marketing'), ('Outros');

-- ---------------------------------------------------------------------------
-- Despesas fixas (molde). `last_generated_month` marca ate onde ja foram
-- geradas as contas: a geracao continua DAQUI, entao uma conta gerada e
-- depois excluida pelo dono nao volta a aparecer. Mudar valor/dia do molde
-- vale pros meses ainda nao gerados.
-- ---------------------------------------------------------------------------
create table finance_recurring (
  id uuid primary key default gen_random_uuid(),
  description text not null check (length(trim(description)) > 0),
  category_id uuid references finance_categories (id) on delete set null,
  amount numeric not null check (amount > 0),
  day_of_month int not null check (day_of_month between 1 and 28),
  start_month date not null check (extract(day from start_month) = 1),
  end_month date check (end_month is null or extract(day from end_month) = 1),
  last_generated_month date check (last_generated_month is null or extract(day from last_generated_month) = 1),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contas a pagar. competence_month = mes a que a despesa se refere (vai pro
-- lucro do mes); due_date/paid_at = quando vence/foi paga (vai pro fluxo).
-- ---------------------------------------------------------------------------
create table finance_expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null check (length(trim(description)) > 0),
  category_id uuid references finance_categories (id) on delete set null,
  amount numeric not null check (amount > 0),
  competence_month date not null check (extract(day from competence_month) = 1),
  due_date date not null,
  paid_at date,
  paid_method text check (paid_method in ('dinheiro', 'pix', 'cartao', 'boleto', 'transferencia')),
  recurring_id uuid references finance_recurring (id) on delete set null,
  notes text,
  created_by uuid references profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (recurring_id, competence_month)
);

create index finance_expenses_competence_idx on finance_expenses (competence_month);
create index finance_expenses_due_idx on finance_expenses (due_date) where paid_at is null;
create index finance_expenses_paid_idx on finance_expenses (paid_at);

-- ---------------------------------------------------------------------------
-- Taxas por forma de pagamento, com vigencia: cada venda usa a linha com o
-- maior valid_from <= data da venda. 'online' = pedido pago no site (#66).
-- ---------------------------------------------------------------------------
create table finance_fee_rates (
  id uuid primary key default gen_random_uuid(),
  method text not null check (method in ('dinheiro', 'pix', 'credito', 'debito', 'online')),
  fee_percent numeric not null default 0 check (fee_percent >= 0 and fee_percent < 100),
  settle_days int not null default 0 check (settle_days >= 0 and settle_days <= 365),
  valid_from date not null,
  created_at timestamptz not null default now(),
  unique (method, valid_from)
);

insert into finance_fee_rates (method, fee_percent, settle_days, valid_from) values
  ('dinheiro', 0, 0, '2000-01-01'),
  ('pix', 0, 0, '2000-01-01'),
  ('debito', 0, 0, '2000-01-01'),
  ('credito', 0, 0, '2000-01-01'),
  ('online', 0, 0, '2000-01-01');

-- ---------------------------------------------------------------------------
-- Saldo inicial do fluxo de caixa (singleton).
-- ---------------------------------------------------------------------------
create table finance_settings (
  id boolean primary key default true check (id),
  opening_balance numeric not null default 0,
  opening_date date,
  updated_at timestamptz not null default now()
);

insert into finance_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- RLS: so o dono.
-- ---------------------------------------------------------------------------
alter table finance_categories enable row level security;
alter table finance_recurring enable row level security;
alter table finance_expenses enable row level security;
alter table finance_fee_rates enable row level security;
alter table finance_settings enable row level security;

create policy "finance_categories: dono" on finance_categories
  for all to authenticated using (is_finance_dono()) with check (is_finance_dono());
create policy "finance_recurring: dono" on finance_recurring
  for all to authenticated using (is_finance_dono()) with check (is_finance_dono());
create policy "finance_expenses: dono" on finance_expenses
  for all to authenticated using (is_finance_dono()) with check (is_finance_dono());
create policy "finance_fee_rates: dono" on finance_fee_rates
  for all to authenticated using (is_finance_dono()) with check (is_finance_dono());
create policy "finance_settings: dono" on finance_settings
  for all to authenticated using (is_finance_dono()) with check (is_finance_dono());

grant select, insert, update, delete on
  finance_categories, finance_recurring, finance_expenses, finance_fee_rates
  to authenticated;
-- Singleton: sem insert/delete pela API, so update da linha que ja existe.
grant select, update on finance_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Gera as contas das despesas fixas ate o mes de p_until (o app chama ao
-- abrir /financeiro com o fim do mes seguinte -- as fixas aparecem sempre um
-- mes antes, sem cron). Idempotente: continua de last_generated_month, e o
-- unique (recurring_id, competence_month) segura chamadas simultaneas.
-- ---------------------------------------------------------------------------
create function finance_generate_recurring(p_until date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_until date := date_trunc('month', p_until)::date;
  r record;
  m date;
  v_last date;
begin
  if not is_finance_dono() then
    raise exception 'Somente o dono pode acessar o financeiro';
  end if;

  for r in select * from finance_recurring where active for update loop
    m := coalesce((r.last_generated_month + interval '1 month')::date, r.start_month);
    if m < r.start_month then
      m := r.start_month;
    end if;
    v_last := r.last_generated_month;

    while m <= v_until and (r.end_month is null or m <= r.end_month) loop
      insert into finance_expenses
        (description, category_id, amount, competence_month, due_date, recurring_id)
      values
        (r.description, r.category_id, r.amount, m, m + (r.day_of_month - 1), r.id)
      on conflict (recurring_id, competence_month) do nothing;
      if found then
        v_count := v_count + 1;
      end if;
      v_last := m;
      m := (m + interval '1 month')::date;
    end loop;

    if v_last is distinct from r.last_generated_month then
      update finance_recurring set last_generated_month = v_last where id = r.id;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke execute on function finance_generate_recurring(date) from public;
grant execute on function finance_generate_recurring(date) to authenticated;
