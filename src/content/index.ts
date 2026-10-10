import { SwayamPortalAdapter } from '@/adapters';
import {
  ExtensionMessage,
  ScanResultMessage,
  PopulateResultMessage,
  PopulationSummary,
} from '@/types';

// Instantiate default adapter
const adapter = new SwayamPortalAdapter();

console.log('[swayam404] Content script loaded on:', window.location.href);

// Listen for messages from extension popup/sidepanel
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse: (res: ExtensionMessage) => void) => {
      console.log('[swayam404] Received message:', message.type);

      if (message.type === 'SCAN_ASSIGNMENT') {
        try {
          const questions = adapter.scanQuestions(document);
          console.log(`[swayam404] Scanned ${questions.length} questions from DOM.`);

          const response: ScanResultMessage = {
            type: 'SCAN_RESULT',
            success: true,
            url: window.location.href,
            pageTitle: document.title,
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
        return true; // Keep message channel open for async response
      }

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

      return false;
    }
  );
}

// Attach scanner globally for local test fixture execution and debugging
(window as unknown as { __swayam404Adapter: typeof adapter }).__swayam404Adapter = adapter;
