---
name: Messenger runtime dependency
description: Durable constraint around the imported project's optional Facebook Messenger client
---

The imported project's legacy FCA client packages can be rejected by the workspace package firewall because of vulnerable or suspicious transitive dependencies. The dashboard must remain runnable without them and expose an explicit dependency-missing state rather than bypassing the firewall or claiming Messenger is connected.

**Why:** Both declared FCA client candidates were blocked during setup, so a hard dependency would make the dashboard fail to start and would encourage unsafe installation workarounds.

**How to apply:** Keep the Messenger bridge optional, prefer firewall-approved replacements if one becomes available, and only enable live threads, sends, and automation after the runtime reports a connected session.