-- Tema Pétalas: o tema claro passa a ser o padrão. Antes o padrão era
-- 'system' (seguia o sistema operacional). Perfis que nunca escolheram um
-- tema ficaram com 'system' só por causa do padrão antigo, então passam para
-- 'light'; quem quiser o automático escolhe de novo no menu do usuário.
alter table profiles alter column theme_preference set default 'light';
update profiles set theme_preference = 'light' where theme_preference = 'system';
