/** Central TanStack Query keys, so invalidation never depends on duplicated literals. */
export const queryKeys = {
  health: ['health'] as const,
  applications: {
    all: ['applications'] as const,
    list: () => [...queryKeys.applications.all, 'list'] as const,
    detail: (applicationId: string) => [...queryKeys.applications.all, 'detail', applicationId] as const,
  },
  deployment: {
    all: ['deployment'] as const,
    status: ['deployment', 'status'] as const,
    operations: (limit: number) => ['deployment', 'operations', 'list', limit] as const,
    operation: (operationId: string) => ['deployment', 'operations', 'detail', operationId] as const,
    audit: (limit: number, operationId: string | null) => ['deployment', 'audit', limit, operationId] as const,
  },
  apiExplorer: {
    openapi: ['api-explorer', 'openapi'] as const,
    documentation: (path: string) => ['api-explorer', 'documentation', path] as const,
  },
} as const
