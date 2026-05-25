// Content script for MemoryOS on chat.openai.com and chatgpt.com

// 1. Inject Styles
const styleEl = document.createElement("style");
styleEl.textContent = `
  /* MemoryOS Injected Styles */
  .memory-os-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 99999;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: linear-gradient(135deg, #7c3aed, #06b6d4);
    box-shadow: 0 4px 20px rgba(124, 58, 237, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    color: white;
    outline: none;
  }
  
  .memory-os-fab:hover {
    transform: scale(1.1) translateY(-4px);
    box-shadow: 0 8px 30px rgba(6, 182, 212, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.3);
  }
  
  .memory-os-fab:active {
    transform: scale(0.95);
  }
  
  .memory-os-fab svg {
    width: 24px;
    height: 24px;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));
    transition: transform 0.3s ease;
  }
  
  .memory-os-fab:hover svg {
    transform: rotate(15deg);
  }
  
  .memory-os-toast {
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 100000;
    min-width: 320px;
    max-width: 400px;
    padding: 16px 20px;
    border-radius: 16px;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    gap: 14px;
    transform: translateX(120%);
    transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  
  .memory-os-toast.show {
    transform: translateX(0);
  }
  
  .memory-os-toast-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
  }
  
  .memory-os-toast-icon.success {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }
  
  .memory-os-toast-icon.error {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
  
  .memory-os-toast-content {
    flex: 1;
  }
  
  .memory-os-toast-title {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 2px;
  }
  
  .memory-os-toast-desc {
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.4;
  }
`;
document.head.appendChild(styleEl);

