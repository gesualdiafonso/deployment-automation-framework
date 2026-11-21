import { Rocket } from 'lucide-react'

import { PageHeader } from '@/components/PageHeader'
import { PlannedFeature } from '@/components/feedback/PlannedFeature'

export default function DeploymentsPage() {
  return (
    <div>
      <PageHeader title="Deployments" />
      <PlannedFeature icon={Rocket} title="Not available yet" description="Request installs and uninstalls and follow their status. Requires the deployment-requests API, which is not implemented yet." />
    </div>
  )
}
