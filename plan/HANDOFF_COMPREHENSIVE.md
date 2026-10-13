# Waypoint comprehensive handoff (2026-07-27)

Branch: `cursor/comprehensive-streamline-9b13`  
Prior slow chat: https://cursor.com/agents/bc-6781a917-fa6a-48c6-a540-519df3919b13

## Model roles (strict)

| Role | Model |
|------|--------|
| Orchestrator only | `claude-fable-5-thinking-high` (Fable) |
| Judges (one aspect each) | `claude-4.6-sonnet-high-thinking` |
| Hard coding | `gpt-5.6-sol-high` / `gpt-5.6-sol-xhigh` |
| Smaller glue / git / CSS | Grok (parent) |

Fable must not implement or judge. Judges must not redesign — verify or score one aspect.

## User intent (concatenated)

1. **Undo bad UI pass** — Arcade shop/dual-road/Elo + Docs toolbar rewrite + square buttons. Revert (#19 cherry-picked).
2. **Remove Home weather** — minimalist launcher; no Set weather button.
3. **Chat options must work** — Agent New/Delete/picker, Confirm chips, Companion write confirms, follow-ups.
4. **Streamline buttons/features** — best of Code / Projects / Planner / Today / Arcade PLAY; intention cut, not stacking.
5. **Blueprint** — right-click menus pop; Python↔Blueprint convert real; C++ honest scaffold.
6. **Docs** — full extracted text on main; don’t re-break toolbar.
7. **Arcade** — keep PLAY feel; kill fake Review stubs; no shop mess.
8. **Test rigorously** — restart server, run tests, iterate.
9. **Multi-agent** — Fable orchestrates; Sonnet judges; GPT-5.6 Sol hard code; Grok glue.

## Do not revive

Arcade coin shop, dual roads, Elo hub, Home weather, Docs toolbar rewrite from #18.

## Already on main (don’t redo)

- Docs full extract / RAG continue
- Blueprint scrollable all-nodes + wire→empty
- Tidy + orphans + zone comments
- Agent multi-chat, fact-check, contact write tools, Thoughts containment
- Capture/Pulse/Blueprint/Parallel streamline core

## This branch — landed

- [x] Cherry-pick #19 revert + weather removal
- [x] Companion Confirm path (writes → `normal`, not `strong`)
- [x] Persist confirm/followup chips; Delete chat never activates Companion
- [x] Button radius tokens, pill dock tabs, hover media, tap
- [x] Arcade: remove Review stubs; Skin Road only in Lab; accent tokens
- [x] Blueprint: C++ params + honesty labels; Start/pin context menus; toolbar cut
- [x] Today: compact Pulse only; collapsed metrics; Due/Overdue; day-end grade
- [x] Home: transparent inactive dock tabs; hide My apps when empty; Reset only in customize
- [x] Mega-ask P0/P1 (2026-07-31): Blueprint catalog+gates+quests, Today autosave/pulse/importance,
      AI choice actions + practice flop explain, loot/coins/gems/skins/quests, Studio Notes rail,
      Projects log/%, triumph queue, animation cleanup — see PR #20

## Testing pass (Opus + GPT-5.6 Sol)

- [x] Hang root cause: `happiness_policy` `Lock`→`RLock` (self-deadlock in `apply_reward`→`suggest`)
- [x] Opus adversarial suite: `tests/test_adversarial_streamline.py` (26 cases)
- [x] Delete-chat: Companion sole survivor opens fresh "New chat" (not Companion)
- [x] Docs toolbar fully restored to pre-#18 (removed leftover `#18 extras`)
- [x] `unittest` streamline + adversarial: **35/35 OK** (~2s)
- [x] `tests/roundtrip_smoke.py` OK
- [x] Live Flask smokes: conversations 200; delete ≠ Companion; sole-survivor OK
- [x] Playwright **mouse** UX suite: `tests/test_mouse_ux_playwright.py` (Home/Today/Confirm/Blueprint/Arcade/Docs)
- [x] Artifacts: `/opt/cursor/artifacts/mouse-ux/` (screenshots + Opus checklist/report)
- [x] Companion Confirm chips clear after success; Blueprint menu z-index raised
- [ ] Optional: prune unreachable Home weather dead code in `core.js`
- [ ] PR merge once CI green

## How to continue

```
Continue from branch cursor/comprehensive-streamline-9b13.
Read plan/HANDOFF_COMPREHENSIVE.md.
Roles: Fable orchestrates; Sonnet judges one aspect; GPT-5.6 Sol hard code; Grok glue.
Do not revive Arcade shop / dual roads / Elo / Home weather / Docs toolbar rewrite.
Prioritize remaining smoke tests + any Sonnet regression flags.
```
