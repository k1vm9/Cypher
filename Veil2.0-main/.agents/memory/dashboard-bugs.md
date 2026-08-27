---
name: Dashboard bug fixes
description: All bugs found and fixed in src/dashboard/server.js and src/dashboard/public/index.html
---

## Bugs Fixed

### 1. Missing `POST /api/admins/bulk` endpoint (server.js)
`saveAdmins()` in the dashboard called `POST /api/admins` but no such endpoint existed — only granular `/api/admins/add`, `/api/admins/remove` etc. Added `POST /api/admins/bulk` that atomically replaces ownerID, adminBot, superAdminBot in config.json.

**Why:** The dashboard JS sends a bulk payload; the server only had per-op endpoints. The JS was updated to call `/api/admins/bulk`.

### 2. ownerID array vs string mismatch (index.html `loadAdmins`)
`/api/admins` GET returns `ownerID` as an array (via `_ownerArr(cfg)`), but `loadAdmins()` did `setVal("adm-ownerID", r.ownerID || "")` treating it as a string.

**Fix:** `const ownerVal = Array.isArray(r.ownerID) ? (r.ownerID[0] || "") : (r.ownerID || "");`

### 3. UIDs converted to Number (precision loss) in `saveAdmins`
`adminBot: _admins.map(Number)` loses precision for large Facebook UIDs (>53 bits). Changed to `.map(String)`.

### 4. Login password field not in a `<form>` (browser warning)
The login `<input type="password">` was a bare input, not inside a `<form>`. Wrapped in `<form onsubmit="doLogin();return false;" autocomplete="on">`. Also removed duplicate `keydown` Enter listener since the form's submit handles it.

### 5. Settings password field not in a `<form>` (browser warning)
`cfg-dashpwd` in the settings tab had the same issue. Wrapped in a `<form onsubmit="return false;" style="margin:0;padding:0;">` with `autocomplete="new-password"`.

### 6. "DAVID V1" fallback strings throughout server.js
`getStats()`, `/api/status`, WebSocket `bot-status`, and AI system prompts all had `|| "DAVID V1"` fallbacks. Updated all to `|| "Veil"`.

### 7. `getStats()` command count guarded against null commands map
Added null-check: `global.GoatBot?.commands ? (() => {...})() : 0` to prevent crash if commands map is not yet initialized.

## What was NOT changed
- The Veil engine (handlerEvents.js, loader.js, core.js) — already more advanced than the newer David engine in `/David/david-fixed-railway-main/`. No downgrade needed.
- All ctrlpanel endpoints exist in server.js (lines 1027–1297) — no action needed.
- `/api/messages` endpoint exists at line 540 — no action needed.
