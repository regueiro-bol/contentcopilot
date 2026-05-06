import { redirect } from 'next/navigation'

// /ajustes → aterrizamos siempre en la primera tab (Equipo)
export default function AjustesPage() {
  redirect('/ajustes/equipo')
}
