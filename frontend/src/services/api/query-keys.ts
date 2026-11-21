/** Central TanStack Query keys, so invalidation never depends on duplicated literals. */
export const queryKeys = {
  health: ['health'] as const,
  applications: {
    all: ['applications'] as const,
    list: () => [...queryKeys.applications.all, 'list'] as const,
    detail: (applicationId: string) => [...queryKeys.applications.all, 'detail', applicationId] as const,
  },
} as const
