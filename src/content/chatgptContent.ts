/**
 * Swayam404 — Web AI Tab Content Script Bridge (ChatGPT Web & Claude Web)
 * Full Auto-Pilot: Auto-pastes questions, auto-submits, watches AI generation,
 * and auto-syncs answers back to the SWAYAM extension with zero manual steps.
 */

(function initSwayamWebAiBridge() {
  if (typeof window === 'undefined') return;

  const globalScope = window as unknown as { __swayamWebAiBridgeInstalled?: boolean };
  if (globalScope.__swayamWebAiBridgeInstalled) return;
  globalScope.__swayamWebAiBridgeInstalled = true;

  console.log('[swayam404] Web AI Assistant Auto-Pilot Bridge active.');

  let lastSyncedText = '';
  let isWatchingGeneration = false;
  let statusPill: HTMLElement | null = null;
  let syncBtnRef: HTMLButtonElement | null = null;
  let insertBtnRef: HTMLButtonElement | null = null;

  function updateStatus(statusText: string, color: string = '#1a1a1a', bg: string = '#f5f0e8') {
    if (statusPill) {
      statusPill.textContent = statusText;
      statusPill.style.color = color;
      statusPill.style.backgroundColor = bg;
    }
  }

  // 1. Locate prompt editor element
  function findPromptInput(): HTMLElement | null {
    return (
      document.querySelector('#prompt-textarea') ||
      document.querySelector('div[contenteditable="true"].ProseMirror') ||
      document.querySelector('fieldset div[contenteditable="true"]') ||
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector('textarea')
    ) as HTMLElement | null;
  }

  // 2. Locate Send / Submit button
  function findSendButton(): HTMLButtonElement | null {
    return (
      document.querySelector('button[data-testid="send-button"]') ||
      document.querySelector('button[data-testid="composer-send-button"]') ||
      document.querySelector('button[aria-label*="Send"]') ||
      document.querySelector('button[aria-label*="send"]') ||
      document.querySelector('button[aria-label="Send Message"]')
    ) as HTMLButtonElement | null;
  }

  // 3. Insert and optionally submit prompt
  async function insertPromptIntoChat(prompt: string, autoSubmit = true): Promise<boolean> {
    const inputEl = findPromptInput();
    if (!inputEl) return false;

    try {
      navigator.clipboard.writeText(prompt);
    } catch {}

    inputEl.focus();
    let inserted = false;

    try {
      document.execCommand('selectAll', false, undefined);
      inserted = document.execCommand('insertText', false, prompt);
    } catch {
      inserted = false;
    }

    if (!inserted) {
      if (inputEl.tagName.toLowerCase() === 'textarea') {
        (inputEl as HTMLTextAreaElement).value = prompt;
      } else {
        inputEl.innerHTML = `<p>${prompt.replace(/\n/g, '<br>')}</p>`;
      }
    }

    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    try {
      inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
    } catch {}

    if (autoSubmit) {
      updateStatus('⚡ Submitting to AI...', '#1a1a1a', '#ffcc00');
      setTimeout(() => {
        const sendBtn = findSendButton();
        if (sendBtn && !sendBtn.disabled) {
          sendBtn.click();
        } else {
          inputEl.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
          );
        }
        updateStatus('⏳ AI Generating Answers...', '#2563eb', '#dbeafe');
        startAutoWatchLoop();
      }, 500);
    }

    return true;
  }

  // 4. Extract latest AI response text or code block
  function extractLatestResponse(): string {
    const assistantCandidates: HTMLElement[] = [];

    // Role attributes
    document
      .querySelectorAll<HTMLElement>(
        '[data-message-author-role="assistant"], article[data-message-author-role="assistant"], [data-testid*="assistant"], .agent-turn, [class*="agent-turn"]'
      )
      .forEach((el) => {
        if (!assistantCandidates.includes(el)) assistantCandidates.push(el);
      });

    // Claude wrappers
    document
      .querySelectorAll<HTMLElement>(
        'div.font-claude-message, [class*="font-claude-message"], [class*="standard-markdown"], div.claude-message'
      )
      .forEach((el) => {
        if (!assistantCandidates.includes(el)) assistantCandidates.push(el);
      });

    // All conversation articles (filtering user)
    document
      .querySelectorAll<HTMLElement>('main article, [role="presentation"] article, article')
      .forEach((art) => {
        const role = art.getAttribute('data-message-author-role');
        const testId = art.getAttribute('data-testid') || '';
        if (role === 'user' || testId.includes('user')) return;
        if (!assistantCandidates.includes(art)) assistantCandidates.push(art);
      });

    // Fallback markdown
    if (assistantCandidates.length === 0) {
      document
        .querySelectorAll<HTMLElement>(
          'div.markdown.prose, div.markdown, .markdown, [class*="markdown"], .prose, [class*="prose"]'
        )
        .forEach((el) => {
          if (!assistantCandidates.includes(el)) assistantCandidates.push(el);
        });
    }

    const codeBlocks = document.querySelectorAll<HTMLElement>('pre code, pre, div[class*="code-block"]');
    let targetText = '';

    if (assistantCandidates.length > 0) {
      const latestAssistantNode = assistantCandidates[assistantCandidates.length - 1];
      const innerCodeBlock = latestAssistantNode.querySelector<HTMLElement>('pre code, code, pre');
      if (innerCodeBlock) {
        const codeText = (innerCodeBlock.innerText || innerCodeBlock.textContent || '').trim();
        if (codeText && (codeText.includes('{') || codeText.includes('['))) {
          targetText = codeText;
        }
      }
      if (!targetText) {
        targetText = (latestAssistantNode.innerText || latestAssistantNode.textContent || '').trim();
      }
    }

    if (!targetText && codeBlocks.length > 0) {
      const latestCode = codeBlocks[codeBlocks.length - 1];
      targetText = (latestCode.innerText || latestCode.textContent || '').trim();
    }

    if (!targetText) {
      const main = document.querySelector('main');
      if (main) {
        const mainText = (main.innerText || main.textContent || '').trim();
        if (mainText && (mainText.includes('{') || mainText.includes('['))) {
          targetText = mainText;
        }
      }
    }

    targetText = targetText.replace(/^(?:JSON\s*)?(?:Copy code\s*)?/i, '').trim();
    return targetText;
  }

  // 5. Sync extracted response text back to extension storage
  function syncAnswersBack(text: string, isAuto = false): boolean {
    if (!text || text === lastSyncedText) return false;
    lastSyncedText = text;

    try {
      navigator.clipboard.writeText(text);
    } catch {}

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({
        swayam_chatgpt_sync: text,
        swayam_chatgpt_timestamp: Date.now(),
      });
    }

    const label = isAuto ? '⚡ Auto-Synced! Redirecting to SWAYAM...' : '✓ Sent! Redirecting to SWAYAM...';
    updateStatus(label, '#065f46', '#d1fae5');

    // Trigger immediate background redirection to the active SWAYAM tab
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.storage.local.get(['swayam_pilot_context'], (data) => {
        const ctx = data?.swayam_pilot_context;
        chrome.runtime.sendMessage(
          {
            type: 'CHATGPT_SOLVE_COMPLETE',
            answersText: text,
            swayamTabId: ctx?.tabId,
            swayamUrl: ctx?.url,
          },
          (res) => {
            if (res?.success) {
              updateStatus('✓ Switched to SWAYAM tab!', '#065f46', '#d1fae5');
            }
          }
        );
      });
    }

    if (syncBtnRef) {
      syncBtnRef.textContent = '✓ Sent! Returning to Swayam...';
      syncBtnRef.style.background = '#10b981';
      syncBtnRef.style.color = '#ffffff';
    }

    // Auto-remove badge after sync completes and reset autopilot state
    setTimeout(() => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ autoPilotActive: false });
      }
      const badge = document.getElementById('swayam404-chatgpt-badge');
      if (badge) {
        badge.style.opacity = '0';
        badge.style.transition = 'opacity 0.4s ease';
        setTimeout(() => badge.remove(), 400);
      }
    }, 4500);

    return true;
  }

  // 6. Automated Generation Watcher
  function startAutoWatchLoop() {
    if (isWatchingGeneration) return;
    isWatchingGeneration = true;

    let hasSeenStreaming = false;
    let pollCount = 0;

    const timer = setInterval(() => {
      pollCount++;
      const isGenerating = Boolean(
        document.querySelector(
          'button[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="stop"], [data-is-streaming="true"], [class*="result-streaming"]'
        )
      );

      if (isGenerating) {
        hasSeenStreaming = true;
        updateStatus('⏳ AI Generating Answers...', '#2563eb', '#dbeafe');
      } else {
        // Not currently streaming
        if (hasSeenStreaming || pollCount >= 3) {
          const resp = extractLatestResponse();
          if (resp && (resp.includes('{') || resp.includes('[') || resp.includes('"question"'))) {
            syncAnswersBack(resp, true);
            clearInterval(timer);
            isWatchingGeneration = false;
            return;
          }
        }
      }

      // Max watch duration 3 minutes
      if (pollCount > 120) {
        clearInterval(timer);
        isWatchingGeneration = false;
        updateStatus('⚪ Ready', '#1a1a1a', '#f5f0e8');
      }
    }, 1500);
  }

  // 7. Auto-pilot bootloader: check for pending prompt from Swayam404
  function checkAndAutoExecutePendingPrompt() {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;

    chrome.storage.local.get(['pendingChatGptPrompt'], (data) => {
      const prompt = data?.pendingChatGptPrompt;
      if (!prompt) return;

      updateStatus('⚡ Auto-Pilot: Inserting prompt...', '#1a1a1a', '#ffcc00');

      let attempts = 0;
      const findInterval = setInterval(async () => {
        attempts++;
        const inputEl = findPromptInput();
        if (inputEl) {
          clearInterval(findInterval);
          chrome.storage.local.remove(['pendingChatGptPrompt']);
          await insertPromptIntoChat(prompt, true);
        } else if (attempts > 30) {
          clearInterval(findInterval);
          updateStatus('⚠️ Could not locate chat input', '#b91c1c', '#fee2e2');
        }
      }, 400);
    });
  }

  // 8. Create Neo-Brutalist Floating Badge UI
  function createFloatingBadge() {
    if (document.getElementById('swayam404-chatgpt-badge')) return;
    if (!document.body) return;

    const isClaude = window.location.hostname.includes('claude.ai');
    const providerName = isClaude ? 'Claude Web' : 'ChatGPT Web';

    const container = document.createElement('div');
    container.id = 'swayam404-chatgpt-badge';
    container.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999999;
      background: #f5f0e8;
      border: 2px solid #1a1a1a;
      box-shadow: 4px 4px 0px #1a1a1a;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 290px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-sizing: border-box;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1.5px solid #1a1a1a;
      padding-bottom: 6px;
    `;

    const title = document.createElement('div');
    title.style.cssText = `
      font-weight: 800;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #1a1a1a;
      display: flex;
      align-items: center;
      gap: 6px;
    `;
    title.innerHTML = `<span style="width:7px;height:7px;background:#ffcc00;display:inline-block;border:1px solid #1a1a1a"></span>SWAYAM 404 • ${providerName}`;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      font-weight: 800;
      cursor: pointer;
      font-size: 11px;
      color: #1a1a1a;
      padding: 2px 4px;
    `;
    closeBtn.onclick = () => {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem('swayam404_badge_dismissed', 'true');
      }
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ autoPilotActive: false });
        chrome.storage.local.remove(['pendingChatGptPrompt']);
      }
      container.remove();
    };

    header.appendChild(title);
    header.appendChild(closeBtn);
    container.appendChild(header);

    // Live status pill
    statusPill = document.createElement('div');
    statusPill.style.cssText = `
      font-size: 10px;
      font-weight: 700;
      padding: 4px 8px;
      border: 1px solid #1a1a1a;
      background: #ffffff;
      color: #1a1a1a;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      display: flex;
      align-items: center;
      gap: 5px;
    `;
    statusPill.textContent = '⚡ Auto-Pilot Ready';
    container.appendChild(statusPill);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

    // Manual Insert button
    insertBtnRef = document.createElement('button');
    insertBtnRef.textContent = '📋 Insert Swayam Questions';
    insertBtnRef.style.cssText = `
      background: #1a1a1a;
      color: #ffffff;
      border: 1.5px solid #1a1a1a;
      font-weight: 700;
      font-size: 11px;
      padding: 7px 10px;
      cursor: pointer;
      text-transform: uppercase;
      box-shadow: 2px 2px 0px #1a1a1a;
      transition: background 0.15s ease;
    `;
    insertBtnRef.onclick = () => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(['pendingChatGptPrompt'], async (data) => {
          const prompt = data?.pendingChatGptPrompt;
          if (!prompt) {
            alert('No pending questions prompt found. Click "1-Click Auto-Solve" or "Copy Prompt" in Swayam404 first.');
            return;
          }
          await insertPromptIntoChat(prompt, false);
          insertBtnRef!.textContent = '✓ Inserted! Press Enter';
          insertBtnRef!.style.background = '#10b981';
          setTimeout(() => {
            insertBtnRef!.textContent = '📋 Insert Swayam Questions';
            insertBtnRef!.style.background = '#1a1a1a';
          }, 4000);
        });
      }
    };

    // Manual Sync button
    syncBtnRef = document.createElement('button');
    syncBtnRef.textContent = '⚡ Send Answers to Swayam404';
    syncBtnRef.style.cssText = `
      background: #ffcc00;
      color: #1a1a1a;
      border: 1.5px solid #1a1a1a;
      font-weight: 800;
      font-size: 11px;
      padding: 7px 10px;
      cursor: pointer;
      text-transform: uppercase;
      box-shadow: 2px 2px 0px #1a1a1a;
      transition: background 0.15s ease;
    `;
    syncBtnRef.onclick = () => {
      const text = extractLatestResponse();
      if (!text) {
        alert('No AI responses found on page yet. Please ensure ChatGPT has completed generating answers.');
        return;
      }
      syncAnswersBack(text, false);
    };

    btnRow.appendChild(insertBtnRef);
    btnRow.appendChild(syncBtnRef);
    container.appendChild(btnRow);

    document.body.appendChild(container);

    // Boot auto-pilot check
    checkAndAutoExecutePendingPrompt();
  }

  // 9. Guarded bootstrap: Only display UI if an active prompt or autopilot session is present
  function checkShouldShowBadge(callback: (shouldShow: boolean) => void) {
    if (typeof window !== 'undefined' && window.sessionStorage?.getItem('swayam404_badge_dismissed') === 'true') {
      return callback(false);
    }
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return callback(false);
    }

    chrome.storage.local.get(['pendingChatGptPrompt', 'autoPilotActive', 'swayam_pilot_context'], (data) => {
      const hasPrompt = Boolean(data?.pendingChatGptPrompt);
      const isPilotActive = Boolean(data?.autoPilotActive);
      const pilotTimestamp = data?.swayam_pilot_context?.timestamp || 0;
      const isRecentPilot = pilotTimestamp > 0 && Date.now() - pilotTimestamp < 15 * 60 * 1000;

      callback(hasPrompt || (isPilotActive && isRecentPilot));
    });
  }

  function initBadgeIfActive() {
    checkShouldShowBadge((should) => {
      if (should) {
        createFloatingBadge();
      } else {
        const existing = document.getElementById('swayam404-chatgpt-badge');
        if (existing) {
          existing.remove();
        }
      }
    });
  }

  // Reactively mount when Swayam triggers an auto-solve session
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.pendingChatGptPrompt?.newValue || (changes.autoPilotActive && changes.autoPilotActive.newValue === true)) {
          if (typeof window !== 'undefined' && window.sessionStorage) {
            window.sessionStorage.removeItem('swayam404_badge_dismissed');
          }
          initBadgeIfActive();
          checkAndAutoExecutePendingPrompt();
        } else if (changes.autoPilotActive && changes.autoPilotActive.newValue === false && !changes.pendingChatGptPrompt?.newValue) {
          const badge = document.getElementById('swayam404-chatgpt-badge');
          if (badge) badge.remove();
        }
      }
    });
  }

  // Check once on idle load
  setTimeout(initBadgeIfActive, 600);
})();
