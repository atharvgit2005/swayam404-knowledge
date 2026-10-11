# swayam404-knowledge

Open, versioned, community-maintained knowledge base repository for **Swayam404** (the student-controlled SWAYAM assignment assistant extension).

This repository is designed to be hosted publicly on GitHub (e.g. `https://raw.githubusercontent.com/<owner>/swayam404-knowledge/main`) as a static, read-only dataset.

---

## 1. Repository Layout

```
swayam404-knowledge/
├── README.md                           # This guide
├── manifest.json                       # Global catalog, versions & integrity hashes
├── schema/                             # Formal JSON schemas (Draft-07)
│   ├── manifest.schema.json
│   ├── course.schema.json
│   ├── resource.schema.json
│   └── review-record.schema.json
├── courses/                            # Course knowledge packs
│   ├── index.json                      # Summary list of courses
│   ├── course-econ-101/                # Principles of Economics pack
│   │   ├── course.json                 # Course metadata & syllabus topics
│   │   ├── resources.json              # Concept summaries & worked examples
│   │   └── review-records.json         # Released past graded feedback records
│   └── course-ent-201/                # Entrepreneurship pack
│       ├── course.json
│       ├── resources.json
│       └── review-records.json
└── examples/                           # Blank templates for contributors
    ├── example-course.json
    ├── example-resources.json
    └── example-review-records.json
```

---

## 2. Integrity and Versioning Rules

- **Schema Version (`schemaVersion`)**: Incremented only when the format/structure of schemas changes.
- **Dataset Version (`datasetVersion`)**: Incremented on each publication of updated course materials using semantic versioning (`major.minor.patch`).
- **Deterministic Hashes (`contentHash`)**: Every course pack entry in `manifest.json` specifies a 64-character SHA-256 hash computed canonically over `{ courseId, coursePackVersion, course, resources, reviewRecords }`.
- **Atomic Caching**: The Swayam404 extension verifies these hashes before committing any downloaded pack to local storage.

---

## 3. Strict Educational and Ethical Boundaries

### Prohibited Content
- **NO Active Assessment Answer Keys**: Never commit answer keys or questions for currently ongoing, unreleased, or active graded quizzes.
- **NO Unreleased Materials**: Only publish materials that are either explicitly released or authorized under open educational licenses.
- **NO Student Identifiers**: No roll numbers, email addresses, cookies, tokens, or personal identifiers may appear anywhere in this dataset.

### Released-Assessment Review Records
- Past assessment records must have:
  - `isReleased: true`
  - Explicit provenance and license metadata
  - Verification status (`portal-confirmed`, `instructor-provided`, `source-supported`, or `needs-review`)
- A student's previous selection is **not** evidence of correctness by itself. Portal-confirmed status requires authoritative platform verification feedback.

---

## 4. Local Validation Instructions

To validate all schemas, packages, and hashes locally before opening or merging a pull request:

```bash
# In the Swayam404 root directory:
node scripts/validate-contributions.mjs knowledge-base

# Or validate a specific exported contribution package:
node scripts/validate-contributions.mjs path/to/contribution_package.json
```

---

## 5. Community Contribution Workflow (Phase 3)

### How Contributors Submit Learning Resources
1. In Swayam404, go to **More ▾** -> **Import / Export** -> **Community Knowledge Contributions** (or **Capture Graded Answers** -> **Propose Community Knowledge**).
2. Preview proposed resources, review provenance metadata, license (`CC-BY-4.0` / `CC-BY-NC-4.0`), and check conflict diagnostics.
3. Click **Export Contribution Package (.json)** and **Copy PR Summary**.
4. Fork this repository on GitHub.
5. Place the exported resources into `knowledge-base/courses/<courseId>/`:
   - Learning materials into `resources.json`.
   - Verified past assessment feedback into `review-records.json`.
   - Course outline / syllabus into `course.json`.
6. Recompute the course's canonical SHA-256 integrity hash and update `manifest.json`.
7. Open a GitHub Pull Request and paste the copied PR Summary.

### Maintainer Review & Acceptance Process
1. **Automated CI**: GitHub Actions (`.github/workflows/validate.yml`) runs schema checks, SHA-256 integrity verification, and sensitive data scans.
2. **Provenance & License**: Ensure the declared license is open educational and attribution is provided.
3. **Assessment Release Verification**: Confirm that all review records have `isReleased: true` and explicit portal verification (`portal-confirmed`). Rejects any unreleased active assignment keys.
4. **Merge & Tag**: Once approved, merge to `main`. Increment `datasetVersion` in `manifest.json` using semantic versioning.

---

## 6. How Swayam404 Connects to this Repository

1. Open **Swayam404** in your browser.

2. Navigate to **More ▾** -> **Settings**.
3. Under **Shared Knowledge Base (Repository Sync)**:
   - Enable the toggle.
   - Set the raw repository URL:
     `https://raw.githubusercontent.com/<owner>/swayam404-knowledge/main`
   - Click **Sync Knowledge Base**.
4. The extension fetches `manifest.json`, downloads changed packs, validates integrity hashes, and caches them offline.

---

## 7. Production Course Packs & Ingestion (Phase 4)

### Supported Input Formats
- **Markdown Notes (`markdown-notes`)**: Course notes, lecture summaries with frontmatter or Markdown headers.
- **Study Guides (`study-guide`)**: Student-authored guides and high-level concept summaries.
- **Transcript Excerpts (`transcript-excerpt`)**: Verified video transcript excerpts with lecture numbers and timestamps.
- **Instructor Notes (`instructor-notes`)**: Authorized slides/handouts provided for open distribution.
- **Worked Examples (`worked-example`)**: Step-by-step mathematical calculations and formulations.
- **Official References (`official-reference`)**: Citations and summaries of external authoritative resources.
- **Structured Metadata (`structured-metadata`)**: Course syllabus outlines with units, weeks, lectures, and topics.
- **Contribution Packages (`contribution-package`)**: JSON packages exported from the in-extension contribution workflow.

### Stable Chunking & Hierarchy
- **Resource IDs**: `res-<courseId>-<slug>-<shortHash>`
- **Chunk IDs**: `<resourceId>-chunk-<index>`
- Long resources are split into bounded searchable chunks (target ~400 characters), preserving mathematical formulas and parent provenance.

### Maintainer CLI Commands
```bash
# Validate course packs and manifest hashes without modifying files
node scripts/build-course-packs.mjs knowledge-base --check-only

# Build, recalculate SHA-256 hashes, and update manifest.json and courses/index.json
node scripts/build-course-packs.mjs knowledge-base

# Full contribution and sensitive data audit
node scripts/validate-contributions.mjs knowledge-base
```

### Intelligent Synchronization & Scaling
- **Conditional HTTP (ETag & 304)**: Caches `ETag` and `Last-Modified` headers to avoid downloading unchanged manifests or packs.
- **Course-Selective Sync**: Students only download the packs for their selected courses.
- **Partial Failure Resilience**: Network or validation failure for one course preserves its previously valid cache while continuing other courses.
- **Concurrent Sync Guard**: Active single-flight lock deduplicates concurrent background or UI sync triggers.
- **Inverted Chunk Index**: Scalable `ResourceChunkIndex` provides O(1) candidate lookup and sub-2ms query latency on >500 resource chunks.

