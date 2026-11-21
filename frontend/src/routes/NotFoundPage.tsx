import { Link } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { buttonVariants } from '@/components/ui/button'

import { paths } from './paths'

export default function NotFoundPage() {
  return (
    <div>
      <PageHeader title="Page not found" description="This address does not match any DeployForge page." />
      <Link to={paths.dashboard} className={buttonVariants({ variant: 'outline' })}>
        Back to dashboard
      </Link>
    </div>
  )
}
