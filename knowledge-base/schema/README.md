# Knowledge Base Schema Reference

This directory contains formal JSON Schema (Draft-07) specifications governing all knowledge base payloads.

---

## 1. `manifest.schema.json`
- **Location**: `schema/manifest.schema.json`
- **Purpose**: Defines root repository catalog.
- **Key Fields**:
  - `schemaVersion`: string (`"1.0.0"`).
  - `datasetVersion`: semver string (`"1.0.0"`).
  - `publishedAt`: ISO 8601 date.
  - `courses`: array of catalog entries.
  - `contentHash`: SHA-256 hex string (64 characters).

---

## 2. `course.schema.json`
- **Location**: `schema/course.schema.json`
- **Purpose**: Metadata for an individual course.
- **Key Fields**:
  - `courseId`: stable alphanumeric ID (`course-econ-101`).
  - `courseTitle`: full display title.
  - `externalCourseId`: portal course identifier.
  - `topics`: array of concept tags.
  - `coursePackVersion`: semver string.

---

## 3. `resource.schema.json`
- **Location**: `schema/resource.schema.json`
- **Purpose**: Array of learning support materials.
- **Permitted `resourceType` Values**:
  - `concept-summary`
  - `lecture-notes`
  - `transcript-excerpt`
  - `official-reference`
  - `learning-objective`
  - `worked-example`
  - `practice-explanation`
- **Provenance Requirements**:
  - `sourceTitle`, `license`, `retrievalDate` are strictly mandatory.

---

## 4. `review-record.schema.json`
- **Location**: `schema/review-record.schema.json`
- **Purpose**: Post-assessment review records from past graded and released quizzes.
- **Critical Requirements**:
  - `isReleased`: must be `true`.
  - `verificationStatus`: enum (`portal-confirmed`, `instructor-provided`, `source-supported`, `needs-review`).
  - `redistributionPermission`: explicit notice.
  - Prohibited from distributing keys for active assignments.
