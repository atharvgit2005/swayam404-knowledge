# Requirements — swayam404

## Functional Requirements
- **FR-1: Course Management**
  - CRUD operations for courses.
  - Initial default courses: Economics (Shared/Common), Entrepreneurship (Minor).
  - Selected course persisted in storage.
  - Strict course isolation (Economics answer bank never matches Entrepreneurship questions).

- **FR-2: Answer-Bank Schema & Storage**
  - Strongly typed schema for `Course` and `QuestionRecord`.
  - Question types: `single-choice`, `multiple-choice`, `true-false`, `short-text`.
  - Content-based answers (store option text/meaning, not brittle indices like "B").
  - Explanation, review status, source, and timestamps stored.
  - Versioned storage model (`v1`) with Chrome Local Storage persistence.

- **FR-3: Import / Export**
  - Export single course or full backup to versioned JSON.
  - Import JSON with schema validation, course preview, and question count.
  - Merge vs Replace strategies.
  - Duplicate detection.
  - Clear validation error reporting.

- **FR-4: Assignment Scanning (Content Script & Site Adapter)**
  - Active tab verification and safe messaging.
  - Semantic question container discovery.
  - Radio, checkbox, select, and text input extraction with label resolution.
  - Site adapter pattern decoupling SWAYAM / mock selectors from core business logic.
  - Multiple question discovery per page.

- **FR-5: 3-Level Matching Engine**
  - Level 1: Normalized exact text matching.
  - Level 2: Deterministic conservative similarity.
  - Level 3: Ambiguity detection (numerical differences, negation detection like 'not'/'except', altered options).
  - Strict status badges: Exact Match, Probable Match (Review Required), Ambiguous Match, No Match, Unsupported Type.

- **FR-6: Match Review Interface**
  - Question list with question number, type, status badge, matched saved answer, current choices.
  - Filterable by match status.
  - Granular checkboxes for student approval.
  - Metrics: Total scanned, exact matches, requiring review, unmatched, selected for population.
  - Manual correction / answer selection capability.

- **FR-7: Safe Approved Form Population**
  - Populates ONLY approved fields upon student clicking "Populate Selected Answers".
  - Dispatches native `input`, `change`, `click` events with full React/framework controlled input support.
  - Reports success, failure, and skipped count per field.
  - Absolutely NO auto-submission, no clicking "Submit", no background form submission.

- **FR-8: Optional AI-Assisted Review Architecture**
  - Pluggable interface for explaining unmatched questions and proposing candidate answers.
  - Disabled by default, requiring explicit user API key/proxy config.
  - Never auto-populates AI answers without explicit user review and saving.

- **FR-9: Test Fixtures & Local Mocking**
  - Standalone mock assignment HTML pages representing SWAYAM assignment formats.
  - Unit and integration tests demonstrating scanning, matching, isolation, and population.
