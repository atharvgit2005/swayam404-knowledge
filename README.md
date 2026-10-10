# swayam404 — SWAYAM Assignment Assistant (Chrome Extension)

A student-controlled, privacy-focused Chrome Extension (Manifest V3) built with **React**, **TypeScript**, and **Vite** designed to eliminate repetitive navigation and manual re-entry on SWAYAM assignments across multiple courses.

---

## ⚡ Core Philosophy & Safety Guarantees

1. **Explicit Student Approval Only**: The extension identifies questions and matches answers from your course answer bank, but **populates only fields you explicitly review and approve**.
2. **Strict Zero Auto-Submit Policy**: The extension **never** clicks `Submit`, `Final Submit`, or `Complete Assignment`. You review the completed form and submit through the platform's normal interface yourself.
3. **Zero Credential Harvesting**: The extension never requests, reads, or transmits your SWAYAM session cookies, passwords, tokens, or personal identifiers. It operates directly within your normal, already-authenticated browser tab.
4. **Strict Course Isolation**: Economics answer banks will never populate an Entrepreneurship assignment even if wording seems similar. Each course maintains an independent, isolated answer bank.
5. **100% Local by Default**: All course profiles, questions, and match history stay in your browser's local extension storage.

---

## 🏗️ Product Architecture

```
swayam404/
├── .planning/                     # GSD Specification & Roadmaps
│   ├── PROJECT.md
│   ├── REQUIREMENTS.md
│   ├── ROADMAP.md
│   └── STATE.md
├── dist/                          # Production Chrome Extension (Unpacked)
│   ├── manifest.json              # Manifest V3
│   ├── background.js              # Service Worker (lifecycle & storage seeds)
│   ├── content.js                 # Standalone IIFE Content Script & Site Adapter
│   ├── popup.html                 # Extension Popup Entry
│   ├── sidepanel.html             # Extension Side Panel Entry (Chrome 114+)
│   ├── assets/                    # Compiled React UI & Dark Charcoal CSS
│   ├── fixtures/                  # Local Mock Assignment HTML Pages
│   └── sample-data/               # Sample JSON Answer Banks
├── public/
│   ├── manifest.json              # Extension Manifest V3
│   ├── fixtures/                  # Standalone Assignment HTML Fixtures
│   ├── icons/                     # 16, 48, 128 px PNG Icons
│   └── sample-data/               # Economics & Entrepreneurship sample JSONs
├── scripts/
│   ├── build.js                   # Multi-target Extension Bundler
│   └── generate-icons.js          # Pure Node PNG Icon Generator
├── src/
│   ├── adapters/                  # Site-specific DOM parsing & Safe Input Dispatch
│   │   └── index.ts               # SwayamPortalAdapter & ISiteAdapter
│   ├── background/                # Extension Background Service Worker
│   ├── content/                   # Content Script message handler
│   ├── components/                # Header, Navigation, Reusable Cards & Badges
│   ├── features/
│   │   ├── dashboard/             # Overview, active course status, test launch
│   │   ├── scanner/               # Assignment scanner, match review, population
│   │   ├── courses/               # Course Library (Economics, Minor, Custom)
│   │   ├── answer-bank/           # JSON Import/Export with schema validation
│   │   └── settings/              # Privacy statement, local storage reset, AI toggles
│   ├── lib/
│   │   ├── matching/              # Layered Matching Engine (Levels 1, 2, 3)
│   │   └── storage/               # Versioned Chrome Storage & Fallback
│   ├── popup/                     # React root & App coordinator
│   ├── sample-data/               # Fictional sample banks for Economics & Minor
│   ├── test/                      # Vitest Unit and Integration Suite
│   └── types/                     # Shared TypeScript models
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🎯 3-Level Question Matching Engine

| Level | Strategy | Handling |
|---|---|---|
| **Level 1** | **Exact Normalized Match** | Normalizes leading numbers (`1.`, `Q1:`), punctuation, and casing. Preserves math operators, numbers, and negations. Option matching verifies that saved answer text exists in visible choices regardless of shuffled order. |
| **Level 2** | **Conservative Text Similarity** | Deterministic token-overlap and bigram Sørensen–Dice scoring (conservative threshold $\ge 0.82$). Tagged as **Probable Match — Review Required**. Unapproved by default. |
| **Level 3** | **Ambiguity & Conflict Detection** | Detects changes in numerical values (e.g. `10%` vs `20%`) or negation inversions (`NOT`, `EXCEPT`). Flags missing options or close candidate ties as **Ambiguous Match**. |

---

## 🚀 Quickstart: Install & Build

### 1. Requirements
- Node.js $\ge 18$
- npm $\ge 9$
- Google Chrome (or Chromium-based browser)

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Automated Tests
```bash
npm test
```
*Executes all 24 Vitest tests covering normalization, exact matching, option reordering, token conflict detection, course isolation, schema validation, and safe non-submitting DOM population.*

### 4. Build Production Extension
```bash
npm run build
```
*Outputs the complete, self-contained Manifest V3 extension bundle into the `dist/` directory.*

---

## 🔌 How to Load the Extension in Google Chrome

1. Open Google Chrome.
2. Navigate to: `chrome://extensions` (or click Menu $\rightarrow$ Extensions $\rightarrow$ Manage Extensions).
3. Toggle on **Developer mode** in the top right corner.
4. Click the **Load unpacked** button in the top left.
5. Select the **`dist`** folder inside the project directory:
   `/Users/atharvpaharia100/Desktop/Projects/swayam404/dist`
