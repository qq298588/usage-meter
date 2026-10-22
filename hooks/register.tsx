import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { UsageSnapshot } from '../types'

const PANE = 'usage-meter'
const TITLE = '用量面板'

const snapshot = atom({ plugin: 'usage-meter', key: 'snapshot' } as const, {
  updatedAt: 0,
  categories: [],
  rateLimits: [],
} as UsageSnapshot)

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(Math.round(n))
}

function formatResetsAt(iso?: string): string {
  if (!iso) return ''
  const target = new Date(iso).getTime()
  const diffMs = target - Date.now()
  if (!Number.isFinite(diffMs) || diffMs <= 0) return '即將重置'
  const hours = Math.floor(diffMs / 3_600_000)
  const mins = Math.round((diffMs % 3_600_000) / 60_000)
  if (hours >= 24) return `約 ${Math.floor(hours / 24)} 天後重置`
  if (hours > 0) return `約 ${hours} 時 ${mins} 分後重置`
  return `約 ${mins} 分後重置`
}

const RATE_LIMIT_LABEL: Record<string, string> = {
  five_hour: '5 小時額度',
  seven_day: '7 天額度',
  spend_limit: '額度上限',
}

// $ carries the full engine interface; typed loosely here since this module
// only touches session.usage, which is documented but not worth re-deriving.
async function refreshBreakdown($: any): Promise<void> {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const breakdown = usage.context?.breakdown
  const rawMax = breakdown?.rawMaxTokens || 1

  const categories = (breakdown?.categories ?? [])
    .filter((c: any) => c.kind === 'used')
    .map((c: any) => ({
      name: c.name,
      tokens: c.tokens,
      percentage: Math.round((c.tokens / rawMax) * 1000) / 10,
    }))
    .sort((a: any, b: any) => b.tokens - a.tokens)

  const api = breakdown?.apiUsage
  const apiUsage = api
    ? {
        input_tokens: api.input_tokens,
        output_tokens: api.output_tokens,
        cache_read_input_tokens: api.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: api.cache_creation_input_tokens ?? 0,
      }
    : undefined

  await update($, snapshot, () => ({
    updatedAt: Date.now(),
    contextTokens: usage.context?.tokens,
    contextWindow: usage.context?.window,
    contextPercent: usage.context?.percent,
    categories,
    apiUsage,
    rateLimits: usage.rateLimits ?? [],
    costUsd: usage.cost?.usd,
  }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-panel',
      description: '開啟用量面板（session 用量、快取占比、claude.ai 帳號額度）',
    })
    void $.ui.open({ id: PANE, title: TITLE })
    await refreshBreakdown($)
    $.clock.every(30_000, () => void refreshBreakdown($))
    return next(e)
  })

  on('command.run', { command: 'usage-panel' }, async $ => {
    await refreshBreakdown($)
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: '用量面板已開啟。' }
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await update($, snapshot, prev => ({
      ...prev,
      updatedAt: Date.now(),
      contextTokens: e.context.tokens ?? prev.contextTokens,
      contextWindow: e.context.window ?? prev.contextWindow,
      contextPercent: e.context.percent ?? prev.contextPercent,
      rateLimits: e.rateLimits ?? prev.rateLimits,
      costUsd: e.cost?.usd ?? prev.costUsd,
    }))
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, snapshot)
    const api = s.apiUsage

    let cacheReadPct = 0
    let cacheWritePct = 0
    let freshPct = 0
    let outputPct = 0
    if (api) {
      const total =
        api.input_tokens +
        api.output_tokens +
        api.cache_read_input_tokens +
        api.cache_creation_input_tokens
      if (total > 0) {
        cacheReadPct = Math.round((api.cache_read_input_tokens / total) * 1000) / 10
        cacheWritePct = Math.round((api.cache_creation_input_tokens / total) * 1000) / 10
        freshPct = Math.round((api.input_tokens / total) * 1000) / 10
        outputPct = Math.round((api.output_tokens / total) * 1000) / 10
      }
    }

    return (
      <Box flexDirection="column">
        <Text weight="bold">本次 Session</Text>
        <Text>
          Context：
          {s.contextPercent !== undefined ? `${s.contextPercent.toFixed(1)}%` : '—'}
          {s.contextTokens !== undefined && s.contextWindow !== undefined
            ? ` (${formatTokens(s.contextTokens)} / ${formatTokens(s.contextWindow)})`
            : ''}
        </Text>
        {s.costUsd !== undefined && <Text dimColor>花費：${s.costUsd.toFixed(4)}</Text>}
        <Text> </Text>

        {api && (
          <Box flexDirection="column">
            <Text weight="bold">Token 占比（最近一次請求）</Text>
            <Text dimColor>快取讀取 cache_read：{cacheReadPct}%</Text>
            <Text dimColor>快取寫入 cache_creation：{cacheWritePct}%</Text>
            <Text dimColor>新輸入 input：{freshPct}%</Text>
            <Text dimColor>輸出 output：{outputPct}%</Text>
            <Text> </Text>
          </Box>
        )}

        <Text weight="bold">Context 分類（前 6 大）</Text>
        {s.categories.length === 0 && <Text dimColor>尚無資料</Text>}
        {s.categories.slice(0, 6).map(c => (
          <Text dimColor>
            {c.name}：{formatTokens(c.tokens)} ({c.percentage}%)
          </Text>
        ))}
        <Text> </Text>

        <Text weight="bold">Claude.ai 帳號額度</Text>
        {s.rateLimits.length === 0 && <Text dimColor>（非訂閱帳號，或尚未讀到資料）</Text>}
        {s.rateLimits.map(r => (
          <Text>
            {RATE_LIMIT_LABEL[r.kind] ?? r.kind}：{r.percentUsed.toFixed(1)}%
            {r.resetsAt ? ` · ${formatResetsAt(r.resetsAt)}` : ''}
          </Text>
        ))}
      </Box>
    )
  })
}
