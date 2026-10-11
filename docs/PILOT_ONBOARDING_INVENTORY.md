# Pilot Course Onboarding Inventory — Principles of Economics (`course-econ-101`)

Comprehensive onboarding and provenance audit for the Swayam404 Phase 5 College Pilot.

---

## 1. Course Identity & Taxonomy

| Field | Value | Provenance / Verification Source |
|---|---|---|
| **Stable Course ID** | `course-econ-101` | Extension internal unique course profile key |
| **Course Title** | Principles of Economics | `public/fixtures/economics-course-outline.html` header |
| **Course Code / External ID** | `noc24-hs101` / `SWAYAM-ECON-CORE` | NPTEL / SWAYAM portal fixture container |
| **Provider** | National Programme on Technology Enhanced Learning (NPTEL) / SWAYAM | Portal fixture banner |
| **Language** | English (`en`) | Course syllabus metadata |
| **Status** | Validated Pilot Benchmark Pack | Verified via `build-course-packs.mjs` and `validate-contributions.mjs` |

---

## 2. Source Material Inventory & File Locations

| Local File Path | Purpose | Format | Provenance / Attribution | Redistribution License | Public Pack Eligible? |
|---|---|---|---|---|---|
| `public/fixtures/economics-course-outline.html` | Portal syllabus & outline structure | Semantic HTML5 | NPTEL Portal Fixture | Open Educational Benchmark | Yes (Metadata-only) |
| `public/fixtures/submitted-feedback-assignment.html` | Past graded assignment feedback | Evaluated Form HTML | SWAYAM Graded Feedback Archive | CC-BY-4.0 Test Feedback | Yes (Released review records) |
| `knowledge-base/courses/course-econ-101/course.json` | Course catalog metadata & objectives | Canonical JSON | Swayam404 Knowledge Base | CC0 Public Domain | Yes |
| `knowledge-base/courses/course-econ-101/resources.json` | Pedagogical notes & worked math examples | Canonical JSON | Synthetic Open Education Project | CC-BY-4.0 | Yes |
| `knowledge-base/courses/course-econ-101/review-records.json` | Released past assessment rationales | Canonical JSON | Portal Released Feedback Archive | CC-BY-4.0 | Yes (Strictly `isReleased: true`) |

---

## 3. Mathematical Notation & Pedagogical Content

The pilot pack contains verified mathematical derivations preserving LaTeX formatting:

- **Worked Example (`econ-res-002`)**:
  - Model: Market Equilibrium Computation
  - Demand Equation: $Q_d = 100 - 2P$
  - Supply Equation: $Q_s = 20 + 2P$
  - Equilibrium Condition: $Q_d = Q_s \implies 100 - 2P = 20 + 2P \implies 4P = 80 \implies P^* = 20$
  - Equilibrium Quantity: $Q^* = 60$ units
- **Concept Summary (`econ-res-001`)**:
  - Concept: Price Elasticity of Demand (PED)
  - Elastic condition: $\text{PED} > 1$
  - Inelastic condition: $\text{PED} < 1$
  - Unit elastic condition: $\text{PED} = 1$

---

## 4. Source Evidence Structure & Units/Weeks Hierarchy

Derived from the verified portal syllabus fixture (`economics-course-outline.html`):

```
Principles of Economics (noc24-hs101)
├── Week 1: Foundations of Microeconomics
│   ├── Lecture 1: Scarcity & Choices
│   ├── Assignment 1: Scarcity & Marginal Analysis (Graded)
│   └── Quiz 1: Foundations Concept Check (Practice)
├── Week 2: Demand and Supply Equilibrium
│   ├── Lecture 2: Market Equilibrium & Price Discovery
│   ├── Assignment 2: Market Demand Dynamics (Graded)
│   └── Practice 1: Elasticity Problem Set (Optional)
└── Week 3: Production, Costs, and Market Structures
    ├── Assignment 3: Cost Functions & Profit Maximization (Graded)
    └── Mid-course Feedback Survey
```

---

## 5. Missing Metadata & Prerequisite Inputs for Live College Rollout

Before a department maintainer creates a production pack for a live semester course:

1. **Instructor Handouts**: Official course slides, lecture summaries, or formula sheets explicitly licensed under CC-BY or institutionally approved open licenses.
2. **Video Timestamps**: Official lecture timestamps (e.g., `04:15 - 08:30`) for key concept derivations.
3. **Assessment Safety**: Graded assignment review records must **ONLY** be added after the assignment submission deadline has passed and the portal has published official evaluated feedback (`isReleased: true`). Active unreleased assignment answers are strictly prohibited.
4. **Attribution Disclosures**: Course packs must include clear attribution to the instructor and institution.
