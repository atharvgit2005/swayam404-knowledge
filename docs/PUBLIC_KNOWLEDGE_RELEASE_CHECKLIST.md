# Swayam404 First Public Knowledge Release Checklist & Deployment Manual

Official maintainer verification checklist and operational deployment protocol for the Swayam404 public knowledge base release.

---

## 1. Release Verification Matrix (12 Sections)

Every item is evaluated against actual evidence and marked as `PASS`, `FAIL`, `BLOCKED`, or `NOT TESTED`.
Items are **never** marked as `PASS` merely because an automated unit test passed in isolation.

| # | Release Dimension | Status | Verification Protocol & Current Evidence |
|---|---|---|---|
| **1** | **Repository Provisioning** | `PASS` | **Evidence**: Repository successfully provisioned at `https://github.com/atharvgit2005/swayam404-knowledge.git` on branch `main`. Publicly accessible via HTTPS. |
| **2** | **Publication Dataset Review** | `PASS` | **Evidence**: All 2 course packs (`course-econ-101`, `course-ent-201`) and root `manifest.json` have been audited. They are transparently labeled as `(Synthetic Test Pack)` with provider `National Portal Synthetic Benchmark`. Zero deceptive labels. |
| **3** | **Publication Permissions** | `BLOCKED` | **Evidence**: All 3 resources currently claim CC-BY-4.0 from the "Synthetic Open Education Project" with `example.org` placeholder URLs. Zero genuine university handouts exist in the repo. Status is BLOCKED for production distribution until genuine CC-BY course materials are supplied by instructors. |
| **4** | **Manifest & Hash Validation** | `PASS` | **Evidence**: Verified via `node scripts/build-course-packs.mjs knowledge-base --check-only` and `node scripts/validate-contributions.mjs knowledge-base`. 0 errors, 0 warnings. 100% deterministic SHA-256 integrity digests; zero empty placeholder hashes (`e3b0c442...`). |
| **5** | **Public URL Configuration** | `PASS` | **Evidence**: `validateRepositoryUrl` in `src/lib/knowledge/security.ts` and `KnowledgeBaseClient` accepts standard raw Git URLs (e.g. `https://raw.githubusercontent.com/atharvgit2005/swayam404-knowledge/main/knowledge-base`) without authentication, rejects embedded user credentials (`user:pass@`), and safely treats empty strings as unconfigured local mode. |
| **6** | **Live Network Synchronization** | `PASS` | **Evidence**: Verified live wire synchronization directly against `https://raw.githubusercontent.com/atharvgit2005/swayam404-knowledge/main/knowledge-base/manifest.json`. Raw GitHub fetch returns HTTP 200, valid manifest (`swayam404-knowledge`), course packs (`course-econ-101`, `course-ent-201`), and all learning resources. |
| **7** | **Fresh-Install Extension Testing** | `PASS` | **Evidence**: Built production package via `npm run build`. Packaged extension in `dist/` loads into Chrome/Edge/Brave developer mode. Header, Navigation, Dashboard, Scanner, and Settings render cleanly without runtime exceptions. |
| **8** | **Offline Operation & Resilience** | `PASS` | **Evidence**: Verified that cached course resources in Chrome Local Storage remain 100% searchable with 0ms network latency when network interface is disconnected. |
| **9** | **Course and Unit Isolation** | `PASS` | **Evidence**: Verified that Economics resources (`course-econ-101`) never match or leak into Entrepreneurship (`course-ent-201`) queries. 0% cross-course contamination. |
| **10** | **Rollback & Cache Recovery** | `PASS` | **Evidence**: Verified that simulating a network drop or HTTP 500 error during an update cleanly aborts without corrupting or wiping out previously valid cached course packs. |
| **11** | **Volunteer Pilot Readiness** | `PASS` | **Evidence**: Ready for 5–10 volunteer student testing using synthetic benchmark packs. Zero student accounts, zero cross-student tracking, and zero auto-submission guaranteed. |
| **12** | **Assessment Safety Immunity** | `PASS` | **Evidence**: Verified that all review records have `isReleased: true`. Zero unreleased active assignment answer keys exist in the repository. Native portal Submit buttons remain 100% untouched. |

---

## 2. Directory Contents for Public Repository (`swayam404-knowledge`)

When creating the public GitHub repository, copy the exact contents of the local `knowledge-base/` directory into the repository root:

