# Cypher Dashboard

## Run

Use the existing `Start application` workflow, or run:

```bash
npm start
```

The project serves the Cypher control dashboard from the Node launcher. The dashboard exposes live status, command discovery, settings, protections, logs, automation, and Messenger controls. Messenger conversations remain empty until a valid session is imported and connected; the original bot runtime remains in `main.js`.

## Notes

- The launcher uses Node's built-in HTTP and file APIs so the dashboard can start even when the imported bot-only dependencies are unavailable.
- Dashboard settings, schedules, and operator lists are persisted in the ignored `.cypher-dashboard-state.json` file created at runtime. Live Messenger threads and messages are never persisted as dashboard demo data.
- Import a browser-exported appstate JSON from the Cookies panel. The session is written with restrictive permissions and can be cleared from the panel; values are never returned by the API.
- The FCA client is optional at startup. If Replit's package firewall prevents its legacy dependency tree from installing, the dashboard reports `Dependency missing` instead of pretending Messenger is connected.
- The dashboard accepts standard appstate JSON, c3c-style `{ "cookies": [...] }` exports, simple cookie maps, and browser cookie-header text. `c_user` and `xs` are required before a connection is attempted.
- Veil's command catalog is read from `Veil2.0-main/src/commands` and exposed read-only in the Commands tab; native Cypher commands remain the only source files editable from the panel.
- Enabled automatic-message schedules are real guarded jobs: they pause without a connected session or live target thread, use a randomized interval, persist their configuration, and record the last error in the Control Center.
- The Messenger tab can load live thread information and use the provider's supported actions for marking read, renaming, changing nicknames, and adding/removing members.
- Do not place session cookies or API keys in chat. Keep sensitive configuration in the workspace secrets/configuration flow.