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

  function showApp() {
    loginGate.classList.add("is-hidden");
    appShell.classList.remove("is-hidden");
    document.body.classList.add("authenticated");
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
    const activeNav = $(`.nav-item[data-tab="${tab}"]`);
    activeNav?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
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

  $$("button.toggle").forEach((toggle) => toggle.addEventListener("click", (event) => {
    event.currentTarget.classList.toggle("active");
    const state = event.currentTarget.classList.contains("active") ? "enabled" : "disabled";
    const label = event.currentTarget.getAttribute("aria-label") || "Setting";
    toast(`${label.replace(/^Toggle /, "")} ${state}`);
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

  $$("[data-action]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.action;
    const messages = {
      restart: "Restart queued · bot will reconnect shortly",
      stop: "Stop request sent to Cypher",
      admin: "Admin-only mode updated",
      silent: "Silent mode preference updated",
      refresh: "Telemetry refreshed just now",
      ping: "Ping complete · 42ms round trip",
      import: "Session payload ready for validation",
      "new-command": "Command editor is ready for a new command",
      "add-thread": "Thread selector opened",
      save: "Changes saved to the active instance",
      "clear-logs": "Log stream cleared",
      upload: "File picker opened",
      reload: "Configuration reloaded",
      "stop-all": "All automated jobs paused",
      "save-message": "Automatic message schedule saved",
    };
    toast(messages[action] || "Action completed");
  }));

  $$(".thread").forEach((thread) => thread.addEventListener("click", () => {
    $$(".thread").forEach((item) => item.classList.remove("active"));
    thread.classList.add("active");
    const unread = $(".unread", thread);
    if (unread) unread.remove();
  }));

  const composer = $(".composer-input textarea");
  if (composer) {
    composer.addEventListener("input", () => {
      composer.style.height = "auto";
      composer.style.height = `${Math.min(composer.scrollHeight, 100)}px`;
    });
    $(".composer-input .send-btn").addEventListener("click", () => {
      if (!composer.value.trim()) return toast("Write a message first", "info");
      toast("Message queued for Nightwatch Ops");
      composer.value = "";
      composer.style.height = "41px";
    });
  }

  const generateButton = $('[data-action="generate"]');
  const generatedResult = $("#generatedResult");
  generateButton?.addEventListener("click", () => {
    generateButton.classList.add("is-loading");
    generateButton.innerHTML = `${icon("spark")} Generating...`;
    setTimeout(() => {
      generatedResult.classList.remove("is-hidden");
      generatedResult.classList.add("is-visible");
      generateButton.classList.remove("is-loading");
      generateButton.innerHTML = `${icon("spark")} Generate`;
      toast("Command generated successfully");
    }, 650);
  });

  $$(".file-row").forEach((file) => file.addEventListener("click", () => {
    $$(".file-row").forEach((item) => item.classList.remove("active"));
    file.classList.add("active");
    toast(`${$("span", file)?.textContent || "File"} selected`);
  }));

  // Keep static dashboard telemetry feeling alive without pretending it is a backend API.
  setInterval(() => {
    const latency = 38 + Math.floor(Math.random() * 12);
    const label = $(".connection-label");
    if (label) label.textContent = `· ${latency}ms`;
  }, 6000);
})();