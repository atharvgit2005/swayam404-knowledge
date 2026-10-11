import { ExtensionMessage, PingMessage, PongMessage, PortalTabInfo } from '@/types';

export interface TabCheckResult {
  tab?: chrome.tabs.Tab;
  tabId?: number;
  url?: string;
  isSupported: boolean;
  error?: string;
}

export class PageConnectionService {
  private static inFlightTabs = new Set<number>();

  /**
   * Tests if a URL is a supported SWAYAM, NPTEL, or local fixture page
   */
  static isSupportedUrl(url?: string): { supported: boolean; reason?: string } {
    if (!url) {
      return { supported: false, reason: 'Tab has no URL loaded.' };
    }

    if (
      url.startsWith('chrome://') ||
      url.startsWith('edge://') ||
      url.startsWith('brave://') ||
      url.startsWith('chrome-error://') ||
      url.startsWith('about:')
    ) {
      return {
        supported: false,
        reason: 'Cannot connect to browser internal pages. Navigate to a SWAYAM/NPTEL assignment tab.',
      };
    }

    const isSwayam =
      /swayam\.gov\.in/i.test(url) ||
      /swayam2\.ac\.in/i.test(url) ||
      /nptel\.ac\.in/i.test(url);

    const isLocalFixture =
      /localhost|127\.0\.0\.1/i.test(url) ||
      (url.startsWith('chrome-extension://') && url.includes('/fixtures/')) ||
      (url.startsWith('file://') && url.includes('fixtures'));

    if (isSwayam || isLocalFixture) {
      return { supported: true };
    }

    return {
      supported: false,
      reason: `Current URL is "${url}". Swayam404 supports *.swayam.gov.in, *.swayam2.ac.in, *.nptel.ac.in, and local assignment fixtures.`,
    };
  }

