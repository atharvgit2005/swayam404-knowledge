# Swayam404 College Pilot Guide & Volunteer Operations Protocol

Operational handbook for conducting a controlled 5–10 student volunteer pilot of Swayam404.

---

## 1. Pilot Mission & Privacy Philosophy

The objective of this pilot is to evaluate the practical usability, retrieval relevance, and local caching resilience of Swayam404 with a small group of voluntary university students.

### Privacy Safeguards
1. **Zero Student Accounts**: Students never create accounts, log in, or register user profiles.
2. **Zero Cross-Student Tracking**: No telemetry, analytics, cookies, or unique behavioral fingerprints are collected across students.
3. **Local-Only Processing**: Question matching, note retrieval, and diagnostic traces run 100% locally within the student's browser sandbox.
4. **Voluntary Diagnostic Sharing**: When reporting unexpected behavior, students use the explicit "Export Diagnostic Report" action, which automatically redacts all personal data, question text, and answers.

---

## 2. Institutional Boundaries & Academic Integrity

> [!IMPORTANT]
> **Honest Labeling & Institutional Disclosure**:
> - Swayam404 is an open-source, student-controlled study assistant.
> - **It is NOT institutionally approved, endorsed, or certified by SWAYAM, NPTEL, or university administration** unless explicit written permission is obtained from your institution.
> - Volunteer participants must be explicitly informed that they are participating in an independent software trial.

### Assessment Boundaries
- **Submission Immunity**: The extension does **not** click Submit or Final Submit buttons on SWAYAM/NPTEL portals. All final submissions must be performed manually by the student after reviewing answers.
- **Active Assignment Protection**: Answer keys for currently active, unreleased assignments must **never** be shared or loaded into the public repository.
- **Student Agency**: The student retains 100% responsibility for evaluating the correctness of suggested answers before submitting.

---

## 3. Pilot Cohort Setup (5–10 Students)

### Target Cohort Composition
- **Cohort Size**: 5 to 10 volunteer students.
- **Course Focus**: Students enrolled in `noc24-hs101` (Principles of Economics) or related SWAYAM/NPTEL semester courses.
- **Hardware/Browser**: Laptops running Google Chrome, Microsoft Edge, or Brave Browser (desktop).

### Onboarding Steps for Maintainer
1. Provide the pre-built `dist/` directory to volunteers via secure local transfer or departmental shared drive.
2. Direct students to the [Student Installation Guide](file:///Users/atharvpaharia100/Desktop/Projects/swayaam-hacked/docs/PILOT_DIAGNOSTIC_CHECKLIST.md#part-2-student-volunteer-installation-guide).
3. Walk volunteers through the settings panel to ensure they understand the Zero-Credential boundary.

---

## 4. Collecting Useful Feedback Without Intrusive Telemetry

To improve the software without collecting personal information:

### Feedback Collection Method
Provide a simple, anonymous feedback form (e.g. Google Form or Paper Survey) with questions strictly focused on software behavior:

1. **Installation & Discovery**:
   - Did the extension detect your active assignment page? (Yes / No / Slow)
   - Did the sidepanel layout fit comfortably next to your course tab? (1–5 scale)
2. **Retrieval & Evidence Quality**:
   - Were the cited lecture notes and worked formulas helpful? (Yes / Sometimes / Irrelevant)
   - Did the LaTeX mathematical formulas display legibly? (Yes / No)
3. **Review & Population Experience**:
   - Did the "Populate Approved Answers" button correctly mark the selected radio buttons? (Yes / No / Partial)
   - Did you appreciate the manual submission boundary? (Yes / No)
4. **Bug & Error Reporting**:
   - If an error occurred, did you export the diagnostic report? (Attach sanitized JSON)

### What NOT to Ask or Collect
- **Do NOT ask for**: Student name, roll number, college registration number, email address, GPA, or assessment grades.
- **Do NOT collect**: Screenshots showing full student portal banners with roll numbers, or screenshots containing active graded quiz questions.

---

## 5. Troubleshooting & Bug Investigation Workflow

When a volunteer reports an issue:

1. **Request the Sanitized Diagnostic Report**:
   - Ask the student to open `More ▾` -> `Diagnostics Trace` -> `Export Diagnostic Report (Privacy-Preserved)`.
   - The student clicks `Download Report (.json)` and shares the file.
2. **Inspect the Export File**:
   - Verify `application.version` and `application.browserEnvironment`.
   - Check `pipelineTelemetry.sanitizedErrorCodes` for codes like `NETWORK_TIMEOUT`, `PROVIDER_QUOTA_EXCEEDED`, `INTEGRITY_MISMATCH`.
   - Check `pipelineTelemetry.stages` to identify exactly which stage (Stage 1 to 16) failed.
   - Confirm that question and answer texts are absent from the report.
3. **Formulate Solution**:
   - Provide non-invasive configuration guidance (e.g. refresh tab, reconnect Wi-Fi, check proxy settings).
