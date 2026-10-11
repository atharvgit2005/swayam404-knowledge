# Swayam404 Shared Knowledge Base Architecture & Operator Guide

This document specifies the architecture, data contracts, security model, and publication workflows for the Swayam404 Shared Knowledge Base Foundation (Phase 1).

---

## 1. Architectural Overview

The Swayam404 Shared Knowledge Base decouples static educational domain knowledge from the extension binary and local browser storage. It enables versioned, community-maintained course packs hosted on any public Git service (e.g., GitHub) without requiring backend infrastructure, accounts, or proprietary sync servers.

```
┌────────────────────────────────────────────────────────┐
│  Public Remote Repository (e.g. swayam404-knowledge)   │
│  - manifest.json (versions, catalog, content hashes)   │
│  - schema/*.schema.json                                │
│  - courses/<courseId>/course.json                      │
│  - courses/<courseId>/resources.json                   │
│  - courses/<courseId>/review-records.json              │
└───────────────────────────┬────────────────────────────┘
                            │ Read-Only HTTP GET
                            ▼
┌────────────────────────────────────────────────────────┐
│  KnowledgeBaseClient (src/lib/knowledge/client.ts)     │
│  - Configurable repository root URL                    │
│  - Request timeout (default: 8s) & bounded retries     │
│  - Zero authentication / No tokens / Read-only         │
└───────────────────────────┬────────────────────────────┘
                            │ Raw JSON text
                            ▼
┌────────────────────────────────────────────────────────┐
│  KnowledgeValidator (src/lib/knowledge/validator.ts)   │
│  - Schema version check (v1.0.0)                       │
│  - Deterministic semver parsing (X.Y.Z)                │
│  - Path traversal rejection (no '..', absolute paths)  │
│  - Content hash verification (SHA-256)                 │
│  - Enforces isReleased=true on review records          │
└───────────────────────────┬────────────────────────────┘
                            │ Validated Data Pack
                            ▼
┌────────────────────────────────────────────────────────┐
│  KnowledgeCacheService (src/lib/knowledge/cache.ts)    │
│  - Compares datasetVersion and course contentHashes    │
│  - Skips downloading unchanged packs                   │
│  - Atomic commit to chrome.storage.local               │
│  - Retains last valid cache on ANY failure             │
└───────────────────────────┬────────────────────────────┘
                            │ Query API (courseId scoped)
                            ▼
┌────────────────────────────────────────────────────────┐
│  KnowledgeBaseService (src/lib/knowledge/service.ts)   │
│  - searchResources(courseId, query)                    │
│  - getCourseResources(courseId)                        │
│  - getReleasedReviewRecords(courseId) (isolated!)      │
└────────────────────────────────────────────────────────┘
```

---

## 2. Schemas and Data Models

### 2.1 Manifest Schema (`manifest.json`)
The root manifest declares the catalog of published courses, dataset versions, and SHA-256 integrity hashes:
- `schemaVersion`: Version of the schema structure (current: `"1.0.0"`).
- `datasetVersion`: Semantic version of the data release (e.g., `"1.0.0"`). Deterministically parsed and compared numerically (never lexicographically).
- `publishedAt`: ISO 8601 publication timestamp.
- `courses`: Array of available course pack metadata entries with relative file paths and 64-character SHA-256 checksums.

### 2.2 Course Schema (`course.json`)
- `courseId`: Stable unique ID matching extension course identifiers (`course-econ-101`, `course-ent-201`).
- `courseTitle`: Official course display title.
- `externalCourseId`: Portal identifier (`SWAYAM-ECON-CORE`).
- `topics`: Array of concept keywords.
- `learningObjectives`: Competencies delivered by the course.

### 2.3 Learning Resources Schema (`resources.json`)
Supported pedagogical resource types:
1. `concept-summary`: Concise definitions of key principles.
2. `lecture-notes`: Structured notes from lecture slides.
3. `transcript-excerpt`: Short, authorized quotes from lecture audio/video.
4. `official-reference`: Links and citations to standard textbooks.
5. `learning-objective`: Unit competency goals.
6. `worked-example`: Step-by-step problem derivations.
7. `practice-explanation`: Explanatory walkthroughs of practice concepts.

**Provenance Requirements**:
Every resource requires explicit provenance:
- `sourceTitle`
- `license` (e.g., `CC-BY-4.0`, `Open Educational Resources`, `Public Domain`)
- `retrievalDate` (ISO 8601)

### 2.4 Released-Assessment Review Records Schema (`review-records.json`)
Review records represent questions and learning rationales from past, already graded assignments whose official feedback has been made public:
- `recordId`: Unique identifier.
- `isReleased`: **Must be explicitly `true`**. Records without this flag are rejected.
- `verificationStatus`: Enum (`portal-confirmed`, `instructor-provided`, `source-supported`, `needs-review`).
  - *Strict Rule*: A student's prior answer choice is **never** considered `portal-confirmed` by itself. Portal-confirmed requires explicit correctness markers from platform feedback.
