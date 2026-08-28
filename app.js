(() => {
  "use strict";

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const loginGate = $("#loginGate");
  const appShell = $("#appShell");
  const accessKey = $("#accessKey");
  const loginForm = $("#loginForm");
  const loginError = $("#loginError");
  const toastRegion = $("#toastRegion");
  const icon = (name) => `<svg><use href="#i-${name}"></use></svg>`;
  let csrfToken = "";
  let currentThread = "thread_8841";
  let eventStream = null;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    }[character]));
  }

  async function api(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const headers = { ...(options.headers || {}) };
    if (method !== "GET" && method !== "HEAD") {
      if (!csrfToken) {
        const tokenResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
        const tokenData = await tokenResponse.json().catch(() => ({}));
        csrfToken = tokenData.csrf || "";
      }
      headers["Content-Type"] = "application/json";
      headers["x-csrf-token"] = csrfToken;
    }
    const response = await fetch(path, { ...options, headers, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      showLogin();
      throw new Error(data.error || "Your session has expired.");
    }
    if (!response.ok || data.ok === false) throw new Error(data.error || "The request could not be completed.");
    return data;
  }

  function showLogin() {
    eventStream?.close();
    eventStream = null;
    appShell.classList.add("is-hidden");
    loginGate.classList.remove("is-hidden");
    document.body.classList.remove("authenticated");
    csrfToken = "";
  }

  async function showApp() {
    loginGate.classList.add("is-hidden");
    appShell.classList.remove("is-hidden");
    document.body.classList.add("authenticated");
    await loadDashboard();
    connectLiveEvents();
  }

  function syncStatus(data) {
    if (!data) return;
    const status = data.status || "online";
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    $$(".connection-pill").forEach((pill) => {
      const label = pill.querySelector("span:nth-child(2)");
      const latency = pill.querySelector(".connection-label");
      if (label) label.textContent = statusLabel;
      if (latency) latency.textContent = status === "online" ? `· ${data.latency || 42}ms` : "· waiting";
      pill.classList.toggle("is-offline", status !== "online");
    });
    $$(".profile-card .badge").forEach((badge) => {
      badge.innerHTML = `<span class="status-dot ${status === "online" ? "online" : status === "connecting" ? "amber" : ""}"></span> ${statusLabel}`;
      badge.className = `badge ${status === "online" ? "badge-success" : status === "connecting" ? "badge-warning" : "badge-red"}`;
    });
    $$(".profile-card .eyebrow .status-dot").forEach((dot) => {
      dot.className = `status-dot ${status === "online" ? "online" : status === "connecting" ? "amber" : ""}`;
    });
    const stats = data.stats || {};
    const values = [
      stats.messages, stats.commands, stats.groups, Number(stats.users || 0).toLocaleString(),
      stats.uptime, stats.totalCommands?.toLocaleString(), String(stats.protections ?? "—").padStart(2, "0"), stats.ram,
    ];
    $$(".stat-card strong").forEach((value, index) => {
      if (values[index] !== undefined) value.textContent = values[index];
    });
    const profileVersion = $(".profile-copy code");
    if (profileVersion) profileVersion.textContent = `cypher-live · v${data.version || "1.2.14"}`;
    const silentChip = $(".silent-chip");
    if (silentChip) silentChip.innerHTML = `<span class="status-dot ${data.settings?.silentMode ? "amber" : "online"}"></span> Silent ${data.settings?.silentMode ? "on" : "off"}`;
    const statusSummary = $("#veilStatusSummary");
    if (statusSummary) statusSummary.textContent = `${data.activeProtectionCount || 0}/${data.protectionCount || 20} safety layers active`;
    if (data.messages) renderMessages(data.messages);
    if (data.logs) renderLogs(data.logs);
    if (data.schedules) renderSchedules(data.schedules);
    $$(".toggle[data-setting]").forEach((toggle) => {
      toggle.classList.toggle("active", Boolean(data.settings?.[toggle.dataset.setting]));
    });
    $$(".toggle[aria-label]").forEach((toggle) => {
      const label = String(toggle.getAttribute("aria-label") || "").toLowerCase();
      const setting = label.includes("silent") ? "silentMode"
        : label.includes("admin") ? "adminOnly"
          : label.includes("keep-alive") ? "keepAlive"
            : label.includes("mqtt") ? "mqttReconnect"
              : label.includes("stealth") ? "stealthMode"
                : label.includes("inbox") ? "allowInbox"
                  : "";
      if (setting && data.settings?.[setting] !== undefined) toggle.classList.toggle("active", Boolean(data.settings[setting]));
    });
    $$(".toggle[data-protection]").forEach((toggle) => {
      toggle.classList.toggle("active", Boolean(data.protections?.[toggle.dataset.protection]));
      const label = toggle.closest(".protection-card")?.querySelector(".status-label");
      if (label) {
        label.className = `status-label ${data.protections?.[toggle.dataset.protection] ? "enabled" : "disabled"}`;
        label.innerHTML = `<span class="status-dot ${data.protections?.[toggle.dataset.protection] ? "online" : ""}"></span> ${data.protections?.[toggle.dataset.protection] ? "Enabled" : "Disabled"}`;
      }
    });
  }

  async function loadDashboard() {
    try {
      const [status, commands, protections] = await Promise.all([
        api("/api/status"),
        api("/api/commands"),
        api("/api/protections"),
      ]);
      syncStatus(status);
      renderCommands(commands.commands || []);
      renderProtections(protections.protections || []);
      renderLogs(status.logs || []);
      renderMessages(status.messages || []);
      injectVeilFeatures();
      wirePanelControls();
      renderSchedules(status.schedules || []);
      await loadThreads();
      await loadFiles();
      await loadAdmins();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function connectLiveEvents() {
    eventStream?.close();
    eventStream = new EventSource("/api/events");
    eventStream.addEventListener("state-update", (event) => {
      try { syncStatus(JSON.parse(event.data)); } catch (_) {}
    });
    eventStream.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.threadID === currentThread) appendMessage(message, "incoming");
      } catch (_) {}
    });
    eventStream.addEventListener("log-line", (event) => {
      try { appendLog(JSON.parse(event.data)); } catch (_) {}
    });
    eventStream.onerror = () => {
      eventStream?.close();
      setTimeout(() => {
        if (!appShell.classList.contains("is-hidden")) connectLiveEvents();
      }, 5000);
    };
  }

  function appendLog(log) {
    const lines = $("#logLines");
    if (!lines || !log) return;
    $(".log-empty", lines)?.remove();
    const row = document.createElement("div");
    const level = String(log.level || "INFO").toLowerCase();
    row.innerHTML = `<time>${escapeHtml(log.time || "")}</time><b class="${level}">${escapeHtml(log.level || "INFO")}</b><span>${escapeHtml(log.text || "")} <em>${escapeHtml(log.meta || "")}</em></span>`;
    lines.prepend(row);
    while (lines.children.length > 100) lines.lastElementChild.remove();
  }

  async function runAction(action, button, payload = {}) {
    if (button) button.disabled = true;
    try {
      const data = await api("/api/actions", {
        method: "POST",
        body: JSON.stringify({ action, ...payload }),
      });
      syncStatus(data.state);
      const messages = {
        restart: "Restart queued · instance will reconnect shortly",
        stop: "Cypher is offline",
        start: "Cypher is online",
        admin: "Admin-only mode updated",
        silent: "Silent mode preference updated",
        lock: "Bot lock updated",
        refresh: "Telemetry refreshed just now",
        ping: `Ping complete · ${data.state?.latency || 42}ms round trip`,
        import: "Session payload validated and ready",
        reload: "Configuration reloaded",
        "clear-logs": "Log stream cleared",
        "stop-all": "All automated jobs paused",
        "save-message": "Automatic message schedule saved",
      };
      toast(messages[action] || "Action completed");
      return data;
    } catch (error) {
      toast(error.message, "error");
      return null;
    } finally {
      if (button) button.disabled = false;
    }
  }

  function commandCategory(command) {
    const category = String(command.category || "").toLowerCase();
    if (/ai|ذكاء/.test(category)) return "AI";
    if (/admin|إدارة|مسؤولي/.test(category) || Number(command.role) >= 2) return "Admin";
    if (/game|لعب|ترفيه/.test(category)) return "Fun";
    return "Utility";
  }

  function renderCommands(commands) {
    const grid = $(".command-grid");
    if (!grid) return;
    grid.innerHTML = commands.map((command) => {
      const category = commandCategory(command);
      const aliases = (command.aliases || []).slice(0, 2).join(", ");
      const readonly = command.source === "veil";
      return `<article class="command-card panel live-command-card" data-category="${category}" data-command="${escapeHtml(command.name)}">
        <div class="command-top"><code>!${escapeHtml(command.name)}</code><span class="badge ${category === "AI" ? "badge-purple" : category === "Admin" ? "badge-red" : "badge-cyan"}">${category}</span></div>
        <p>${escapeHtml(command.description || "No description available.")}</p>
        <div class="command-meta"><span>${aliases ? `Alias: <code>${escapeHtml(aliases)}</code>` : `${readonly ? "Veil catalog" : "Cypher native"}`}</span><span class="permission">${icon(Number(command.role) >= 2 ? "lock" : "user")} ${Number(command.role) >= 2 ? "Admins" : "Everyone"}</span></div>
        <div class="command-bottom"><span class="status-label ${command.enabled ? "enabled" : "disabled"}"><span class="status-dot ${command.enabled ? "online" : ""}"></span> ${command.enabled ? "Enabled" : "Disabled"}</span>
          <button class="text-btn command-edit" data-command-file="${escapeHtml(command.file)}">${readonly ? "View source" : "Edit"} ${icon("arrow")}</button></div>
      </article>`;
    }).join("");
    const count = $(".inline-count", $("#panel-commands"));
    if (count) count.textContent = commands.length;
    const panel = $("#panel-commands");
    const search = $(".toolbar .search-box input", panel);
    const filters = $$(".filter-btn", panel);
    if (search && !search.dataset.bound) {
      search.dataset.bound = "true";
      const filter = () => {
        const query = search.value.toLowerCase().trim();
        const activeFilter = $(".filter-btn.active", panel)?.textContent.trim() || "All commands";
        $$(".live-command-card", grid).forEach((card) => {
          const matchesQuery = !query || card.textContent.toLowerCase().includes(query);
          const matchesCategory = activeFilter === "All commands" || card.dataset.category === activeFilter;
          card.classList.toggle("is-hidden", !(matchesQuery && matchesCategory));
        });
      };
      search.addEventListener("input", filter);
      filters.forEach((filterButton) => filterButton.addEventListener("click", () => {
        filters.forEach((item) => item.classList.remove("active"));
        filterButton.classList.add("active");
        filter();
      }));
    }
  }

  function renderLogs(logs) {
    const lines = $("#logLines");
    if (!lines) return;
    lines.innerHTML = "";
    if (logs.length) logs.slice(0, 100).reverse().forEach(appendLog);
    else lines.innerHTML = `<div class="log-empty">No log entries yet.</div>`;
  }

  function renderMessages(messages) {
    const table = $(".data-table", $("#panel-messages"));
    if (!table) return;
    const head = $(".table-head", table);
    table.innerHTML = head ? head.outerHTML : "";
    if (!messages.length) {
      table.insertAdjacentHTML("beforeend", `<div class="table-empty">No message events yet.</div>`);
    }
    messages.slice(0, 50).forEach((message) => {
      const thread = message.threadID === "thread_9204" ? "Design Systems"
        : message.threadID === "thread_1920" ? "AI Lab / prompts"
          : message.threadID === "thread_4402" ? "Ops Control" : "Nightwatch Ops";
      const row = document.createElement("div");
      row.className = "table-row";
      const status = String(message.status || "Processed");
      row.innerHTML = `<span class="person"><span class="avatar tiny blue-avatar">ME</span>${escapeHtml(message.sender || "You")}</span><span>${thread}</span><span>${escapeHtml(String(message.content || "").slice(0, 48))}</span><time>${escapeHtml(message.time || "")}</time><span class="status-label enabled">${escapeHtml(status)}</span>`;
      table.appendChild(row);
    });
    const count = $(".table-count", $("#panel-messages"));
    if (count) count.textContent = `${messages.length} event${messages.length === 1 ? "" : "s"}`;
    const preview = $(".message-preview-card");
    if (preview) {
      const content = messages.length
        ? messages.slice(0, 3).map((message) => `<div class="message-preview-row"><span class="avatar tiny blue-avatar">${escapeHtml(String(message.sender || "U").slice(0, 2).toUpperCase())}</span><span><strong>${escapeHtml(message.sender || "Unknown")}</strong><small>${escapeHtml(String(message.content || "").slice(0, 72))}</small></span><time>${escapeHtml(message.time || "")}</time></div>`).join("")
        : `<div class="empty-state compact"><div class="empty-icon">${icon("eye")}</div><strong>No messages yet</strong><span>New activity will appear here in real time.</span></div>`;
      const existing = $(".empty-state, .message-preview-list", preview);
      if (existing) {
        existing.outerHTML = `<div class="message-preview-list">${content}</div>`;
      } else {
        preview.insertAdjacentHTML("beforeend", `<div class="message-preview-list">${content}</div>`);
      }
    }
  }

  function renderSchedules(schedules) {
    const card = $("[data-automation='messages']");
    if (!card) return;
    const schedule = schedules.find((item) => item.id === "automatic-message") || schedules[0];
    const toggle = $("[data-schedule-toggle]", card);
    if (toggle) toggle.classList.toggle("active", Boolean(schedule?.enabled));
    if (!schedule) return;
    card.dataset.scheduleId = schedule.id;
    const select = $("select", card);
    const message = $(".text-area", card);
    const fields = $$("input", card);
    if (select) select.value = schedule.threadID;
    if (message && document.activeElement !== message) message.value = schedule.message || "";
    if (fields[0] && document.activeElement !== fields[0]) fields[0].value = schedule.min;
    if (fields[1] && document.activeElement !== fields[1]) fields[1].value = schedule.max;
    const nextRun = $(".next-run", card);
    if (nextRun) nextRun.textContent = schedule.enabled ? `Next run · every ${schedule.min}–${schedule.max} min` : "Paused";
  }

  async function loadFiles() {
    const list = $(".files-list", $("#panel-files"));
    if (!list) return;
    try {
      const data = await api("/api/files/tree");
      const flat = [];
      const flatten = (items, depth = 0) => items.forEach((item) => {
        if (item.type === "dir") {
          flat.push({ ...item, depth });
          flatten(item.children || [], depth + 1);
        } else flat.push({ ...item, depth });
      });
      flatten(data.tree || []);
      list.innerHTML = `<div class="file-search search-box"><svg><use href="#i-search"></use></svg><input placeholder="Filter files" aria-label="Filter files"></div>${flat.map((item) => item.type === "dir"
        ? `<div class="folder-label" data-file-name="${escapeHtml(item.name)}" style="padding-left:${10 + item.depth * 12}px">${icon("folder")}${escapeHtml(item.name)}</div>`
        : `<button class="file-row" data-file-path="${escapeHtml(item.path)}" style="padding-left:${10 + item.depth * 12}px">${icon("code")}<span>${escapeHtml(item.name)}</span><small>${item.ext || ""}</small></button>`).join("")}`;
      $(".file-search input", list)?.addEventListener("input", (event) => {
        const query = event.target.value.toLowerCase();
        $$(".file-row, .folder-label", list).forEach((row) => row.classList.toggle("is-hidden", query && !row.textContent.toLowerCase().includes(query)));
      });
      const firstFile = flat.find((item) => item.type === "file");
      if (firstFile) await loadFilePreview(firstFile.path);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function loadFilePreview(filePath) {
    try {
      const data = await api(`/api/files/read?path=${encodeURIComponent(filePath)}`);
      const preview = $(".code-preview", $("#panel-files"));
      const title = $(".file-preview-head strong", $("#panel-files"));
      const meta = $(".file-preview-head strong + span", $("#panel-files"));
      if (title) title.textContent = filePath.split("/").pop();
      if (meta) meta.textContent = `${filePath} · ${data.size} bytes`;
      if (preview) preview.textContent = data.content;
      if (preview) preview.dataset.filePath = filePath;
      const save = $('[data-action="save-file"]', $("#panel-files"));
      if (save) save.dataset.filePath = filePath;
      $$(".file-row", $("#panel-files")).forEach((row) => row.classList.toggle("active", row.dataset.filePath === filePath));
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function loadAdmins() {
    const grid = $(".admin-grid", $("#panel-admin"));
    if (!grid) return;
    try {
      const data = await api("/api/admins");
      const roles = [
        ["owner", "Owner", "One account with full control.", "owner", "eye"],
        ["super", "Super admins", "Can manage settings and access.", "super", "shield"],
        ["admin", "Admins", "Can use approved bot commands.", "admin", "user"],
      ];
      grid.innerHTML = roles.map(([role, title, description, tone, symbol]) => {
        const members = data.admins?.[role] || [];
        return `<article class="panel admin-card ${role === "owner" ? "owner-card" : ""}"><div class="card-heading"><div><h3>${title} <span class="inline-count">${members.length}</span></h3><p>${description}</p></div><div class="role-icon ${tone}">${icon(symbol)}</div></div>
          <div class="uid-list">${members.length ? members.map((id) => `<div class="uid-row"><code>${escapeHtml(id)}</code><button class="icon-btn" data-admin-action="remove" data-admin-role="${role}" data-admin-id="${escapeHtml(id)}" aria-label="Remove ${title}">${icon("trash")}</button></div>`).join("") : `<div class="empty-state compact"><strong>No operators configured</strong><span>Add a numeric user ID below.</span></div>`}</div>
          <button class="btn btn-ghost btn-block" data-admin-action="add" data-admin-role="${role}">${icon("plus")} Add ${role === "owner" ? "owner" : role === "super" ? "super admin" : "admin"}</button></article>`;
      }).join("");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function updateAdmin(action, role, id) {
    try {
      const data = await api("/api/admins", {
        method: action === "add" ? "POST" : "DELETE",
        body: JSON.stringify({ role, id }),
      });
      toast(action === "add" ? "Operator added" : "Operator removed");
      loadAdmins();
      return data;
    } catch (error) {
      toast(error.message, "error");
      return null;
    }
  }

  function renderProtections(protections) {
    const grid = $(".protection-grid");
    if (!grid) return;
    grid.innerHTML = protections.map((protection, index) => `<article class="protection-card panel">
      <div class="protection-top"><div class="card-icon ${protection.enabled ? "green" : "gray"}">${icon(index % 3 === 0 ? "shield" : index % 3 === 1 ? "lock" : "pulse")}</div><span class="severity ${index > 14 ? "high" : index > 7 ? "medium" : "low"}">${index > 14 ? "High" : index > 7 ? "Medium" : "Low risk"}</span></div>
      <h3>${escapeHtml(protection.name)}</h3><p>${escapeHtml(protection.description)}</p>
      <div class="protection-bottom"><span class="status-label ${protection.enabled ? "enabled" : "disabled"}"><span class="status-dot ${protection.enabled ? "online" : ""}"></span> ${protection.enabled ? "Enabled" : "Disabled"}</span>
      <button class="toggle ${protection.enabled ? "active" : ""}" data-protection="${escapeHtml(protection.id)}" aria-label="Toggle ${escapeHtml(protection.name)}"><i></i></button></div>
    </article>`).join("");
    const headingBadge = $("#panel-protection .section-heading .badge");
    if (headingBadge) headingBadge.innerHTML = `<span class="status-dot online"></span> ${protections.filter((item) => item.enabled).length} enabled`;
  }

  async function loadThreads() {
    try {
      const data = await api("/api/threads");
      const list = $(".thread-list");
      if (!list) return;
      list.innerHTML = (data.threads || []).map((thread, index) => `<button class="thread ${thread.id === currentThread ? "active" : ""}" data-thread-id="${escapeHtml(thread.id)}">
        <span class="avatar ${["red", "blue", "purple", "green"][index % 4]}-avatar">${escapeHtml(thread.name.slice(0, 2).toUpperCase())}</span>
        <span class="thread-copy"><strong>${escapeHtml(thread.name)}</strong><small>${thread.members} members · ${thread.type}</small></span>
        <time>${thread.unread ? `${thread.unread} new` : "active"}</time>${thread.unread ? `<i class="unread">${thread.unread}</i>` : ""}</button>`).join("");
      await loadThread(currentThread);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function loadThread(threadID) {
    currentThread = threadID;
    try {
      const data = await api(`/api/threads/${encodeURIComponent(threadID)}/messages`);
      const thread = await api("/api/threads").then((result) => result.threads.find((item) => item.id === threadID));
      const head = $(".chat-head");
      if (head && thread) {
        const name = head.querySelector("strong");
        const sub = head.querySelector("small");
        if (name) name.textContent = thread.name;
        if (sub) sub.innerHTML = `<span class="status-dot online"></span> ${thread.members} members · Active now`;
      }
      const body = $(".chat-body");
      if (body) {
        body.innerHTML = `<div class="date-separator"><span>Live thread</span></div>${(data.messages || []).map((message) => messageRow(message)).join("")}`;
        body.scrollTop = body.scrollHeight;
      }
      $$(".thread").forEach((item) => item.classList.toggle("active", item.dataset.threadId === threadID));
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function messageRow(message, forcedKind) {
    const kind = forcedKind || message.kind || (message.sender === "Cypher" ? "bot" : "incoming");
    return `<div class="message-row ${kind}"><span class="avatar tiny ${kind === "bot" ? "eye-avatar" : "blue-avatar"}">${kind === "bot" ? icon("eye") : escapeHtml(String(message.sender || "U").slice(0, 2).toUpperCase())}</span><div><small class="sender">${escapeHtml(message.sender || "Unknown")} <time>${escapeHtml(message.time || "")}</time></small><div class="bubble">${escapeHtml(message.content || "")}</div></div></div>`;
  }

  function appendMessage(message, kind = "incoming") {
    const body = $(".chat-body");
    if (!body) return;
    body.insertAdjacentHTML("beforeend", messageRow(message, kind));
    body.scrollTop = body.scrollHeight;
  }

  function injectVeilFeatures() {
    if (!$("#veilExtension")) {
      const controls = $(".control-grid", $("#panel-home"));
      controls?.insertAdjacentHTML("afterend", `<section class="panel veil-extension" id="veilExtension">
        <div class="veil-extension-head"><div><div class="eyebrow">VEIL COMPATIBILITY</div><h3>Safety & automation controls</h3><p id="veilStatusSummary">Live protection state</p></div><span class="badge badge-success">Live</span></div>
        <div class="veil-action-grid">
          <button class="veil-action" data-action="lock"><span class="card-icon amber">${icon("lock")}</span><span><strong>Bot lock</strong><small>Restrict runtime to operators</small></span></button>
          <button class="veil-action" data-tab-target="protection"><span class="card-icon green">${icon("shield")}</span><span><strong>Defense matrix</strong><small>Manage Veil safety layers</small></span></button>
          <button class="veil-action" data-tab-target="control"><span class="card-icon purple">${icon("pulse")}</span><span><strong>Automation</strong><small>Schedules and group behavior</small></span></button>
          <button class="veil-action" data-tab-target="ai"><span class="card-icon red">${icon("spark")}</span><span><strong>Image studio</strong><small>Generate an image from a prompt</small></span></button>
        </div>
      </section>`);
    }
    const aiLayout = $(".ai-layout", $("#panel-ai"));
    if (aiLayout && !$("#imageStudio")) {
      aiLayout.insertAdjacentHTML("afterend", `<section class="panel image-studio" id="imageStudio">
        <div class="card-heading"><div><h3>Image studio</h3><p>Veil-compatible image generation without storing your prompt.</p></div><div class="card-icon purple">${icon("spark")}</div></div>
        <div class="image-studio-form"><textarea id="imagePrompt" class="text-area" placeholder="Describe an image, for example: a neon city above the clouds"></textarea><button class="btn btn-primary" data-action="imagegen">${icon("spark")} Generate image</button></div>
        <div id="imageResult" class="image-result is-hidden"></div>
      </section>`);
    }
  }

  function wirePanelControls() {
    const automationCards = $$(".automation-card");
    const messageCard = automationCards[0];
    if (messageCard) {
      messageCard.dataset.automation = "messages";
      $("[aria-label='Toggle automatic messages']", messageCard)?.setAttribute("data-schedule-toggle", "automatic-message");
    }
    const nameCard = automationCards[1];
    if (nameCard) {
      $$("[aria-label*='group name locking'], [aria-label*='auto-restore']", nameCard)
        .forEach((toggle) => toggle.setAttribute("data-protection", "nameProtection"));
    }
    const filePanel = $("#panel-files");
    const fileSave = $('[data-action="save"]', filePanel);
    if (fileSave) fileSave.dataset.action = "save-file";
    $(".code-preview", filePanel)?.setAttribute("contenteditable", "true");
  }

  async function generateImage(button) {
    const prompt = $("#imagePrompt")?.value.trim();
    if (!prompt) return toast("Describe the image you want to create.", "error");
    button.disabled = true;
    try {
      const data = await api("/api/imagegen", { method: "POST", body: JSON.stringify({ prompt }) });
      const result = $("#imageResult");
      if (result) {
        result.classList.remove("is-hidden");
        result.innerHTML = `<img src="${escapeHtml(data.imageUrl)}" alt="${escapeHtml(data.prompt)}" loading="lazy"><div><strong>Generation queued</strong><span>${escapeHtml(data.prompt)}</span><a class="btn btn-ghost btn-small" href="${escapeHtml(data.imageUrl)}" target="_blank" rel="noopener">Open image</a></div>`;
      }
      toast("Image generation queued");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function sendChat() {
    const input = $(".ai-composer input");
    const prompt = input?.value.trim();
    if (!prompt) return;
    try {
      const data = await api("/api/ai/chat", { method: "POST", body: JSON.stringify({ message: prompt }) });
      const history = $(".ai-history");
      history?.insertAdjacentHTML("beforeend", `<div class="ai-message user">${escapeHtml(prompt)}</div><div class="ai-message assistant"><span class="avatar tiny eye-avatar">${icon("eye")}</span><div>${escapeHtml(data.message)}</div></div>`);
      if (input) input.value = "";
      toast("Cypher AI replied");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function openCommandSource(file) {
    try {
      const data = await api(`/api/commands/source?file=${encodeURIComponent(file)}`);
      activateTab("editor");
      const editor = $(".code-editor");
      if (editor) editor.value = data.content;
      const title = $(".code-heading span:first-child", $("#panel-editor"));
      if (title) title.innerHTML = `${icon("code")} ${escapeHtml(file)}`;
      toast(data.readonly ? "Veil source opened read-only" : "Cypher source opened in editor");
      const save = $('#panel-editor [data-action="save"]');
      if (save) save.dataset.commandFile = file;
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function activateTab(tab) {
    $$(".nav-item, .mobile-nav button").forEach((item) => item.classList.toggle("active", item.dataset.tab === tab));
    $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tab));
    $(`.nav-item[data-tab="${CSS.escape(tab)}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toast(message, type = "success") {
    const item = document.createElement("div");
    item.className = "toast";
    item.innerHTML = `${icon(type === "success" ? "check" : "info")}<span>${escapeHtml(message)}</span>`;
    toastRegion.appendChild(item);
    setTimeout(() => item.remove(), 3200);
  }

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = accessKey.value.trim();
    if (key.length < 4) {
      loginError.textContent = "Access key must be at least 4 characters.";
      accessKey.focus();
      return;
    }
    const button = loginForm.querySelector("button[type=submit]");
    if (button) button.disabled = true;
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Invalid access key.");
      csrfToken = data.csrf || "";
      loginError.textContent = "";
      accessKey.value = "";
      await showApp();
      toast("Secure session established");
    } catch (error) {
      loginError.textContent = error.message;
    } finally {
      if (button) button.disabled = false;
    }
  });

  $("#revealKey")?.addEventListener("click", (event) => {
    const isPassword = accessKey.type === "password";
    accessKey.type = isPassword ? "text" : "password";
    event.currentTarget.textContent = isPassword ? "HIDE" : "SHOW";
    event.currentTarget.setAttribute("aria-label", isPassword ? "Hide access key" : "Show access key");
  });
  accessKey?.addEventListener("input", () => { loginError.textContent = ""; });
  $("#logoutBtn")?.addEventListener("click", async () => {
    try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch (_) {}
    showLogin();
  });

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("button, [data-tab-target], [data-tab]");
    if (!target) return;
    if (target.dataset.tab) {
      activateTab(target.dataset.tab);
      return;
    }
    if (target.dataset.tabTarget) {
      activateTab(target.dataset.tabTarget);
      return;
    }
    if (target.dataset.commandFile) {
      await openCommandSource(target.dataset.commandFile);
      return;
    }
    if (target.dataset.filePath) {
      await loadFilePreview(target.dataset.filePath);
      return;
    }
    if (target.dataset.adminAction) {
      const role = target.dataset.adminRole;
      const id = target.dataset.adminId || window.prompt(`Enter the numeric user ID for ${role}:`, "");
      if (id) await updateAdmin(target.dataset.adminAction, role, id.trim());
      return;
    }
    if (target.dataset.protection) {
      target.classList.toggle("active");
      try {
        const data = await api("/api/protections/toggle", { method: "POST", body: JSON.stringify({ id: target.dataset.protection, enabled: target.classList.contains("active") }) });
        syncStatus(data.state);
        toast("Protection layer updated");
      } catch (error) {
        target.classList.toggle("active");
        toast(error.message, "error");
      }
      return;
    }
    if (target.dataset.action === "imagegen") {
      await generateImage(target);
      return;
    }
    if (target.dataset.action === "upload") {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = ".json,.js,.md,.txt,.css,.html";
      picker.addEventListener("change", () => {
        if (picker.files?.[0]) toast(`${picker.files[0].name} selected; review it before saving`);
      });
      picker.click();
      return;
    }
    if (target.dataset.scheduleToggle) {
      target.classList.toggle("active");
      const result = await runAction("schedule-toggle", target, {
        id: target.closest("[data-automation]")?.dataset.scheduleId || target.dataset.scheduleToggle,
        enabled: target.classList.contains("active"),
      });
      if (!result) target.classList.toggle("active");
      return;
    }
    if (target.dataset.action === "save" && target.dataset.commandFile) {
      const editor = $(".code-editor", $("#panel-editor"));
      try {
        await api("/api/commands/source", { method: "POST", body: JSON.stringify({ file: target.dataset.commandFile, source: editor?.value || "" }) });
        toast("Command source saved");
      } catch (error) {
        toast(error.message, "error");
      }
      return;
    }
    if (target.dataset.action === "save-file") {
      const preview = $(".code-preview", $("#panel-files"));
      const filePath = target.dataset.filePath || preview?.dataset.filePath;
      if (!filePath || !preview) return toast("Select a file before saving.", "error");
      try {
        await api("/api/files/write", {
          method: "POST",
          body: JSON.stringify({ path: filePath, content: preview.textContent || "" }),
        });
        toast("Workspace file saved");
      } catch (error) {
        toast(error.message, "error");
      }
      return;
    }
    if (target.dataset.action === "save" && target.closest("#panel-settings")) {
      const panel = target.closest("#panel-settings");
      const inputs = $$("input", panel);
      try {
        const data = await api("/api/settings", {
          method: "POST",
          body: JSON.stringify({
            botName: inputs[0]?.value,
            prefix: inputs[1]?.value,
          }),
        });
        syncStatus(data.state);
        toast("Settings saved");
      } catch (error) {
        toast(error.message, "error");
      }
      return;
    }
    if (target.dataset.action === "save" && target.closest("#panel-activation")) {
      const activeMode = $(".segmented button.active", target.closest("#panel-activation"))?.textContent.trim().toLowerCase();
      try {
        const data = await api("/api/settings", {
          method: "POST",
          body: JSON.stringify({ activationMode: activeMode === "blacklist" ? "blacklist" : "whitelist" }),
        });
        syncStatus(data.state);
        toast("Activation settings saved");
      } catch (error) {
        toast(error.message, "error");
      }
      return;
    }
    if (target.dataset.action === "save-message") {
      const card = target.closest(".automation-card");
      const fields = $$("input", card);
      await runAction("save-message", target, {
        schedule: {
          id: card.dataset.scheduleId || "automatic-message",
          threadID: $("select", card)?.value || "thread_8841",
          message: $(".text-area", card)?.value || "",
          min: fields[0]?.value || 30,
          max: fields[1]?.value || 60,
        },
      });
      return;
    }
    if (target.closest(".segmented")) {
      $$(".segmented button", target.closest(".segmented")).forEach((button) => button.classList.toggle("active", button === target));
      return;
    }
    if (target.dataset.action && !target.classList.contains("toggle")) {
      await runAction(target.dataset.action, target);
    }
    if (target.classList.contains("toggle")) {
      const setting = target.dataset.setting || (() => {
        const label = String(target.getAttribute("aria-label") || "").toLowerCase();
        if (label.includes("silent")) return "silentMode";
        if (label.includes("admin")) return "adminOnly";
        if (label.includes("keep-alive")) return "keepAlive";
        if (label.includes("stealth")) return "stealthMode";
        if (label.includes("inbox")) return "allowInbox";
        return "";
      })();
      if (!setting) return;
      target.classList.toggle("active");
      const enabled = target.classList.contains("active");
      try {
        const data = await api("/api/settings", { method: "POST", body: JSON.stringify({ [setting]: enabled }) });
        syncStatus(data.state);
        toast(`${setting} ${enabled ? "enabled" : "disabled"}`);
      } catch (error) {
        target.classList.toggle("active");
        toast(error.message, "error");
      }
    }
    if (target.dataset.threadId) await loadThread(target.dataset.threadId);
  });

  $("#navPrev")?.addEventListener("click", () => $("#featureNav")?.scrollBy({ left: -260, behavior: "smooth" }));
  $("#navNext")?.addEventListener("click", () => $("#featureNav")?.scrollBy({ left: 260, behavior: "smooth" }));
  $("#themeToggle")?.addEventListener("click", () => {
    document.body.classList.toggle("light");
    toast(document.body.classList.contains("light") ? "Light appearance enabled" : "Dark appearance enabled");
  });

  const composer = $(".composer-input textarea");
  $(".composer-input .send-btn")?.addEventListener("click", async () => {
    const message = composer?.value.trim();
    if (!message) return toast("Write a message first", "error");
    try {
      const data = await api("/api/messages", { method: "POST", body: JSON.stringify({ message, threadID: currentThread }) });
      appendMessage(data.message, "incoming");
      composer.value = "";
      composer.style.height = "41px";
      syncStatus(data.state);
      toast("Message queued");
    } catch (error) {
      toast(error.message, "error");
    }
  });
  composer?.addEventListener("input", () => {
    composer.style.height = "auto";
    composer.style.height = `${Math.min(composer.scrollHeight, 100)}px`;
  });

  const generateButton = $('[data-action="generate"]');
  generateButton?.addEventListener("click", async (event) => {
    event.stopPropagation();
    const prompt = $(".ai-prompt")?.value.trim();
    if (!prompt) return toast("Describe the command you want to generate", "error");
    generateButton.disabled = true;
    try {
      const result = await api("/api/ai/generate", { method: "POST", body: JSON.stringify({ prompt }) });
      const generatedResult = $("#generatedResult");
      if (generatedResult) {
        generatedResult.querySelector("code").textContent = `!${result.name}`;
        generatedResult.querySelector("pre").textContent = result.code;
        generatedResult.querySelector("p").textContent = result.description;
        generatedResult.classList.remove("is-hidden");
        generatedResult.classList.add("is-visible");
      }
      toast("Command scaffold generated");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      generateButton.disabled = false;
    }
  });
  $(".ai-composer .send-btn")?.addEventListener("click", sendChat);
  $(".ai-composer input")?.addEventListener("keydown", (event) => { if (event.key === "Enter") sendChat(); });
  $("#fileInput")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) toast(`${file.name} selected for upload`);
  });

  (async function init() {
    try {
      const session = await fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.json());
      if (session.authenticated) {
        const token = await fetch("/api/auth/csrf", { cache: "no-store" }).then((response) => response.json());
        csrfToken = token.csrf || "";
        await showApp();
      } else {
        showLogin();
      }
    } catch (error) {
      showLogin();
      toast("Dashboard is unavailable", "error");
    }
  })();
})();