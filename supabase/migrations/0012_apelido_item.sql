-- Edicao de nome do produto em dois niveis (decisao #30): apelido opcional
-- por item de estoque (stock_items.nickname, livre para qualquer papel) e
-- nome do catalogo (product_catalog.name, ja existia -- edicao restrita ao
-- dono, via RPC checada no servidor, mesmo padrao de delete_catalog_item/
-- delete_stock_item em 0011_exclusao_itens.sql).

alter table stock_items add column nickname text;

create function update_catalog_name(p_catalog_id uuid, p_name text)
returns void
language plpgsql
as $$
declare
  v_role text;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is distinct from 'dono' then
    raise exception 'Somente o dono pode editar o nome do catálogo';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'Nome não pode ficar em branco';
  end if;

  update product_catalog set name = btrim(p_name) where id = p_catalog_id;
end;
$$;

grant execute on function update_catalog_name(uuid, text) to authenticated;
