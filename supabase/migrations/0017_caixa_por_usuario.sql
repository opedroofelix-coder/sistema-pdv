-- Decisao #53, item 2: cada operador fecha o proprio caixa.
--
-- Ate aqui o 0003_pdv.sql impunha "1 loja, 1 caixa" com um indice unico
-- GLOBAL (`on cash_sessions ((true)) where closed_at is null`): so podia
-- existir uma sessao aberta na loja inteira, entao quem abria abria pra todo
-- mundo e quem fechava fechava o de todos. Passa a ser uma sessao aberta por
-- operador.
--
-- Aditiva: nao mexe em dado nenhum. O indice antigo garantia no maximo uma
-- sessao aberta, logo no maximo uma por cashier -- os dados existentes ja
-- satisfazem o indice novo.

drop index if exists cash_sessions_one_open_idx;

create unique index cash_sessions_one_open_per_cashier_idx
  on cash_sessions (cashier_id)
  where closed_at is null;

-- ---------------------------------------------------------------------------
-- close_cash_session: mesma assinatura e mesmo calculo, mais a checagem de
-- quem pode fechar. Esconder o botao nao basta -- a RLS de cash_sessions e'
-- aberta por papel (decisao #25), entao qualquer usuario logado alcancaria a
-- funcao. Regra: o proprio dono da sessao, ou quem tem papel `dono` (decisao
-- do dono: caixa esquecido aberto precisa de alguem que consiga fechar).
-- ---------------------------------------------------------------------------
create or replace function close_cash_session(p_session_id uuid, p_closing_amount numeric)
returns cash_sessions
language plpgsql
as $$
declare
  v_opening numeric;
  v_cashier uuid;
  v_caller_role text;
  v_dinheiro numeric;
  v_sangria numeric;
  v_suprimento numeric;
  v_expected numeric;
  v_rows int;
begin
  select opening_amount, cashier_id into v_opening, v_cashier
    from cash_sessions where id = p_session_id;
  if not found then
    raise exception 'Sessão de caixa não encontrada';
  end if;

  select role into v_caller_role from profiles where id = auth.uid();
  if auth.uid() is distinct from v_cashier and v_caller_role is distinct from 'dono' then
    raise exception 'Somente quem abriu o caixa ou o dono pode fechar esta sessão';
  end if;

  select coalesce(sum(total), 0) into v_dinheiro from sales
    where session_id = p_session_id and payment_method = 'dinheiro' and status = 'completed';

  select coalesce(sum(amount) filter (where type = 'sangria'), 0),
         coalesce(sum(amount) filter (where type = 'suprimento'), 0)
    into v_sangria, v_suprimento
    from cash_movements where session_id = p_session_id;

  v_expected := v_opening + v_dinheiro - v_sangria + v_suprimento;

  update cash_sessions
    set closed_at = now(), closing_amount = p_closing_amount, expected_amount = v_expected
    where id = p_session_id and closed_at is null;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Sessão já estava fechada';
  end if;

  return (select c from cash_sessions c where id = p_session_id);
end;
$$;
