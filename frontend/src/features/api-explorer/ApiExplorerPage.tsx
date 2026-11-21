import { Braces } from 'lucide-react'

import { PageHeader } from '@/components/PageHeader'
import { PlannedFeature } from '@/components/feedback/PlannedFeature'

export default function ApiExplorerPage() {
  return (
    <div>
      <PageHeader title="API Explorer" />
      <PlannedFeature icon={Braces} title="Not available yet" description="Inspect the DeployForge API endpoints and their responses." />
    </div>
  )
}
