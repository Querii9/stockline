import { aiErrorMessage, askChat, isLive } from "../ai.js";
import { th } from "../i18n.js";
import { icon, on } from "../ui.js";
import { esc, mdLite } from "../utils.js";

let messages = []; // { role: "user"|"assistant", content, error?, streaming? }
let busy = false;
let controller = null;
let queued = null;

/** Lets other views open the chat with a question already sent (e.g. "Draft order"). */
export function queueChatPrompt(text) {
  queued = text;
}

export function renderChat(root) {
  root.innerHTML = `
    <section class="page-head">
      <div>
        <h1>${th("chat.title")}</h1>
        <p class="muted">${th("chat.subtitle")}</p>
      </div>
      <button class="btn" type="button" data-action="chat-clear">${icon("refresh", 16)} ${th("chat.clear")}</button>
    </section>
    ${
      isLive()
        ? ""
        : `<p class="demo-note">${icon("info", 15)}<span>${th("chat.demoBanner")} <button class="btn-link" type="button" data-action="open-settings">${th("common.addKey")}</button></span></p>`
    }
    <div class="card chat">
      <div class="chat-log" id="chat-log" aria-live="polite"></div>
      <div class="chips">
        ${["chat.s1", "chat.s2", "chat.s3", "chat.s4"].map((k) => `<button class="chip" type="button" data-action="chat-suggest">${th(k)}</button>`).join("")}
      </div>
      <form class="chat-input" data-submit="chat-send">
        <textarea class="input" name="q" rows="1" data-enter-submit placeholder="${th("chat.placeholder")}"></textarea>
        <button class="btn btn-primary" type="submit" aria-label="${th("chat.send")}">${icon("send", 16)}</button>
      </form>
    </div>`;
  paint();
  if (queued) {
    const text = queued;
    queued = null;
    send(text);
  }
}

const bubble = (m) =>
  `<div class="msg ${m.role} ${m.error ? "error" : ""}">${
    m.role === "assistant" ? (m.content ? mdLite(m.content) : `<span class="typing"><i></i><i></i><i></i></span>`) : esc(m.content)
  }</div>`;

function paint() {
  const log = document.getElementById("chat-log");
  if (!log) return;
  log.innerHTML = `<div class="msg assistant">${th("chat.welcome")}</div>` + messages.map(bubble).join("");
  log.scrollTop = log.scrollHeight;
}

function paintLast(message) {
  const log = document.getElementById("chat-log");
  if (!log?.lastElementChild) return;
  log.lastElementChild.outerHTML = bubble(message);
  log.scrollTop = log.scrollHeight;
}

async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  // Only real turns go to the API (failed answers are shown but not sent back).
  const history = [...messages.filter((m) => !m.error), { role: "user", content: text }].map(({ role, content }) => ({ role, content }));
  messages.push({ role: "user", content: text });
  const reply = { role: "assistant", content: "" };
  messages.push(reply);
  busy = true;
  controller = new AbortController();
  paint();

  try {
    // Keep the last 20 turns, and make sure the conversation still starts with a user turn.
    const recent = history.slice(-20);
    while (recent[0]?.role !== "user") recent.shift();
    await askChat(recent, (delta) => {
      reply.content += delta;
      paintLast(reply);
    }, { signal: controller.signal });
  } catch (err) {
    if (err.code !== "aborted") {
      reply.content = `⚠️ ${aiErrorMessage(err)}`;
      reply.error = true;
    }
  } finally {
    if (!reply.content) messages = messages.filter((m) => m !== reply);
    busy = false;
    controller = null;
    paint();
  }
}

on("submit", {
  "chat-send": (form) => {
    const text = form.q.value;
    form.q.value = "";
    send(text);
  },
});

on("click", {
  "chat-suggest": (el) => send(el.textContent),
  "chat-clear": () => {
    controller?.abort();
    messages = [];
    busy = false;
    paint();
  },
});
