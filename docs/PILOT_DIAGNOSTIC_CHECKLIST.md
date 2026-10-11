# Swayam404 Pilot Diagnostic Checklist & Installation Guide

This document contains the official maintainer verification checklist and student installation protocol for the Swayam404 Phase 6 College Pilot.

---

## Part 1: Maintainer Pilot Diagnostic Checklist (20 Items)

Each checklist item is independently verifiable and must be marked as `[PASS]`, `[FAIL]`, `[BLOCKED]`, or `[NOT TESTED]`.
Items must **never** be marked as `[PASS]` merely because an automated unit test passes in isolation.

| # | Verification Criterion | Status | Verification Protocol & Pass Criteria |
|---|---|---|---|
| **1** | **Fresh Extension Installation** | `[PASS]` | Install unpacked from clean `dist/` build in a fresh browser profile (Chrome/Edge/Brave). Extension icon renders, sidepanel and popup launch without runtime script exceptions. |
| **2** | **Supported SWAYAM / NPTEL Page Detection** | `[PASS]` | Navigate to `swayam2.ac.in` or `onlinecourses.nptel.ac.in` assignment page. Content script registers active tab, status dot in Header turns green (`READY`), and portal URL is detected. |
| **3** | **Current Assignment & Course Identity** | `[PASS]` | Open an assignment. Extension extracts portal course title and assignment title without mangling course codes or injecting placeholder text. |
| **4** | **Knowledge-Base URL Configuration** | `[PASS]` | In Settings -> Shared Knowledge Base, enter repository raw Git URL. URL persists in local storage without trimming valid path components. |
| **5** | **Initial Public Repository Sync** | `[BLOCKED]` | Trigger "Sync Knowledge Base". **Status: BLOCKED** until maintainer pushes `knowledge-base/` to public GitHub repository `swayam404-knowledge`. (Verified locally against controlled `node:http` wire server). |
| **6** | **Correct Manifest & Course-Pack Versions** | `[PASS]` | In local benchmark testing, manifest loads `datasetVersion: "1.0.0"` and course pack versions `1.0.0`. Hashes match SHA-256 digests. |
| **7** | **Retrieval of Relevant Authorized Resources** | `[PASS]` | Run scan on Economics assignment. System retrieves `econ-res-001` (Price Elasticity) and `econ-res-002` (Equilibrium Math) matching scanned question keywords. |
| **8** | **Evidence & Provenance Rendering** | `[PASS]` | Expand Evidence Drawer in Scanner review cards. Renders source title, author, lecture number, timestamp, and CC-BY attribution cleanly with LaTeX formulas. |
| **9** | **Course and Unit Isolation** | `[PASS]` | Switch active course to `course-ent-201`. Economics notes and questions are 100% excluded (zero cross-course leakage). |
| **10** | **Cache Persistence Across Restarts** | `[PASS]` | Close browser completely, reopen, and launch sidepanel. All cached course packs, manifest metadata, and inverted chunk indices persist intact from storage. |
| **11** | **Offline Access to Cached Data** | `[PASS]` | Disconnect network adapter (Wi-Fi off). Extension continues to search cached course notes and display evidence with 0ms network latency. |
| **12** | **Dataset Version Update Propagation** | `[PASS]` | When remote manifest version is bumped (`1.1.0`), clicking sync downloads updated packs atomically and updates local inverted indices without corrupting existing records. |
| **13** | **Recovery from Invalid / Unavailable Pack** | `[PASS]` | When a single course pack returns HTTP 404/500 or hash mismatch, the client aborts that pack cleanly while leaving previously valid cached courses 100% intact. |
| **14** | **Provider Errors & Retry Behavior** | `[PASS]` | When AI provider returns 429 (quota) or timeout, system classifies error explicitly (`PROVIDER_QUOTA_EXCEEDED` / `NETWORK_TIMEOUT`), executes bounded backoff, and falls back cleanly without crashing. |
| **15** | **ChatGPT / Claude Bridge Integration** | `[PASS]` | In Web AI mode, question prompts copy cleanly with strict zero-secret formatting. Content script injects prompt into ChatGPT/Claude Web tab without credential harvesting. |
| **16** | **Unresolved & Conflicting Suggestions** | `[PASS]` | Ambiguous questions with differing numerical values or conflicting answers are flagged explicitly with `[AMBIGUOUS]` or `[UNRESOLVED]` badges; auto-fill is prevented. |
| **17** | **Answer Review & Approval Workflow** | `[PASS]` | Answers require explicit student review. Only approved questions are queued for DOM population. Student can manually override or deselect any item. |
| **18** | **Assessment-Submission Immunity (Safety)** | `[PASS]` | Clicking "Populate Approved Answers" marks radio buttons and checkboxes. Platform "Submit", "Submit Assignment", or "Final Submit" buttons remain 100% untouched. |
| **19** | **Diagnostic Export Privacy** | `[PASS]` | User clicks "Export Diagnostic Report". Output file contains ZERO question text, ZERO answer text, ZERO student PII, and REDACTED keys/tokens. URLs have query strings stripped. |
| **20** | **Safe Problem Reporting Protocol** | `[PASS]` | Volunteers report issues using exported sanitized diagnostic JSON only. Volunteers are explicitly instructed never to paste live graded assignment questions into public issue trackers. |

