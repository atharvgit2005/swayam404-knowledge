# swayam404 — AI-Powered SWAYAM/NPTEL Assignment Assistant (Chrome Extension)

A student-controlled, privacy-focused Chrome Extension (Manifest V3) built with **React**, **TypeScript**, and **Vite** that transforms course management on SWAYAM/NPTEL into an intelligent assistant: capturing confirmed answers from past submissions, retrieving course lecture context, requesting structured AI assistance for new quizzes, and automatically preparing quizzes without auto-submitting.

---

## ⚡ Core Philosophy & Safety Guarantees

1. **Strict Submission Immunity (Zero Auto-Submit)**: The extension **never** clicks `Submit`, `Final Submit`, or `Complete Assignment`. It never calls `form.submit()` or automates final grading. Students retain 100% review control before submission.
2. **Zero Credential Harvesting**: The extension never reads, stores, or transmits your SWAYAM session cookies, passwords, authentication tokens, or personal identifiers. It operates entirely within your existing authenticated browser tab.
3. **Strict Course Isolation**: Economics and Entrepreneurship answer banks remain completely isolated. Answers are never cross-pollinated between different courses without explicit confirmation.
4. **Local Knowledge Base by Default**: Answer banks, lecture notes, and assignment records are stored in `chrome.storage.local`. External AI requests to Google Gemini are opt-in, disabled by default, and require your explicit API key.
5. **Honest Verification States**: AI suggestions and score-only feedback are never labeled as verified. The extension distinguishes `portal-confirmed`, `student-reviewed`, `ai-suggested`, `unverified`, and `conflicted` records.

---

## 🚀 Major Upgrades & New Features

### 1. Robust Live-Page Connection & Handshake
- Fixes the `"Could not connect to page"` issue on `https://onlinecourses.swayam2.ac.in/...` and `nptel.ac.in`.
- Uses a unified `PageConnectionService`:
  - Active tab URL validation with descriptive actionable error messages.
  - PING/PONG readiness handshake between popup and content script.
  - Automatic dynamic script injection via `chrome.scripting.executeScript` fallback if content script isn't pre-loaded.
  - Concurrency locking preventing duplicate parallel scans.

### 2. Feature A — Answer Capture from Completed Assignments
- **`Capture Correct Answers` button**: Inspects submitted assignments with visible feedback.
- Detects explicit portal-confirmed answers:
  - Option-level green checkmarks and `.correct` badges.
  - Question-level `Accepted Answers:` feedback blocks.
  - Portal-provided explanations.
- **Never infers correctness from student selection alone** (student may have chosen an incorrect option).
- **Never infers correctness from score alone** (score without option indication is classified as `unverified` with a warning).
- **Interactive Capture Preview Modal**: Preview captured answers, select individual questions, and confirm target course.
- **Deduplication & Conflict Detection**: Updates existing records or flags conflicts (`conflicted`) when answers differ.

### 3. Feature B — Course Identity & Answer-Bank Readiness
- Decouples portal course identity (`onlinecourses.swayam2.ac.in/e-learning/course/ini26_cm22`), external course IDs, and local course profiles (`course-econ-101`, `course-ent-201`).
- Real-time pre-flight readiness breakdown:
  - Total stored questions.
  - Portal-confirmed records.
  - Student-reviewed records.
  - AI-suggested records.
  - Conflicted records.
  - Clear guidance when bank is empty.

### 4. Feature C — Google Gemini LLM Integration
- Pluggable `ILlmProvider` abstraction for Google Gemini.
- Configurable models: `gemini-1.5-flash` (fast & recommended), `gemini-1.5-pro`, `gemini-2.0-flash`.
- In-UI "Test Connection" button with live status feedback.
- Context-limited structured prompt sending only:
  - Detected course and topic.
  - Question text and question type.
  - Visible options list.
  - Relevant local course excerpts.
- Strict machine-readable JSON response schema:
  - `questionId`, `recommendedAnswers`, `explanation`, `evidence`, `basis`, `uncertaintyReasons`, `needsReview`.
- Rigorous output validation:
  - Hallucinated or non-existent options are rejected and flagged.
  - Single-choice constraint enforced.
  - AI reasoning without direct course evidence flags `needsReview: true`.

### 5. Feature D — Local Course-Context Retrieval
- `CourseMaterialRetrievalService`: Local keyword-relevance search across student-provided lecture notes and transcripts.
- Distinguishes actual lecture excerpts from generated AI explanations.
- Stored locally per course in `chrome.storage.local`.

