-- Sprint 5: atualizacao do recebimento (ver CLAUDE.md secao 4, Sprint 5).
-- Escopo desta migration: colunas aditivas (todas nullable ou com default
-- seguro) em product_catalog para suportar validacao por foto, preco de
-- referencia do Mercado Livre e produtos importados. Nenhuma mudanca em
-- stock_items/lots/sales* -- o rateio e o PDV nao sao afetados.

alter table product_catalog
  add column origin text check (origin in ('nacional', 'importado')),
  add column ncm_pending boolean not null default false,
  add column ref_price_min numeric,
  add column ref_price_avg numeric,
  add column ref_price_max numeric,
  add column ref_price_updated_at timestamptz;

-- Amplia a lista de fontes aceitas para incluir o novo fallback UPCitemdb.
-- Constraint aditiva: todo valor ja gravado continua satisfazendo a nova regra.
alter table product_catalog drop constraint product_catalog_source_check;
alter table product_catalog add constraint product_catalog_source_check
  check (source in ('cosmos', 'upcitemdb', 'off', 'manual'));

-- Backfill (decisao registrada em CLAUDE.md secao 1, #12): itens de catalogo
-- ja existentes so recebem a classificacao de origem: sem reconferencia
-- retroativa de foto, needs_review permanece como estava.
update product_catalog set origin = 'nacional' where origin is null;
