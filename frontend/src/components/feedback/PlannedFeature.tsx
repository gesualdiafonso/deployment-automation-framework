import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface PlannedFeatureProps {
  icon: LucideIcon
  title: string
  description: string
}

/** Honest placeholder for a route whose feature is not implemented yet (no fake data). */
export function PlannedFeature({ icon: Icon, title, description }: PlannedFeatureProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="size-5 text-muted-foreground" aria-hidden />
          <CardTitle>{title}</CardTitle>
          <Badge variant="outline">Planned</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}
