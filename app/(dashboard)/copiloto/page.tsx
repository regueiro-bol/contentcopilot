import { cargarContenidosList, type ContenidoLista } from './actions'
import CopilotoClient from './copiloto-client'

export default async function CopilotoPage({
  searchParams,
}: {
  searchParams: { contenido?: string }
}) {
  let contenidos: ContenidoLista[] = []
  try {
    contenidos = await cargarContenidosList()
  } catch {
    contenidos = []
  }

  return (
    <CopilotoClient
      contenidosInicial={contenidos}
      contenidoIdInicial={searchParams.contenido ?? null}
    />
  )
}