- `redistributionPermission`: Explicit statement confirming release.
- **Isolation Policy**: Review records are strictly segregated from active assignment auto-population.

---

## 3. Remote Client & Local Caching Lifecycle

### 3.1 Update Sequence
1. **Discover**: Client downloads `manifest.json` from `<repoUrl>/manifest.json`.
2. **Validate Manifest**: Checks schema version, semver format, relative path safety, and required fields.
3. **Diff Against Cache**:
   - If local `datasetVersion` and all course `contentHash` checksums match remote, sync finishes immediately with `0` downloads.
4. **Selective Download**: Changed or new course packs are fetched individually.
5. **Pack Validation & Checksum**: Each downloaded course pack is validated and its SHA-256 checksum verified against the manifest entry.
6. **Atomic Storage Commit**: Staged packs, updated manifest, and sync telemetry metadata are written to storage in a single transaction.
7. **Failure Resilience**: If any step fails (network drop, timeout, 404, schema violation, corrupted hash), the entire sync aborts and the **last valid cached state is retained 100% untouched**.

### 3.2 Offline Availability
When the browser is offline:
- Extension startup reads directly from local storage (`chrome.storage.local`).
- All previously downloaded courses, resources, and review records remain immediately searchable.
- Sync attempts report network unavailability without corrupting or deleting existing cached packs.

---

## 4. How to Create and Publish the Separate GitHub Repository

Follow these steps to establish the standalone public repository `swayam404-knowledge`:

### Step 1: Create GitHub Repository
1. On GitHub, create a new public repository named `swayam404-knowledge`.
2. Do not add private access tokens or secrets.

### Step 2: Initialize from Local Template
Copy the local `knowledge-base/` contents into your git workspace:
```bash
# In your terminal:
mkdir swayam404-knowledge
cd swayam404-knowledge
cp -r /path/to/swayam404/knowledge-base/* .
cp -r /path/to/swayam404/knowledge-base/.* .  # copy hidden dirs like .github
git init
git add .
git commit -m "feat: initial knowledge base foundation v1.0.0"
git branch -M main
git remote add origin https://github.com/<your-username>/swayam404-knowledge.git
git push -u origin main
```

### Step 3: Verify GitHub Actions
- The repository includes `.github/workflows/validate.yml`.
- On push, the workflow validates `manifest.json`, course packs, paths, and SHA-256 hashes.

### Step 4: Configure in Swayam404 Extension
1. Open Swayam404 sidepanel or popup.
2. Go to **More ▾** -> **Settings**.
3. Under **Shared Knowledge Base (Repository Sync)**:
   - Toggle **Enable Remote Repository Sync** to ON.
   - Enter your public raw repository URL:
     `https://raw.githubusercontent.com/<your-username>/swayam404-knowledge/main`
   - Click **Sync Knowledge Base**.
4. The status badge will transition to `SYNCED (v1.0.0)` displaying the count of cached packs and resources.

---

## 5. Contribution & Quality Control Workflow

When students or instructors contribute new course materials:

```
[Contributor]
     │
     ├─► Forks repository & creates course pack in courses/<courseId>/
     ├─► Verifies open license / redistribution rights
     ├─► Ensures NO active assignment answer keys are present
     ├─► Computes canonical SHA-256 hash
     ├─► Adds entry to manifest.json with incremented datasetVersion
     ▼
[Pull Request]
     │
     ├─► GitHub Actions runs validation script (.github/workflows/validate.yml)
     ├─► Checks paths, schema rules, and hash integrity
     ▼
[Maintainer Review]
     │
     ├─► Verifies educational quality and license provenance
     ├─► Confirms courseId matches standard portal taxonomy
     ├─► Merges PR to main
     ▼
[Student Extensions]
     │
     └─► Extensions discover new datasetVersion on next manual or scheduled sync
```

---

## 6. Known Limitations & Phase 2 Roadmap

### Current Scope (Phase 1)
- Read-only static fetching via HTTP GET from public raw Git URLs.
- Local caching in `chrome.storage.local`.
- Course-scoped resource retrieval and keyword search API (`KnowledgeBaseService.searchResources`).
- Released review records isolated from active assignment population.

### Future Scope (Phase 2 & 3)
- **Phase 2: Hybrid Retrieval Integration**:
  - Connect `KnowledgeBaseService` to `GraphRetrievalEngine` and `CourseMaterialRetrievalService`.
  - Expose verified knowledge excerpts as high-confidence context citations during question matching.
- **Phase 3: Community Verification Signals**:
  - Multiple corroboration sources for post-assessment explanations.
  - Granular pack updates per week/unit.
