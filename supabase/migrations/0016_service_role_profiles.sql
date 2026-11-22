-- Branch de correção (item 5 / admin-users): a Edge Function `admin-users`
-- roda com `service_role` e lê `public.profiles` pra confirmar que o chamador
-- é dono. Mas o `service_role` nunca recebeu GRANT de SELECT em `profiles`
-- (desde o 0001 só `authenticated` tem; o 0006 concedeu service_role só nas
-- tabelas de catálogo) -- então a consulta falha com "permission denied for
-- table profiles" (42501), a checagem de dono vira falsa e a função devolve
-- 403 pra qualquer um, inclusive o dono. Sem isso a tela /usuarios não
-- funciona (nem local, nem em produção).
--
-- Aditiva: concede só o SELECT necessário (a função apenas lê profiles).

grant select on public.profiles to service_role;
