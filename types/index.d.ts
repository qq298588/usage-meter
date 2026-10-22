export type UsageCategory = {
  name: string
  tokens: number
  percentage: number
}

export type UsageApiTokens = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type UsageRateLimit = {
  kind: string
  percentUsed: number
  resetsAt?: string
}

export type UsageSnapshot = {
  updatedAt: number
  contextTokens?: number
  contextWindow?: number
  contextPercent?: number
  categories: UsageCategory[]
  apiUsage?: UsageApiTokens
  rateLimits: UsageRateLimit[]
  costUsd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': { snapshot: UsageSnapshot }
  }
}
