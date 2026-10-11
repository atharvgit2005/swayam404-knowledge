# Course Onboarding Guide for Maintainers

A comprehensive operational manual for repository maintainers adding new courses to the Swayam404 Knowledge Base.

---

## 1. Prerequisites & Required Material Inputs

Before initiating onboarding for a new university course, collect the following materials directly from the course instructor, teaching assistant, or department coordinator:

| Required Input | Format / Specifications | Redistribution Requirement |
|---|---|---|
| **Course Syllabus Outline** | Unit, week, lecture hierarchy and titles | Public syllabus structure (Metadata only) |
| **Lecture Handouts / Summaries** | Markdown (`.md`), text (`.txt`), or HTML slides | Must be licensed under **CC-BY-4.0** or official university open courseware clearance |
| **Formula & Worked Problem Sets** | LaTeX math notation, Markdown definitions | Open educational resource with explicit attribution |
| **Archived Evaluated Feedback** | Released post-deadline assignment rationales | **Strict requirement**: Assignment deadline must be passed; official feedback released (`isReleased: true`) |

> [!CAUTION]
> **Zero Active Assessment Materials Rule**:
> Never ingest unreleased assignment questions, test bank answers, or active grading keys. Adding active graded assessment keys violates academic integrity rules and project policies.

---

## 2. Step-by-Step Onboarding Workflow

### Step 1: Choose a Stable Course ID
Choose a kebab-case, deterministic course identifier that will remain stable across semesters:
- **Format**: `course-<dept>-<number>` (e.g., `course-cs-101`, `course-ee-204`, `course-econ-101`).
- **Constraint**: Must match regex `^course-[a-z0-9-]+$`.
- Create the course directory:
  ```bash
  mkdir -p knowledge-base/courses/course-<dept>-<number>
  ```

### Step 2: Create Course Metadata (`course.json`)
Create `knowledge-base/courses/course-<dept>-<number>/course.json` matching `knowledge-base/schema/course.schema.json`:
```json
{
  "courseId": "course-cs-101",
  "title": "Introduction to Computer Science and Programming",
  "externalCourseId": "noc24-cs101",
  "provider": "SWAYAM",
  "institution": "Indian Institute of Technology",
  "language": "en",
  "coursePackVersion": "1.0.0",
  "description": "Fundamental algorithms, data structures, and computational thinking.",
  "units": [
    {
      "unitId": "unit-1",
      "unitNumber": 1,
      "title": "Introduction to Algorithms",
      "weekNumber": 1,
      "lectures": [
        { "lectureId": "lec-1-1", "lectureNumber": "1", "title": "Asymptotic Notation" }
      ]
    }
  ],
  "lastUpdated": "2026-10-15T00:00:00Z"
}
```

### Step 3: Ingest Authorized Resources (`resources.json`)
Prepare your authorized notes and worked examples. You can use the built-in `ResourceIngestionService` or author `resources.json` directly conforming to `resource.schema.json`:
```json
[
  {
    "resourceId": "cs-res-001",
    "courseId": "course-cs-101",
    "title": "Concept Summary: Big-O Asymptotic Complexity",
    "resourceType": "concept-summary",
    "content": "Big-O notation describes the upper bound of algorithm growth rate. For $f(n) = O(g(n))$, there exist positive constants $c$ and $n_0$ such that $0 \\le f(n) \\le c \\cdot g(n)$ for all $n \\ge n_0$.",
    "topics": ["algorithms", "asymptotic-notation", "big-o"],
    "provenance": {
      "sourceTitle": "IIT CS101 Lecture Handout — Lecture 1",
      "sourceUrl": "https://nptel.ac.in/courses/106/101/handout1.pdf",
      "authorOrPublisher": "Department of Computer Science & Engineering",
      "license": "CC-BY-4.0",
      "attribution": "Used with permission under Creative Commons Attribution 4.0 International.",
      "retrievalDate": "2026-10-15T00:00:00Z",
      "lectureNumber": "1"
    },
    "version": "1.0.0",
    "createdAt": "2026-10-15T00:00:00Z",
    "updatedAt": "2026-10-15T00:00:00Z"
  }
]
```

### Step 4: Add Released Assessment Rationales (`review-records.json`)
Only include questions from **past, completed, graded** assignments where official rationales were published:
```json
[
  {
    "recordId": "cs-rev-001",
    "courseId": "course-cs-101",
    "assignmentId": "noc24-cs101-a01",
    "questionFingerprint": "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    "normalizedQuestionText": "which of the following functions has the slowest asymptotic growth rate",
    "options": ["O(1)", "O(log n)", "O(n)", "O(n^2)"],
    "explanation": "Constant time O(1) does not grow with input size n, representing the slowest growth rate.",
    "verificationStatus": "portal-confirmed",
    "verificationSource": "portal_archived_graded_feedback",
    "releaseTimestamp": "2025-09-30T00:00:00Z",
    "redistributionPermission": "Official evaluated feedback released to enrolled students.",
    "recordVersion": "1.0.0",
    "isReleased": true,
    "provenance": {
      "sourceTitle": "NPTEL CS101 Assignment 1 Evaluated Solution Key",
      "sourceUrl": "https://nptel.ac.in/courses/106/101/feedback/a01.pdf",
      "authorOrPublisher": "NPTEL Portal Archive",
      "license": "CC-BY-4.0",
      "attribution": "Evaluated feedback released after assignment submission closure.",
      "retrievalDate": "2026-10-15T00:00:00Z"
    }
  }
]
```

### Step 5: Build Course Packs & Recompute Integrity Hashes
Run the maintainer build script:
```bash
node scripts/build-course-packs.mjs knowledge-base
```
This script will:
1. Validate schemas against Draft-07 specs.
2. Canonicalize JSON serialization.
3. Compute SHA-256 integrity digests across the pack.
4. Update `knowledge-base/manifest.json` and `knowledge-base/courses/index.json`.

### Step 6: Validate Contribution Integrity
Run the maintainer validation tool:
```bash
node scripts/validate-contributions.mjs knowledge-base
```
Ensure output reports:
`Summary: 0 errors, 0 warnings. Validation PASSED.`

### Step 7: Review the Resulting Git Diff
Inspect changes with git:
```bash
git status
git diff knowledge-base/manifest.json
```
Verify:
- No unintentional file changes.
- Content hashes are 64-character SHA-256 strings.
- Version numbers match semver format (`1.0.0`).

### Step 8: Manual Public Publication
Commit and push the verified changes to the public GitHub repository:
```bash
git add knowledge-base/
git commit -m "feat(knowledge): onboard course-cs-101 with verified lecture notes"
git push origin main
```

### Step 9: Verify from Fresh Extension Installation
1. Open the extension in Chrome / Edge.
2. Navigate to `More ▾` -> `Settings`.
3. Click `Sync Knowledge Base`.
4. Confirm `course-cs-101` appears in the Course Selector dropdown.
5. Perform a test question scan and confirm notes appear in the Evidence Drawer.