  /**
   * Compares the current session/scan context with newly detected portal tab info.
   * Returns true if the user navigated to a different week, quiz, or assignment.
   */
  static isAssignmentOrWeekDifferent(
    current: {
      url?: string;
      detectedWeek?: string;
      assignmentTitle?: string;
    } | null | undefined,
    portal: {
      url?: string;
      detectedWeek?: string;
      detectedAssignmentTitle?: string;
    } | null | undefined
  ): boolean {
    if (!current || !portal) return false;

    // 1. Check week difference (e.g. "Week 1" vs "Week 2")
    if (current.detectedWeek && portal.detectedWeek) {
      const curWeek = current.detectedWeek.toLowerCase().replace(/\s+/g, '');
      const porWeek = portal.detectedWeek.toLowerCase().replace(/\s+/g, '');
      if (curWeek !== porWeek) {
        return true;
      }
    }

    // 2. Check assignment title difference (e.g. "Assignment 1" vs "Assignment 2")
    if (current.assignmentTitle && portal.detectedAssignmentTitle) {
      const curTitle = current.assignmentTitle.toLowerCase().trim();
      const porTitle = portal.detectedAssignmentTitle.toLowerCase().trim();
      if (curTitle !== porTitle && !curTitle.includes(porTitle) && !porTitle.includes(curTitle)) {
        return true;
      }
    }

    // 3. Check unit / assessment query parameters or path in URL
    if (current.url && portal.url && current.url !== portal.url) {
      try {
        const u1 = new URL(current.url);
        const u2 = new URL(portal.url);

        const unit1 = u1.searchParams.get('unit') || u1.searchParams.get('unitId');
        const unit2 = u2.searchParams.get('unit') || u2.searchParams.get('unitId');
        if (unit1 && unit2 && unit1 !== unit2) {
          return true;
        }

        const assess1 = u1.searchParams.get('assessment') || u1.searchParams.get('assessmentId');
        const assess2 = u2.searchParams.get('assessment') || u2.searchParams.get('assessmentId');
        if (assess1 && assess2 && assess1 !== assess2) {
          return true;
        }

        // Check hash parameters if SWAYAM uses #unit=...&assessment=...
        if (u1.hash && u2.hash && u1.hash !== u2.hash) {
          const h1 = new URLSearchParams(u1.hash.replace(/^#/, ''));
          const h2 = new URLSearchParams(u2.hash.replace(/^#/, ''));
          const hUnit1 = h1.get('unit');
          const hUnit2 = h2.get('unit');
          if (hUnit1 && hUnit2 && hUnit1 !== hUnit2) return true;
          const hAssess1 = h1.get('assessment');
          const hAssess2 = h2.get('assessment');
          if (hAssess1 && hAssess2 && hAssess1 !== hAssess2) return true;
        }

        // If paths differ significantly (e.g. /course/123/week1 vs /course/123/week2)
        if (u1.pathname !== u2.pathname && !u1.pathname.includes('popup.html') && !u2.pathname.includes('popup.html')) {
          return true;
        }
      } catch {
        // Fallback: compare stripped URLs
        const clean1 = current.url.split('#')[0];
        const clean2 = portal.url.split('#')[0];
        if (clean1 !== clean2) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Proactively detects whether active tab is SWAYAM, ChatGPT, or other,
   * returning course and assignment context without a heavy full scan.
   */
  static async detectActivePortal(): Promise<PortalTabInfo> {
    const tabCheck = await this.getActiveTab();
    if (!tabCheck.tab || !tabCheck.tabId) {
      return {
        isSwayam: false,
        isChatGpt: false,
        isSupported: false,
      };
    }

    const url = tabCheck.url || '';
    const isChatGpt = /chatgpt\.com|claude\.ai/i.test(url);
    const isSwayam = tabCheck.isSupported;

    if (isChatGpt) {
      return {
        isSwayam: false,
        isChatGpt: true,
        isSupported: true,
        url,
        tabTitle: tabCheck.tab.title,
        tabId: tabCheck.tabId,
      };
    }

    if (!isSwayam) {
      return {
        isSwayam: false,
        isChatGpt: false,
        isSupported: false,
        url,
        tabTitle: tabCheck.tab.title,
        tabId: tabCheck.tabId,
      };
    }

    // Supported SWAYAM / NPTEL / fixture tab
    try {
      const handshake = await this.ensureContentScriptReady(tabCheck.tabId);
      if (handshake.ready) {
        const pong = await new Promise<PongMessage | null>((resolve) => {
          const timer = setTimeout(() => resolve(null), 1000);
          try {
            chrome.tabs.sendMessage(tabCheck.tabId!, { type: 'PING' }, (res: PongMessage) => {
              clearTimeout(timer);
              if (chrome.runtime.lastError || !res || res.type !== 'PONG') {
                resolve(null);
              } else {
                resolve(res);
              }
            });
          } catch {
            clearTimeout(timer);
            resolve(null);
          }
        });

        if (pong) {
          return {
            isSwayam: true,
            isChatGpt: false,
            isSupported: true,
            url,
            tabTitle: tabCheck.tab.title,
            detectedCourseTitle: pong.detectedCourseTitle,
            detectedAssignmentTitle: pong.detectedAssignmentTitle || pong.title,
            detectedExternalId: pong.detectedExternalId,
            detectedWeek: pong.detectedWeek,
            detectedWeekNumber: pong.detectedWeekNumber,
            isAlreadySubmitted: pong.isAlreadySubmitted,
            submissionStatus: pong.submissionStatus,
            questionCount: pong.questionCount,
            tabId: tabCheck.tabId,
          };
        }
      }
    } catch {
      // Non-blocking fallback
    }

    return {
      isSwayam: true,
      isChatGpt: false,
      isSupported: true,
      url,
      tabTitle: tabCheck.tab.title,
      tabId: tabCheck.tabId,
    };
  }

  /**
   * Retrieves the current active tab and checks URL support
   */
  static async getActiveTab(): Promise<TabCheckResult> {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      return {
        isSupported: false,
        error: 'Chrome Tabs API is unavailable (running outside browser extension).',
      };
    }

    try {
      let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tabs || tabs.length === 0) {
        tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      }
      if (!tabs || tabs.length === 0) {
        tabs = await chrome.tabs.query({ active: true });
      }

      const tab = tabs[0];
      if (!tab || !tab.id) {
        return {
          isSupported: false,
          error: 'No active browser tab found. Open an assignment or course page.',
        };
      }

      const urlCheck = this.isSupportedUrl(tab.url);
      return {
        tab,
        tabId: tab.id,
        url: tab.url,
        isSupported: urlCheck.supported,
        error: urlCheck.reason,
      };
    } catch (e) {
      return {
        isSupported: false,
        error: (e as Error).message || 'Failed to query active tab.',
      };
    }
  }

  /**
   * Performs a handshake with the content script, dynamically injecting it if missing
   */
  static async ensureContentScriptReady(tabId: number): Promise<{ ready: boolean; error?: string }> {
    // Helper to send a ping with a short timeout
    const ping = (): Promise<boolean> => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 800);
        try {
          const pingMsg: PingMessage = { type: 'PING' };
          chrome.tabs.sendMessage(tabId, pingMsg, (response: PongMessage) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError || !response || response.type !== 'PONG') {
              resolve(false);
            } else {
              resolve(true);
            }
          });
        } catch {
          clearTimeout(timeout);
          resolve(false);
        }
      });
    };

