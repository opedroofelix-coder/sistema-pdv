import { supabase } from './supabaseClient'

export async function uploadPhoto(file: File, path: string): Promise<string> {
  const { error } = await supabase.storage.from('photos').upload(path, file, {
    upsert: true,
  })
  if (error) throw error

  const {
    data: { publicUrl },
  } = supabase.storage.from('photos').getPublicUrl(path)
  return publicUrl
}
