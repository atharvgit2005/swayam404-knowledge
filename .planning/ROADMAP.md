# Roadmap — swayam404

## Phase 1: Repository Inspection, Project Setup, Manifest, and React UI Foundation
- [ ] Initialize Vite + React + TypeScript project with extension manifest (MV3).
- [ ] Configure Vite build with entries: popup, sidepanel, content script, background service worker.
- [ ] Setup modern dark charcoal design system and responsive layout.
- [ ] Base navigation: Dashboard, Scanner, Review, Course Library, Import/Export, Settings.

## Phase 2: Course Management, Answer-Bank Schema, Local Persistence, Import/Export
- [ ] Define TypeScript models: `Course`, `QuestionRecord`, `AnswerBankExport`.
- [ ] Implement versioned Chrome Storage service with local fallback.
- [ ] Course CRUD (default Economics & Entrepreneurship profiles).
- [ ] Import/Export engine with JSON schema validation, diff/merge/replace previews, duplicate detection.
- [ ] Sample answer-bank fixture files (`sample-economics.json`, `sample-entrepreneurship.json`).

## Phase 3: Matching Engine and Comprehensive Unit Tests
- [ ] Text normalization module (whitespace, punctuation, preserving math, numbers, negations).
- [ ] Level 1 exact normalized matcher.
- [ ] Level 2 deterministic conservative similarity matcher.
- [ ] Level 3 ambiguity detector (numbers, negations, option mismatches).
- [ ] Unit test suite in Vitest testing normalization, matching, alterations, course isolation, duplicates.

## Phase 4: Site-Adapter Interface, Visible-Page Scanner, and Local Assignment Fixtures
- [ ] Site-adapter abstraction (`ISiteAdapter`).
- [ ] SWAYAM & generic HTML assignment adapter (semantic labels, radio groups, checkboxes, text fields).
- [ ] Content script and background message routing protocol.
- [ ] Local mock HTML assignment fixtures with representative questions (Economics & Entrepreneurship).

## Phase 5: Review Workflow and Approved Answer Population
- [ ] Review UI cards with status tags, diffs, explanations, manual edits.
- [ ] Filter bar and summary metrics counters.
- [ ] Batch selection and approval controls.
- [ ] Safe form population executor with React controlled input event dispatching.
- [ ] Population report modal with itemized success/failure status.

## Phase 6: Error Handling, Accessibility, Security Review, Build Verification, and Documentation
- [ ] Robust error boundaries and graceful recovery for detached tabs, unrecognized layouts.
- [ ] Security validation: no credential reading, local-only guarantee, no remote code execution.
- [ ] Vitest test execution (all passing).
- [ ] Production extension build verification (`dist/`).
- [ ] Comprehensive README with load-unpacked instructions, workflow guide, and verification steps.
