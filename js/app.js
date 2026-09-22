// Entry point: boots the app, draws the header and routes between views (#/dashboard, #/inventory…).
import { CONFIG } from "./config.js";
import { isLive, modelLabel, providerLabel } from "./ai.js";
import { buildDemoData } from "./demo-data.js";
import { LANGS, getLang, initI18n, t, th } from "./i18n.js";
import { getModel, getPrefs, loadState, replaceAll, setPrefs, subscribe } from "./store.js";
import { bindDelegation, icon, on, setRenderer } from "./ui.js";
import { esc } from "./utils.js";
import { renderChat } from "./views/chat.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderInventory } from "./views/inventory.js";
import { renderMovements } from "./views/movements.js";
import { applyTheme, changeLanguage } from "./views/settings.js";

const ROUTES = {
  dashboard: { render: renderDashboard, icon: "grid" },
  inventory: { render: renderInventory, icon: "box" },
  movements: { render: renderMovements, icon: "arrows" },
  chat: { render: renderChat, icon: "chat" },
};

const currentRoute = () => {
  const name = location.hash.replace(/^#\/?/, "").split("?")[0];
  return ROUTES[name] ? name : "dashboard";
};

let lastRoute = null;

function render() {
  const route = currentRoute();
  renderChrome(route);
  ROUTES[route].render(document.getElementById("view"));
  if (route !== lastRoute) window.scrollTo({ top: 0 });
  lastRoute = route;
}

const isDark = () =>
  document.documentElement.dataset.theme === "dark" ||
  (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);

function renderChrome(route) {
  document.title = `${CONFIG.appName} · ${t(`nav.${route}`)}`;
  document.getElementById("brand-name").textContent = CONFIG.appName;

  document.getElementById("tabs").innerHTML = Object.entries(ROUTES)
    .map(
      ([name, r]) =>
        `<a href="#/${name}" class="${name === route ? "active" : ""}" ${name === route ? 'aria-current="page"' : ""}>${icon(r.icon, 18)}<span>${th(`nav.${name}`)}</span></a>`,
    )
    .join("");

  const live = isLive();
  const badge = document.getElementById("ai-badge");
  badge.className = `ai-badge ${live ? "live" : "demo"}`;
  badge.title = live ? modelLabel(getModel()) : "";
  badge.innerHTML = `<i class="dot"></i>${live ? `${th("ai.live")} · ${esc(providerLabel())}` : th("ai.demo")}`;

  const lang = document.getElementById("lang-select");
  lang.innerHTML = LANGS.map((l) => `<option value="${l.id}" ${l.id === getLang() ? "selected" : ""}>${l.id.toUpperCase()}</option>`).join("");

  document.getElementById("theme-btn").innerHTML = icon(isDark() ? "sun" : "moon", 18);

  document.getElementById("footer").innerHTML = `${th("footer.built")} <a href="${esc(CONFIG.author.url)}" target="_blank" rel="noopener">${esc(CONFIG.author.name)}</a>
    ${th("footer.with")} · <a href="${esc(CONFIG.repoUrl)}" target="_blank" rel="noopener">${th("footer.source")}</a>`;
}

function init() {
  document.documentElement.style.setProperty("--accent", CONFIG.accentColor);
  initI18n();
  applyTheme();

  // First visit (or unreadable data): start with the demo inventory so there is something to see.
  if (!loadState()) replaceAll(buildDemoData(getLang()));

  bindDelegation();
  setRenderer(render);
  on("click", {
    "toggle-theme": () => {
      setPrefs({ theme: isDark() ? "light" : "dark" });
      applyTheme();
      render();
    },
  });
  document.getElementById("lang-select").addEventListener("change", (e) => changeLanguage(e.target.value));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => (getPrefs().theme ?? "auto") === "auto" && render());
  window.addEventListener("hashchange", render);

  // Re-render on data changes — except the chat, which manages its own DOM while streaming.
  subscribe(() => (currentRoute() === "chat" ? renderChrome("chat") : render()));
  render();
}

init();
