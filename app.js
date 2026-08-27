(() => {
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const loginGate = $("#loginGate");
  const appShell = $("#appShell");
  const accessKey = $("#accessKey");
  const loginForm = $("#loginForm");
  const loginError = $("#loginError");
  const toastRegion = $("#toastRegion");
  const icon = (name) => `<svg><use href="#i-${name}"></use></svg>`;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The request could not be completed.");
    return data;
  }

  function showApp() {
    loginGate.classList.add("is-hidden");
    appShell.classList.remove("is-hidden");
    document.body.classList.add("authenticated");
    loadStatus();
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
    });
    $$(".profile-card .badge").forEach((badge) => {
      badge.innerHTML = `<span class="status-dot ${status === "online" ? "online" : status === "connecting" ? "amber" : ""}"></span> ${statusLabel}`;
      badge.className = `badge ${status === "online" ? "badge-success" : status === "connecting" ? "badge-warning" : "badge-red"}`;
    });
    $$(".profile-card .eyebrow .status-dot").forEach((dot) => {
      dot.className = `status-dot ${status === "online" ? "online" : status === "connecting" ? "amber" : ""}`;
    });
    const stats = data.stats || {};
    const statValues = [
      stats.messages, stats.commands, stats.groups, Number(stats.users || 0).toLocaleString(),
      stats.uptime, stats.totalCommands?.toLocaleString(), stats.protections, stats.ram,
    ];
    $$(".stat-card strong").forEach((value, index) => {
      if (statValues[index] !== undefined) value.textContent = statValues[index];
    });
  }

  async function loadStatus() {
    try {
      const data = await api("/api/status");
      syncStatus(data);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  if (sessionStorage.getItem("cypher-auth") === "true") showApp();

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const key = accessKey.value.trim();
    if (key.length < 4) {
      loginError.textContent = "Access key must be at least 4 characters.";
      accessKey.focus();
      return;
    }
    sessionStorage.setItem("cypher-auth", "true");
    loginError.textContent = "";
    showApp();
    toast("Secure session established");
  });

  $("#revealKey").addEventListener("click", (event) => {
    const isPassword = accessKey.type === "password";
    accessKey.type = isPassword ? "text" : "password";
    event.currentTarget.textContent = isPassword ? "HIDE" : "SHOW";
    event.currentTarget.setAttribute("aria-label", isPassword ? "Hide access key" : "Show access key");
  });

  accessKey.addEventListener("input", () => { loginError.textContent = ""; });
  $("#logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("cypher-auth");
    appShell.classList.add("is-hidden");
    loginGate.classList.remove("is-hidden");
    accessKey.value = "";
    accessKey.focus();
  });

  function activateTab(tab) {
    $$(".nav-item, .mobile-nav button").forEach((item) => item.classList.toggle("active", item.dataset.tab === tab));
    $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tab));
    $(`.nav-item[data-tab="${tab}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  $$("[data-tab]").forEach((element) => element.addEventListener("click", () => activateTab(element.dataset.tab)));
  $$("[data-tab-target]").forEach((element) => element.addEventListener("click", () => activateTab(element.dataset.tabTarget)));
  $("#navPrev").addEventListener("click", () => $("#featureNav").scrollBy({ left: -260, behavior: "smooth" }));
  $("#navNext").addEventListener("click", () => $("#featureNav").scrollBy({ left: 260, behavior: "smooth" }));

  $("#themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("light");
    toast(document.body.classList.contains("light") ? "Light appearance enabled" : "Dark appearance enabled");
  });

  function toast(message, type = "success") {
    const item = document.createElement("div");
    item.className = "toast";
    item.innerHTML = `${icon(type === "success" ? "check" : "info")}<span>${message}</span>`;
    toastRegion.appendChild(item);
    setTimeout(() => item.remove(), 3200);
  }

  async function runAction(button) {
    const action = button.dataset.action;
    const payload = { action };
    if (action === "import") payload.payload = $("#cookieInput")?.value || "";
    if (action === "admin" || action === "silent") {
      payload.enabled = $(".toggle", button)?.classList.contains("active");
    }
    button.disabled = true;
    try {
      const data = await api("/api/actions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      syncStatus(data.state);
      const messages = {
        restart: "Restart queued · bot will reconnect shortly",
        stop: "Cypher is offline",
        admin: "Admin-only mode updated",
        silent: "Silent mode preference updated",
        refresh: "Telemetry refreshed just now",
        ping: `Ping complete · ${data.state?.latency || 42}ms round trip`,
        import: "Session payload validated and ready",
        "new-command": "Command editor is ready for a new command",
        "add-thread": "Thread selector opened",
        save: "Changes saved to the active instance",
        "clear-logs": "Log stream cleared",
        upload: "Choose a file to add to this instance",
        reload: "Configuration reloaded",
        "stop-all": "All automated jobs paused",
        "save-message": "Automatic message schedule saved",
      };
      toast(messages[action] || "Action completed");
      if (action === "upload") $("#fileInput")?.click();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  $$("[data-action]").forEach((button) => button.addEventListener("click", () => runAction(button)));

  $$("button.toggle").forEach((toggle) => toggle.addEventListener("click", async (event) => {
    event.currentTarget.classList.toggle("active");
    const label = event.currentTarget.getAttribute("aria-label") || "Setting";
    const key = label.toLowerCase().includes("silent") ? "silent" : label.toLowerCase().includes("admin") ? "admin" : "save";
    try {
      const data = await api("/api/actions", {
        method: "POST",
        body: JSON.stringify({ action: key, enabled: event.currentTarget.classList.contains("active") }),
      });
      syncStatus(data.state);
      toast(`${label.replace(/^Toggle /, "")} ${event.currentTarget.classList.contains("active") ? "enabled" : "disabled"}`);
    } catch (error) {
      event.currentTarget.classList.toggle("active");
      toast(error.message, "error");
    }
  }));

  $$(".filter-btn").forEach((button) => button.addEventListener("click", () => {
    $$(".filter-btn").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    toast(`${button.textContent.trim()} filter applied`);
  }));

  $$(".segmented button").forEach((button) => button.addEventListener("click", () => {
    $$(".segmented button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    toast(`${button.textContent} mode selected`);
  }));

  $$(".thread").forEach((thread) => thread.addEventListener("click", () => {
    $$(".thread").forEach((item) => item.classList.remove("active"));
    thread.classList.add("active");
    $(".unread", thread)?.remove();
  }));

  const composer = $(".composer-input textarea");
  if (composer) {
    composer.addEventListener("input", () => {
      composer.style.height = "auto";
      composer.style.height = `${Math.min(composer.scrollHeight, 100)}px`;
    });
    $(".composer-input .send-btn").addEventListener("click", async () => {
      if (!composer.value.trim()) return toast("Write a message first", "error");
      try {
        const data = await api("/api/messages", {
          method: "POST",
          body: JSON.stringify({ message: composer.value }),
        });
        const chatBody = $(".chat-body");
        const row = document.createElement("div");
        row.className = "message-row incoming";
        row.innerHTML = `<span class="avatar tiny blue-avatar">YO</span><div><small class="sender">You <time>${data.message.time}</time></small><div class="bubble">${escapeHtml(data.message.content)}</div></div>`;
        chatBody.appendChild(row);
        chatBody.scrollTop = chatBody.scrollHeight;
        composer.value = "";
        composer.style.height = "41px";
        syncStatus(data.state);
        toast("Message queued for Nightwatch Ops");
      } catch (error) {
        toast(error.message, "error");
      }
    });
  }

  const generateButton = $('[data-action="generate"]');
  const generatedResult = $("#generatedResult");
  generateButton?.addEventListener("click", async (event) => {
    event.stopImmediatePropagation();
    const prompt = $(".ai-prompt")?.value.trim();
    if (!prompt) return toast("Describe the command you want to generate", "error");
    generateButton.disabled = true;
    generateButton.innerHTML = `${icon("spark")} Generating...`;
    try {
      const result = await api("/api/ai/generate", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });
      $("> code", generatedResult) && ($("> code", generatedResult).textContent = `!${result.name}`);
      $("pre", generatedResult).textContent = result.code;
      $("p", generatedResult).textContent = result.description;
      generatedResult.classList.remove("is-hidden");
      generatedResult.classList.add("is-visible");
      toast("Command generated successfully");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      generateButton.disabled = false;
      generateButton.innerHTML = `${icon("spark")} Generate`;
    }
  });

  $$(".file-row").forEach((file) => file.addEventListener("click", () => {
    $$(".file-row").forEach((item) => item.classList.remove("active"));
    file.classList.add("active");
    toast(`${$("span", file)?.textContent || "File"} selected`);
  }));

  $("#fileInput")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) toast(`${file.name} selected for upload`);
  });

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    }[character]));
  }

  setInterval(loadStatus, 15000);
})();