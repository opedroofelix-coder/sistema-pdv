-- Editar lote (decisao #65): fornecedor, valor pago e data da compra passam a
-- ser corrigiveis pelo dono na tela do lote.
--
-- Ate aqui o lote nascia e nunca mais podia ser corrigido: `createLot`
-- (src/lib/lots.ts) gravava os quatro campos e nao havia nenhum caminho de
-- edicao -- errar o fornecedor ou digitar o valor pago errado no leilao so se
-- resolvia no SQL Editor, ou apagando e recriando o lote (impossivel depois que
-- ele tem itens: `delete_lot` bloqueia).
--
-- Decisoes do dono nesta branch:
--   - campos editaveis: fornecedor, valor pago e data da compra (`notes` fica
--     de fora -- nao e' exibido em nenhuma tela hoje);
--   - mudar o valor pago exige um passo de confirmacao na UI (recalcula o
--     rateio); fornecedor e data salvam direto;
--   - lote FECHADO tambem pode ser editado, sem reabrir primeiro (mesmo padrao
--     ja usado em /estoque pra excluir item de lote fechado);
--   - a acao e' SO DO DONO, seguindo o precedente das tres acoes de
--     0019_lotes_acoes.sql -- deliberadamente nao segue a linha aberta da
--     decisao #38/0013, porque o lote e' a unidade de custeio e mexer no valor
--     pago reabre o rateio de todo o lote.
--
-- O recalculo do rateio NAO precisa de codigo novo: o trigger `lots_recalc`
-- (0002_receiving.sql) ja roda `after update of purchase_value on lots` e chama
-- `recalc_lot_allocated_cost`, que so reescreve linhas com
-- `quantity_sold < quantity` -- unidade ja vendida fica congelada em
-- `sale_items.cost_at_sale`, entao margem historica nao muda.
--
-- Divida conhecida, deliberadamente nao mexida aqui (igual ao 0019): a policy
-- "lots: authenticated all" (0001) continua permitindo update direto na tabela
-- via PostgREST. Esta RPC e' a trava de produto, nao uma trava de RLS
-- (decisao #25).
--
-- Aditiva: so cria funcao, nao toca em coluna nem em dado.

-- ---------------------------------------------------------------------------
-- update_lot: um unico `update` com as tres colunas no SET, pra o trigger
-- `lots_recalc` disparar uma vez so.
--
-- A validacao de valor e' MAIS ESTRITA que a constraint da tabela
-- (`purchase_value >= 0`, 0001): zero apagaria o custo rateado do lote inteiro
-- em silencio (recalc_lot_allocated_cost gravaria allocated_cost = 0 em todos
-- os itens nao vendidos), e lote de leilao sempre tem valor pago. Mesma regua
-- da mensagem "Preço deve ser maior que zero." do EditProductModal.
--
-- Fornecedor e' obrigatorio na edicao, mesmo a coluna sendo nullable: e' o
-- titulo do lote nas duas telas (`lot.supplier || 'Sem fornecedor'`) e o
-- formulario de criacao ja o marca `required`.
-- ---------------------------------------------------------------------------
create function update_lot(
  p_lot_id uuid,
  p_supplier text,
  p_purchase_value numeric,
  p_purchase_date date
)
returns void
language plpgsql
as $$
declare
  v_role text;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is distinct from 'dono' then
    raise exception 'Somente o dono pode editar um lote';
  end if;

  if p_supplier is null or btrim(p_supplier) = '' then
    raise exception 'Fornecedor não pode ficar em branco';
  end if;

  if p_purchase_value is null or p_purchase_value <= 0 then
    raise exception 'Valor pago deve ser maior que zero';
  end if;

  if p_purchase_date is null then
    raise exception 'Data da compra é obrigatória';
  end if;

  update lots
     set supplier = btrim(p_supplier),
         purchase_value = p_purchase_value,
         purchase_date = p_purchase_date
   where id = p_lot_id;
end;
$$;

grant execute on function update_lot(uuid, text, numeric, date) to authenticated;
