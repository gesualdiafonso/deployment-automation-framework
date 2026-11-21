import { toast, type ExternalToast } from 'sonner'

import { getErrorMessage } from './errors'

/**
 * The single notification API of the app. Features call notify.*, never sonner
 * directly, so the toast library can change without touching features.
 */
export const notify = {
  success: (message: string, options?: ExternalToast) => toast.success(message, options),
  info: (message: string, options?: ExternalToast) => toast.info(message, options),
  warning: (message: string, options?: ExternalToast) => toast.warning(message, options),
  error: (message: string, options?: ExternalToast) => toast.error(message, options),
  promise: toast.promise,
  dismiss: (id?: string | number) => toast.dismiss(id),
}

export function notifyError(error: unknown, fallback?: string, options?: ExternalToast) {
  return notify.error(getErrorMessage(error, fallback), options)
}
