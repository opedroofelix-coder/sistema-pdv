-- Branch 2 (feature/permissoes-caixa-estoque), item 4: excluir e editar itens
-- de estoque/catalogo deixam de ser restritos ao dono -- qualquer papel
-- autenticado pode. Reverte a checagem de papel das RPCs de exclusao
-- (0011_exclusao_itens.sql) e da edicao de nome do catalogo
-- (0012_apelido_item.sql / decisao #30).
--
-- Decisao do dono (Branch 2): equipe pequena e de confianca (decisao #5/#25),
-- o atrito de so o dono poder excluir/renomear passou a valer menos que a
-- agilidade de caixa/estoquista resolverem sozinhos. Mesma linha da divida
-- tecnica ja aceita na decisao #25 (RLS aberta por papel).
--
-- O que NAO muda: a logica de exclusao logica-vs-fisica (active), o bloqueio
-- de excluir catalogo com estoque vinculado sem venda, e a validacao de nome
-- em branco -- so a checagem `v_role is distinct from 'dono'` sai. O passo de
-- confirmacao ao renomear continua, mas e' so na UI (nao no banco).
--
-- Aditiva: `create or replace` das funcoes existentes, sem tocar em dados.

-- ---------------------------------------------------------------------------
-- delete_catalog_item: mesma logica de 0011, sem a checagem de papel.
-- ---------------------------------------------------------------------------
create or replace function delete_catalog_item(p_catalog_id uuid)
returns void
language plpgsql
as $$
declare
  v_has_sale boolean;
  v_has_stock boolean;
begin
  select exists (
    select 1 from sale_items si
    join stock_items sti on sti.id = si.stock_item_id
    where sti.catalog_id = p_catalog_id
  ) into v_has_sale;

  if v_has_sale then
    update product_catalog set active = false where id = p_catalog_id;
    return;
  end if;

  select exists (
    select 1 from stock_items where catalog_id = p_catalog_id
  ) into v_has_stock;

  if v_has_stock then
    raise exception 'Há itens de estoque vinculados a este produto — exclua-os primeiro';
  end if;

  delete from product_catalog where id = p_catalog_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_stock_item: mesma logica de 0011, sem a checagem de papel.
-- ---------------------------------------------------------------------------
create or replace function delete_stock_item(p_stock_item_id uuid)
returns void
language plpgsql
as $$
declare
  v_has_sale boolean;
begin
  select exists (
    select 1 from sale_items where stock_item_id = p_stock_item_id
  ) into v_has_sale;

  if v_has_sale then
    update stock_items set active = false where id = p_stock_item_id;
  else
    delete from stock_items where id = p_stock_item_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_catalog_name: mesma validacao de nome em branco de 0012, sem a
-- checagem de papel (a confirmacao passou a viver so na UI).
-- ---------------------------------------------------------------------------
create or replace function update_catalog_name(p_catalog_id uuid, p_name text)
returns void
language plpgsql
as $$
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Nome não pode ficar em branco';
  end if;

  update product_catalog set name = btrim(p_name) where id = p_catalog_id;
end;
$$;
