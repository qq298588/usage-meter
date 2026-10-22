# usage-meter

A Claude Code mod (side pane) that shows this session's live token usage next to the
transcript: the context window's fill percentage and raw token count, a breakdown of
the last response's input tokens into cache-read, cache-write, fresh input and output
shares, the top context categories by token count (as `/context` breaks them down),
the session's cost in USD, and, for a claude.ai subscription, the account's five-hour
and seven-day rate-limit windows with their reset times. The pane opens automatically
when the session starts and can be reopened any time with `/usage-panel`. The headline
numbers update live whenever usage changes; the category breakdown recomputes every
30 seconds.

## Install

```
/plugin install usage-meter --marketplace qq298588/usage-meter
```
