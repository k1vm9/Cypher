# Cypher Dashboard

## Run

Use the existing `Start application` workflow, or run:

```bash
npm start
```

The project serves the Cypher control dashboard from the Node launcher. The dashboard is a static frontend with local preview interactions for navigation, controls, messaging, logs, AI generation, and settings. The original bot runtime remains in `main.js` and still requires its declared Messenger/FCA dependency tree and a valid `appstate.json` session.

## Notes

- The launcher uses Node's built-in HTTP and file APIs so the dashboard can start even when the imported bot-only dependencies are unavailable.
- Do not place session cookies or API keys in chat. Keep sensitive configuration in the workspace secrets/configuration flow.