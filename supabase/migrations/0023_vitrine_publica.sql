-- Vitrine pública (/loja): o cliente vê o que está disponível no estoque e
-- manda o pedido pelo WhatsApp da loja.
--
-- As tabelas continuam fechadas para `anon` (RLS só libera `authenticated`).
-- A vitrine lê por esta função, security definer, que devolve SÓ campos
-- seguros: nome, preço de venda, foto e quantidade disponível. Custo rateado,
-- lote, fornecedor e código interno nunca saem daqui.
--
-- Regras de exibição (mesmas do PDV):
--   * item e catálogo ativos (exclusão lógica, 0011);
--   * com saldo (quantity - quantity_sold > 0);
--   * não vencido (o PDV bloqueia venda de item vencido, 0004);
--   * com nome e preço.
-- Itens com o mesmo nome exibido e o mesmo preço (ex.: o mesmo buquê recebido
-- em dois lotes) viram uma linha só, com o saldo somado.

create function public_catalog()
returns table (
  id text,
  name text,
  price numeric,
  photo_url text,
  available int
)
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select
      si.id,
      si.created_at,
      btrim(coalesce(nullif(btrim(si.nickname), ''), pc.name)) as display_name,
      si.sale_price,
      coalesce(si.photos[1], pc.photo_url) as photo,
      si.quantity - si.quantity_sold as left_qty
    from stock_items si
    left join product_catalog pc on pc.id = si.catalog_id
    where si.active
      and (pc.id is null or pc.active)
      and si.quantity - si.quantity_sold > 0
      and (si.expiry_date is null or si.expiry_date >= current_date)
      and si.sale_price > 0
  )
  select
    md5(lower(display_name) || '|' || sale_price::text) as id,
    min(display_name) as name,
    sale_price as price,
    (array_agg(photo order by (photo is null), created_at desc))[1] as photo_url,
    sum(left_qty)::int as available
  from visible
  where display_name is not null and display_name <> ''
  group by lower(display_name), sale_price
  order by min(display_name), sale_price;
$$;

revoke all on function public_catalog() from public;
grant execute on function public_catalog() to anon, authenticated;

-- A role anon precisa enxergar o schema para chamar a RPC (0001 só deu
-- usage para authenticated).
grant usage on schema public to anon;