// 2. Create and Inject Floating Action Button (FAB)
function createFAB() {
  if (document.getElementById("memory-os-fab-btn")) return;
  
  const fab = document.createElement("button");
  fab.id = "memory-os-fab-btn";
  fab.className = "memory-os-fab";
  fab.title = "Save Last Assistant Message to MemoryOS";
  
  // Brain / Memory SVG Icon
  fab.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
      <path d="M12 6v12"/>
      <path d="M8 10h8"/>
    </svg>
  `;
  
  fab.addEventListener("click", () => handleSaveMemory());
  document.body.appendChild(fab);
}

// 3. Create and Inject Toast Container
let toastTimeout: number | null = null;
function showToast(type: "success" | "error", title: string, description: string) {
  let toast = document.getElementById("memory-os-toast-notification");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "memory-os-toast-notification";
    toast.className = "memory-os-toast";
    document.body.appendChild(toast);
  }
  
  const successIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `;
  
  const errorIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  `;
  
  toast.innerHTML = `
    <div class="memory-os-toast-icon ${type}">
      ${type === "success" ? successIcon : errorIcon}
    </div>
    <div class="memory-os-toast-content">
      <div class="memory-os-toast-title">${title}</div>
      <div class="memory-os-toast-desc">${description}</div>
    </div>
  `;
  
  // Clear any existing timeouts
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }
  
  // Trigger entry animation
  setTimeout(() => {
    toast?.classList.add("show");
  }, 50);
  
  // Hide after 4 seconds
  toastTimeout = window.setTimeout(() => {
    toast?.classList.remove("show");
  }, 4000);
}

function detectPlatform() {
  const url = window.location.href;
  if (url.includes("claude.ai")) return "Claude";
  if (url.includes("chatgpt.com") || url.includes("chat.openai.com")) return "ChatGPT";
  return "ChatGPT";
}

const injectedConversationKeys = new Set<string>();
const injectingConversationKeys = new Set<string>();

function getChatGPTConversationKey() {
  if (!window.location.hostname.includes("chatgpt.com")) return null;
  const match = window.location.pathname.match(/\/c\/([^/?#]+)/);
  if (!match) return null;
  return `chatgpt:${match[1]}`;
}

function getClaudeConversationKey() {
  if (!window.location.hostname.includes("claude.ai")) return null;
  return `claude:${window.location.pathname}${window.location.search}`;
}

function getStoredToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["token"], (result: { token?: string }) => {
      resolve(result.token || null);
    });
  });
}

async function fetchTopMemories(token: string) {
  const res = await fetch("http://127.0.0.1:8000/memories", {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  if (!Array.isArray(data)) return [];
  return data
    .slice()
    .sort((a, b) => (Number(b?.decay_score) || 0) - (Number(a?.decay_score) || 0))
    .slice(0, 5);
}

function formatInjectedContext(memories: Array<{ text?: string }>) {
  const parts = memories
    .map((m) => (m?.text || "").trim())
    .filter(Boolean)
    .slice(0, 5);
  const joined = parts.map((t) => `${t}.`).join(" ");
  return `Before we begin, here is context about me from my previous AI conversations: ${joined}`.trim();
}

function setContentEditableHTML(el: Element, html: string) {
  if (!(el instanceof HTMLElement)) return;
  el.innerHTML = html;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function maybeInjectContext() {
  const platform = detectPlatform();
  const key = platform === "Claude" ? getClaudeConversationKey() : getChatGPTConversationKey();
  if (!key) return;
  if (injectedConversationKeys.has(key) || injectingConversationKeys.has(key)) return;

  if (platform === "ChatGPT") {
    if (document.querySelectorAll("div[data-message-author-role='assistant']").length > 0) return;
    if (!document.querySelector("div#prompt-textarea[contenteditable=true]")) return;
  } else {
    if (document.querySelectorAll(".font-claude-message").length > 0) return;
    if (!document.querySelector("div[contenteditable=true].ProseMirror")) return;
  }

  injectingConversationKeys.add(key);
  try {
    const token = await getStoredToken();
    if (!token) return;
    const memories = await fetchTopMemories(token);
    const context = formatInjectedContext(memories);
    if (!context) return;

    if (platform === "ChatGPT") {
      const input = document.querySelector("div#prompt-textarea[contenteditable=true]");
      if (!input) return;
      setContentEditableHTML(input, context);
    } else {
      const input = document.querySelector("div[contenteditable=true].ProseMirror");
      if (!input) return;
      setContentEditableHTML(input, context);
    }

    injectedConversationKeys.add(key);
    showToast("success", "Context injected from MemoryOS", "Your AI already knows you.");
  } finally {
    injectingConversationKeys.delete(key);
  }
}

// 4. Capture and Process Assistant Message
function handleSaveMemory(platformOverride?: "ChatGPT" | "Claude", textOverride?: string) {
  const platform = platformOverride || detectPlatform();
  let text = "";

  if (textOverride) {
    text = textOverride;
  } else if (platform === "Claude") {
    const selectors = ["div[data-is-streaming]", ".font-claude-message", "div.grid.gap-2"];
    let lastEl: Element | null = null;
    for (const selector of selectors) {
      const matches = document.querySelectorAll(selector);
      if (matches.length > 0) {
        lastEl = matches[matches.length - 1];
        break;
      }
    }
    if (lastEl) {
      text = lastEl.textContent || "";
    }
  } else {
    const assistantMessageElements = document.querySelectorAll('div[data-message-author-role="assistant"]');
    if (assistantMessageElements.length > 0) {
      const lastEl = assistantMessageElements[assistantMessageElements.length - 1];
      const markdownBody = lastEl.querySelector(".markdown") || lastEl;
      text = markdownBody.textContent || "";
    } else {
      const markdowns = document.querySelectorAll(".markdown");
      if (markdowns.length > 0) {
        text = markdowns[markdowns.length - 1].textContent || "";
      }
    }
  }
  
  text = text.trim();
  
  if (!text) {
    showToast("error", "Failed to Capture Memory", "No assistant messages could be detected on the page.");
    return;
  }
  
  // Truncate warning if it's way too long, but we send the whole text
  const previewText = text.length > 60 ? text.substring(0, 60) + "..." : text;
  
  // Send message to the background service worker
  chrome.runtime.sendMessage(
    {
      type: "SAVE_MEMORY",
      payload: {
        text: text,
        platform: platform,
        timestamp: new Date().toISOString(),
        decay_score: 1.0 // Defaults to 1.0 (fresh memory)
      }
    },
    (response) => {
      // Handle the response
      if (chrome.runtime.lastError) {
        showToast("error", "Extension Connection Error", "Background worker is not responding. Try reloading extension.");
        return;
      }
      
      if (response && response.success) {
        showToast("success", "Memory Saved!", `"${previewText}" was added to MemoryOS.`);
      } else {
        const errorMsg = response?.error || "Are you logged into the MemoryOS popup?";
        showToast("error", "Save Failed", errorMsg);
      }
    }
  );
}

const capturedMessageIds = new Set<string>();
let isCaptureInProgress = false;

function isChatGPTStreaming() {
  return !!(
    document.querySelector('button[aria-label="Stop generating"]') ||
    document.querySelector('[data-testid="stop-button"]')
  );
}

function isClaudeStreaming() {
  const streamingEl = document.querySelector('[data-is-streaming="true"]') || document.querySelector("div[data-is-streaming='true']");
  if (streamingEl) return true;
  return false;
}

function getMessageKey(el: Element) {
  if (el instanceof HTMLElement) {
    const id = el.getAttribute("data-message-id") || el.id;
    if (id) return id;
  }
  const text = (el.textContent || "").trim();
  if (!text) return null;
  return text;
}

function getChatGPTMessageText(el: Element) {
  if (!(el instanceof HTMLElement)) return (el.textContent || "").trim();
  const markdownBody = (el.querySelector(".markdown") as HTMLElement | null) || el;
  return (markdownBody.textContent || "").trim();
}

function scheduleChatGPTCapture(el: Element) {
  if (isCaptureInProgress) return;

  const key = getMessageKey(el);
  if (!key) return;
  if (capturedMessageIds.has(key)) return;

  const checkAndCapture = () => {
    if (isCaptureInProgress) return;
    if (capturedMessageIds.has(key)) return;
    if (isChatGPTStreaming()) {
      window.setTimeout(checkAndCapture, 1000);
      return;
    }
    window.setTimeout(() => {
      if (isCaptureInProgress) return;
      if (capturedMessageIds.has(key)) return;
      if (isChatGPTStreaming()) return;
      const text = getChatGPTMessageText(el);
      if (!text) return;
      isCaptureInProgress = true;
      capturedMessageIds.add(key);
      window.setTimeout(() => {
        isCaptureInProgress = false;
      }, 5000);
      handleSaveMemory("ChatGPT", text);
    }, 3000);
  };

  checkAndCapture();
}

function scheduleClaudeCapture(el: Element) {
  if (isCaptureInProgress) return;

  const key = getMessageKey(el);
  if (!key) return;
  if (capturedMessageIds.has(key)) return;
  if (isClaudeStreaming()) return;
  window.setTimeout(() => {
    if (isCaptureInProgress) return;
    if (capturedMessageIds.has(key)) return;
    if (isClaudeStreaming()) return;
    const text = (el.textContent || "").trim();
    if (!text) return;
    isCaptureInProgress = true;
    capturedMessageIds.add(key);
    window.setTimeout(() => {
      isCaptureInProgress = false;
    }, 5000);
    handleSaveMemory("Claude", text);
  }, 3000);
}

// 5. Initialize Content Script
function init() {
  createFAB();
  
  // In case of SPA navigation, check periodically to keep FAB present
  const observer = new MutationObserver((mutations) => {
    createFAB();
    void maybeInjectContext();
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;

        if (node.matches("div[data-message-author-role='assistant']")) {
          scheduleChatGPTCapture(node);
        }
        if (node.matches("div.font-claude-message")) {
          scheduleClaudeCapture(node);
        }

        const chatgptNodes = node.querySelectorAll?.("div[data-message-author-role='assistant']");
        if (chatgptNodes && chatgptNodes.length > 0) {
          chatgptNodes.forEach((n) => scheduleChatGPTCapture(n));
        }

        const claudeNodes = node.querySelectorAll?.("div.font-claude-message");
        if (claudeNodes && claudeNodes.length > 0) {
          claudeNodes.forEach((n) => scheduleClaudeCapture(n));
        }
      }
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  void maybeInjectContext();
}

// Run the script
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
