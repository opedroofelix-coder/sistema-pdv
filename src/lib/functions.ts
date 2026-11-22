import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

/**
 * Chama uma Edge Function e, no erro, **desembrulha a mensagem real** do corpo
 * da resposta (`{ error: "..." }`) em vez de deixar subir o genérico "Edge
 * Function returned a non-2xx status code" que o supabase-js usa pra qualquer
 * status !=2xx. Assim o usuário sempre vê o motivo de verdade (ex.: "permission
 * denied for table profiles", "Apenas o dono..."). Só cai no genérico se a
 * resposta não tiver um corpo `{ error }` legível.
 */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return data as T

  if (error instanceof FunctionsHttpError) {
    let message: string | null = null
    try {
      const parsed = await error.context.json()
      if (parsed && typeof parsed.error === 'string') message = parsed.error
    } catch {
      // corpo não-JSON ou já consumido: usa a mensagem genérica abaixo
    }
    if (message) throw new Error(message)
  }

  throw new Error(error.message)
}
