import { useQuery } from '@tanstack/react-query'

import { queryKeys } from '@/services/api/query-keys'
import { getApplication, listApplications } from '@/services/applications.service'
import { APPLICATION_ID_PATTERN } from '@/types/api'

export function useApplications() {
  return useQuery({
    queryKey: queryKeys.applications.list(),
    queryFn: ({ signal }) => listApplications(signal),
  })
}

export function useApplication(applicationId: string) {
  return useQuery({
    queryKey: queryKeys.applications.detail(applicationId),
    queryFn: ({ signal }) => getApplication(applicationId, signal),
    // Same rule the API enforces: a malformed ID never leaves the browser.
    enabled: APPLICATION_ID_PATTERN.test(applicationId),
  })
}
