import type { ServerSoftware } from '@shared/types'

/** Custom first, then the supported server types. */
export const SOFTWARE_ORDER: readonly ServerSoftware[] = ['custom', 'vanilla', 'paper', 'purpur', 'folia', 'leaf', 'fabric', 'velocity']
