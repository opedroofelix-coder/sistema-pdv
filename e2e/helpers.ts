import { execSync } from 'node:child_process'

/**
 * Não há UI de gestão de papel (role é 'dono' só pro primeiro cadastro,
 * 'estoquista' pros demais -- ver handle_new_user na migration 0001).
 * Pra testar dono/caixa/estoquista de forma deterministica e independente
 * da ordem de execução dos specs, promovemos direto no Postgres local,
 * desabilitando o trigger protect_profile_role_trigger (que existe pra
 * impedir um usuário comum de trocar o próprio papel pela API -- não se
 * aplica a este ajuste de fixture via conexão direta ao banco).
 *
 * Depois de chamar, force um `page.goto(...)` -- o papel só chega no cliente
 * quando o AuthContext recarrega o perfil.
 */
export function setRole(email: string, role: 'dono' | 'caixa' | 'estoquista') {
  const sql = `
    alter table profiles disable trigger protect_profile_role_trigger;
    update profiles set role = '${role}'
      where id = (select id from auth.users where email = '${email}');
    alter table profiles enable trigger protect_profile_role_trigger;
  `
  execSync('docker exec -i supabase_db_sistema-pdv psql -U postgres -d postgres', { input: sql })
}
