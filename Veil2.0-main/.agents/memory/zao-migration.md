---
name: ZAO-CMDS migration
description: How ZAO commands were ported into Veil and what shim layer bridges the two engines
---

## Rule
ZAO commands live in `src/commands/`. They reference `../../ZAO-ENGINE/` and `../../utils/atomicWrite` which resolve from `src/commands/` up to the project root. All bridging happens via shim files in `/ZAO-ENGINE/` and `/utils/` at the project root — never edit each individual command file.

**Why:** ~70 commands use these paths. Editing each one would be fragile; a shim directory is one change that fixes all of them at once.

**How to apply:** When adding new ZAO commands that reference `../../ZAO-ENGINE/SomeThing`, add `ZAO-ENGINE/SomeThing.js` pointing to the Veil equivalent. Same for `../../utils/X` → `utils/X.js`.

## Shim inventory (project root)
- `ZAO-ENGINE/motorPersist.js` → provides `motor1`/`motor2` with `persistAll`/`loadAll` backed by `data/motor1-persist.json` / `data/motor2-persist.json`
- `ZAO-ENGINE/motorSafeSend.js` → re-exports `src/engine/motorSafeSend`
- `ZAO-ENGINE/nickProtect.js` → re-exports `src/engine/nickProtect`
- `ZAO-ENGINE/groupImgLocks.js` → re-exports `src/engine/groupImgLocks`
- `ZAO-ENGINE/AntiDetectionEnhanced.js` → stub (no-op)
- `ZAO-ENGINE/EnhancedRateLimiter.js` → stub (no-op)
- `ZAO-ENGINE/runtimePersist.js` → updates `global.config.ADMINBOT` at runtime
- `utils/atomicWrite.js` → real atomic write-then-rename implementation

## Engine compatibility (loader.js + handlerEvents.js)
- `hasPermssion` → normalized to `role` in loader
- `commandCategory` → normalized to `category` in loader
- `module.exports.run` supported alongside `onStart`
- `handleEvent` aliased to `onEvent`
- `global.client.commands` bridged to `global.GoatBot.commands`
- `global.client.handleReply` array bridged
- Default permission: `?? 0` (not `?? 2`) — all commands are public by default

## Kept Veil originals (not replaced by ZAO)
angel, groupimg, بروفايل, nick, nm, tiktok, song, التحكم, احصائيات, صامت, قفل, اوامر, chats, divel, lockdown

## Skipped from ZAO
shutdown.js (killswitch), cp.js (→ التحكم), help.js (→ اوامر), uptime.js (→ ابتيم)

## Canvas uptime (ابتيم.js)
Uses `canvas` npm package. Assets at `src/commands/uptime/` (blank.png + Roboto fonts). Cache at `src/commands/cache/`. Falls back to text output if canvas fails.
