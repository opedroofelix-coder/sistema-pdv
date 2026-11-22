-- Plano B do preco de referencia (CLAUDE.md decisao #23): via automatica
-- do Mercado Livre encerrada (busca de produtos bloqueada por politica do
-- ML mesmo autenticado, ver decisao #22). product_catalog.ref_price_min/
-- avg/max/ref_price_updated_at (colunas da migration 0005) passam a ser
-- preenchidas pela Cosmos (quando a API tiver o dado) em vez do ML -- mesmo
-- formato, so troca a fonte, sem precisar de migration pra isso.
--
-- Preco anotado manualmente: operador ve o preco no site do Mercado Livre
-- (link aberto em nova aba) e digita o valor -- fica numa coluna separada,
-- ja que e um numero unico (nao um min/avg/max de varios anuncios).
alter table product_catalog
  add column manual_ref_price numeric,
  add column manual_ref_price_updated_at timestamptz;
