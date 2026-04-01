import Link from 'next/link'
import { Building2, Globe, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { obtenerIniciales } from '@/lib/utils'
import type { Cliente } from '@/types'

interface ClienteCardProps {
  cliente: Cliente
}

export function ClienteCard({ cliente }: ClienteCardProps) {
  return (
    <Card className="flex flex-col hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-4">
          {cliente.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cliente.logo_url}
              alt={`Logo de ${cliente.nombre}`}
              className="h-12 w-12 rounded-lg object-cover border border-gray-200"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 font-semibold text-sm shrink-0">
              {obtenerIniciales(cliente.nombre)}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-gray-900 truncate">{cliente.nombre}</h3>
              <Badge variant={cliente.activo ? 'success' : 'secondary'}>
                {cliente.activo ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 truncate">{cliente.sector}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
          <span className="truncate">{cliente.sector}</span>
        </div>

        {cliente.url_web && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Globe className="h-4 w-4 text-gray-400 shrink-0" />
            <span className="truncate">{cliente.url_web}</span>
          </div>
        )}

        {cliente.descripcion && (
          <p className="text-xs text-gray-500 line-clamp-2 mt-1">{cliente.descripcion}</p>
        )}
      </CardContent>

      <CardFooter className="pt-3">
        <Button variant="ghost" size="sm" className="ml-auto gap-1" asChild>
          <Link href={`/clientes/${cliente.id}`}>
            Ver detalle
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
