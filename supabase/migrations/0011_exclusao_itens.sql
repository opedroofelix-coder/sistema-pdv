-- Cinco ajustes de UX (branch feature/ux-catalogo-estoque-loader): exclusao
-- de itens no catalogo e no estoque, restrita ao dono, com exclusao logica
-- quando ha historico de venda (preserva o dado para os relatorios) e fisica
-- quando nao ha.
--
-- Regra combinada com o dono para o caso "catalogo sem venda mas com estoque
-- fisico vinculado (recebido, nunca vendido)": NAO cria cascata automatica
-- de exclusao do estoque -- fica bloqueado com aviso, o operador exclui o
-- estoque primeiro. Isso evita apagar quantidade fisica de forma implicita
-- ao excluir um cadastro de catalogo.

alter table product_catalog add column active boolean not null default true;
alter table stock_items add column active boolean not null default true;

-- ---------------------------------------------------------------------------
-- lot_margin_report: receita/custo do vendido ja vem só de sale_items/sales
-- (independente de active, nao muda) -- só "estoque restante" deixa de
-- contar itens inativos, senao um item excluido logicamente continuaria
-- projetado como estoque disponivel no relatorio de margem.
-- ---------------------------------------------------------------------------
create or replace view lot_margin_report as
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
  from stock_items where lot_id = l.id and active
) rem on true;

-- ---------------------------------------------------------------------------
-- delete_catalog_item: exclusao logica (active = false) quando existe
-- historico de venda em qualquer stock_item vinculado a este catalogo;
-- exclusao fisica quando nao existe historico E nao existe estoque
-- vinculado; bloqueia com erro quando nao ha venda mas ha estoque vinculado
-- (decisao combinada com o dono, ver comentario no topo do arquivo).
-- Checagem de papel no servidor (auth.uid() -> profiles.role), mesmo padrao
-- de create_sale/p_override_expired (0006_catalogo_melhorias.sql) -- sem
-- isso um caixa/estoquista poderia contornar o bloqueio chamando a RPC
-- direto, ja que o app so esconderia o botao.
-- ---------------------------------------------------------------------------
create function delete_catalog_item(p_catalog_id uuid)
returns void
language plpgsql
as $$
declare
  v_role text;
  v_has_sale boolean;
  v_has_stock boolean;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is distinct from 'dono' then
    raise exception 'Somente o dono pode excluir itens do catálogo';
  end if;

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
-- delete_stock_item: mesma logica, um nivel mais simples (nao ha cascata
-- pra decidir -- o proprio stock_item e a folha da arvore).
-- ---------------------------------------------------------------------------
create function delete_stock_item(p_stock_item_id uuid)
returns void
language plpgsql
as $$
declare
  v_role text;
  v_has_sale boolean;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is distinct from 'dono' then
    raise exception 'Somente o dono pode excluir itens do estoque';
  end if;

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

grant execute on function delete_catalog_item(uuid) to authenticated;
grant execute on function delete_stock_item(uuid) to authenticated;
