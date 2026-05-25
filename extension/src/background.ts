// Background service worker for MemoryOS

import { deriveKey, encryptText } from "./crypto";

const API_BASE_URL = "http://127.0.0.1:8000";

interface ChromeStorageData {
  token?: string;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SAVE_MEMORY") {
    const { text, platform, timestamp, decay_score } = message.payload;
    
    // Retrieve credentials from Chrome storage
    chrome.storage.local.get(["token"], (result: ChromeStorageData) => {
      const token = result.token;
      
      if (!token) {
        sendResponse({
          success: false,
          error: "Unauthorized: Please log in using the MemoryOS extension popup."
        });
        return;
      }

      (async () => {
        try {
          const key = await deriveKey(token);
          const encryptedText = await encryptText(text, key);

          const response = await fetch(`${API_BASE_URL}/memories`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              text: encryptedText,
              platform,
              timestamp,
              decay_score
            })
          });

          if (response.status === 401) {
            chrome.storage.local.remove(["token"]);
            sendResponse({ success: false, error: "Authentication expired. Please log in again." });
            return;
          }

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            sendResponse({ success: false, error: errData.detail || `Server error (${response.status})` });
            return;
          }

          const data = await response.json();
          sendResponse({ success: true, data });
        } catch (err) {
          console.error("MemoryOS Background error:", err);
          sendResponse({
            success: false,
            error: "Could not connect to MemoryOS server. Is the backend running at " + API_BASE_URL + "?"
          });
        }
      })();
    });
    
    return true; // Keep message channel open for asynchronous sendResponse
  }
});