### 6. Feature E — One-Click Quiz Preparation & Safe Auto-Fill
- **Primary `Prepare Quiz` action**:
  1. Identifies course, assignment, and visible questions.
  2. Matches historical verified answers.
  3. Sends unmatched questions to Gemini with retrieved course context (if AI enabled).
  4. Builds proposed answer set.
  5. If `autoApplyHighConfidence` is ON: automatically populates exact verified answers and high-evidence AI recommendations.
  6. If OFF: presents proposed choices for 1-click review and apply.
- **Checkbox unchecking**: Checks target choices AND unchecks previously pre-selected wrong choices.
- **Radio uniqueness**: Ensures single selection for single-choice questions.
- React-controlled input support via native descriptor dispatch.

---

## 🛠️ Installation in Brave / Chrome

1. Open **Brave** (or Google Chrome).
2. Go to `brave://extensions` (or `chrome://extensions`).
3. Toggle on **Developer mode** (top-right switch).
4. Click **Load unpacked** (top-left button).
5. Select the **`dist/`** directory in this repository:
   ```
   /Users/atharvpaharia100/Desktop/Projects/swayam404/dist
   ```
6. Pin **swayam404** to your browser toolbar!

---

## 🔑 Configuring Google Gemini

1. Obtain a free Gemini API key from [Google AI Studio](https://aistudio.google.com/).
2. Open the **swayam404** extension popup.
3. Navigate to the **Settings** tab.
4. Under **AI Integration (Google Gemini)**:
   - Toggle **Enable**.
   - Select your model (e.g. `gemini-1.5-flash`).
   - Paste your API key (`AIzaSy...`).
   - Click **Test Connection** to verify connectivity.
   - Click **Save AI Config**.
5. Optionally enable **Auto-Apply High-Confidence Suggestions** if you want single-click quiz preparation to automatically fill exact verified and evidence-backed answers.

---

## 🧪 Automated Testing & Verification

Run the test suite:
```bash
npm test
```

Run TypeScript type check:
```bash
npm run typecheck
```

Build production bundle:
```bash
npm run build
```

### Test Coverage (67 Automated Tests across 8 Test Suites):
- **Answer Capture (`answer-capture.test.ts`)**:
  - Explicit option indicators (`.correct`, checkmarks).
  - Accepted answers blocks below questions.
  - Complete multiple-choice sets.
  - Selected answers without feedback (not inferred as correct).
  - Score-only feedback (not verified; warning attached).
  - Short-text accepted answers.
  - Duplicate captures & metadata updating.
  - Conflict detection across differing captures.
  - Strict course isolation.
- **LLM Provider & Retrieval (`llm-provider.test.ts`)**:
  - Structured JSON response parsing.
  - Hallucinated option rejection.
  - Single-choice constraint enforcement.
  - Missing API key safety.
  - Course excerpt retrieval & ranking.
- **Page Connection & Population (`page-connection-and-fill.test.ts`)**:
  - Live SWAYAM2 URL recognition (`onlinecourses.swayam2.ac.in`).
  - Internal browser URL rejection.
  - Checkbox unchecking of incorrect pre-selections.
  - Submit button immunity.
- **Course Completion (`course-completion.test.ts`)**:
  - Outline discovery & completion detection.
  - Readiness assessment.
  - Task queue persistence & checkpoint pauses.
- **Matcher, Storage, Normalizer, and Fixture integration tests**.

---

## 📂 Included Local HTML Fixtures

1. `dist/fixtures/submitted-feedback-assignment.html`: Evaluated assignment with correct badges, accepted answer blocks, explanations, score indicators, and wrong student choices.
2. `dist/fixtures/economics-assignment.html`: Active Economics quiz with multiple-choice, radio, true/false, short text, and submit alerts.
3. `dist/fixtures/entrepreneurship-assignment.html`: Active Entrepreneurship minor assignment.
4. `dist/fixtures/economics-course-outline.html`: Multi-week syllabus with completed tasks, quizzes, and outline metadata.

---

## ⚠️ Notes & Portal Limitations

- Graded assignments must always be submitted by the student using the platform's native button.
- Live portals may occasionally change DOM class names across terms. The `SwayamPortalAdapter` supports containers matching `.gcb-form-element`, `.qt-question`, `.assignment-question`, `.question-card`, and semantic `<fieldset>` elements.
- When an assignment exposes no correct-answer feedback (e.g. before grading deadline), the extension correctly marks captured items as `unverified`.
