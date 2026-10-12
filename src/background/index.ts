import { StorageService } from '@/lib/storage';
import { KnowledgeBaseService } from '@/lib/knowledge';

console.log('[swayam404] Background service worker initialized.');

/**
 * Non-destructive background check for remote knowledge updates.
 * Never executes code. Strictly unauthenticated read-only manifest inspection.
 */
async function checkKnowledgeUpdatesSafe(): Promise<void> {
  try {
    const settings = await StorageService.getSettings();
    if (!settings?.knowledgeBaseEnabled || !settings?.knowledgeBaseRepoUrl?.trim()) {
      return;
    }
    const res = await KnowledgeBaseService.checkForUpdates();
    if (res.updateAvailable) {
      console.log('[swayam404] Remote knowledge base update available:', res.latestVersion);
      if (chrome.action?.setBadgeText) {
        chrome.action.setBadgeText({ text: 'NEW' });
        chrome.action.setBadgeBackgroundColor({ color: '#ffcc00' });
      }
    } else if (chrome.action?.setBadgeText) {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (err) {
    console.warn('[swayam404] Background update check failed (offline or network error):', err);
  }
}

/**
 * Anonymous browser heartbeat telemetry.
 * Strictly anonymous: zero personal information, zero SWAYAM data, zero student details.
 * Purpose: Track active installation count and browser distribution for admin panel.
 */
async function sendTelemetryHeartbeat(event: 'install' | 'startup' | 'heartbeat' = 'heartbeat'): Promise<void> {
  try {
    let clientId: string = '';
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const stored = await chrome.storage.local.get(['swayam_telemetry_client_id']);
      clientId = stored.swayam_telemetry_client_id;
      if (!clientId) {
        clientId = 'c_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        await chrome.storage.local.set({ swayam_telemetry_client_id: clientId });
      }
    }

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    let browser = 'Chrome';
    if (ua.includes('Brave')) browser = 'Brave';
    else if (ua.includes('Edg/')) browser = 'Edge';
    else if (ua.includes('Arc/')) browser = 'Arc';

    let platform = 'other';
    if (ua.includes('Macintosh') || ua.includes('Mac OS')) platform = 'mac';
    else if (ua.includes('Windows')) platform = 'windows';
    else if (ua.includes('Linux')) platform = 'linux';

    const payload = {
      clientId: clientId || 'c_anon',
      browser,
      platform,
      version: '1.1.0',
      event,
      timestamp: new Date().toISOString(),
    };

    // Send heartbeat to public deployed admin cloud endpoint (captures all browsers globally)
    const CLOUD_URL = 'https://admin-panel-neon-eight-87.vercel.app/api/telemetry/ping';
    const LOCAL_URL = 'http://127.0.0.1:52420/api/telemetry/ping';

    try {
      await fetch(CLOUD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Fallback to local server if cloud is unreachable
        return fetch(LOCAL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }).catch(() => {});
    } catch {
      // Non-blocking fail-silent: extension functions 100% normally
    }
  } catch {
    // Fail silent
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[swayam404] Extension installed/updated, reason:', details.reason);
  try {
    await StorageService.initDefaults();
    console.log('[swayam404] Default courses and settings initialized in storage.');

    // Setup periodic alarm (every 6 hours) for background knowledge manifest checks
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.create('swayam404_knowledge_check', {
        periodInMinutes: 360,
        delayInMinutes: 2,
      });
    }

    // Trigger initial safe check and telemetry heartbeat
    await checkKnowledgeUpdatesSafe();
    await sendTelemetryHeartbeat('install');
  } catch (err) {
    console.error('[swayam404] Error initializing defaults on install:', err);
  }
});

if (chrome.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(async () => {
    await checkKnowledgeUpdatesSafe();
    await sendTelemetryHeartbeat('startup');
  });
}

if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'swayam404_knowledge_check') {
      await checkKnowledgeUpdatesSafe();
      await sendTelemetryHeartbeat('heartbeat');
    }
  });
}

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

  // 3. Knowledge Base update check
  if (message?.type === 'CHECK_KNOWLEDGE_UPDATES') {
    (async () => {
      try {
        const res = await KnowledgeBaseService.checkForUpdates();
        sendResponse({ success: true, result: res });
      } catch (err) {
        sendResponse({ success: false, error: (err as Error).message });
      }
    })();
    return true;
  }

  // 4. Explicit Knowledge Base sync
  if (message?.type === 'SYNC_KNOWLEDGE_BASE') {
    (async () => {
      try {
        const res = await KnowledgeBaseService.syncNow(message.repoUrl);
        if (res.success && chrome.action?.setBadgeText) {
          chrome.action.setBadgeText({ text: '' });
        }
        sendResponse({ success: true, result: res });
      } catch (err) {
        sendResponse({ success: false, error: (err as Error).message });
      }
    })();
    return true;
  }

  return false;
});