6. Pin **swayam404** to your browser toolbar!

---

## 🧪 Testing with Local Assignment Fixtures

Because real SWAYAM portals require student authentication and active course enrollment, two complete local mock assignment pages are included in the build:

1. **Economics Assignment Fixture**:
   - Location: `dist/fixtures/economics-assignment.html`
   - Features: Radio questions with shuffled options, multiple-choice checkboxes, true/false, short text input, and an unmatched question.
   - Includes a red **Final Submit** button with an alert listener proving the extension never clicks it.

2. **Entrepreneurship Minor Assignment Fixture**:
   - Location: `dist/fixtures/entrepreneurship-assignment.html`
   - Features: Minor course questions testing MVP, burn rate, Business Model Canvas, and CAC.

### Step-by-Step Test Walkthrough:
1. Load unpacked `dist/` in Chrome.
2. In Chrome, open `dist/fixtures/economics-assignment.html` (or click **Economics Mock Page** from the extension Dashboard).
3. Open the **swayam404** extension popup (or side panel).
4. Verify the active course is **Economics (Common Course)**.
5. Go to **Import / Export** $\rightarrow$ click **Load Economics Sample** (or import `src/sample-data/economics-sample.json`).
6. Click **Scan Active Page**.
7. Observe the scan results:
   - Q1 to Q5 are classified as **Exact Match**.
   - Q6 is clearly marked as **Unmatched**.
8. Notice that the exact matches have their approval checkboxes checked, while unmatched/ambiguous questions do not.
9. Click **Populate Selected Answers**.
10. Confirm in the dialog. The form fields on the page will automatically check and fill in!
11. Observe that the red **Final Submit** button remains untouched. You can review the responses and click Submit manually.
12. Now switch the course to **Entrepreneurship** and scan the Economics tab:
    - 0 questions will match, demonstrating **Strict Course Isolation**!

---

## 📥 Answer Bank JSON Format

Exported and imported answer banks adhere to the `v1.0.0` schema:

```json
{
  "version": "1.0.0",
  "app": "swayam404",
  "exportedAt": "2026-03-01T10:00:00.000Z",
  "courses": [
    {
      "id": "course-econ-101",
      "name": "Economics (Common Course)",
      "externalCourseId": "SWAYAM-ECON-CORE",
      "description": "Shared core course for micro/macroeconomics assignments"
    }
  ],
  "questions": [
    {
      "id": "q-1",
      "courseId": "course-econ-101",
      "questionText": "What happens to the demand curve of a normal good when consumer income increases?",
      "questionType": "single-choice",
      "options": [
        "Shifts to the left",
        "Shifts to the right",
        "Remains unchanged",
        "Becomes perfectly inelastic"
      ],
      "correctOptions": [
        "Shifts to the right"
      ],
      "explanation": "Higher income increases purchasing power for normal goods.",
      "reviewStatus": "verified",
      "source": "Assignment 1"
    }
  ]
}
```

---

## 🛡️ Privacy & Technical Guarantees

- **No Remote JavaScript**: The extension loads 0% remote scripts. Everything is pre-bundled in accordance with Chrome Web Store MV3 policy.
- **Controlled Event Dispatching**: Dispatches native `input`, `change`, and `click` events with React value-tracker overrides so modern controlled forms register populated choices without dropping state.
- **Optional AI-Assisted Review**: Pluggable support for local LLM proxies (e.g. Ollama `http://localhost:11434`) to explain unmatched questions. **Disabled by default**.

---

## ⚠️ Known Limitations & Portal Notes

- Real SWAYAM assignments render across several slightly varying NPTEL/Swayam portal templates. The `SwayamPortalAdapter` supports containers matching `.gcb-form-element`, `.qt-question`, `.assignment-question`, `.question-card`, and semantic `<fieldset>` blocks.
- If an untested SWAYAM course layout uses heavily custom shadow DOM or non-standard canvas rendering, open an issue or update the container selectors in `src/adapters/index.ts`.
