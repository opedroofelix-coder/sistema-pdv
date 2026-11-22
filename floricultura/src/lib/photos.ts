// Fotos em src/assets/fotos/<chave>.jpg. O Vite empacota (e, no build de
// arquivo único, embute) só as que existem na pasta.
const files = import.meta.glob('../assets/fotos/*.jpg', { eager: true, import: 'default' }) as Record<string, string>

const byKey: Record<string, string> = {}
for (const [path, url] of Object.entries(files)) {
  const key = path.split('/').pop()!.replace(/\.jpg$/, '')
  byKey[key] = url
}

export function photo(key: string): string {
  return byKey[key] ?? ''
}
