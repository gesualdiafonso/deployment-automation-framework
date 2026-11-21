import { Activity } from 'lucide-react'

import { PageHeader } from '@/components/PageHeader'
import { PlannedFeature } from '@/components/feedback/PlannedFeature'

export default function ActivityPage() {
  return (
    <div>
      <PageHeader title="Activity" />
      <PlannedFeature icon={Activity} title="Not available yet" description="History of deployment requests and their results." />
    </div>
  )
}
