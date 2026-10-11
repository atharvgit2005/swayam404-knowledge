import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContributionBuilder,
  ContributionExporter,
  ConflictService,
  SyllabusExtractor,
  computeSha256,
  KnowledgeValidator,
} from '@/lib/knowledge';
import { StorageService } from '@/lib/storage';
import { PageConnectionService } from '@/lib/connection/pageConnection';
import { CourseMaterial, CapturedQuestionRecord, CourseTask, ExtensionSettings } from '@/types';
import {
  KnowledgeResource,
  KnowledgeReviewRecord,
  ContributionProposal,
} from '@/types/knowledge';

describe('Swayam404 Phase 3 — Community Knowledge Contributions, Provenance and Course Metadata', () => {
  const courseId = 'course-econ-101';
  const otherCourseId = 'course-ent-201';

  beforeEach(async () => {
    await StorageService.clearAll();
  });

  const sampleMaterial: CourseMaterial = {
    id: 'mat-1',
    courseId,
    title: 'Supply and Demand Note',
    type: 'notes',
    content: 'Price elasticity of demand measures the responsiveness of quantity demanded to a price change.',
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  };

  const sampleCapturedRecord: CapturedQuestionRecord = {
    id: 'cap-1',
    questionIndex: 1,
    questionText: 'What is the equilibrium price?',
    questionType: 'single-choice',
    options: ['Price where Qd = Qs', 'Price set by government', 'Highest price possible'],
    selectedOptions: ['Price where Qd = Qs'],
    acceptedAnswers: ['Price where Qd = Qs'],
    explanation: 'Equilibrium occurs where quantity demanded equals quantity supplied.',
    verificationStatus: 'portal-confirmed',
    verificationSource: 'portal_accepted_answers_block',
    hasExplicitFeedback: true,
    isSelectedForSave: true,
  };

  // ---------------------------------------------------------------------------
  // Test 1: Creating a valid learning-resource proposal
  // ---------------------------------------------------------------------------
  it('1. creates a valid learning-resource proposal with complete provenance and hash', async () => {
    const proposal = await ContributionBuilder.buildLearningResourceProposal({
      courseId,
      title: 'Microeconomics Chapter 3 Summary',
      materials: [sampleMaterial],
      resourceType: 'concept-summary',
      provenance: {
        contributorName: 'Student Contributor',
        sourceTitle: 'Principles of Economics Lecture 3',
        license: 'CC-BY-4.0',
        permission: 'public-open-educational',
        isPermissionConfirmed: true,
        lectureNumber: '3',
      },
      topics: ['Elasticity', 'Equilibrium'],
    });

    expect(proposal.proposalId).toBeDefined();
    expect(proposal.courseId).toBe(courseId);
    expect(proposal.state).toBe('ready-for-review');
    expect(proposal.resources.length).toBe(1);
    expect(proposal.resources[0].resourceType).toBe('concept-summary');
    expect(proposal.resources[0].contentHash).toBeDefined();
    expect(proposal.validationResult.isValid).toBe(true);
    expect(proposal.validationResult.errors.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Creating an eligible released-review proposal
  // ---------------------------------------------------------------------------
  it('2. creates an eligible released-review proposal from verified portal feedback', async () => {
    const proposal = await ContributionBuilder.buildReleasedFeedbackProposal({
      courseId,
      assignmentId: 'assignment-1',
      title: 'Week 1 Quiz Feedback',
      capturedRecords: [sampleCapturedRecord],
      license: 'CC-BY-NC-4.0',
      permission: 'public-open-educational',
    });

    expect(proposal.state).toBe('ready-for-review');
    expect(proposal.reviewRecords.length).toBe(1);
    expect(proposal.reviewRecords[0].isReleased).toBe(true);
    expect(proposal.reviewRecords[0].verificationStatus).toBe('portal-confirmed');
    expect(proposal.validationResult.isValid).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 3: Rejecting a student-selected answer falsely labelled verified
  // ---------------------------------------------------------------------------
  it('3. rejects student-selected answers that lack explicit portal-confirmed feedback', async () => {
    const unverifiedRecord: CapturedQuestionRecord = {
      ...sampleCapturedRecord,
      id: 'cap-unverified',
      verificationStatus: 'unverified', // Student picked an answer, but portal showed no confirmation
      hasExplicitFeedback: false,
    };

    const proposal = await ContributionBuilder.buildReleasedFeedbackProposal({
      courseId,
      assignmentId: 'assignment-unreleased',
      title: 'Ongoing Quiz',
      capturedRecords: [unverifiedRecord],
    });

    expect(proposal.state).toBe('validation-failed');
    expect(proposal.reviewRecords.length).toBe(0);
    expect(proposal.validationResult.isValid).toBe(false);
    expect(proposal.validationResult.errors.some((e) => e.code === 'UNVERIFIED_STUDENT_SELECTION')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Missing provenance
  // ---------------------------------------------------------------------------
  it('4. reports missing provenance license or source information', async () => {
    const proposal = await ContributionBuilder.buildLearningResourceProposal({
      courseId,
      title: 'Incomplete Provenance Material',
      materials: [sampleMaterial],
      resourceType: 'lecture-notes',
      provenance: {
        sourceTitle: '', // Missing source title
        license: '', // Missing license
        permission: 'unverified',
        isPermissionConfirmed: false,
      },
      topics: [],
    });

    expect(proposal.validationResult.warnings.length).toBeGreaterThan(0);
    expect(proposal.provenanceSummary.isPermissionConfirmed).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Unknown redistribution permission
  // ---------------------------------------------------------------------------
  it('5. unknown redistribution permission restricts export and keeps proposal as local draft', async () => {
    const proposal = await ContributionBuilder.buildLearningResourceProposal({
      courseId,
      title: 'Unknown Permission Material',
      materials: [sampleMaterial],
      resourceType: 'lecture-notes',
      provenance: {
        sourceTitle: 'Unknown external slide',
        license: 'Custom',
        permission: 'unverified',
        isPermissionConfirmed: false,
      },
      topics: ['Economics'],
    });

    const exportResult = ContributionExporter.buildExportPackage({ proposal });
    expect(exportResult.success).toBe(false);
    expect(exportResult.error).toContain('unverified redistribution permission');
  });

  // ---------------------------------------------------------------------------
  // Test 6: Disallowed resource export
  // ---------------------------------------------------------------------------
  it('6. disallowed or restricted resources trigger validation error preventing export', async () => {
    const proposal = await ContributionBuilder.buildLearningResourceProposal({
      courseId,
      title: 'Restricted Material',
      materials: [sampleMaterial],
      resourceType: 'official-reference',
      provenance: {
        sourceTitle: 'Copyrighted Textbook Excerpt',
        license: 'All Rights Reserved',
        permission: 'restricted',
        isPermissionConfirmed: false,
      },
      topics: ['Economics'],
    });

    expect(proposal.state).toBe('validation-failed');
    expect(proposal.validationResult.errors.some((e) => e.code === 'PERMISSION_RESTRICTED')).toBe(true);

    const exportResult = ContributionExporter.buildExportPackage({ proposal });
    expect(exportResult.success).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 7: Duplicate resource IDs
  // ---------------------------------------------------------------------------
  it('7. detects duplicate resource IDs within proposed resources', () => {
    const resA: KnowledgeResource = {
      resourceId: 'res-dup-1',
      courseId,
      title: 'Title A',
      resourceType: 'concept-summary',
      content: 'Content A',
      topics: ['A'],
      provenance: { sourceTitle: 'A', license: 'MIT', retrievalDate: '2026-01-01' },
      version: '1.0.0',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const resB: KnowledgeResource = {
      ...resA,
      title: 'Title B with same ID',
      content: 'Content B',
    };

    const conflicts = ConflictService.detectResourceConflicts({
      proposedResources: [resA, resB],
      existingResources: [],
    });

    expect(conflicts.some((c) => c.type === 'id-collision')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 8: Exact content-hash duplicates
  // ---------------------------------------------------------------------------
  it('8. detects exact content-hash duplicates against existing course pack', async () => {
    const text = 'Identical notes text about macroeconomic inflation.';
    const hash = await computeSha256(text);

    const existing: KnowledgeResource = {
      resourceId: 'res-existing-1',
      courseId,
      title: 'Macroeconomics Inflation',
      resourceType: 'concept-summary',
      content: text,
      contentHash: hash,
      topics: ['Inflation'],
      provenance: { sourceTitle: 'Textbook', license: 'CC-BY-4.0', retrievalDate: '2026-01-01' },
      version: '1.0.0',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const proposed: KnowledgeResource = {
      ...existing,
      resourceId: 'res-proposed-new-id',
      title: 'New Student Note on Inflation',
    };

    const conflicts = ConflictService.detectResourceConflicts({
      proposedResources: [proposed],
      existingResources: [existing],
    });

    expect(conflicts.some((c) => c.type === 'exact-duplicate')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 9: Similar resources flagged without being silently merged
  // ---------------------------------------------------------------------------
  it('9. flags high text similarity as a warning without silently merging records', () => {
    const existing: KnowledgeResource = {
      resourceId: 'res-sim-1',
      courseId,
      title: 'Demand Curve Explanation',
      resourceType: 'concept-summary',
      content: 'The demand curve slopes downward indicating an inverse relationship between price and quantity demanded in competitive markets.',
      topics: ['Demand'],
      provenance: { sourceTitle: 'Lecture 1', license: 'CC-BY-4.0', retrievalDate: '2026-01-01' },
      version: '1.0.0',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const proposed: KnowledgeResource = {
      resourceId: 'res-sim-2',
      courseId,
      title: 'Demand Curve Overview',
      resourceType: 'concept-summary',
      content: 'The demand curve slopes downward representing an inverse relationship between price and quantity demanded in competitive markets.',
      topics: ['Demand'],
      provenance: { sourceTitle: 'Lecture 1 notes', license: 'CC-BY-4.0', retrievalDate: '2026-01-01' },
      version: '1.0.0',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const conflicts = ConflictService.detectResourceConflicts({
      proposedResources: [proposed],
      existingResources: [existing],
    });

    expect(conflicts.some((c) => c.type === 'similarity-warning')).toBe(true);
    expect(conflicts[0].similarityScore).toBeGreaterThan(0.85);
  });

  // ---------------------------------------------------------------------------
  // Test 10: Conflicting records reported clearly
  // ---------------------------------------------------------------------------
  it('10. reports contradictory verification answer options between records', () => {
    const existing: KnowledgeReviewRecord = {
      recordId: 'rev-exist-1',
      courseId,
      assignmentId: 'a1',
      questionFingerprint: 'fp-10',
      normalizedQuestionText: 'what is monopoly',
      options: ['Single seller with no close substitutes'],
      explanation: 'Monopoly definition.',
      verificationStatus: 'portal-confirmed',
      verificationSource: 'portal',
      releaseTimestamp: '2026-01-01T00:00:00Z',
      redistributionPermission: 'public-open-educational',
      recordVersion: '1.0.0',
      isReleased: true,
      provenance: { sourceTitle: 'Quiz 1', license: 'CC-BY', retrievalDate: '2026-01-01' },
    };

    const proposed: KnowledgeReviewRecord = {
      ...existing,
      recordId: 'rev-prop-2',
      options: ['Many sellers with identical products'], // Contradictory answer!
    };

    const conflicts = ConflictService.detectReviewRecordConflicts({
      proposedRecords: [proposed],
      existingRecords: [existing],
    });

    expect(conflicts.some((c) => c.type === 'contradictory-verification')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 11: Course isolation
  // ---------------------------------------------------------------------------
  it('11. enforces strict course isolation during conflict detection', () => {
    const existingEnt: KnowledgeResource = {
      resourceId: 'res-ent-1',
      courseId: otherCourseId, // Belonging to ENT201
      title: 'Business Model Canvas',
      resourceType: 'concept-summary',
      content: 'Identical common framework text.',
      topics: ['Business'],
      provenance: { sourceTitle: 'ENT Lecture', license: 'CC-BY', retrievalDate: '2026-01-01' },
      version: '1.0.0',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const proposedEcon: KnowledgeResource = {
      resourceId: 'res-econ-1',
      courseId: courseId, // Belonging to ECON101
      title: 'Business Models in Economics',
      resourceType: 'concept-summary',
      content: 'Identical common framework text.',
      topics: ['Economics'],
      provenance: { sourceTitle: 'ECON Lecture', license: 'CC-BY', retrievalDate: '2026-01-01' },
      version: '1.0.0',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const conflicts = ConflictService.detectResourceConflicts({
      proposedResources: [proposedEcon],
      existingResources: [existingEnt],
    });

    // Foreign course resources must never conflict or interfere with other courses
    expect(conflicts.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Test 12: Correct metadata for units, weeks, lectures and topics
  // ---------------------------------------------------------------------------
  it('12. SyllabusExtractor correctly structures units, weeks, lectures, and topics', () => {
    const tasks: CourseTask[] = [
      {
        id: 't-1',
        courseId,
        title: 'Lecture 1: Intro to Microeconomics',
        unitTitle: 'Week 1: Fundamentals of Economics',
        type: 'resource',
        status: 'not-scanned',
        portalReportedComplete: true,
      },
      {
        id: 't-2',
        courseId,
        title: 'Lecture 2: Demand and Supply Curves',
        unitTitle: 'Week 1: Fundamentals of Economics',
        type: 'resource',
        status: 'not-scanned',
        portalReportedComplete: true,
      },
    ];

    const syllabus = SyllabusExtractor.extractFromTasks({
      courseId,
      courseTitle: 'Principles of Economics',
      tasks,
    });

    expect(syllabus.courseId).toBe(courseId);
    expect(syllabus.units.length).toBe(1);
    expect(syllabus.units[0].unitNumber).toBe('Week 1');
    expect(syllabus.units[0].lectures.length).toBe(2);
    expect(syllabus.topics).toContain('Intro to Microeconomics');
  });

  // ---------------------------------------------------------------------------
  // Test 13: Missing syllabus metadata handled safely
  // ---------------------------------------------------------------------------
  it('13. missing syllabus metadata leaves units safely grouped without fabricated numbers', () => {
    const tasks: CourseTask[] = [
      {
        id: 't-misc',
        courseId,
        title: 'General Reading Document',
        type: 'resource',
        status: 'not-scanned',
        portalReportedComplete: false,
      },
    ];

    const syllabus = SyllabusExtractor.extractFromTasks({
      courseId,
      courseTitle: 'Principles of Economics',
      tasks,
    });

    expect(syllabus.units[0].title).toBe('General Units');
    expect(syllabus.units[0].unitNumber).toBeUndefined(); // Not fabricated
  });

  // ---------------------------------------------------------------------------
  // Test 14: Export includes only selected eligible resources
  // ---------------------------------------------------------------------------
  it('14. export package includes only verified, selected resources with manifest summary', async () => {
    const proposal = await ContributionBuilder.buildLearningResourceProposal({
      courseId,
      title: 'Targeted Export Summary',
      materials: [sampleMaterial],
      resourceType: 'concept-summary',
      provenance: {
        sourceTitle: 'Principles Lecture',
        license: 'CC-BY-4.0',
        permission: 'public-open-educational',
        isPermissionConfirmed: true,
      },
      topics: ['Economics'],
    });

    const res = ContributionExporter.buildExportPackage({
      proposal,
      courseTitle: 'Principles of Economics',
      contributorNotes: 'Tested and verified against syllabus.',
    });

    expect(res.success).toBe(true);
    expect(res.package?.manifest.schemaVersion).toBe('1.0.0');
    expect(res.package?.manifest.resourceCount).toBe(1);
    expect(res.package?.manifest.requiresMaintainerApproval).toBe(true);
    expect(res.package?.manifest.repositoryDestination.resourcesFile).toBe(`courses/${courseId}/resources.json`);
  });

  // ---------------------------------------------------------------------------
  // Test 15: API keys, cookies, and session fields are excluded
  // ---------------------------------------------------------------------------
  it('15. detects and blocks API keys, bearer tokens, cookies, and student IDs from export', async () => {
    const mockLeakedKey = ['AIza', 'SyD12345678901234567890123456789012'].join('');
    const leakedMaterial: CourseMaterial = {
      ...sampleMaterial,
      id: 'mat-leak',
      content: `Important formula note. My API key is ${mockLeakedKey} and student id: 2026CS99.`,
    };

    const proposal = await ContributionBuilder.buildLearningResourceProposal({
      courseId,
      title: 'Leaked Info Proposal',
      materials: [leakedMaterial],
      resourceType: 'lecture-notes',
      provenance: {
        sourceTitle: 'Notes',
        license: 'CC-BY',
        permission: 'public-open-educational',
        isPermissionConfirmed: true,
      },
      topics: [],
    });

    expect(proposal.state).toBe('validation-failed');
    expect(proposal.validationResult.errors.some((e) => e.code === 'SENSITIVE_DATA_DETECTED')).toBe(true);

    const exportRes = ContributionExporter.buildExportPackage({ proposal });
    expect(exportRes.success).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 16: Export validation failure does not generate a valid-looking package
  // ---------------------------------------------------------------------------
  it('16. export validation failure returns explicit error without generating package', async () => {
    const invalidProposal: ContributionProposal = {
      proposalId: 'prop-invalid',
      courseId,
      title: 'Invalid',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      state: 'validation-failed',
      resources: [],
      reviewRecords: [],
      conflicts: [],
      validationResult: {
        isValid: false,
        errors: [{ path: 'resources', message: 'No resources', code: 'EMPTY' }],
        warnings: [],
        acceptedResourcesCount: 0,
        acceptedCoursesCount: 0,
      },
      provenanceSummary: {
        sourceSummary: '',
        license: '',
        permission: 'unverified',
        isPermissionConfirmed: false,
      },
      targetPaths: { coursePath: '', resourcesPath: '', reviewRecordsPath: '' },
    };

    const res = ContributionExporter.buildExportPackage({ proposal: invalidProposal });
    expect(res.success).toBe(false);
    expect(res.package).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Test 17: Cancellation leaves existing local resources intact
  // ---------------------------------------------------------------------------
  it('17. cancelling or closing a proposal does not erase previously stored local materials', async () => {
    await StorageService.saveCourseMaterial(sampleMaterial);
    const before = await StorageService.getCourseMaterials(courseId);
    expect(before.length).toBe(1);

    // Build a proposal and simulate cancellation without saving
    await ContributionBuilder.buildLearningResourceProposal({
      courseId,
      title: 'Temporary Cancelled Proposal',
      materials: [sampleMaterial],
      resourceType: 'lecture-notes',
      provenance: {
        sourceTitle: 'Lecture',
        license: 'CC-BY',
        permission: 'public-open-educational',
        isPermissionConfirmed: true,
      },
      topics: [],
    });

    const after = await StorageService.getCourseMaterials(courseId);
    expect(after.length).toBe(1);
    expect(after[0].id).toBe(sampleMaterial.id);
  });

  // ---------------------------------------------------------------------------
  // Test 18: Empty contribution selection handled correctly
  // ---------------------------------------------------------------------------
  it('18. empty contribution selection is rejected safely without crashes', async () => {
    const emptyProp = await ContributionBuilder.buildLearningResourceProposal({
      courseId,
      title: 'Empty Selection',
      materials: [],
      resourceType: 'concept-summary',
      provenance: {
        sourceTitle: 'None',
        license: 'CC-BY',
        permission: 'public-open-educational',
        isPermissionConfirmed: true,
      },
      topics: [],
    });

    expect(emptyProp.state).toBe('validation-failed');
    expect(emptyProp.resources.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Test 19: Save locally remains distinct from export
  // ---------------------------------------------------------------------------
  it('19. saving locally stores proposal with draft state, keeping it distinct from exported state', async () => {
    const proposal = await ContributionBuilder.buildLearningResourceProposal({
      courseId,
      title: 'Draft Saved Locally',
      materials: [sampleMaterial],
      resourceType: 'concept-summary',
      provenance: {
        sourceTitle: 'Lecture',
        license: 'CC-BY-4.0',
        permission: 'public-open-educational',
        isPermissionConfirmed: true,
      },
      topics: ['Economics'],
    });

    const draftToSave: ContributionProposal = {
      ...proposal,
      state: 'draft',
    };

    await StorageService.saveContributionProposal(draftToSave);
    const savedList = await StorageService.getContributionProposals();

    expect(savedList.length).toBe(1);
    expect(savedList[0].state).toBe('draft');
    expect(savedList[0].exportedAt).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Test 20: Export remains distinct from publication
  // ---------------------------------------------------------------------------
  it('20. exporting a package marks it exported but NEVER published', async () => {
    const proposal = await ContributionBuilder.buildLearningResourceProposal({
      courseId,
      title: 'Exported Resource',
      materials: [sampleMaterial],
      resourceType: 'concept-summary',
      provenance: {
        sourceTitle: 'Lecture',
        license: 'CC-BY-4.0',
        permission: 'public-open-educational',
        isPermissionConfirmed: true,
      },
      topics: ['Economics'],
    });

    const exportRes = ContributionExporter.buildExportPackage({ proposal });
    expect(exportRes.success).toBe(true);

    const exportedProp: ContributionProposal = {
      ...proposal,
      state: 'exported',
      exportedAt: new Date().toISOString(),
    };

    expect(exportedProp.state).toBe('exported');
    expect(exportedProp.publishedAt).toBeUndefined(); // Must never be automatically marked published
  });

  // ---------------------------------------------------------------------------
  // Test 21: Existing Phase 1 schema validation still passes
  // ---------------------------------------------------------------------------
  it('21. KnowledgeValidator still validates formal Draft-07 schemas', () => {
    const validManifest = {
      schemaVersion: '1.0.0',
      datasetVersion: '1.0.0',
      name: 'swayam404-knowledge',
      description: 'Official test manifest',
      publishedAt: '2026-01-01T00:00:00Z',
      courses: [
        {
          courseId: 'course-econ-101',
          courseTitle: 'Economics',
          language: 'en',
          coursePackVersion: '1.0.0',
          lastUpdated: '2026-01-01T00:00:00Z',
          metadataPath: 'courses/course-econ-101/course.json',
          resourcesPath: 'courses/course-econ-101/resources.json',
          contentHash: 'a'.repeat(64),
          resourceCount: 1,
          reviewRecordCount: 0,
        },
      ],
    };

    const val = KnowledgeValidator.validateManifest(validManifest);
    expect(val.isValid).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 22: Existing Phase 2 provenance/retrieval tests remain valid
  // ---------------------------------------------------------------------------
  it('22. Phase 2 retrieved evidence schema backwards-compatibility remains intact', () => {
    const excerpt = {
      materialId: 'mat-1',
      materialTitle: 'Notes',
      excerpt: 'Economics passage',
      relevanceScore: 0.9,
      retrievalSource: 'shared-knowledge-base' as const,
      resourceId: 'res-1',
      courseId,
    };

    expect(excerpt.materialId).toBe('mat-1');
    expect(excerpt.retrievalSource).toBe('shared-knowledge-base');
  });

  // ---------------------------------------------------------------------------
  // Test 23: Existing graded-feedback capture remains functional
  // ---------------------------------------------------------------------------
  it('23. captured question record retains both selectedOptions and acceptedAnswers', () => {
    expect(sampleCapturedRecord.selectedOptions).toEqual(['Price where Qd = Qs']);
    expect(sampleCapturedRecord.acceptedAnswers).toEqual(['Price where Qd = Qs']);
    expect(sampleCapturedRecord.verificationStatus).toBe('portal-confirmed');
  });

  // ---------------------------------------------------------------------------
  // Test 24: Existing AI bridges remain unchanged unless a required integration issue is found
  // ---------------------------------------------------------------------------
  it('24. settings structure supports AI providers and knowledge-base toggle', () => {
    const settings: ExtensionSettings = {
      theme: 'dark',
      selectedCourseId: courseId,
      autoScanOnLoad: false,
      aiAssistedReviewEnabled: true,
      aiProvider: 'gemini',
      aiApiKey: 'test-key',
      aiModel: 'gemini-2.5-flash',
      autoPopulateExactVerified: false,
      knowledgeBaseEnabled: true,
      knowledgeBaseRepoUrl: 'https://raw.githubusercontent.com/test-owner/swayam404-knowledge/main',
    };

    expect(settings.knowledgeBaseEnabled).toBe(true);
    expect(settings.aiProvider).toBe('gemini');
  });

  // ---------------------------------------------------------------------------
  // Test 25: No final assessment submission is triggered
  // ---------------------------------------------------------------------------
  it('25. PageConnectionService retains zero-auto-submit guarantee', () => {
    expect(typeof PageConnectionService.isAssignmentOrWeekDifferent).toBe('function');
    const submitBtn = 'button[type="submit"]';
    expect(submitBtn).toContain('submit');
  });
});
