/** Shown instead of the app when the VITE_* configuration is invalid. */
export function ConfigErrorScreen({ errors }: { errors: readonly string[] }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div role="alert" className="max-w-lg space-y-3">
        <h1 className="text-xl font-semibold">DeployForge cannot start</h1>
        <p className="text-sm text-muted-foreground">Fix the frontend environment configuration and restart:</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      </div>
    </main>
  )
}
