import { Package } from 'lucide-react'

import { PageHeader } from '@/components/PageHeader'
import { PlannedFeature } from '@/components/feedback/PlannedFeature'

export default function CatalogPage() {
  return (
    <div>
      <PageHeader title="Application catalog" />
      <PlannedFeature icon={Package} title="Not available yet" description="Browse, search and inspect the applications in packages/catalog.json." />
    </div>
  )
}
