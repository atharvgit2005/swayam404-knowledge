# Swayam404 Community Knowledge Contributions Guide

This document describes the complete lifecycle, data contracts, and verification rules for contributing to the shared learning knowledge base in **Swayam404**.

---

## 1. Contribution Lifecycle & State Machine

Contributions move through explicit staged states to ensure quality, security, and safety:

```
[Draft]
   │
   ▼
[Pending Validation]
   │
   ├─► [Validation Failed] (contains schema errors, missing provenance, or restricted permission)
   │
   ▼
[Ready for Review] (passes all schema, hash, and permission checks; no critical conflicts)
   │
   ├─► [Approved for Publication] (maintainer review passed)
   ├─► [Rejected] (fails community guidelines, unreleased answers, or duplicate)
   │
   ▼
[Exported] (portable JSON package and GitHub PR description created by student)
   │
   ▼
[Published] (ONLY when merged to main branch and confirmed by independent manifest sync)
```

> [!IMPORTANT]
> **Exported != Published**: Generating an export file locally never marks a contribution as "Published". Publication requires maintainer review, Git commit, SHA-256 manifest hash update, and public repository deployment.

---

## 2. Permitted vs Prohibited Content

### Eligible Resources
- **Concept Summaries**: Key definitions, theorem explanations, and formulas authored by students or instructors.
- **Student Lecture Notes**: Summarized notes from public NPTEL/SWAYAM lectures.
- **Worked Examples**: Solved numerical problems and step-by-step walkthroughs.
- **Attributed References**: Links and citations to standard open textbooks.
- **Released Assessment Reviews**: Past assignment questions that have been **officially graded and released** by the portal with explicit correct-answer feedback.

### Strictly Prohibited
- **NO Active Assessment Answer Keys**: Active, ongoing, or unreleased assignment questions/answers are strictly rejected.
- **NO Student Selections as Verification**: A student's previous selection is NOT proof of correctness. Only explicit portal feedback (`portal-confirmed`) qualifies.
- **NO Student Identifiers or Credentials**: Never include roll numbers, names, email addresses, cookies, session IDs, bearer tokens, or API keys (`AIza...`, `sk-...`, `xai-...`).
- **NO Scraped Raw Web Pages**: Bulk page HTML, scripts, or full copyrighted textbooks cannot be exported.

---

## 3. Data Contracts & Export Packaging

A contribution export package is a self-contained JSON document structured as follows:

```json
{
  "manifest": {
    "schemaVersion": "1.0.0",
    "packageVersion": "1.0.0",
    "exportTimestamp": "2026-10-11T12:00:00.000Z",
    "courseId": "course-econ-101",
    "courseTitle": "Principles of Economics",
    "resourceCount": 1,
    "reviewRecordCount": 1,
    "resourceIds": ["res-econ-101-notes-1"],
    "reviewRecordIds": ["rev-econ-101-quiz1-1"],
    "contentHashes": {
      "res-econ-101-notes-1": "48ff393d2b67e2aa..."
    },
    "validationSummary": {
      "isValid": true,
      "errorCount": 0,
      "warningCount": 0
    },
    "requiresMaintainerApproval": true,
    "repositoryDestination": {
      "basePath": "courses/course-econ-101/",
      "resourcesFile": "courses/course-econ-101/resources.json",
      "reviewRecordsFile": "courses/course-econ-101/review-records.json",
      "courseFile": "courses/course-econ-101/course.json"
    }
  },
  "resources": [...],
  "reviewRecords": [...]
}
```

---

## 4. Conflict & Duplicate Resolution

The `ConflictService` evaluates candidate contributions against existing course packs using:

1. **Exact Duplicate (`exact-duplicate`)**: Matching SHA-256 `contentHash` or identical question fingerprint.
2. **ID Collision (`id-collision`)**: Same `resourceId` but different content.
3. **Contradictory Verification (`contradictory-verification`)**: Record claims Option A is correct, but existing verified pack specifies Option B.
4. **Similarity Warning (`similarity-warning`)**: High token/text overlap (>85%) but not identical.

> [!NOTE]
> The extension never silently merges or deletes similar records. Maintainers and contributors must make an explicit decision: **Update**, **Keep Separate**, or **Reject**.

---

## 5. Maintainer Review CLI Tooling

Maintainers can validate proposed packages or the entire dataset locally:

```bash
# Validate entire knowledge base
node scripts/validate-contributions.mjs knowledge-base

# Validate an exported contribution package file
node scripts/validate-contributions.mjs path/to/contribution.json
```

All 25 unit and lifecycle tests can be executed with:

```bash
npm test -- src/test/knowledge-contribution-lifecycle.test.ts
```
