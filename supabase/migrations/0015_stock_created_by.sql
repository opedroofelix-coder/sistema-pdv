-- Branch 6 (feature/painel-admin-usuarios), item 5: autoria de quem cadastrou
-- o item de estoque, pro histórico "quem cadastrou" da tela de admin.
--
-- Aditiva: coluna nullable com `default auth.uid()`. Assim os itens novos
-- gravam sozinhos quem os criou (o insert do recebimento roda como o usuário
-- autenticado via PostgREST, então auth.uid() resolve pro id dele) sem mudar
-- o cliente. Itens cadastrados ANTES desta migration ficam com created_by
-- null -- aparecem como "desconhecido" no histórico (não dá pra saber
-- retroativamente quem cadastrou; decisão do dono: só daqui pra frente).
--
-- "Quem vendeu" não precisa de coluna nova: sales.cashier_id já existe desde
-- o 0001. FK pra profiles(id) (= auth.users.id), satisfeita porque todo
-- usuário autenticado tem uma linha em profiles (trigger handle_new_user).

alter table stock_items
  add column created_by uuid references profiles (id) default auth.uid();

create index stock_items_created_by_idx on stock_items (created_by);
