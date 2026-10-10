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