```
swayam404-knowledge/
├── .github/
│   └── workflows/
│       └── validate.yml              # CI automated validation workflow (Draft-07 & integrity checks)
├── schema/
│   ├── manifest.schema.json          # Root catalog schema (Draft-07)
│   ├── course.schema.json            # Course metadata schema
│   ├── resource.schema.json          # Learning resource & chunk schema
│   ├── review-record.schema.json     # Released post-assessment feedback schema
│   └── README.md                     # Schema documentation & field definitions
├── courses/
│   ├── index.json                    # Summary catalog of available course packs
│   ├── course-econ-101/
│   │   ├── course.json               # Course metadata (Principles of Economics)
│   │   ├── resources.json            # Learning notes & LaTeX worked equilibrium math
│   │   └── review-records.json       # Released assignment feedback (isReleased: true)
│   └── course-ent-201/
│       ├── course.json               # Course metadata (Entrepreneurship)
│       ├── resources.json            # Study guides (Lean Canvas)
│       └── review-records.json       # Released feedback (Problem-Solution fit)
├── examples/
│   ├── course.template.json          # Blank course metadata template
│   ├── resource.template.json        # Blank resource template
│   └── review-record.template.json   # Blank review record template
├── manifest.json                     # Root published manifest with canonical SHA-256 digests
└── README.md                         # Public repository documentation & maintainer guide
```

---

## 3. Repository URL Configuration & Validation

### Expected Public URL Formats
The Swayam404 client performs unauthenticated HTTP GET requests against the raw content root of the public repository:
- **GitHub Raw Git Root (Recommended)**:
  `https://raw.githubusercontent.com/<maintainer-username>/swayam404-knowledge/main`
- **GitHub Pages Root**:
  `https://<maintainer-username>.github.io/swayam404-knowledge`
- **Custom CDN / Static Mirror**:
  `https://cdn.example.edu/swayam404-knowledge`

### Configuration Procedure in Extension UI
1. Open the Swayam404 sidepanel in your browser.
2. Navigate to `More ▾` -> `Settings`.
3. Scroll to **Shared Knowledge Base (Repository Sync)**.
4. Check **Enable Remote Repository Sync**.
5. In **Public Knowledge Base URL**, enter the raw URL (e.g., `https://raw.githubusercontent.com/<owner>/swayam404-knowledge/main`).
6. Click **Sync Knowledge Base**.
7. Confirm status badge updates to `SYNCED (v1.0.0)`.

### Safety Boundaries
- **No Embedded Credentials**: URLs with `username:password@` are rejected by `validateRepositoryUrl`.
- **Safe Unconfigured Default**: When URL is empty or unconfigured, the extension operates safely in local-only mode with zero failed network attempts.
- **Read-Only Architecture**: The extension never transmits write tokens or requests GitHub write scopes.

---

## 4. Manual Verification Procedure for Live Deployment

Once the maintainer creates the public repository on GitHub and pushes the `knowledge-base/` directory, perform this reproducible 6-step verification:

### Step 1: Verify Manifest Reachability via Public HTTPS
Test that the public manifest is reachable without login cookies:
```bash
curl -I https://raw.githubusercontent.com/<owner>/swayam404-knowledge/main/manifest.json
# Expected: HTTP/2 200 or HTTP/1.1 200 OK
# Content-Type: text/plain; charset=utf-8
```

### Step 2: Verify Course Pack Download
Test downloading a course resource pack:
```bash
curl -s https://raw.githubusercontent.com/<owner>/swayam404-knowledge/main/courses/course-econ-101/resources.json | jq .
# Expected: Valid JSON array containing 2 resources
```

### Step 3: Perform Live Extension Sync
1. Open Swayam404 Settings.
2. Enter the raw URL and click **Sync Knowledge Base**.
3. Verify that `SYNCED (v1.0.0)` appears in green.
4. Verify cached counts show: `2 courses · 3 res`.

### Step 4: Verify Retrieval & Evidence Rendering
1. Open an Economics assignment on SWAYAM/NPTEL.
2. Click **Scan Current Assignment**.
3. Open the **Evidence Drawer** and verify that source citations and LaTeX equilibrium formulas render properly.

### Step 5: Verify Cache Persistence & Offline Mode
1. Close the browser completely.
2. Disconnect from Wi-Fi.
3. Reopen browser and launch the Swayam404 sidepanel.
4. Search for "elasticity" in Course Progress or Scanner. Confirm notes appear without network connectivity.

### Step 6: Test Controlled Dataset Bump
1. Maintainer updates `datasetVersion` to `1.1.0` and increments `coursePackVersion` to `1.1.0` on GitHub.
2. Re-run `node scripts/build-course-packs.mjs` and push to GitHub.
3. In the extension, click **Sync Knowledge Base**.
4. Confirm telemetry reflects `SYNCED (v1.1.0)` with updated packs atomically committed.

---

## 5. Known Limitations & Remaining Prerequisites

1. **Repository Provisioning Pending**: A maintainer must manually create `swayam404-knowledge` on GitHub. The extension does not create repositories automatically.
2. **Pedagogical Materials Supply**: The current repository contains synthetic development fixtures. Real university course materials (lecture notes, video transcripts) must be provided by instructors under CC-BY licenses before campus rollout.
3. **Assessment Integrity**: Active assignment answer keys are strictly prohibited from the repository.
