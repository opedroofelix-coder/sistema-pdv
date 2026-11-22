-- Acoes do lote (branch feature/lotes-reabrir-excluir): fechar, reabrir e
-- excluir lote passam a ser do dono, cada uma com confirmacao na UI.
--
-- Ate aqui o lote so andava pra frente: `closeLot` (src/lib/lots.ts) era um
-- update direto via PostgREST, aberto a qualquer papel, com a unica regra de
-- negocio (todo item precisa de preco) validada NO CLIENTE -- e nao havia como
-- reabrir nem excluir. As tres acoes viram RPC, no mesmo formato de
-- 0011_exclusao_itens.sql: checagem de papel por auth.uid() -> profiles.role no
-- servidor (nao basta esconder o botao) e `raise exception` com a mensagem que
-- a tela exibe.
--
-- Decisoes do dono nesta branch:
--   - as TRES acoes sao so do dono (nao segue a linha aberta da decisao #38);
--   - excluir lote com venda registrada: BLOQUEIA (sem exclusao logica, sem
--     coluna `active` em lots -- o historico de margem depende do lote);
--   - excluir lote que ainda tem itens: BLOQUEIA, o operador exclui os itens
--     primeiro (mesmo padrao de delete_catalog_item com estoque vinculado).
--
-- Divida conhecida, deliberadamente nao mexida aqui: a policy
-- "lots: authenticated all" (0001) continua permitindo update/delete direto na
-- tabela via PostgREST pra qualquer autenticado -- mesma divida ja aceita na
-- decisao #25. As RPCs sao a trava de produto, nao uma trava de RLS.
--
-- Aditiva: so cria funcoes, nao toca em coluna nem em dado.

-- ---------------------------------------------------------------------------
-- close_lot: traz pro servidor a validacao que estava no cliente. O filtro
-- `active` e' correcao de borda: item excluido logicamente (0011) nao deve
-- mais travar o fechamento do lote.
-- ---------------------------------------------------------------------------
create function close_lot(p_lot_id uuid)
returns void
language plpgsql
as $$
declare
  v_role text;
  v_has_unpriced boolean;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is distinct from 'dono' then
    raise exception 'Somente o dono pode fechar um lote';
  end if;

  select exists (
    select 1 from stock_items
    where lot_id = p_lot_id and active and sale_price <= 0
  ) into v_has_unpriced;

  if v_has_unpriced then
    raise exception 'Todos os itens precisam ter preço de venda definido antes de fechar o lote.';
  end if;

  update lots set status = 'closed' where id = p_lot_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- reopen_lot: sem guarda alem do papel. O trigger trg_stock_items_recalc
-- (0002_receiving.sql) so recalcula o rateio dos itens NAO vendidos, entao
-- reabrir um lote que ja vendeu nao mexe em margem congelada.
-- ---------------------------------------------------------------------------
create function reopen_lot(p_lot_id uuid)
returns void
language plpgsql
as $$
declare
  v_role text;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is distinct from 'dono' then
    raise exception 'Somente o dono pode reabrir um lote';
  end if;

  update lots set status = 'receiving' where id = p_lot_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_lot: dois bloqueios com mensagens distintas. O de venda nunca
-- dispararia sozinho (item vendido continua como linha, a exclusao dele e'
-- logica -- 0011), mas e' ele que da a mensagem certa: sem essa checagem o
-- dono leria "exclua os itens primeiro" para um item que ele nao consegue
-- fazer sumir da tabela, um beco sem saida.
--
-- Passando os dois, o `delete` e' fisico. O `on delete cascade` de
-- stock_items.lot_id (0001) nunca chega a ser exercido: so se apaga lote
-- vazio.
-- ---------------------------------------------------------------------------
create function delete_lot(p_lot_id uuid)
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
    raise exception 'Somente o dono pode excluir um lote';
  end if;

  select exists (
    select 1 from sale_items si
    join stock_items sti on sti.id = si.stock_item_id
    where sti.lot_id = p_lot_id
  ) into v_has_sale;

  if v_has_sale then
    raise exception 'Este lote já tem vendas registradas e não pode ser excluído.';
  end if;

  select exists (
    select 1 from stock_items where lot_id = p_lot_id
  ) into v_has_stock;

  if v_has_stock then
    raise exception 'Exclua os itens deste lote antes de excluí-lo.';
  end if;

  delete from lots where id = p_lot_id;
end;
$$;

grant execute on function close_lot(uuid) to authenticated;
grant execute on function reopen_lot(uuid) to authenticated;
grant execute on function delete_lot(uuid) to authenticated;
