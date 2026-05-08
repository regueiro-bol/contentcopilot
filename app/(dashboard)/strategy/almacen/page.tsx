import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function AlmacenPage({
  searchParams,
}: {
  searchParams?: { cliente?: string }
}) {
  const cliente = searchParams?.cliente
  redirect(cliente ? `/mapa?cliente=${cliente}` : '/mapa')
}
