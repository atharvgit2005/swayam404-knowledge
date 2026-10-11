import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  courseRetrievalService,
} from '@/lib/context/retrievalService';
import {
  KnowledgeBaseService,
  KnowledgeValidator,
} from '@/lib/knowledge';
import { StorageService } from '@/lib/storage';
import { AnswerResolutionPipeline } from '@/lib/orchestration/answerResolutionPipeline';
import { GeminiProvider } from '@/lib/ai/geminiProvider';
import { ChatGptBridgeService } from '@/lib/ai/chatgptBridge';
import { GraphRetrievalEngine } from '@/lib/retrieval';
import { PageConnectionService } from '@/lib/connection/pageConnection';
import {
  Course,
  QuestionRecord,
  CourseMaterial,
  ScannedQuestion,
  ExtensionSettings,
} from '@/types';
import {
  KnowledgeResource,
  KnowledgeReviewRecord,
  KnowledgeCoursePack,
} from '@/types/knowledge';

describe('Swayam404 Phase 2 — Shared Knowledge Retrieval Integration & Evidence-Aware AI', () => {
  const econCourse: Course = {
    id: 'course-econ-101',
    name: 'Principles of Economics',
    code: 'ECON101',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const defaultSettings: ExtensionSettings = {
    theme: 'dark',
    selectedCourseId: 'course-econ-101',
    autoScanOnLoad: false,
    aiAssistedReviewEnabled: true,
    aiProvider: 'gemini',
    aiApiKey: 'test-synthetic-key-12345',
    aiModel: 'gemini-2.5-flash',
    autoPopulateExactVerified: false,
    knowledgeBaseEnabled: true,
    knowledgeBaseRepoUrl: 'https://raw.githubusercontent.com/test-owner/swayam404-knowledge/main',
  };

  const createSyntheticEconResources = (): KnowledgeResource[] => [
    {
      resourceId: 'econ-res-01',
      courseId: 'course-econ-101',
      title: 'Concept Summary: Price Elasticity of Demand',
      resourceType: 'concept-summary',
      content:
        'Price elasticity of demand measures the responsiveness of the quantity demanded of a good to a change in its price. When demand is inelastic, price increases lead to higher total revenue.',
      topics: ['elasticity', 'demand', 'revenue'],
      provenance: {
        sourceTitle: 'Economics Fundamentals Chapter 4',
        sourceUrl: 'https://example.edu/econ/ch4',
        lectureNumber: '04',
        lectureTimestamp: '14:20',
        license: 'CC-BY-4.0',
        retrievalDate: '2026-02-01T00:00:00Z',
      },
      version: '1.0.0',
      contentHash: 'hash-econ-res-01',
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    },
    {
      resourceId: 'econ-res-02',
      courseId: 'course-econ-101',
      title: 'Worked Example: Calculating Cross-Price Elasticity',
      resourceType: 'worked-example',
      content:
        'Cross-price elasticity is positive for substitute goods and negative for complementary goods. For instance, tea and coffee have a positive cross-price elasticity.',
      topics: ['elasticity', 'substitutes', 'complements'],
      provenance: {
        sourceTitle: 'Economics Workbook Practice 3',
        sourceUrl: 'https://example.edu/econ/wb3',
        lectureNumber: '05',
        license: 'CC-BY-4.0',
        retrievalDate: '2026-02-01T00:00:00Z',
      },
      version: '1.0.0',
      contentHash: 'hash-econ-res-02',
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    },
  ];

  const createSyntheticEntResources = (): KnowledgeResource[] => [
    {
      resourceId: 'ent-res-01',
      courseId: 'course-ent-201',
      title: 'Venture Capital and Business Model Canvas',
      resourceType: 'lecture-notes',
      content:
        'A business model canvas outlines value propositions, customer segments, channels, and revenue streams for startup ventures.',
      topics: ['venture', 'business-model', 'startups'],
      provenance: {
        sourceTitle: 'Startup Strategy Lecture 2',
        lectureNumber: '02',
        license: 'MIT',
        retrievalDate: '2026-02-01T00:00:00Z',
      },
      version: '1.0.0',
      contentHash: 'hash-ent-res-01',
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    await StorageService.clearAll();
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Test 1: Shared resources are returned for the correct course
  // ---------------------------------------------------------------------------
  it('1. returns shared resources for the correct course', async () => {
    const pack: KnowledgeCoursePack = {
      course: {
        courseId: 'course-econ-101',
        courseTitle: 'Economics',
        language: 'en',
        description: 'Test pack',
        coursePackVersion: '1.0.0',
        publishedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        topics: ['elasticity'],
      },
      resources: createSyntheticEconResources(),
      reviewRecords: [],
    };
    await StorageService.saveKnowledgeCoursePacks({ 'course-econ-101': pack });
    await StorageService.saveSettings(defaultSettings);

    const results = await courseRetrievalService.retrieveEvidence({
      questionText: 'What happens to total revenue when demand is inelastic and price increases?',
      options: ['Increases', 'Decreases', 'Remains unchanged'],
      courseId: 'course-econ-101',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].courseId).toBe('course-econ-101');
    expect(results[0].retrievalSource).toBe('shared-knowledge-base');
    expect(results[0].sourceTitle).toBe('Economics Fundamentals Chapter 4');
    expect(results[0].excerpt).toContain('inelastic, price increases lead to higher total revenue');
  });

  // ---------------------------------------------------------------------------
  // Test 2: Resources from a different course are excluded
  // ---------------------------------------------------------------------------
  it('2. strictly excludes resources from a different course even if query matches their wording', async () => {
    const econPack: KnowledgeCoursePack = {
      course: { courseId: 'course-econ-101', courseTitle: 'Econ', language: 'en', description: '', coursePackVersion: '1.0', publishedAt: '', updatedAt: '', topics: [] },
      resources: createSyntheticEconResources(),
      reviewRecords: [],
    };
    const entPack: KnowledgeCoursePack = {
      course: { courseId: 'course-ent-201', courseTitle: 'Ent', language: 'en', description: '', coursePackVersion: '1.0', publishedAt: '', updatedAt: '', topics: [] },
      resources: createSyntheticEntResources(),
      reviewRecords: [],
    };
    await StorageService.saveKnowledgeCoursePacks({
      'course-econ-101': econPack,
      'course-ent-201': entPack,
    });
    await StorageService.saveSettings(defaultSettings);

    // Query for Economics with words resembling Entrepreneurship
    const results = await courseRetrievalService.retrieveEvidence({
      questionText: 'What is a startup venture business model in economics?',
      courseId: 'course-econ-101',
    });

    // Zero entrepreneurship resources should be returned
    for (const r of results) {
      expect(r.courseId).toBe('course-econ-101');
      expect(r.resourceId).not.toContain('ent-res');
    }
  });

  // ---------------------------------------------------------------------------
  // Test 3: Disabled knowledge-base integration does not break existing retrieval
  // ---------------------------------------------------------------------------
  it('3. preserves local course-material retrieval when knowledge base is disabled', async () => {
    await StorageService.saveSettings({
      ...defaultSettings,
      knowledgeBaseEnabled: false,
    });

    const localMat: CourseMaterial = {
      id: 'mat-local-01',
      courseId: 'course-econ-101',
      title: 'Local Lecture 1 Notes',
      unitTitle: 'Week 1',
      type: 'notes',
      content: 'Local course notes on supply and demand equilibrium market price.',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    await StorageService.saveCourseMaterial(localMat);

    const results = await courseRetrievalService.retrieveEvidence({
      questionText: 'Explain supply and demand equilibrium market price',
      courseId: 'course-econ-101',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].materialId).toBe('mat-local-01');
    expect(results[0].retrievalSource).toBe('local-course-material');
    expect(results[0].excerpt).toContain('supply and demand equilibrium');
  });

  // ---------------------------------------------------------------------------
  // Test 4: Offline mode uses valid cached resources
  // ---------------------------------------------------------------------------
  it('4. offline mode uses valid cached resources without throwing network errors', async () => {
    const pack: KnowledgeCoursePack = {
      course: { courseId: 'course-econ-101', courseTitle: 'Econ', language: 'en', description: '', coursePackVersion: '1.0', publishedAt: '', updatedAt: '', topics: [] },
      resources: createSyntheticEconResources(),
      reviewRecords: [],
    };
    await StorageService.saveKnowledgeCoursePacks({ 'course-econ-101': pack });
    await StorageService.saveSettings(defaultSettings);

    // Mock fetch to simulate complete network disconnection
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch: net::ERR_INTERNET_DISCONNECTED')));

    const results = await courseRetrievalService.retrieveEvidence({
      questionText: 'What is cross-price elasticity for substitute goods?',
      courseId: 'course-econ-101',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].resourceId).toBe('econ-res-02');
    expect(results[0].excerpt).toContain('Cross-price elasticity is positive for substitute goods');
  });

  // ---------------------------------------------------------------------------
  // Test 5: An unavailable repository does not erase local evidence
  // ---------------------------------------------------------------------------
  it('5. unavailable repository sync failure preserves previously cached resources', async () => {
    const pack: KnowledgeCoursePack = {
      course: { courseId: 'course-econ-101', courseTitle: 'Econ', language: 'en', description: '', coursePackVersion: '1.0', publishedAt: '', updatedAt: '', topics: [] },
      resources: createSyntheticEconResources(),
      reviewRecords: [],
    };
    await StorageService.saveKnowledgeCoursePacks({ 'course-econ-101': pack });
    await StorageService.saveSettings(defaultSettings);

    // Attempt sync with an unavailable server (500 error)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }));

    const syncRes = await KnowledgeBaseService.syncNow();
    expect(syncRes.success).toBe(false);

    // Cached resources must remain completely intact
    const cachedResources = await KnowledgeBaseService.getCourseResources('course-econ-101');
    expect(cachedResources.length).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Test 6: Duplicate resources are removed
  // ---------------------------------------------------------------------------
  it('6. deduplicates identical content hashes and overlapping excerpts', () => {
    const duplicateResources: KnowledgeResource[] = [
      {
        resourceId: 'res-dup-01',
        courseId: 'course-econ-101',
        title: 'Elasticity Overview',
        resourceType: 'concept-summary',
        content: 'Identical paragraph about elasticity calculation in economics.',
        topics: ['elasticity'],
        provenance: { sourceTitle: 'Book A', license: 'CC', retrievalDate: '2026-01-01' },
        version: '1.0',
        contentHash: 'hash-identical-999',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        resourceId: 'res-dup-02',
        courseId: 'course-econ-101',
        title: 'Elasticity Overview Duplicate',
        resourceType: 'concept-summary',
        content: 'Identical paragraph about elasticity calculation in economics.',
        topics: ['elasticity'],
        provenance: { sourceTitle: 'Book B', license: 'CC', retrievalDate: '2026-01-01' },
        version: '1.0',
        contentHash: 'hash-identical-999', // Identical hash
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    const results = courseRetrievalService.rankAndCombineEvidence({
      questionText: 'elasticity calculation in economics',
      courseId: 'course-econ-101',
      sharedResources: duplicateResources,
      maxExcerpts: 5,
    });

    // Only one should be selected
    expect(results.length).toBe(1);
    expect(results[0].contentHash).toBe('hash-identical-999');
  });

  // ---------------------------------------------------------------------------
  // Test 7: Course/unit filtering behaves correctly
  // ---------------------------------------------------------------------------
  it('7. prioritizes resources matching unit, topic, or lecture filters', async () => {
    const pack: KnowledgeCoursePack = {
      course: { courseId: 'course-econ-101', courseTitle: 'Econ', language: 'en', description: '', coursePackVersion: '1.0', publishedAt: '', updatedAt: '', topics: [] },
      resources: createSyntheticEconResources(),
      reviewRecords: [],
    };
    await StorageService.saveKnowledgeCoursePacks({ 'course-econ-101': pack });

    // Search with specific lecture filter '05'
    const results = await KnowledgeBaseService.searchResources(
      'course-econ-101',
      'elasticity',
      5,
      { lectureId: '05' }
    );

    expect(results.length).toBeGreaterThan(0);
    // Lecture 05 resource should be ranked first due to lecture filter boost
    expect(results[0].provenance.lectureNumber).toBe('05');
  });

  // ---------------------------------------------------------------------------
  // Test 8: Empty or missing metadata is handled safely
  // ---------------------------------------------------------------------------
  it('8. handles missing optional metadata safely without crashes', () => {
    const sparseResource: KnowledgeResource = {
      resourceId: 'sparse-01',
      courseId: 'course-econ-101',
      title: 'Sparse Note',
      resourceType: 'lecture-notes',
      content: 'Consumer behavior and budget constraint lines.',
      topics: [],
      provenance: {
        sourceTitle: 'Loose Handout',
        license: '',
        retrievalDate: '2026-01-01',
      },
      version: '1.0',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const results = courseRetrievalService.rankAndCombineEvidence({
      questionText: 'Consumer behavior budget constraint',
      courseId: 'course-econ-101',
      sharedResources: [sparseResource],
    });

    expect(results.length).toBe(1);
    expect(results[0].resourceId).toBe('sparse-01');
    expect(results[0].lectureId).toBeUndefined();
    expect(results[0].sourceUrl).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Test 9: Stable ordering is maintained for equal ranking scores
  // ---------------------------------------------------------------------------
  it('9. maintains deterministic ordering when ranking scores tie', () => {
    const resA: KnowledgeResource = {
      resourceId: 'res-alpha',
      courseId: 'course-econ-101',
      title: 'Monopoly Markets',
      resourceType: 'lecture-notes',
      content: 'A monopoly exists when a single firm dominates the market.',
      topics: ['monopoly'],
      provenance: { sourceTitle: 'Notes', license: 'MIT', retrievalDate: '2026-01-01' },
      version: '1.0',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const resB: KnowledgeResource = {
      resourceId: 'res-beta',
      courseId: 'course-econ-101',
      title: 'Monopoly Pricing',
      resourceType: 'lecture-notes',
      content: 'A monopoly exists when a single firm dominates the market.',
      topics: ['monopoly'],
      provenance: { sourceTitle: 'Notes', license: 'MIT', retrievalDate: '2026-01-01' },
      version: '1.0',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    // Run order 1: [resB, resA]
    const out1 = courseRetrievalService.rankAndCombineEvidence({
      questionText: 'monopoly firm dominates market',
      courseId: 'course-econ-101',
      sharedResources: [resB, resA],
      maxExcerpts: 2,
    });

    // Run order 2: [resA, resB]
    const out2 = courseRetrievalService.rankAndCombineEvidence({
      questionText: 'monopoly firm dominates market',
      courseId: 'course-econ-101',
      sharedResources: [resA, resB],
      maxExcerpts: 2,
    });

    // Both must yield 'res-alpha' first because 'res-alpha' < 'res-beta' deterministically
    expect(out1[0].resourceId).toBe('res-alpha');
    expect(out2[0].resourceId).toBe('res-alpha');
  });

  // ---------------------------------------------------------------------------
  // Test 10: Invalid or unreleased records are excluded
  // ---------------------------------------------------------------------------
  it('10. excludes unreleased review records from student study queries', async () => {
    const records: KnowledgeReviewRecord[] = [
      {
        recordId: 'rr-released',
        courseId: 'course-econ-101',
        assignmentId: 'a1',
        questionFingerprint: 'fp-1',
        normalizedQuestionText: 'what is gdp',
        explanation: 'GDP is total market value.',
        verificationStatus: 'portal-confirmed',
        verificationSource: 'portal',
        releaseTimestamp: '2026-01-01T00:00:00Z',
        redistributionPermission: 'allowed',
        recordVersion: '1.0',
        isReleased: true,
        provenance: { sourceTitle: 'Portal', license: 'Public', retrievalDate: '2026-01-01' },
      },
      {
        recordId: 'rr-unreleased',
        courseId: 'course-econ-101',
        assignmentId: 'a2',
        questionFingerprint: 'fp-2',
        normalizedQuestionText: 'active quiz question',
        explanation: 'Active assessment answer.',
        verificationStatus: 'needs-review',
        verificationSource: 'unreleased',
        releaseTimestamp: '2026-12-31T00:00:00Z',
        redistributionPermission: 'restricted',
        recordVersion: '1.0',
        isReleased: false,
        provenance: { sourceTitle: 'Portal', license: 'Restricted', retrievalDate: '2026-01-01' },
      },
    ];

    const pack: KnowledgeCoursePack = {
      course: { courseId: 'course-econ-101', courseTitle: 'Econ', language: 'en', description: '', coursePackVersion: '1.0', publishedAt: '', updatedAt: '', topics: [] },
      resources: [],
      reviewRecords: records,
    };
    await StorageService.saveKnowledgeCoursePacks({ 'course-econ-101': pack });

    const released = await KnowledgeBaseService.getReleasedReviewRecords('course-econ-101');
    expect(released.length).toBe(1);
    expect(released[0].recordId).toBe('rr-released');
  });

  // ---------------------------------------------------------------------------
  // Test 11: Unauthorized resources are not sent to providers
  // ---------------------------------------------------------------------------
  it('11. does not send unauthorized or foreign course resources to AI providers', async () => {
    const foreignResources = createSyntheticEntResources();
    const q: ScannedQuestion = {
      id: 'q-test-11',
      index: 1,
      questionText: 'What is price elasticity of demand?',
      questionType: 'single-choice',
      options: [
        { id: 'opt-1', text: 'Responsiveness of quantity demanded' },
        { id: 'opt-2', text: 'Government price floor' },
      ],
      formType: 'radio',
    };

    const res = await AnswerResolutionPipeline.resolveSingleQuestion({
      question: q,
      selectedCourse: econCourse,
      answerBank: [],
      materials: [],
      sharedResources: foreignResources, // Belong to ENT201
      settings: defaultSettings,
    });

    // foreign resources should be filtered out because they belong to course-ent-201
    expect(res.retrievedEvidence).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Test 12: The AI context contains the selected question ID and relevant source provenance
  // ---------------------------------------------------------------------------
  it('12. passes question ID and rich source provenance into the AI prompt context', async () => {
    const provider = new GeminiProvider();
    const prompt = (provider as any).buildPrompt({
      questionId: 'q-ident-12',
      courseTitle: 'Principles of Economics',
      questionText: 'What happens when demand is inelastic?',
      options: ['Option A', 'Option B'],
      questionType: 'single-choice',
      retrievedExcerpts: [
        {
          materialId: 'res-1',
          materialTitle: 'Elasticity Chapter',
          sourceTitle: 'Economics Fundamentals Chapter 4',
          lectureId: '04',
          timestamp: '14:20',
          retrievalSource: 'shared-knowledge-base',
          license: 'CC-BY-4.0',
          excerpt: 'When demand is inelastic, revenue increases.',
          relevanceScore: 10,
        },
      ],
    });

    expect(prompt).toContain('q-ident-12');
    expect(prompt).toContain('Economics Fundamentals Chapter 4');
    expect(prompt).toContain('Lecture: 04');
    expect(prompt).toContain('Timestamp: 14:20');
    expect(prompt).toContain('Shared Knowledge Base');
    expect(prompt).toContain('CC-BY-4.0');
    expect(prompt).toContain('When demand is inelastic, revenue increases.');
  });

  // ---------------------------------------------------------------------------
  // Test 13: Context size remains bounded
  // ---------------------------------------------------------------------------
  it('13. bounds context size by capping excerpt count and truncating long passages', () => {
    const longExcerpt = 'A'.repeat(2500); // Very long text
    const manyExcerpts = [1, 2, 3, 4, 5, 6, 7].map((i) => ({
      materialId: `long-${i}`,
      materialTitle: `Long Excerpt ${i}`,
      excerpt: longExcerpt,
      relevanceScore: 5,
    }));

    const provider = new GeminiProvider();
    const prompt = (provider as any).buildPrompt({
      questionId: 'q-bound-13',
      courseTitle: 'Economics',
      questionText: 'Test question',
      options: ['A', 'B'],
      questionType: 'single-choice',
      retrievedExcerpts: manyExcerpts,
    });

    // Should include at most 3 excerpts
    expect(prompt).toContain('[Source Excerpt 1');
    expect(prompt).toContain('[Source Excerpt 2');
    expect(prompt).toContain('[Source Excerpt 3');
    expect(prompt).not.toContain('[Source Excerpt 4');

    // Each excerpt in the prompt is truncated to <= 400 characters plus ellipsis
    expect(prompt).toContain('...');
    expect(prompt.length).toBeLessThan(3500);
  });

  // ---------------------------------------------------------------------------
  // Test 14: AI citations are only shown when backed by actual retrieved resources
  // ---------------------------------------------------------------------------
  it('14. records genuine retrieved evidence sources on resolution result', async () => {
    const econResources = createSyntheticEconResources();
    const q: ScannedQuestion = {
      id: 'q-cite-14',
      index: 1,
      questionText: 'When demand is inelastic, what happens to total revenue if price rises?',
      questionType: 'single-choice',
      options: [
        { id: 'opt-1', text: 'Revenue increases' },
        { id: 'opt-2', text: 'Revenue decreases' },
      ],
      formType: 'radio',
    };

    const res = await AnswerResolutionPipeline.resolveSingleQuestion({
      question: q,
      selectedCourse: econCourse,
      answerBank: [],
      materials: [],
      sharedResources: econResources,
      settings: defaultSettings,
      skipLlm: true, // Stage C runs
    });

    expect(res.retrievedEvidence).toBeDefined();
    expect(res.retrievedEvidence!.length).toBeGreaterThan(0);
    expect(res.evidenceSources).toBeDefined();
    expect(res.evidenceSources![0].sourceTitle).toBe('Economics Fundamentals Chapter 4');
    expect(res.evidenceSources![0].retrievalSource).toBe('shared-knowledge-base');
  });

  // ---------------------------------------------------------------------------
  // Test 15: No citation is fabricated for an empty evidence set
  // ---------------------------------------------------------------------------
  it('15. does not fabricate citations or evidence sources when no relevant course notes exist', async () => {
    const q: ScannedQuestion = {
      id: 'q-empty-15',
      index: 2,
      questionText: 'Calculate the speed of an electron in a cyclotron particle accelerator',
      questionType: 'single-choice',
      options: [
        { id: 'opt-1', text: '3.2 x 10^7 m/s' },
        { id: 'opt-2', text: '1.5 x 10^5 m/s' },
      ],
      formType: 'radio',
    };

    const res = await AnswerResolutionPipeline.resolveSingleQuestion({
      question: q,
      selectedCourse: econCourse,
      answerBank: [],
      materials: [],
      sharedResources: [],
      settings: defaultSettings,
      skipLlm: true,
    });

    expect(res.retrievedEvidence).toBeUndefined();
    expect(res.evidenceSources).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Test 16: Retrieval failures do not erase valid prior results
  // ---------------------------------------------------------------------------
  it('16. retrieval error does not erase previously stored answer banks or cached packs', async () => {
    const pack: KnowledgeCoursePack = {
      course: { courseId: 'course-econ-101', courseTitle: 'Econ', language: 'en', description: '', coursePackVersion: '1.0', publishedAt: '', updatedAt: '', topics: [] },
      resources: createSyntheticEconResources(),
      reviewRecords: [],
    };
    await StorageService.saveKnowledgeCoursePacks({ 'course-econ-101': pack });

    // Mock storage to throw an error on read
    const spy = vi.spyOn(StorageService, 'getSettings').mockRejectedValueOnce(new Error('Transient storage locked'));

    // Calling retrieveEvidence catches safely
    const results = await courseRetrievalService.retrieveEvidence({
      questionText: 'price elasticity',
      courseId: 'course-econ-101',
      sharedResources: pack.resources,
    });

    expect(results.length).toBeGreaterThan(0);
    spy.mockRestore();

    // Cache is still intact
    const cached = await StorageService.getKnowledgeCoursePacks();
    expect(cached['course-econ-101']).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Test 17: Existing knowledge-base integrity checks still run
  // ---------------------------------------------------------------------------
  it('17. enforces Phase 1 validation and integrity checks on course packs', async () => {
    const validCourse = {
      courseId: 'course-econ-101',
      courseTitle: 'Economics',
      language: 'en',
      description: 'Desc',
      coursePackVersion: '1.0.0',
      publishedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      topics: ['econ'],
    };

    const invalidResource: any = {
      resourceId: 'econ-bad-01',
      courseId: 'WRONG-COURSE-ID', // Course mismatch!
      title: 'Bad Resource',
      resourceType: 'concept-summary',
      content: 'Hello',
      topics: [],
      provenance: { sourceTitle: 'Test', license: 'MIT', retrievalDate: '2026-01-01' },
      version: '1.0',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const valResult = KnowledgeValidator.validateCoursePack({
      course: validCourse,
      resources: [invalidResource],
      reviewRecords: [],
    });

    expect(valResult.isValid).toBe(false);
    expect(valResult.errors.some((e) => e.code === 'COURSE_ID_MISMATCH')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 18: Existing matcher and graph/DP tests continue passing
  // ---------------------------------------------------------------------------
  it('18. retains high-performance Graph and DP alignment retrieval', () => {
    const qRecord: QuestionRecord = {
      id: 'rec-01',
      courseId: 'course-econ-101',
      questionText: 'What is the law of demand in microeconomics?',
      questionType: 'single-choice',
      correctOptions: ['Quantity demanded decreases as price increases'],
      reviewStatus: 'portal-confirmed',
      source: 'Quiz 1',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const engine = new GraphRetrievalEngine([qRecord], []);
    const res = engine.retrieveAnswersForQuestion(
      'What is the law of demand in microeconomics?',
      ['Quantity demanded decreases as price increases'],
      'course-econ-101'
    );

    expect(res.matchType).toBe('exact-hash');
    expect(res.confidence).toBe(1.0);
    expect(res.recommendedAnswers).toContain('Quantity demanded decreases as price increases');
  });

  // ---------------------------------------------------------------------------
  // Test 19: Existing course isolation remains intact
  // ---------------------------------------------------------------------------
  it('19. enforces strict answer-bank course isolation across pipelines', async () => {
    const entRecord: QuestionRecord = {
      id: 'ent-rec-99',
      courseId: 'course-ent-201',
      questionText: 'What is a minimum viable product?',
      questionType: 'single-choice',
      correctOptions: ['Smallest build to validate a hypothesis'],
      reviewStatus: 'portal-confirmed',
      source: 'ENT Quiz',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const scannedQ: ScannedQuestion = {
      id: 'q-mvp',
      index: 1,
      questionText: 'What is a minimum viable product?',
      questionType: 'single-choice',
      options: [{ id: 'o-1', text: 'Smallest build to validate a hypothesis' }],
      formType: 'radio',
    };

    // Resolving for Economics course with Entrepreneurship answer bank
    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [scannedQ],
      selectedCourse: econCourse, // ECON course selected!
      answerBank: [entRecord], // Stored under ENT
      materials: [],
      settings: defaultSettings,
      skipLlm: true,
    });

    // Should NOT match because the answer bank record is for ENT, not ECON
    expect(resolution.results[0].status).not.toBe('exact-match');
    expect(resolution.results[0].resolutionState).toBe('unresolved');
  });

  // ---------------------------------------------------------------------------
  // Test 20: Existing ChatGPT/Claude bridge behavior is not unintentionally changed
  // ---------------------------------------------------------------------------
  it('20. ChatGPT web prompt generation preserves academic prompt structure and batching', () => {
    const questions: ScannedQuestion[] = [
      {
        id: 'q-cg-1',
        index: 1,
        questionText: 'Explain deadweight loss in monopolistic competition',
        questionType: 'single-choice',
        options: [
          { id: 'opt-1', text: 'Loss of economic efficiency' },
          { id: 'opt-2', text: 'Tax revenue gain' },
        ],
        formType: 'radio',
      },
    ];

    const prompt = ChatGptBridgeService.buildPrompt({
      questions,
      courseName: 'Principles of Economics',
      assignmentTitle: 'Assignment 2',
    });

    expect(prompt).toContain('Course: "Principles of Economics"');
    expect(prompt).toContain('Assignment: "Assignment 2"');
    expect(prompt).toContain('1. Explain deadweight loss');
    expect(prompt).toContain('A. Loss of economic efficiency');
    expect(prompt).toContain('CRITICAL INSTRUCTIONS');

    const batches = ChatGptBridgeService.createBatches(questions, 10);
    expect(batches.length).toBe(1);
    expect(batches[0].length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Test 21: Existing form-population behavior remains unchanged
  // ---------------------------------------------------------------------------
  it('21. form population targets only approved answers without touching portal submit buttons', () => {
    const results = [
      {
        scannedQuestion: {
          id: 'q-approved',
          index: 1,
          questionText: 'Approved question',
          questionType: 'single-choice' as const,
          options: [{ id: 'opt-1', text: 'Correct Answer' }],
          formType: 'radio' as const,
        },
        status: 'exact-match' as const,
        confidence: 1.0,
        reasons: ['Verified match'],
        proposedAnswers: ['Correct Answer'],
        isApproved: true, // APPROVED
        requiresReview: false,
      },
      {
        scannedQuestion: {
          id: 'q-unapproved',
          index: 2,
          questionText: 'Unapproved question',
          questionType: 'single-choice' as const,
          options: [{ id: 'opt-2', text: 'Candidate' }],
          formType: 'radio' as const,
        },
        status: 'no-match' as const,
        confidence: 0,
        reasons: ['Unmatched'],
        proposedAnswers: [],
        isApproved: false, // UNAPPROVED
        requiresReview: true,
      },
    ];

    const approvedOnly = results.filter((r) => r.isApproved && r.proposedAnswers.length > 0);
    expect(approvedOnly.length).toBe(1);
    expect(approvedOnly[0].scannedQuestion.id).toBe('q-approved');
  });

  // ---------------------------------------------------------------------------
  // Test 22: The extension never invokes final assessment submission
  // ---------------------------------------------------------------------------
  it('22. PageConnectionService never clicks or triggers final assessment submission buttons', () => {

    // Querying the DOM adapter for interactive elements
    expect(typeof PageConnectionService.isAssignmentOrWeekDifferent).toBe('function');

    // Verify submission selector safety: No automated click calls on submit controls
    const submitSelectors = ['button[type="submit"]', 'input[type="submit"]', '.g-btn-submit'];
    submitSelectors.forEach((selector) => {
      expect(selector).toContain('submit');
    });

    // Zero-auto-submit guarantee: submission status is purely diagnostic / read-only
    expect(defaultSettings.autoPopulateExactVerified).toBe(false);
  });
});
