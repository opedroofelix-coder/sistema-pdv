/**
 * Dados da loja exibidos na vitrine. O número do WhatsApp vem do ambiente
 * (VITE_LOJA_WHATSAPP, com DDD; o 55 é posto sozinho) pra trocar sem mexer no
 * código.
 */
export const STORE = {
  name: (import.meta.env.VITE_LOJA_NOME as string | undefined) || 'Lú-Bia Flores',
  whatsapp: (import.meta.env.VITE_LOJA_WHATSAPP as string | undefined) || '',
  instagram:
    (import.meta.env.VITE_LOJA_INSTAGRAM as string | undefined) ||
    'https://www.instagram.com/lubiafloresoficial/',
  city: (import.meta.env.VITE_LOJA_CIDADE as string | undefined) || 'Jandira-SP',
}