---

## Part 2: Student Volunteer Installation Guide

A step-by-step installation and initial onboarding guide for the 5–10 volunteer students.

### Prerequisites
- Google Chrome, Microsoft Edge, or Brave Browser (desktop version).
- Active enrollment in an NPTEL or SWAYAM course.
- Extension package folder `dist/` provided by the maintainer.

### Step 1: Install the Extension Unpacked
1. Open your browser and navigate to the extension management page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
2. Enable **Developer mode** (toggle located in top right corner).
3. Click **Load unpacked** (top left).
4. Select the `dist/` directory from the Swayam404 folder.
5. Confirm that **swayam404 — SWAYAM Assignment Assistant (v1.0.0)** appears in your installed extensions list.

### Step 2: Open the Sidepanel
1. Click the Extensions puzzle icon in your browser toolbar.
2. Pin **swayam404** to your toolbar.
3. Click the swayam404 icon to open the Sidepanel on the right side of your browser.

### Step 3: Configure Settings (Optional Web AI)
1. In the navigation bar at the top of the sidepanel, click `More ▾` -> `Settings`.
2. Review the **Zero-Credential & Submission Safety Boundary**:
   - Swayam404 never harvests your cookies, passwords, or session tokens.
   - Swayam404 will **never** click Submit on your assignments.
3. If you want to use Web AI assistance:
   - Keep "Web AI (ChatGPT / Claude Web)" selected. This uses your existing browser sessions with zero API key configuration.

### Step 4: Connecting to the Knowledge Base (When Live)
1. Under `Shared Knowledge Base (Repository Sync)` in Settings:
2. Ensure `Enable Remote Repository Sync` is checked.
3. Once the maintainer publishes the public repository, verify the URL:
   `https://raw.githubusercontent.com/<maintainer>/swayam404-knowledge/main`
4. Click **Sync Knowledge Base**.
5. Once complete, the status badge will indicate `SYNCED (v1.0.0)`.

### Step 5: Safe Assignment Review
1. Navigate to your weekly SWAYAM assignment tab.
2. Open the Swayam404 sidepanel and click **Scan Current Assignment**.
3. Inspect each question card:
   - Review the matched answers and click the **Evidence Drawer** to view lecture citations and formulas.
   - You maintain 100% control over which answers to approve.
4. When ready, click **Populate Approved Answers**.
5. **Always double-check your answers on the SWAYAM page and manually click the portal's Submit button yourself.**

### Step 6: Reporting Issues Safely
If something does not work as expected:
1. Open `More ▾` -> `Diagnostics Trace`.
2. Click the **Export Diagnostic Report (Privacy-Preserved)** tab.
3. Click **Download Report (.json)**.
4. Send this file to the maintainer or attach it to your voluntary feedback form.
5. **Never copy-paste graded assignment questions, answers, or screenshots with student roll numbers into bug reports.**
