import { StorageService } from '@/lib/storage';

console.log('[swayam404] Background service worker initialized.');

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[swayam404] Extension installed/updated, reason:', details.reason);
  try {
    await StorageService.initDefaults();
    console.log('[swayam404] Default courses and settings initialized in storage.');
  } catch (err) {
    console.error('[swayam404] Error initializing defaults on install:', err);
  }
});

// Coordinate side panel behavior in Chrome 114+
if (chrome.sidePanel && 'setPanelBehavior' in chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((err) => {
    console.warn('[swayam404] sidePanel.setPanelBehavior warning:', err);
  });
}

/**
 * Tab Redirection & Cross-Tab Answer Dispatch
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. Register or update SWAYAM portal tab session
  if (message?.type === 'REGISTER_SWAYAM_TAB' || message?.type === 'SWAYAM_TAB_NAVIGATION') {
    const tabId = sender.tab?.id || message.tabId;
    const url = sender.tab?.url || message.url;
    if (tabId && url) {
      chrome.storage.local.set({
        swayam_pilot_context: {
          tabId,
          url,
          detectedWeek: message.detectedWeek,
          detectedWeekNumber: message.detectedWeekNumber,
          detectedAssignmentTitle: message.detectedAssignmentTitle,
          courseTitle: message.courseTitle,
          timestamp: Date.now(),
        },
      });
      // Broadcast to any open popup / sidepanel views
      chrome.runtime
        .sendMessage({
          type: 'SWAYAM_PORTAL_UPDATED',
          tabId,
          url,
          detectedWeek: message.detectedWeek,
          detectedWeekNumber: message.detectedWeekNumber,
          detectedAssignmentTitle: message.detectedAssignmentTitle,
          courseTitle: message.courseTitle,
        })
        .catch(() => {});
      sendResponse({ success: true, tabId });
    }
    return false;
  }

  // 2. ChatGPT / Claude Web finished solving -> auto-redirect back to SWAYAM tab!
  if (message?.type === 'CHATGPT_SOLVE_COMPLETE') {
    (async () => {
      try {
        const answersText = message.answersText;
        if (answersText) {
          // Sync to storage
          await chrome.storage.local.set({
            swayam_chatgpt_sync: answersText,
            swayam_chatgpt_timestamp: Date.now(),
          });
        }

        // Determine target SWAYAM tab
        let targetTab: chrome.tabs.Tab | null = null;
        const preferredTabId = message.swayamTabId;

        if (preferredTabId && typeof chrome.tabs?.get === 'function') {
          try {
            targetTab = await chrome.tabs.get(preferredTabId);
          } catch {
            targetTab = null;
          }
        }

        // If preferred tab not found, query open SWAYAM tabs
        if (!targetTab && typeof chrome.tabs?.query === 'function') {
          const swayamTabs = await chrome.tabs.query({
            url: [
              'https://*.swayam2.ac.in/*',
              'https://swayam2.ac.in/*',
              'https://*.swayam.gov.in/*',
              'https://swayam.gov.in/*',
              'https://*.nptel.ac.in/*',
              'https://nptel.ac.in/*',
              'http://localhost/*',
              'http://127.0.0.1/*',
            ],
          });
          if (swayamTabs.length > 0) {
            targetTab = swayamTabs[0];
          }
        }

        // Switch to target SWAYAM tab
        if (targetTab?.id) {
          await chrome.tabs.update(targetTab.id, { active: true });
          if (targetTab.windowId && typeof chrome.windows?.update === 'function') {
            await chrome.windows.update(targetTab.windowId, { focused: true });
          }

          // Forward message to SWAYAM content script to auto-mark inputs immediately
          if (answersText) {
            chrome.tabs.sendMessage(targetTab.id, {
              type: 'AUTO_APPLY_ANSWERS',
              answersText,
            }).catch(() => {
              // Non-blocking: content script also listens to chrome.storage.onChanged
            });
          }

          sendResponse({ success: true, switchedTabId: targetTab.id });
        } else if (message.swayamUrl && typeof chrome.tabs?.create === 'function') {
          // If tab was somehow closed, reopen the SWAYAM page
          const newTab = await chrome.tabs.create({ url: message.swayamUrl, active: true });
          sendResponse({ success: true, switchedTabId: newTab.id });
        } else {
          sendResponse({ success: false, reason: 'No SWAYAM tab found' });
        }
      } catch (err) {
        console.error('[swayam404] Error during CHATGPT_SOLVE_COMPLETE redirection:', err);
        sendResponse({ success: false, error: (err as Error).message });
      }
    })();
    return true; // Keep channel open for async sendResponse
  }

  return false;
});