    // 1. Try pinging first
    const firstPing = await ping();
    if (firstPing) {
      return { ready: true };
    }

    // 2. Ping failed — inject content script dynamically via chrome.scripting
    if (typeof chrome !== 'undefined' && chrome.scripting) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js'],
        });

        // Small delay for DOM execution
        await new Promise((r) => setTimeout(r, 120));

        // 3. Ping again to verify successful injection
        const secondPing = await ping();
        if (secondPing) {
          return { ready: true };
        }
      } catch (err) {
        return {
          ready: false,
          error: `Script injection blocked: ${(err as Error).message}. Check host permissions or refresh page.`,
        };
      }
    }

    return {
      ready: false,
      error: 'Content script failed to respond. Please refresh the SWAYAM tab and try again.',
    };
  }

  /**
   * Sends a typed message to the active tab with full connection verification and error handling
   */
  static async sendToActiveTab<TResponse = unknown>(
    message: ExtensionMessage,
    timeoutMs = 12000
  ): Promise<{ success: boolean; data?: TResponse; error?: string }> {
    const tabCheck = await this.getActiveTab();
    if (!tabCheck.isSupported || !tabCheck.tabId) {
      return {
        success: false,
        error: tabCheck.error || 'Active tab is not a supported SWAYAM or assignment page.',
      };
    }

    const tabId = tabCheck.tabId;

    if (this.inFlightTabs.has(tabId)) {
      return {
        success: false,
        error: 'A scan or preparation request is already in progress on this tab. Please wait.',
      };
    }

    // Handshake check
    const readyCheck = await this.ensureContentScriptReady(tabId);
    if (!readyCheck.ready) {
      return {
        success: false,
        error: readyCheck.error || 'Could not connect to page content script.',
      };
    }

    this.inFlightTabs.add(tabId);

    try {
      const response = await new Promise<TResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Page response timed out after ${Math.round(timeoutMs / 1000)}s.`));
        }, timeoutMs);

        chrome.tabs.sendMessage(tabId, message, (res) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(res as TResponse);
          }
        });
      });

      return { success: true, data: response };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message || 'Failed to exchange message with assignment tab.',
      };
    } finally {
      this.inFlightTabs.delete(tabId);
    }
  }

  /**
   * Helper that returns the response data directly or throws an error
   */
  static async queryTab<TResponse = unknown>(
    message: ExtensionMessage,
    timeoutMs = 12000
  ): Promise<TResponse> {
    const res = await this.sendToActiveTab<TResponse>(message, timeoutMs);
    if (!res.success || res.data === undefined) {
      throw new Error(res.error || 'Failed to exchange message with assignment tab.');
    }
    return res.data;
  }
}

export const pageConnectionService = PageConnectionService;

