-- Sprint 1: fundação do modelo de dados (ver CLAUDE.md secao 3)
-- Escopo: tabelas, constraints, indices, autenticacao/perfis e RLS basica.
-- Fora de escopo (Sprint 2/3): trigger de recalculo de allocated_cost e RPC
-- transacional de venda.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- stores (preparo para multi-loja; nao estava explicito no CLAUDE.md, mas
-- store_id e referenciado por varias tabelas do modelo)
-- ---------------------------------------------------------------------------
create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Loja Principal',
  created_at timestamptz not null default now()
);

insert into stores (name) values ('Loja Principal');

-- Postgres nao aceita subquery direta em DEFAULT; encapsulamos em funcao.
-- Enquanto for loja unica, todo store_id assume a loja semeada acima.
create function default_store_id()
returns uuid
language sql
stable
as $$
  select id from stores limit 1;
$$;

-- ---------------------------------------------------------------------------
-- profiles (perfis de usuario: dono, caixa, estoquista)
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  store_id uuid not null references stores (id) default default_store_id(),
  full_name text,
  role text not null check (role in ('dono', 'caixa', 'estoquista')),
  theme_preference text not null default 'system' check (theme_preference in ('light', 'dark', 'system')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- product_catalog (cache de EANs, compartilhado entre lotes)
-- ---------------------------------------------------------------------------
create table product_catalog (
  id uuid primary key default gen_random_uuid(),
  ean text unique,
  name text,
  brand text,
  photo_url text,
  ncm text,
  cest text,
  source text check (source in ('cosmos', 'off', 'manual')),
  needs_review boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- lots (lote comprado no leilao)
-- ---------------------------------------------------------------------------
create table lots (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) default default_store_id(),
  supplier text,
  purchase_value numeric not null check (purchase_value >= 0),
  purchase_date date not null default current_date,
  notes text,
  status text not null default 'receiving' check (status in ('receiving', 'closed')),
  created_at timestamptz not null default now()
);

create index lots_store_id_idx on lots (store_id);
create index lots_status_idx on lots (status);

-- ---------------------------------------------------------------------------
-- stock_items (item de estoque vinculado a lote e catalogo)
-- ---------------------------------------------------------------------------
create table stock_items (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots (id) on delete cascade,
  catalog_id uuid references product_catalog (id),
  internal_code text unique,
  condition text check (condition in ('novo', 'caixa_aberta', 'avaria', 'usado')),
  quantity int not null default 1 check (quantity >= 0),
  quantity_sold int not null default 0 check (quantity_sold >= 0),
  sale_price numeric not null check (sale_price >= 0),
  allocated_cost numeric not null default 0 check (allocated_cost >= 0),
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint stock_items_sold_within_quantity check (quantity_sold <= quantity)
);

create index stock_items_lot_id_idx on stock_items (lot_id);
create index stock_items_catalog_id_idx on stock_items (catalog_id);

-- ---------------------------------------------------------------------------
-- sales (venda)
-- ---------------------------------------------------------------------------
create table sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) default default_store_id(),
  cashier_id uuid references profiles (id),
  total numeric not null default 0 check (total >= 0),
  discount numeric not null default 0 check (discount >= 0),
  payment_method text check (payment_method in ('dinheiro', 'pix', 'credito', 'debito')),
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index sales_store_id_idx on sales (store_id);
create index sales_cashier_id_idx on sales (cashier_id);

-- ---------------------------------------------------------------------------
-- sale_items (itens da venda; cost_at_sale congela a margem historica)
-- ---------------------------------------------------------------------------
create table sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales (id) on delete cascade,
  stock_item_id uuid not null references stock_items (id),
  quantity int not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  cost_at_sale numeric not null check (cost_at_sale >= 0)
);

create index sale_items_sale_id_idx on sale_items (sale_id);
create index sale_items_stock_item_id_idx on sale_items (stock_item_id);

-- ---------------------------------------------------------------------------
-- cash_sessions / cash_movements (caixa)
-- ---------------------------------------------------------------------------
create table cash_sessions (
  id uuid primary key default gen_random_uuid(),
  cashier_id uuid references profiles (id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_amount numeric not null default 0 check (opening_amount >= 0),
  closing_amount numeric check (closing_amount >= 0),
  expected_amount numeric check (expected_amount >= 0)
);

create index cash_sessions_cashier_id_idx on cash_sessions (cashier_id);

create table cash_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references cash_sessions (id) on delete cascade,
  type text not null check (type in ('sangria', 'suprimento')),
  amount numeric not null check (amount > 0),
  reason text,
  created_at timestamptz not null default now()
);

create index cash_movements_session_id_idx on cash_movements (session_id);

-- ---------------------------------------------------------------------------
-- Autenticacao: cria profile automaticamente ao criar usuario.
-- Primeiro usuario cadastrado vira 'dono'; demais entram como 'estoquista'.
-- ---------------------------------------------------------------------------
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role text;
begin
  if exists (select 1 from profiles limit 1) then
    assigned_role := 'estoquista';
  else
    assigned_role := 'dono';
  end if;

  insert into profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data ->> 'full_name', assigned_role);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Impede que o proprio usuario altere seu papel (role); apenas um 'dono'
-- pode alterar o papel de qualquer perfil (ver policy de update abaixo).
create function protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> old.role then
    if not exists (
      select 1 from profiles where id = auth.uid() and role = 'dono'
    ) then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_profile_role_trigger
  before update on profiles
  for each row execute function protect_profile_role();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table stores enable row level security;
alter table profiles enable row level security;
alter table product_catalog enable row level security;
alter table lots enable row level security;
alter table stock_items enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table cash_sessions enable row level security;
alter table cash_movements enable row level security;

create policy "stores: authenticated read" on stores
  for select to authenticated using (true);

create policy "profiles: authenticated read" on profiles
  for select to authenticated using (true);

create policy "profiles: user updates own row" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Tabelas de negocio: qualquer usuario autenticado opera (fundacao da
-- Sprint 1; restricoes por papel entram nas Sprints 2/3 conforme necessario).
create policy "product_catalog: authenticated all" on product_catalog
  for all to authenticated using (true) with check (true);

create policy "lots: authenticated all" on lots
  for all to authenticated using (true) with check (true);

create policy "stock_items: authenticated all" on stock_items
  for all to authenticated using (true) with check (true);

create policy "sales: authenticated all" on sales
  for all to authenticated using (true) with check (true);

create policy "sale_items: authenticated all" on sale_items
  for all to authenticated using (true) with check (true);

create policy "cash_sessions: authenticated all" on cash_sessions
  for all to authenticated using (true) with check (true);

create policy "cash_movements: authenticated all" on cash_movements
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Grants: com auto_expose_new_tables desligado (padrao atual do Supabase
-- CLI), novas tabelas nao sao expostas as roles anon/authenticated a menos
-- que haja GRANT explicito. Sem isso, o Postgres nega o acesso antes mesmo
-- de avaliar as policies de RLS acima.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  stores, profiles, product_catalog, lots, stock_items, sales, sale_items,
  cash_sessions, cash_movements
  to authenticated;
