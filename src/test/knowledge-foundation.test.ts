import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  KnowledgeValidator,
  KnowledgeBaseClient,
  KnowledgeClientError,
  KnowledgeCacheService,
  KnowledgeBaseService,
  validateRelativeRepoPath,
  compareSemver,
  parseSemver,
  computeSha256,
  verifyIntegrity,
} from '@/lib/knowledge';
import { StorageService } from '@/lib/storage';
import {
  KnowledgeManifest,
  KnowledgeCourse,
  KnowledgeResource,
  KnowledgeReviewRecord,
  KnowledgeCoursePack,
} from '@/types/knowledge';

describe('Swayam404 Phase 1 — Shared Knowledge Base Foundation', () => {
  beforeEach(async () => {
    await StorageService.clearAll();
    vi.restoreAllMocks();
  });

  // Helper generator for valid synthetic course metadata
  const createValidCourse = (courseId = 'course-econ-101'): KnowledgeCourse => ({
    courseId,
    courseTitle: 'Principles of Economics (Synthetic Test)',
    language: 'en',
    description: 'Synthetic foundational economics study pack.',
    coursePackVersion: '1.0.0',
    publishedAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
    topics: ['supply-and-demand', 'elasticity'],
  });

  // Helper generator for valid synthetic learning resources
  const createValidResources = (courseId = 'course-econ-101'): KnowledgeResource[] => [
    {
      resourceId: `${courseId}-res-01`,
      courseId,
      title: 'Concept Summary: Price Elasticity',
      resourceType: 'concept-summary',
      content: 'Elasticity measures responsiveness of demand to price alterations.',
      topics: ['elasticity', 'demand'],
      provenance: {
        sourceTitle: 'Synthetic Economics Notes',
        sourceUrl: 'https://example.org/synthetic/econ',
        license: 'CC-BY-4.0',
        retrievalDate: '2026-01-15T00:00:00Z',
      },
      version: '1.0.0',
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-01-15T00:00:00Z',
    },
  ];

  // Helper generator for valid synthetic released review records
  const createValidReviewRecords = (courseId = 'course-econ-101'): KnowledgeReviewRecord[] => [
    {
      recordId: `${courseId}-rev-01`,
      courseId,
      assignmentId: 'assignment-past-w01',
      questionFingerprint: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      normalizedQuestionText: 'what is inelastic demand',
      options: ['Demand responsiveness < 1', 'Demand responsiveness > 1'],
      explanation: 'Inelastic demand has elasticity magnitude strictly less than 1.',
      verificationStatus: 'portal-confirmed',
      verificationSource: 'portal_graded_feedback',
      releaseTimestamp: '2025-12-01T00:00:00Z',
      redistributionPermission: 'Permitted educational review release',
      recordVersion: '1.0.0',
      isReleased: true,
      provenance: {
        sourceTitle: 'Released Portal Exam Archive',
        license: 'CC-BY-4.0',
        retrievalDate: '2026-01-15T00:00:00Z',
      },
    },
  ];

  // 1. Valid manifest accepted
  it('1. accepts a valid manifest with correct schema and dataset version', async () => {
    const rawManifest: KnowledgeManifest = {
      schemaVersion: '1.0.0',
      datasetVersion: '1.0.0',
      name: 'swayam404-knowledge',
      description: 'Shared open learning knowledge base',
      publishedAt: '2026-01-15T00:00:00Z',
      courses: [
        {
          courseId: 'course-econ-101',
          courseTitle: 'Economics',
          language: 'en',
          coursePackVersion: '1.0.0',
          lastUpdated: '2026-01-15T00:00:00Z',
          metadataPath: 'courses/course-econ-101/course.json',
          resourcesPath: 'courses/course-econ-101/resources.json',
          contentHash: '48ff393d2b67e2aac0916ecbb54065acb77e91b91a5287c711ff97a7fdfd355a',
          resourceCount: 1,
          reviewRecordCount: 1,
        },
      ],
    };

    const res = KnowledgeValidator.validateManifest(rawManifest);
    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.data?.datasetVersion).toBe('1.0.0');
    expect(res.acceptedCoursesCount).toBe(1);
  });

  // 2. Unsupported schema rejected
  it('2. rejects an unsupported schema version', () => {
    const invalidSchemaManifest = {
      schemaVersion: '2.0.0', // Unsupported
      datasetVersion: '1.0.0',
      name: 'swayam404-knowledge',
      publishedAt: '2026-01-15T00:00:00Z',
      courses: [],
    };

    const res = KnowledgeValidator.validateManifest(invalidSchemaManifest);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.code === 'UNSUPPORTED_SCHEMA')).toBe(true);
  });

  // 3. Invalid dataset version rejected
  it('3. rejects an invalid dataset version that does not match semver format', () => {
    const invalidVersionManifest = {
      schemaVersion: '1.0.0',
      datasetVersion: 'v1-latest', // Not valid X.Y.Z
      name: 'swayam404-knowledge',
      publishedAt: '2026-01-15T00:00:00Z',
      courses: [],
    };

    const res = KnowledgeValidator.validateManifest(invalidVersionManifest);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.code === 'INVALID_VERSION_FORMAT')).toBe(true);
  });

  // 4. Duplicate course IDs rejected
  it('4. rejects duplicate course IDs in the manifest catalog', () => {
    const duplicateManifest = {
      schemaVersion: '1.0.0',
      datasetVersion: '1.0.0',
      name: 'swayam404-knowledge',
      publishedAt: '2026-01-15T00:00:00Z',
      courses: [
        {
          courseId: 'course-econ-101',
          courseTitle: 'Economics A',
          language: 'en',
          coursePackVersion: '1.0.0',
          lastUpdated: '2026-01-15T00:00:00Z',
          metadataPath: 'courses/econ-101/course.json',
          resourcesPath: 'courses/econ-101/resources.json',
          contentHash: '48ff393d2b67e2aac0916ecbb54065acb77e91b91a5287c711ff97a7fdfd355a',
          resourceCount: 1,
          reviewRecordCount: 0,
        },
        {
          courseId: 'course-econ-101', // Duplicate ID
          courseTitle: 'Economics B',
          language: 'en',
          coursePackVersion: '1.0.0',
          lastUpdated: '2026-01-15T00:00:00Z',
          metadataPath: 'courses/econ-101-b/course.json',
          resourcesPath: 'courses/econ-101-b/resources.json',
          contentHash: '48ff393d2b67e2aac0916ecbb54065acb77e91b91a5287c711ff97a7fdfd355a',
          resourceCount: 1,
          reviewRecordCount: 0,
        },
      ],
    };

    const res = KnowledgeValidator.validateManifest(duplicateManifest);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.code === 'DUPLICATE_COURSE_ID')).toBe(true);
  });

  // 5. Missing course file reported
  it('5. reports validation failure when course file or metadata is missing or null', () => {
    const res = KnowledgeValidator.validateCourse(null);
    expect(res.isValid).toBe(false);
    expect(res.errors[0].code).toBe('INVALID_TYPE');

    const missingTitleCourse = {
      courseId: 'course-econ-101',
      // courseTitle missing
      language: 'en',
      coursePackVersion: '1.0.0',
      publishedAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-01-15T00:00:00Z',
    };
    const res2 = KnowledgeValidator.validateCourse(missingTitleCourse);
    expect(res2.isValid).toBe(false);
    expect(res2.errors.some((e) => e.path === 'courseTitle')).toBe(true);
  });

  // 6. Invalid resource IDs rejected
  it('6. rejects invalid or duplicate resource IDs', () => {
    const invalidResourceId = [
      {
        resourceId: 'invalid ID with spaces!@#',
        courseId: 'course-econ-101',
        title: 'Title',
        resourceType: 'concept-summary',
        content: 'Content',
        topics: [],
        provenance: { sourceTitle: 'Src', license: 'MIT', retrievalDate: '2026-01-01T00:00:00Z' },
        version: '1.0.0',
      },
    ];
    const res1 = KnowledgeValidator.validateResources(invalidResourceId, 'course-econ-101');
    expect(res1.isValid).toBe(false);
    expect(res1.errors.some((e) => e.code === 'INVALID_RESOURCE_ID')).toBe(true);

    const duplicateResources = [
      {
        resourceId: 'res-01',
        courseId: 'course-econ-101',
        title: 'Title 1',
        resourceType: 'concept-summary',
        content: 'Content 1',
        topics: [],
        provenance: { sourceTitle: 'Src', license: 'MIT', retrievalDate: '2026-01-01T00:00:00Z' },
        version: '1.0.0',
      },
      {
        resourceId: 'res-01', // Duplicate!
        courseId: 'course-econ-101',
        title: 'Title 2',
        resourceType: 'concept-summary',
        content: 'Content 2',
        topics: [],
        provenance: { sourceTitle: 'Src', license: 'MIT', retrievalDate: '2026-01-01T00:00:00Z' },
        version: '1.0.0',
      },
    ];
    const res2 = KnowledgeValidator.validateResources(duplicateResources, 'course-econ-101');
    expect(res2.isValid).toBe(false);
    expect(res2.errors.some((e) => e.code === 'DUPLICATE_RESOURCE_ID')).toBe(true);
  });

  // 7. Path traversal rejected
  it('7. strictly rejects path traversal, absolute paths, backslashes, and null bytes', () => {
    expect(validateRelativeRepoPath('../etc/passwd').isValid).toBe(false);
    expect(validateRelativeRepoPath('courses/../../secret.json').isValid).toBe(false);
    expect(validateRelativeRepoPath('/courses/econ/course.json').isValid).toBe(false);
    expect(validateRelativeRepoPath('C:\\courses\\econ\\course.json').isValid).toBe(false);
    expect(validateRelativeRepoPath('courses\\econ\\course.json').isValid).toBe(false);
    expect(validateRelativeRepoPath('courses/econ/\0course.json').isValid).toBe(false);

    // Valid relative path succeeds
    expect(validateRelativeRepoPath('courses/course-econ-101/course.json').isValid).toBe(true);
  });

  // 8. Malformed metadata rejected
  it('8. rejects malformed dates, invalid enums, and corrupted metadata', () => {
    const malformedResource = [
      {
        resourceId: 'res-01',
        courseId: 'course-econ-101',
        title: 'Title',
        resourceType: 'non-existent-type', // Invalid enum
        content: 'Some text',
        topics: [],
        provenance: {
          sourceTitle: 'Source',
          license: 'MIT',
          retrievalDate: 'not-a-valid-date', // Corrupted date
        },
        version: '1.0.0',
      },
    ];

    const res = KnowledgeValidator.validateResources(malformedResource, 'course-econ-101');
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.code === 'INVALID_ENUM')).toBe(true);
    expect(res.errors.some((e) => e.code === 'INVALID_DATE')).toBe(true);
  });

  // 9. Incorrect content hash rejected
  it('9. rejects incorrect SHA-256 content hashes and malformed hash formats', async () => {
    const text = 'Swayam404 benchmark content';
    const realHash = await computeSha256(text);
    expect(realHash).toHaveLength(64);

    const verified = await verifyIntegrity(text, realHash);
    expect(verified.matches).toBe(true);

    const tampered = await verifyIntegrity(text, '0000000000000000000000000000000000000000000000000000000000000000');
    expect(tampered.matches).toBe(false);

    // Malformed hash (not 64 hex characters)
    const malformed = await verifyIntegrity(text, 'invalid-short-hash');
    expect(malformed.matches).toBe(false);
  });

  // 10. Network timeout handled
  it('10. handles network timeouts gracefully without unhandled exceptions', async () => {
    const mockFetch = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(new Error('Request timed out'));
            });
          }
        })
    );

    const client = new KnowledgeBaseClient({
      baseUrl: 'https://example.org/kb',
      timeoutMs: 50,
      maxRetries: 0,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(client.fetchManifest()).rejects.toThrow(/timed out/i);
  });

  // 11. HTTP errors reported correctly
  it('11. reports HTTP errors (such as 404 and 500) with detailed status codes and URLs', async () => {
    const mockFetch404 = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const client = new KnowledgeBaseClient({
      baseUrl: 'https://example.org/kb',
      maxRetries: 0,
      fetchFn: mockFetch404 as unknown as typeof fetch,
    });

    await expect(client.fetchManifest()).rejects.toThrow(KnowledgeClientError);
    await expect(client.fetchManifest()).rejects.toThrow(/HTTP 404/);
  });

  // 12. Empty repository URL disables remote fetching without breaking
  it('12. disables remote fetching gracefully when repository URL is empty or unset', async () => {
    const client = new KnowledgeBaseClient({ baseUrl: '' });
    expect(client.isConfigured()).toBe(false);

    const manifest = await client.fetchManifest();
    expect(manifest).toBeNull();

    const status = await KnowledgeBaseService.getStatus();
    expect(status.configured).toBe(false);
    expect(status.status).toBe('unconfigured');

    const syncRes = await KnowledgeBaseService.syncNow('');
    expect(syncRes.success).toBe(false);
    expect(syncRes.error).toBe('UNCONFIGURED_URL');
  });

  // 13. Valid remote packs are cached
  it('13. downloads and caches valid remote packs in local storage', async () => {
    const course = createValidCourse('course-econ-101');
    const resources = createValidResources('course-econ-101');
    const reviewRecords = createValidReviewRecords('course-econ-101');

    const manifest: KnowledgeManifest = {
      schemaVersion: '1.0.0',
      datasetVersion: '1.0.0',
      name: 'swayam404-knowledge',
      description: 'Test KB',
      publishedAt: '2026-01-15T00:00:00Z',
      courses: [
        {
          courseId: 'course-econ-101',
          courseTitle: course.courseTitle,
          language: 'en',
          coursePackVersion: '1.0.0',
          lastUpdated: '2026-01-15T00:00:00Z',
          metadataPath: 'courses/course-econ-101/course.json',
          resourcesPath: 'courses/course-econ-101/resources.json',
          reviewRecordsPath: 'courses/course-econ-101/review-records.json',
          contentHash: '48ff393d2b67e2aac0916ecbb54065acb77e91b91a5287c711ff97a7fdfd355a',
          resourceCount: 1,
          reviewRecordCount: 1,
        },
      ],
    };

    const mockLoader = {
      isConfigured: () => true,
      getBaseUrl: () => 'https://example.org/kb',
      fetchManifest: async () => manifest,
      fetchCoursePack: async () => ({
        course,
        resources,
        reviewRecords,
        contentHash: '48ff393d2b67e2aac0916ecbb54065acb77e91b91a5287c711ff97a7fdfd355a',
      }),
    };

    const syncRes = await KnowledgeCacheService.syncFromRemote(
      mockLoader,
      'https://example.org/kb'
    );
    expect(syncRes.success).toBe(true);
    expect(syncRes.downloadedCourses).toBe(1);

    // Verify persisted into storage
    const cachedManifest = await KnowledgeCacheService.getCachedManifest();
    expect(cachedManifest?.datasetVersion).toBe('1.0.0');

    const cachedPack = await KnowledgeCacheService.getCachedCoursePack('course-econ-101');
    expect(cachedPack?.course.courseId).toBe('course-econ-101');
    expect(cachedPack?.resources).toHaveLength(1);
    expect(cachedPack?.reviewRecords).toHaveLength(1);
  });

  // 14. Unchanged packs are not downloaded unnecessarily
  it('14. avoids re-downloading unchanged packs when remote version and hashes match', async () => {
    const course = createValidCourse('course-econ-101');
    const resources = createValidResources('course-econ-101');
    const reviewRecords = createValidReviewRecords('course-econ-101');

    const manifest: KnowledgeManifest = {
      schemaVersion: '1.0.0',
      datasetVersion: '1.0.0',
      name: 'swayam404-knowledge',
      description: 'Test KB',
      publishedAt: '2026-01-15T00:00:00Z',
      courses: [
        {
          courseId: 'course-econ-101',
          courseTitle: course.courseTitle,
          language: 'en',
          coursePackVersion: '1.0.0',
          lastUpdated: '2026-01-15T00:00:00Z',
          metadataPath: 'courses/course-econ-101/course.json',
          resourcesPath: 'courses/course-econ-101/resources.json',
          contentHash: '48ff393d2b67e2aac0916ecbb54065acb77e91b91a5287c711ff97a7fdfd355a',
          resourceCount: 1,
          reviewRecordCount: 1,
        },
      ],
    };

    const fetchCoursePackSpy = vi.fn().mockResolvedValue({
      course,
      resources,
      reviewRecords,
      contentHash: '48ff393d2b67e2aac0916ecbb54065acb77e91b91a5287c711ff97a7fdfd355a',
    });

    const mockLoader = {
      isConfigured: () => true,
      getBaseUrl: () => 'https://example.org/kb',
      fetchManifest: async () => manifest,
      fetchCoursePack: fetchCoursePackSpy,
    };

    // First sync downloads pack
    await KnowledgeCacheService.syncFromRemote(mockLoader, 'https://example.org/kb');
    expect(fetchCoursePackSpy).toHaveBeenCalledTimes(1);

    // Second sync: remote version and hash are identical -> skips download!
    const secondSyncRes = await KnowledgeCacheService.syncFromRemote(mockLoader, 'https://example.org/kb');
    expect(secondSyncRes.success).toBe(true);
    expect(secondSyncRes.downloadedCourses).toBe(0);
    expect(fetchCoursePackSpy).toHaveBeenCalledTimes(1); // Not called again!
  });

  // 15. Failed refresh preserves the last valid cache
  it('15. retains the last valid cached state if a refresh operation fails', async () => {
    const course = createValidCourse('course-econ-101');
    const resources = createValidResources('course-econ-101');

    // Pre-populate valid cache
    const initialPack: KnowledgeCoursePack = {
      course,
      resources,
      reviewRecords: [],
      contentHash: '48ff393d2b67e2aac0916ecbb54065acb77e91b91a5287c711ff97a7fdfd355a',
    };
    await StorageService.saveKnowledgeCoursePacks({ 'course-econ-101': initialPack });
    await StorageService.saveKnowledgeManifest({
      schemaVersion: '1.0.0',
      datasetVersion: '1.0.0',
      name: 'Initial Valid',
      description: 'Initial',
      publishedAt: '2026-01-15T00:00:00Z',
      courses: [],
    });

    // Failing loader (network drop / 500 error)
    const failingLoader = {
      isConfigured: () => true,
      getBaseUrl: () => 'https://example.org/kb',
      fetchManifest: async () => {
        throw new Error('500 Internal Server Error');
      },
      fetchCoursePack: async () => {
        throw new Error('500');
      },
    };

    // Refresh fails
    await expect(
      KnowledgeCacheService.syncFromRemote(failingLoader, 'https://example.org/kb')
    ).rejects.toThrow('500 Internal Server Error');

    // Previous valid cache remains completely intact!
    const retainedPack = await KnowledgeCacheService.getCachedCoursePack('course-econ-101');
    expect(retainedPack).not.toBeNull();
    expect(retainedPack?.course.courseId).toBe('course-econ-101');
    expect(retainedPack?.resources).toHaveLength(1);
  });

  // 16. Invalid new data cannot overwrite valid data
  it('16. prevents malformed new packs from overwriting existing valid cache', async () => {
    const course = createValidCourse('course-econ-101');
    const validPack: KnowledgeCoursePack = {
      course,
      resources: createValidResources('course-econ-101'),
      reviewRecords: [],
      contentHash: '48ff393d2b67e2aac0916ecbb54065acb77e91b91a5287c711ff97a7fdfd355a',
    };
    await StorageService.saveKnowledgeCoursePacks({ 'course-econ-101': validPack });

    const corruptedLoader = {
      isConfigured: () => true,
      getBaseUrl: () => 'https://example.org/kb',
      fetchManifest: async () => ({
        schemaVersion: '1.0.0',
        datasetVersion: '1.1.0', // Newer version
        name: 'Updated KB',
        description: 'Updated',
        publishedAt: '2026-01-20T00:00:00Z',
        courses: [
          {
            courseId: 'course-econ-101',
            courseTitle: 'Economics',
            language: 'en',
            coursePackVersion: '1.1.0',
            lastUpdated: '2026-01-20T00:00:00Z',
            metadataPath: 'courses/econ/course.json',
            resourcesPath: 'courses/econ/resources.json',
            contentHash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
            resourceCount: 1,
            reviewRecordCount: 0,
          },
        ],
      }),
      fetchCoursePack: async () => ({
        course: { ...course, courseTitle: '' }, // MALFORMED: missing title
        resources: [],
        reviewRecords: [],
      }),
    };

    await expect(
      KnowledgeCacheService.syncFromRemote(corruptedLoader, 'https://example.org/kb')
    ).rejects.toThrow(/Validation failed/i);

    // Original valid pack is not corrupted
    const currentPack = await KnowledgeCacheService.getCachedCoursePack('course-econ-101');
    expect(currentPack?.course.courseTitle).toBe('Principles of Economics (Synthetic Test)');
  });

  // 17. Offline startup can use cached data
  it('17. allows offline startup to retrieve previously cached data without network calls', async () => {
    const course = createValidCourse('course-econ-101');
    const resources = createValidResources('course-econ-101');
    await StorageService.saveKnowledgeCoursePacks({
      'course-econ-101': {
        course,
        resources,
        reviewRecords: [],
      },
    });

    // Offline read uses local cache directly
    const cachedResources = await KnowledgeBaseService.getCourseResources('course-econ-101');
    expect(cachedResources).toHaveLength(1);
    expect(cachedResources[0].title).toContain('Price Elasticity');
  });

  // 18. Different courses remain isolated
  it('18. maintains strict isolation between different courses', async () => {
    const econCourse = createValidCourse('course-econ-101');
    const entCourse = createValidCourse('course-ent-201');
    entCourse.courseTitle = 'Entrepreneurship';

    const econRes = createValidResources('course-econ-101');
    const entRes: KnowledgeResource[] = [
      {
        resourceId: 'ent-res-01',
        courseId: 'course-ent-201',
        title: 'Venture Capital Economics',
        resourceType: 'concept-summary',
        content: 'Seed stage valuation mechanics.',
        topics: ['venture-capital'],
        provenance: { sourceTitle: 'Ent Notes', license: 'MIT', retrievalDate: '2026-01-01T00:00:00Z' },
        version: '1.0.0',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    await StorageService.saveKnowledgeCoursePacks({
      'course-econ-101': { course: econCourse, resources: econRes, reviewRecords: [] },
      'course-ent-201': { course: entCourse, resources: entRes, reviewRecords: [] },
    });

    // Economics search returns economics material only
    const econResults = await KnowledgeBaseService.searchResources('course-econ-101', 'elasticity');
    expect(econResults).toHaveLength(1);
    expect(econResults[0].courseId).toBe('course-econ-101');

    // Searching entrepreneurship for elasticity returns nothing
    const crossCourseResults = await KnowledgeBaseService.searchResources('course-ent-201', 'elasticity');
    expect(crossCourseResults).toHaveLength(0);
  });

  // 19. Review records require the correct release and provenance metadata
  it('19. requires review records to have isReleased=true and valid verificationStatus', () => {
    const unreleasedRecord = [
      {
        recordId: 'rev-01',
        courseId: 'course-econ-101',
        assignmentId: 'assign-01',
        questionFingerprint: '0123456789abcdef',
        normalizedQuestionText: 'some question',
        explanation: 'explanation',
        verificationStatus: 'portal-confirmed',
        verificationSource: 'portal',
        releaseTimestamp: '2026-01-01T00:00:00Z',
        redistributionPermission: 'allowed',
        recordVersion: '1.0.0',
        isReleased: false, // Prohibited!
        provenance: { sourceTitle: 'Src', license: 'MIT', retrievalDate: '2026-01-01T00:00:00Z' },
      },
    ];

    const res = KnowledgeValidator.validateReviewRecords(unreleasedRecord, 'course-econ-101');
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.code === 'UNRELEASED_ASSESSMENT_REJECTED')).toBe(true);
  });

  // 20. No credential or authentication requirement is introduced
  it('20. enforces that KnowledgeBaseClient operates without credentials or tokens', () => {
    const client = new KnowledgeBaseClient({ baseUrl: 'https://example.org/kb' });
    // Verify client has no auth token properties or headers
    expect((client as unknown as Record<string, unknown>).githubToken).toBeUndefined();
    expect((client as unknown as Record<string, unknown>).apiKey).toBeUndefined();
  });

  // 21. Deterministic semver comparison
  it('21. deterministically compares semantic versions without lexicographical flaws', () => {
    // Standard semver
    expect(compareSemver('1.10.0', '1.2.0')).toBe(1); // Lexicographical would fail here!
    expect(compareSemver('1.2.0', '1.10.0')).toBe(-1);
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('2.0.0', '1.99.99')).toBe(1);

    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver('not-a-version')).toBeNull();
  });

  // 22. Released review records are strictly isolated from active assignment population
  it('22. isolates released review records from active assignment auto-fill paths', async () => {
    const reviewRecords = createValidReviewRecords('course-econ-101');
    await StorageService.saveKnowledgeCoursePacks({
      'course-econ-101': {
        course: createValidCourse('course-econ-101'),
        resources: [],
        reviewRecords,
      },
    });

    const records = await KnowledgeBaseService.getReleasedReviewRecords('course-econ-101');
    expect(records).toHaveLength(1);
    expect(records[0].isReleased).toBe(true);

    // Review records are NEVER converted into QuestionRecord or populated into active questions
    const activeQuestions = await StorageService.getQuestions('course-econ-101');
    expect(activeQuestions).toHaveLength(0);
  });
});
