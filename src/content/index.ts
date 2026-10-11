import { SwayamPortalAdapter } from '@/adapters';
import { ChatGptBridgeService } from '@/lib/ai/chatgptBridge';
import {
  ExtensionMessage,
  ScanResultMessage,
  CourseOutlineResultMessage,
  PopulateResultMessage,
  PopulationSummary,
  PopulationTarget,
  PongMessage,
  CaptureFeedbackResultMessage,
} from '@/types';

// Instantiate default adapter
const adapter = new SwayamPortalAdapter();

// Guard against duplicate injection listeners
const globalObj = window as unknown as {
  __swayam404_installed?: boolean;
  __swayam404Adapter?: SwayamPortalAdapter;
};

if (!globalObj.__swayam404_installed) {
  globalObj.__swayam404_installed = true;
  globalObj.__swayam404Adapter = adapter;

  console.log('[swayam404] Content script initialized on:', window.location.href);

  // Register this SWAYAM portal tab with background service worker
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime
      .sendMessage({
        type: 'REGISTER_SWAYAM_TAB',
        url: window.location.href,
      })
      .catch(() => {});
  }

  // Deduplication state to prevent redundant runs within 10 seconds
  let lastProcessedSyncText = '';
  let lastProcessedTimestamp = 0;

  /**
   * Neo-Brutalist In-Page Feedback Toast
   */
  function showInPageToast(message: string, type: 'success' | 'error' | 'info' = 'success', duration = 8000) {
    if (typeof document === 'undefined' || !document.body) return;

    const existing = document.getElementById('swayam404-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'swayam404-toast';
    toast.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 99999999;
      background: #f5f0e8;
      color: #1a1a1a;
      border: 2px solid #1a1a1a;
      box-shadow: 4px 4px 0px #1a1a1a;
      padding: 12px 16px;
      max-width: 360px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      box-sizing: border-box;
    `;

    const header = document.createElement('div');
    header.style.cssText =
      'display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #1a1a1a; padding-bottom: 4px;';

    const title = document.createElement('div');
    title.style.cssText =
      'font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px;';
    const accentColor = type === 'success' ? '#10b981' : type === 'error' ? '#e63b2e' : '#ffcc00';
    title.innerHTML = `<span style="width:8px;height:8px;background:${accentColor};display:inline-block;border:1px solid #1a1a1a"></span>SWAYAM 404 • AUTO-PILOT`;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText =
      'background: none; border: none; font-weight: 800; cursor: pointer; font-size: 11px; color: #1a1a1a; padding: 0 4px;';
    closeBtn.onclick = () => toast.remove();

    header.appendChild(title);
    header.appendChild(closeBtn);
    toast.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'font-weight: 600; line-height: 1.4; color: #1a1a1a;';
    body.textContent = message;
    toast.appendChild(body);

    const footer = document.createElement('div');
    footer.style.cssText = 'font-size: 10px; color: #555555; font-weight: 700; text-transform: uppercase;';
    footer.textContent = '🛡️ Zero Auto-Submit: Review answers & click Submit';
    toast.appendChild(footer);

    document.body.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        if (document.body.contains(toast)) {
          toast.remove();
        }
      }, duration);
    }
  }

  /**
   * Automatically parses AI answers and marks all radio buttons / checkboxes in the page DOM
   */
  async function handleAutoApplyAnswers(answersText: string): Promise<PopulationSummary | null> {
    if (!answersText || !answersText.trim()) return null;

    const now = Date.now();
    if (answersText === lastProcessedSyncText && now - lastProcessedTimestamp < 10000) {
      console.log('[swayam404] Answers recently processed, ignoring duplicate event.');
      return null;
    }
    lastProcessedSyncText = answersText;
    lastProcessedTimestamp = now;

    console.log('[swayam404] Auto-Pilot: Processing answers into SWAYAM DOM...');

    // 1. Scan questions from page
    const questions = adapter.scanQuestions(document);
    if (!questions || questions.length === 0) {
      showInPageToast('⚠️ Answers received, but no assignment questions found on page.', 'error');
      return null;
    }

    // 2. Parse answers via ChatGPT bridge parser
    const parsed = ChatGptBridgeService.parseResponse(answersText, questions);
    if (!parsed.success || parsed.matchedCount === 0) {
      showInPageToast('⚠️ Web AI answers received, but 0 question options matched.', 'error');
      return null;
    }

    // 3. Mark all radio buttons / checkboxes in live DOM
    let succeeded = 0;
    let failed = 0;
    const results = [];

    for (const item of parsed.matchedItems) {
      const target: PopulationTarget = {
        questionId: item.scannedQuestion.id,
        questionText: item.scannedQuestion.questionText,
        questionType: item.scannedQuestion.questionType,
        selectedAnswers: item.matchedOptionTexts,
        options: item.scannedQuestion.options,
      };

      const res = adapter.populateQuestion(document, target);
      if (res.success) {
        succeeded++;
      } else {
        failed++;
      }
      results.push(res);
    }

    // 4. In-page Toast Feedback
    showInPageToast(
      `⚡ All ${succeeded} of ${questions.length} answers automatically marked! Review your choices and click "Submit" manually.`,
      'success',
      10000
    );

    const summary: PopulationSummary = {
      timestamp: new Date().toISOString(),
      totalApproved: parsed.matchedItems.length,
      succeeded,
      failed,
      skipped: questions.length - parsed.matchedItems.length,
      results,
    };

    // 5. Sync state to chrome.storage for extension popup/sidepanel rehydration
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const persistedResults = questions.map((q) => {
        const matched = parsed.matchedItems.find((m) => m.questionId === q.id);
        return {
          scannedQuestion: q,
          status: (matched ? 'probable-match' : 'no-match') as 'probable-match' | 'no-match',
          confidence: matched ? 0.95 : 0,
          reasons: matched ? ['AI Auto-Pilot Suggested Answer'] : ['Unmatched'],
          requiresReview: false,
          proposedAnswers: matched ? matched.matchedOptionTexts : [],
          resolutionState: (matched ? 'chatgpt-suggested' : 'unresolved') as 'chatgpt-suggested' | 'unresolved',
          isApproved: Boolean(matched && matched.matchedOptionTexts.length > 0),
          matchedRecord: undefined,
        };
      });

      chrome.storage.local.set({
        swayam_persisted_results: persistedResults,
        swayam_last_auto_applied: {
          timestamp: Date.now(),
          succeeded,
          total: questions.length,
        },
      });
    }

    return summary;
  }

  // Floating launch widget on SWAYAM assignments
  function injectSwayamLaunchPill() {
    if (typeof document === 'undefined' || !document.body) return;

    const identity = adapter.detectCourseIdentity(document, window.location.href);
    const existing = document.getElementById('swayam404-launch-pill');
    if (existing) {
      if (
        existing.getAttribute('data-week') === (identity.detectedWeek || '') &&
        existing.getAttribute('data-assignment') === (identity.assignmentTitle || '')
      ) {
        return;
      }
      existing.remove();
    }

    const questions = adapter.scanQuestions(document);
    if (!questions || questions.length === 0) return;

    const pill = document.createElement('div');
    pill.id = 'swayam404-launch-pill';
    pill.setAttribute('data-week', identity.detectedWeek || '');
    pill.setAttribute('data-assignment', identity.assignmentTitle || '');
    pill.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999998;
      background: #ffcc00;
      color: #1a1a1a;
      border: 2px solid #1a1a1a;
      box-shadow: 4px 4px 0px #1a1a1a;
      padding: 8px 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      user-select: none;
      transition: transform 0.1s ease;
    `;
    const weekLabel = identity.detectedWeek ? `${identity.detectedWeek} • ` : '';

    if (identity.isAlreadySubmitted) {
      pill.style.background = '#dcfce7';
      pill.innerHTML = `<span>📥</span> <span>Capture Answers (${weekLabel}Submitted)</span>`;
      pill.title = 'Assignment already submitted! Click to capture portal-confirmed answers into your answer bank.';
      pill.onclick = async () => {
        try {
          pill.innerHTML = `<span>⏳</span> <span>Capturing Answers...</span>`;
          const feedbackData = adapter.captureAssignmentFeedback(document, window.location.href);
          if (!feedbackData.capturedRecords || feedbackData.capturedRecords.length === 0) {
            showInPageToast('⚠️ No visible feedback or accepted answers found on page.', 'error');
            pill.innerHTML = `<span>📥</span> <span>Capture Answers (${weekLabel}Submitted)</span>`;
            return;
          }
          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            const currentQuestions = (await new Promise<any[]>((resolve) => {
              chrome.storage.local.get(['swayam_questions'], (res) => resolve(res?.swayam_questions || []));
            })) || [];

            let addedCount = 0;
            const updatedList = [...currentQuestions];
            for (const rec of feedbackData.capturedRecords) {
              const exists = updatedList.some(
                (q) => q.questionText.trim().toLowerCase() === rec.questionText.trim().toLowerCase()
              );
              if (!exists) {
                updatedList.push({
                  id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  courseId: identity.externalId || 'default',
                  portalCourseTitle: identity.courseTitle,
                  externalCourseId: identity.externalId,
                  assignmentTitle: identity.assignmentTitle,
                  questionText: rec.questionText,
                  questionType: rec.questionType,
                  options: rec.options,
                  correctOptions: rec.acceptedAnswers,
                  acceptedAnswers: rec.acceptedAnswers,
                  explanation: rec.explanation,
                  reviewStatus: rec.verificationStatus,
                  verificationSource: rec.verificationSource,
                  source: identity.assignmentTitle || 'Portal Submission Feedback',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
                addedCount++;
              }
            }
            await chrome.storage.local.set({ swayam_questions: updatedList });
            showInPageToast(`✓ Captured & saved ${addedCount} confirmed answers into your answer bank!`, 'success');
          }
          pill.innerHTML = `<span>✓</span> <span>Answers Captured!</span>`;
        } catch (err) {
          showInPageToast(`Error: ${(err as Error).message}`, 'error');
          pill.innerHTML = `<span>📥</span> <span>Capture Answers</span>`;
        }
      };
    } else {
      pill.innerHTML = `<span>⚡</span> <span>1-Click Auto-Solve (${weekLabel}${questions.length} Qs)</span>`;
      pill.title = 'Copies prompt, opens ChatGPT, solves, redirects back, and marks all radio buttons automatically!';

      pill.onmouseenter = () => {
        pill.style.transform = 'translate(-1px, -1px)';
      };
      pill.onmouseleave = () => {
        pill.style.transform = 'none';
      };

      pill.onclick = async () => {
        try {
          pill.innerHTML = `<span>⚡</span> <span>Scanning & Preparing...</span>`;
          const scanned = adapter.scanQuestions(document);
          const currentIdentity = adapter.detectCourseIdentity(document, window.location.href);

          const promptText = ChatGptBridgeService.buildPrompt({
            questions: scanned,
            courseName: currentIdentity.courseTitle,
            assignmentTitle: currentIdentity.assignmentTitle,
          });

          await ChatGptBridgeService.copyToClipboard(promptText);

          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            await chrome.storage.local.set({
              pendingChatGptPrompt: promptText,
              pendingQuestionsCount: scanned.length,
              autoPilotActive: true,
              swayam_pilot_context: {
                url: window.location.href,
                detectedWeek: currentIdentity.detectedWeek,
                detectedAssignmentTitle: currentIdentity.assignmentTitle,
                timestamp: Date.now(),
              },
            });
          }

          showInPageToast('⚡ Questions copied! Opening ChatGPT to solve...', 'info', 4000);
          pill.innerHTML = `<span>⏳</span> <span>Solving in ChatGPT...</span>`;

          await ChatGptBridgeService.openChatGptTab('https://chatgpt.com/');
        } catch (err) {
          showInPageToast(`Error: ${(err as Error).message}`, 'error');
          pill.innerHTML = `<span>⚡</span> <span>1-Click Auto-Solve</span>`;
        }
      };
    }

    document.body.appendChild(pill);
  }

  // SPA navigation watcher to detect week or quiz switches immediately
  let lastObservedUrl = window.location.href;
  let lastObservedWeek = '';
  let lastObservedAssignmentTitle = '';

  function checkAndNotifyWeekOrAssignmentChange() {
    const newUrl = window.location.href;
    const identity = adapter.detectCourseIdentity(document, newUrl);
    const newWeek = identity.detectedWeek || '';
    const newAssignmentTitle = identity.assignmentTitle || '';

    const urlChanged = newUrl !== lastObservedUrl;
    const weekChanged = newWeek !== lastObservedWeek && Boolean(newWeek);
    const titleChanged = newAssignmentTitle !== lastObservedAssignmentTitle && Boolean(newAssignmentTitle);

    if (urlChanged || weekChanged || titleChanged) {
      console.log('[swayam404] Week or quiz changed on portal:', {
        fromWeek: lastObservedWeek,
        toWeek: newWeek,
        fromTitle: lastObservedAssignmentTitle,
        toTitle: newAssignmentTitle,
        url: newUrl,
      });

      lastObservedUrl = newUrl;
      lastObservedWeek = newWeek;
      lastObservedAssignmentTitle = newAssignmentTitle;

      // Re-inject launch pill to reflect the newly selected week
      injectSwayamLaunchPill();

      // Notify background service worker & open popup/sidepanel views
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime
          .sendMessage({
            type: 'SWAYAM_TAB_NAVIGATION',
            url: newUrl,
            detectedWeek: newWeek,
            detectedWeekNumber: identity.detectedWeekNumber,
            detectedAssignmentTitle: newAssignmentTitle,
            courseTitle: identity.courseTitle,
            isAlreadySubmitted: identity.isAlreadySubmitted,
            submissionStatus: identity.submissionStatus,
          })
          .catch(() => {});
      }

      // Update storage pilot context
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({
          swayam_pilot_context: {
            url: newUrl,
            detectedWeek: newWeek,
            detectedWeekNumber: identity.detectedWeekNumber,
            detectedAssignmentTitle: newAssignmentTitle,
            timestamp: Date.now(),
          },
        });
      }
    }
  }

  // Intercept client-side routing
  window.addEventListener('popstate', checkAndNotifyWeekOrAssignmentChange);
  window.addEventListener('hashchange', checkAndNotifyWeekOrAssignmentChange);

  try {
    const originalPushState = history.pushState;
    if (typeof originalPushState === 'function') {
      history.pushState = function (...args) {
        const ret = originalPushState.apply(this, args);
        setTimeout(checkAndNotifyWeekOrAssignmentChange, 150);
        return ret;
      };
    }

    const originalReplaceState = history.replaceState;
    if (typeof originalReplaceState === 'function') {
      history.replaceState = function (...args) {
        const ret = originalReplaceState.apply(this, args);
        setTimeout(checkAndNotifyWeekOrAssignmentChange, 150);
        return ret;
      };
    }
  } catch {}

  // Periodic check to capture asynchronous React / edX DOM updates
  setTimeout(injectSwayamLaunchPill, 1200);
  setInterval(injectSwayamLaunchPill, 3500);
  setInterval(checkAndNotifyWeekOrAssignmentChange, 1500);

  // Listen for storage changes (incoming ChatGPT / Claude answers)
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.swayam_chatgpt_sync?.newValue) {
        const text = changes.swayam_chatgpt_sync.newValue;
        if (typeof text === 'string' && text.trim()) {
          handleAutoApplyAnswers(text);
        }
      }
    });
  }

  // Listen for messages from extension popup/sidepanel/background
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener(
      (message: ExtensionMessage, _sender, sendResponse: (res: ExtensionMessage) => void) => {
        // 1. Readiness handshake & auto-identification
        if (message.type === 'PING') {
          let detectedCourseTitle: string | undefined;
          let detectedAssignmentTitle: string | undefined;
          let detectedExternalId: string | undefined;
          let detectedWeek: string | undefined;
          let detectedWeekNumber: number | undefined;
          let isAlreadySubmitted = false;
          let submissionStatus = undefined;
          let questionCount = 0;

          try {
            const identity = adapter.detectCourseIdentity(document, window.location.href);
            detectedCourseTitle = identity.courseTitle;
            detectedAssignmentTitle = identity.assignmentTitle;
            detectedExternalId = identity.externalId;
            detectedWeek = identity.detectedWeek;
            detectedWeekNumber = identity.detectedWeekNumber;
            isAlreadySubmitted = Boolean(identity.isAlreadySubmitted);
            submissionStatus = identity.submissionStatus;

            // Fast DOM heuristic count of question containers
            const containers = document.querySelectorAll(
              'section, .problem, .wrapper-problem-response, .gcb-form-element, [data-question-id], .qt-question, .assignment-question, .question-card, fieldset'
            );
            questionCount = containers.length;
          } catch {
            // Non-blocking fallback
          }

          const pong: PongMessage = {
            type: 'PONG',
            url: window.location.href,
            version: '1.2.0',
            title: detectedAssignmentTitle || document.title,
            detectedCourseTitle,
            detectedAssignmentTitle,
            detectedExternalId,
            detectedWeek,
            detectedWeekNumber,
            isAlreadySubmitted,
            submissionStatus,
            questionCount,
            timestamp: Date.now(),
          };
          sendResponse(pong);
          return false;
        }

        // 2. Scan assignment
        if (message.type === 'SCAN_ASSIGNMENT') {
          try {
            const questions = adapter.scanQuestions(document);
            const identity = adapter.detectCourseIdentity(document, window.location.href);
            console.log(`[swayam404] Scanned ${questions.length} questions from DOM.`);

            const response: ScanResultMessage = {
              type: 'SCAN_RESULT',
              success: true,
              url: window.location.href,
              pageTitle: identity.assignmentTitle || document.title,
              detectedCourseTitle: identity.courseTitle,
              detectedExternalId: identity.externalId,
              detectedUnitId: identity.unitId,
              detectedAssessmentId: identity.assessmentId,
              detectedAssignmentTitle: identity.assignmentTitle,
              detectedWeek: identity.detectedWeek,
              detectedWeekNumber: identity.detectedWeekNumber,
              isAlreadySubmitted: identity.isAlreadySubmitted,
              submissionStatus: identity.submissionStatus,
              questions,
            };
            sendResponse(response);
          } catch (err) {
            console.error('[swayam404] Scan failed:', err);
            sendResponse({
              type: 'SCAN_RESULT',
              success: false,
              error: (err as Error).message || 'Failed to scan assignment DOM.',
              questions: [],
            });
          }
          return true;
        }

        // 3. Scan course outline
        if (message.type === 'SCAN_COURSE_OUTLINE') {
          try {
            const outline = adapter.scanCourseOutline(document, window.location.href);
            console.log(`[swayam404] Scanned outline: found ${outline.tasks.length} tasks.`);

            const response: CourseOutlineResultMessage = {
              type: 'COURSE_OUTLINE_RESULT',
              success: true,
              url: window.location.href,
              portalCourseTitle: outline.portalCourseTitle,
              externalCourseId: outline.externalCourseId,
              tasks: outline.tasks,
            };
            sendResponse(response);
          } catch (err) {
            console.error('[swayam404] Outline scan failed:', err);
            sendResponse({
              type: 'COURSE_OUTLINE_RESULT',
              success: false,
              error: (err as Error).message || 'Failed to scan course outline.',
              tasks: [],
            });
          }
          return true;
        }

        // 4. Capture assignment feedback / accepted answers
        if (message.type === 'CAPTURE_ASSIGNMENT_FEEDBACK') {
          try {
            const feedbackData = adapter.captureAssignmentFeedback(document, window.location.href);
            console.log(
              `[swayam404] Captured ${feedbackData.capturedRecords.length} question records with feedback.`
            );

            const response: CaptureFeedbackResultMessage = {
              type: 'CAPTURE_FEEDBACK_RESULT',
              success: true,
              url: window.location.href,
              portalCourseTitle: feedbackData.portalCourseTitle,
              externalCourseId: feedbackData.externalCourseId,
              assignmentTitle: feedbackData.assignmentTitle,
              unitTitle: feedbackData.unitTitle,
              capturedRecords: feedbackData.capturedRecords,
            };
            sendResponse(response);
          } catch (err) {
            console.error('[swayam404] Capture feedback failed:', err);
            sendResponse({
              type: 'CAPTURE_FEEDBACK_RESULT',
              success: false,
              url: window.location.href,
              error: (err as Error).message || 'Failed to capture assignment feedback.',
              capturedRecords: [],
            });
          }
          return true;
        }

        // 5. Populate approved answers
        if (message.type === 'POPULATE_ANSWERS') {
          try {
            const targets = message.targets;
            let succeeded = 0;
            let failed = 0;
            const results = [];

            for (const target of targets) {
              const itemRes = adapter.populateQuestion(document, target);
              if (itemRes.success) {
                succeeded++;
              } else {
                failed++;
              }
              results.push(itemRes);
            }

            const summary: PopulationSummary = {
              timestamp: new Date().toISOString(),
              totalApproved: targets.length,
              succeeded,
              failed,
              skipped: 0,
              results,
            };

            const response: PopulateResultMessage = {
              type: 'POPULATE_RESULT',
              summary,
            };

            sendResponse(response);
          } catch (err) {
            console.error('[swayam404] Population failed:', err);
            sendResponse({
              type: 'POPULATE_RESULT',
              summary: {
                timestamp: new Date().toISOString(),
                totalApproved: message.targets.length,
                succeeded: 0,
                failed: message.targets.length,
                skipped: 0,
                results: [
                  {
                    questionId: 'all',
                    questionText: 'Error',
                    success: false,
                    message: (err as Error).message,
                    populatedAnswers: [],
                  },
                ],
              },
            });
          }
          return true;
        }

        // 6. Automated answers dispatched from background
        if ((message as unknown as { type: string }).type === 'AUTO_APPLY_ANSWERS') {
          const answersText = (message as unknown as { answersText?: string }).answersText;
          if (answersText) {
            handleAutoApplyAnswers(answersText).then((summary) => {
              if (summary) {
                sendResponse({
                  type: 'POPULATE_RESULT',
                  summary,
                });
              }
            });
            return true;
          }
        }

        return false;
      }
    );
  }
}
