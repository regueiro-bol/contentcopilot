import { PermissionGuard } from '@/components/PermissionGuard'
import EquipoClient from './equipo-client'

export const dynamic = 'force-dynamic'

export default function EquipoPage() {
  return (
    <PermissionGuard permission="action:gestionar_equipo">
      <EquipoClient />
    </PermissionGuard>
  )
}
