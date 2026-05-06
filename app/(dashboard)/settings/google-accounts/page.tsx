/**
 * Redirige a la nueva ubicación canónica: /ajustes/conexiones
 *
 * Se mantiene este archivo para no romper bookmarks ni enlaces externos.
 * El callback OAuth ya apunta a /ajustes/conexiones directamente.
 */
import { redirect } from 'next/navigation'

export default function GoogleAccountsRedirect({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') params.set(key, value)
  }
  const qs = params.toString()
  redirect(`/ajustes/conexiones${qs ? `?${qs}` : ''}`)
}
