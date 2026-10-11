# Phase Plan: Phase 7 — Zero-Click End-to-End Auto-Pilot

## Objective
Automate the entire post-ChatGPT loop:
1. When ChatGPT finishes answer generation, auto-redirect/switch focus back to the SWAYAM portal assignment tab.
2. In the SWAYAM tab, automatically parse the answers and immediately mark all radio buttons / checkboxes in the DOM.
3. Eliminate manual "Paste Answers" and "Apply Answers" steps completely.
4. Provide a single-click "Paste & Mark Answers" fallback in the extension UI that immediately marks the page.
5. Strictly adhere to the Zero Auto-Submit Guarantee (never click "Submit").

## Architecture & Data Flow

```
[SWAYAM Tab]
   │
   ├─► User clicks "1-Click Auto-Solve" (or extension action)
   │     - Stores { tabId, url } in chrome.storage.local ('swayam_pilot_context')
   │     - Copies prompt to clipboard & sets 'pendingChatGptPrompt'
   │     - Opens ChatGPT Tab
   ▼
[ChatGPT Tab]
   │
   ├─► chatgptContent.ts detects pending prompt
   │     - Types into editor and clicks Send
   │     - Watches streaming generation until complete
   │     - Extracts JSON / structured response
   │     - Stores response in 'swayam_chatgpt_sync'
   │     - Sends CHATGPT_SOLVE_COMPLETE to background.js
   ▼
[Background Service Worker]
   │
   ├─► background/index.ts receives CHATGPT_SOLVE_COMPLETE
   │     - Looks up recorded swayamTabId (or finds open Swayam tab)
   │     - Switches active tab & window focus to SWAYAM tab
   │     - Sends AUTO_APPLY_ANSWERS message directly to SWAYAM tab
   ▼
[SWAYAM Tab (In-Page Content Script)]
   │
   ├─► content/index.ts receives answers (via message or storage)
   │     - Scans page questions (if needed)
   │     - Parses answers using ChatGptBridgeService
   │     - Matches options and calls adapter.populateQuestion for each question
   │     - All radio buttons & checkboxes are checked in the DOM!
   │     - Displays Neo-brutalist In-Page Notification:
   │       "⚡ SWAYAM404: 10/10 Answers Auto-Marked! Review and click Submit."
   │     - Persists results to storage for popup/sidepanel sync
   │     - NEVER touches Submit button!
```

## Step 1: Permissions & Manifest
- Add `"tabs"` to `public/manifest.json`.

## Step 2: Background Service Worker (`src/background/index.ts`)
- Handle `REGISTER_SWAYAM_TAB`: record tab ID and URL.
- Handle `CHATGPT_SOLVE_COMPLETE`:
  - Retrieve `swayamTabId` and `swayamUrl`.
  - Activate target tab using `chrome.tabs.update(tabId, { active: true })`.
  - Focus window using `chrome.windows.update(tab.windowId, { focused: true })`.
  - Send `AUTO_APPLY_ANSWERS` to the tab.

## Step 3: ChatGPT Content Script (`src/content/chatgptContent.ts`)
- On extraction completion:
  - Notify background with `CHATGPT_SOLVE_COMPLETE`.
  - Update floating badge UI with "⚡ Redirecting to SWAYAM...".
  - Support manual "Send Answers to Swayam404" button also redirecting.

## Step 4: SWAYAM Content Script (`src/content/index.ts`)
- Register active tab on mount.
- Add listener for `AUTO_APPLY_ANSWERS` and `swayam_chatgpt_sync`.
- Implement `autoApplyAnswersToPage(answersText)`.
- Mark radio buttons / checkboxes via `adapter.populateQuestion`.
- Inject brutalist floating toast banner with dismiss button and auto-fade.
- Keep Submit button strictly untouched.

## Step 5: Extension UI (`src/features/scanner/ScannerTab.tsx`)
- Save active tab ID to `swayam_pilot_context` when starting Auto-Pilot.
- Rehydrate `results` from `swayam_persisted_results` if component mounts.
- Update `handlePasteFromClipboardAndApply` to parse AND immediately populate page inputs in 1 click.
- Rename action to `3. ⚡ Paste & Mark Answers`.

## Step 6: Testing & Verification
- Unit & integration tests for auto-redirect and in-page auto-population.
- Run `npm test`, `npm run typecheck`, `npm run build`.
