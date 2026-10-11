---
status: resolved
trigger: "User reported lot of issues in extension, UI/UX issues, API fallback issues, missing Grok API key option in settings, requested Google Stitch prompt"
created: 2026-10-10T22:46:00+05:30
updated: 2026-10-10T22:54:00+05:30
---

## Symptoms
1. Missing option to input Grok API key in Settings when Gemini is selected (and vice versa). SettingsTab only had a single API key field tied to the active provider, overwriting the other key on save.
2. Unwanted / frequent API fallbacks occurring due to Gemini quota/rate limits, with no user toggle to disable/enable fallback.
3. UI/UX layout issues: 6 tabs overflowing in 440px popup, 6-column metric grids squishing labels, lack of password visibility toggle, cluttered action bars.
4. User requested comprehensive Google Stitch prompt to redesign the entire extension UI/UX.

## Root Cause Analysis
1. `SettingsTab.tsx` only had one API key state (`apiKey`) and dynamically switched its meaning based on the active provider. When `provider === 'grok'`, line 121 wrote `patch.aiApiKey = apiKey.trim()`, destroying the Gemini key. Users could never configure Gemini as primary and Grok as fallback simultaneously.
2. `ExtensionSettings` lacked an explicit user toggle (`enableProviderFallback?: boolean`) to control whether fallback should happen on rate limits (429/quota/503).
3. Hardcoded model migration in `StorageService.getSettings()` previously replaced `gemini-2.0-flash` with nonexistent `gemini-2.5-flash`, which returns HTTP 404 from Google's endpoint, triggering unnecessary fallbacks and errors.
4. In `src/index.css`, `grid-template-columns: repeat(6, 1fr)` crammed 6 cards into ~380px usable space (~60px each), truncating metrics. The 6-tab navigation had rectangular buttons without smooth pill scrolling.

## Fix Applied
1. **Dual-Provider Architecture in Settings (`src/features/settings/SettingsTab.tsx`)**:
   - Distinct Primary AI Provider section (Gemini or Grok) with independent API key and model selection.
   - Distinct Secondary Fallback Provider section (the counterpart provider) with independent fallback API key and model selection.
   - Added Show/Hide Eye toggle buttons for both keys to prevent whitespace/copy-paste errors.
   - Independent "Test Primary Connection" and "Test Fallback Connection" buttons with live feedback.
   - Save handler persists `aiApiKey` (Gemini) and `grokApiKey` (Grok) independently without cross-overwriting.
2. **Fallback Toggle & Diagnostics (`src/types/index.ts`, `src/lib/storage/index.ts`, `src/lib/orchestration/answerResolutionPipeline.ts`)**:
   - Added `enableProviderFallback: boolean` (defaults to true) to `ExtensionSettings`.
   - Pipeline respects `settings.enableProviderFallback !== false` before engaging secondary provider.
   - Fixed model defaults to production-standard `gemini-1.5-flash` and `gemini-2.0-flash` instead of nonexistent `gemini-2.5-flash`.
   - Enhanced tracer logging with explicit messages when fallback is engaged or skipped.
3. **UI/UX Polish (`src/features/scanner/ScannerTab.tsx`, `src/index.css`)**:
   - Replaced 6-column metrics grid with a responsive 2x3 grid (`repeat(3, 1fr)`) with large readable counters and badges.
   - Styled navigation tabs as sleek rounded pills with smooth horizontal scrolling and accent glowing active states.
4. **Verification**:
   - Added automated test 21 in `src/test/pipeline-audit-resolution.test.ts` verifying that `enableProviderFallback: false` disables fallback on 429 rate limits.
   - TypeScript type check (`tsc --noEmit`) passes with 0 errors.
   - All 105 tests pass (`vitest run`).
   - Production extension build succeeds.
