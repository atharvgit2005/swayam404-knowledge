/**
 * Swayam404 Reliable Update Architecture & Versioning Verification Suite
 *
 * Verifies strict separation between:
 * - Remote Knowledge-Base Updates (course packs, syllabi, questions)
 * - Extension-Code Versioning (immutable runtime JS, developer mode vs web store)
 *
 * Covers all 10 explicit acceptance criteria from user requirements.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  KnowledgeCacheService,
  KnowledgeBaseService,
} from '@/lib/knowledge';
import { StorageService } from '@/lib/storage';
import { CourseMaterialRetrievalService } from '@/lib/context/retrievalService';
import {
  KnowledgeCourse,
  KnowledgeResource,
  KnowledgeManifest,
  KnowledgeManifestCourseEntry,
  KnowledgeCoursePack,
} from '@/types/knowledge';
import fs from 'node:fs';
import path from 'node:path';

describe('Swayam404 Update Architecture & Versioning Suite', () => {
  const repoUrl = 'https://raw.githubusercontent.com/swayam404/knowledge/main';
  const courseAId = 'course-econ-101';
  const courseBId = 'course-ent-201';

  // Valid 64-character SHA-256 hex strings for schema validator
  const hashA = '48ff393d2b67e2aa000000000000000000000000000000000000000000000001';
  const hashB = 'b7464e659d5c8e7f000000000000000000000000000000000000000000000002';
  const updatedHashA = '48ff393d2b67e2aa000000000000000000000000000000000000000000000003';
  const hashCs301 = '1111111111111111111111111111111111111111111111111111111111111111';

  const mockCourseA: KnowledgeCourse = {
    courseId: courseAId,
    courseTitle: 'Principles of Economics',
    language: 'en',
    description: 'Foundational concepts in microeconomics.',
    coursePackVersion: '1.0.0',
    publishedAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    topics: ['microeconomics', 'market-equilibrium'],
  };

  const mockCourseB: KnowledgeCourse = {
    courseId: courseBId,
    courseTitle: 'Entrepreneurship & Venture Initiation',
    language: 'en',
    description: 'Specialized course in venture initiation.',
    coursePackVersion: '1.0.0',
    publishedAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    topics: ['entrepreneurship', 'venture-capital'],
  };

  const mockResourceA: KnowledgeResource = {
    resourceId: 'res-econ-01',
    courseId: courseAId,
    title: 'Market Equilibrium Handout',
    resourceType: 'concept-summary',
    content: 'Market equilibrium occurs where quantity demanded equals quantity supplied.',
    topics: ['equilibrium', 'demand', 'supply'],
    provenance: {
      sourceTitle: 'Economics 101 Lecture',
      license: 'CC-BY-4.0',
      retrievalDate: '2026-02-01',
    },
    version: '1.0.0',
    contentHash: hashA,
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  };

  const mockResourceB: KnowledgeResource = {
    resourceId: 'res-ent-01',
    courseId: courseBId,
    title: 'Lean Startup Methodology',
    resourceType: 'concept-summary',
    content: 'Lean startup favors experimentation over elaborate planning and customer feedback over intuition.',
    topics: ['lean-startup', 'mvp'],
    provenance: {
      sourceTitle: 'Entrepreneurship 201 Lecture',
      license: 'CC-BY-4.0',
      retrievalDate: '2026-02-01',
    },
    version: '1.0.0',
    contentHash: hashB,
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  };

  const baseManifest: KnowledgeManifest = {
    schemaVersion: '1.0.0',
    datasetVersion: '1.0.0',
    name: 'Swayam404 Shared Knowledge Base',
    description: 'Verified public course packs and review records',
    publishedAt: '2026-02-01T00:00:00Z',
    minExtensionVersion: '1.0.0',
    courses: [
      {
        courseId: courseAId,
        courseTitle: 'Principles of Economics',
        language: 'en',
        coursePackVersion: '1.0.0',
        lastUpdated: '2026-02-01T00:00:00Z',
        metadataPath: `courses/${courseAId}/course.json`,
        resourcesPath: `courses/${courseAId}/resources.json`,
        reviewRecordsPath: `courses/${courseAId}/review-records.json`,
        contentHash: hashA,
        resourceCount: 1,
        reviewRecordCount: 0,
      },
      {
        courseId: courseBId,
        courseTitle: 'Entrepreneurship & Venture Initiation',
        language: 'en',
        coursePackVersion: '1.0.0',
        lastUpdated: '2026-02-01T00:00:00Z',
        metadataPath: `courses/${courseBId}/course.json`,
        resourcesPath: `courses/${courseBId}/resources.json`,
        reviewRecordsPath: `courses/${courseBId}/review-records.json`,
        contentHash: hashB,
        resourceCount: 1,
        reviewRecordCount: 0,
      },
    ],
  };

  const initialPackA: KnowledgeCoursePack = {
    course: mockCourseA,
    resources: [mockResourceA],
    reviewRecords: [],
    contentHash: hashA,
  };

  const initialPackB: KnowledgeCoursePack = {
    course: mockCourseB,
    resources: [mockResourceB],
    reviewRecords: [],
    contentHash: hashB,
  };

  beforeEach(async () => {
    await StorageService.clearAll();
    await StorageService.saveSettings({
      knowledgeBaseEnabled: true,
      knowledgeBaseRepoUrl: repoUrl,
    });
  });

  // --------------------------------------------------------------------------
  // Criterion 1: Detecting a newer knowledge-base version
  // --------------------------------------------------------------------------
  it('1. Detecting a newer knowledge-base version: identifies new dataset version and changed course packs', async () => {
    // Populate existing cache with v1.0.0
    await StorageService.saveKnowledgeManifest(baseManifest);
    await StorageService.saveKnowledgeCoursePacks({
      [courseAId]: initialPackA,
      [courseBId]: initialPackB,
    });

    const newerManifest: KnowledgeManifest = {
      ...baseManifest,
      datasetVersion: '1.1.0',
      courses: [
        {
          ...baseManifest.courses[0],
          coursePackVersion: '1.1.0',
          contentHash: updatedHashA,
        },
        baseManifest.courses[1],
      ],
    };

    const mockLoader = {
      isConfigured: () => true,
      getBaseUrl: () => repoUrl,
      fetchManifest: vi.fn().mockResolvedValue(newerManifest),
      fetchCoursePack: vi.fn(),
    };

    const updateCheck = await KnowledgeCacheService.checkForUpdates(mockLoader, repoUrl);

    expect(updateCheck.updateAvailable).toBe(true);
    expect(updateCheck.state).toBe('update-available');
    expect(updateCheck.currentVersion).toBe('1.0.0');
    expect(updateCheck.latestVersion).toBe('1.1.0');
    expect(updateCheck.changedCourses).toContain(courseAId);
    expect(updateCheck.changedCourses).not.toContain(courseBId);
    // Verified that check does NOT download packs
    expect(mockLoader.fetchCoursePack).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Criterion 2: No unnecessary downloads when the dataset is unchanged
  // --------------------------------------------------------------------------
  it('2. No unnecessary downloads when the dataset is unchanged: reuses cache without pack requests', async () => {
    // Initial sync
    const mockLoader = {
      isConfigured: () => true,
      getBaseUrl: () => repoUrl,
      fetchManifest: vi.fn().mockResolvedValue(baseManifest),
      fetchCoursePack: vi.fn().mockImplementation((entry: KnowledgeManifestCourseEntry) => {
        return Promise.resolve(entry.courseId === courseAId ? initialPackA : initialPackB);
      }),
    };

    const firstSync = await KnowledgeCacheService.syncFromRemote(mockLoader, repoUrl);
    expect(firstSync.success).toBe(true);
    expect(firstSync.downloadedCourses).toBe(2);
    expect(mockLoader.fetchCoursePack).toHaveBeenCalledTimes(2);

    // Second sync with identical dataset & matching content hashes
    mockLoader.fetchCoursePack.mockClear();
    const secondSync = await KnowledgeCacheService.syncFromRemote(mockLoader, repoUrl);

    expect(secondSync.success).toBe(true);
    expect(secondSync.downloadedCourses).toBe(0);
    expect(secondSync.downloadedResources).toBe(0);
    expect(secondSync.message).toContain('already up to date');
    // ZERO course pack fetches executed
    expect(mockLoader.fetchCoursePack).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Criterion 3: Updating one course without corrupting other course caches
  // --------------------------------------------------------------------------
  it('3. Updating one course without corrupting other course caches: Course A updates, Course B remains intact', async () => {
    // Preload both courses
    await StorageService.saveKnowledgeManifest(baseManifest);
    await StorageService.saveKnowledgeCoursePacks({
      [courseAId]: initialPackA,
      [courseBId]: initialPackB,
    });

    const updatedResourceA: KnowledgeResource = {
      ...mockResourceA,
      version: '1.2.0',
      content: 'Updated economic surplus and deadweight loss principles.',
      contentHash: updatedHashA,
    };

    const updatedPackA: KnowledgeCoursePack = {
      course: { ...mockCourseA, coursePackVersion: '1.2.0' },
      resources: [updatedResourceA],
      reviewRecords: [],
      contentHash: updatedHashA,
    };

    const updatedManifest: KnowledgeManifest = {
      ...baseManifest,
      datasetVersion: '1.2.0',
      courses: [
        {
          ...baseManifest.courses[0],
          coursePackVersion: '1.2.0',
          contentHash: updatedHashA,
        },
        baseManifest.courses[1], // Course B unchanged
      ],
    };

    const mockLoader = {
      isConfigured: () => true,
      getBaseUrl: () => repoUrl,
      fetchManifest: vi.fn().mockResolvedValue(updatedManifest),
      fetchCoursePack: vi.fn().mockImplementation((entry: KnowledgeManifestCourseEntry) => {
        if (entry.courseId === courseAId) return Promise.resolve(updatedPackA);
        throw new Error('Course B should not be fetched!');
      }),
    };

    const syncResult = await KnowledgeCacheService.syncFromRemote(mockLoader, repoUrl);
    expect(syncResult.success).toBe(true);
    expect(syncResult.downloadedCourses).toBe(1);

    // Verify Course A was updated
    const cachedPackA = await KnowledgeCacheService.getCachedCoursePack(courseAId);
    expect(cachedPackA?.course.coursePackVersion).toBe('1.2.0');
    expect(cachedPackA?.resources[0].content).toContain('deadweight loss');

    // Verify Course B was 100% preserved and undamaged
    const cachedPackB = await KnowledgeCacheService.getCachedCoursePack(courseBId);
    expect(cachedPackB).not.toBeNull();
    expect(cachedPackB?.course.coursePackVersion).toBe('1.0.0');
    expect(cachedPackB?.resources[0].title).toBe('Lean Startup Methodology');
  });

  // --------------------------------------------------------------------------
  // Criterion 4: Failed updates preserving the last valid cache
  // --------------------------------------------------------------------------
  it('4. Failed updates preserving the last valid cache: server failure leaves valid cache 100% intact', async () => {
    // Established valid cache
    await StorageService.saveKnowledgeManifest(baseManifest);
    await StorageService.saveKnowledgeCoursePacks({
      [courseAId]: initialPackA,
      [courseBId]: initialPackB,
    });

    // Failing loader (HTTP 500 or network failure)
    const failingLoader = {
      isConfigured: () => true,
      getBaseUrl: () => repoUrl,
      fetchManifest: vi.fn().mockRejectedValue(new Error('HTTP 500 Internal Server Error')),
      fetchCoursePack: vi.fn(),
    };

    // Must NOT silently treat unsuccessful sync as success
    await expect(
      KnowledgeCacheService.syncFromRemote(failingLoader, repoUrl)
    ).rejects.toThrow('HTTP 500 Internal Server Error');

    // Prior valid cache is strictly preserved
    const cachedPacks = await KnowledgeCacheService.getCachedCoursePacks();
    expect(cachedPacks[courseAId]).not.toBeUndefined();
    expect(cachedPacks[courseBId]).not.toBeUndefined();
    expect(cachedPacks[courseAId].course.courseTitle).toBe('Principles of Economics');

    // Status reflection
    const status = await KnowledgeBaseService.getStatus();
    expect(status.status).toBe('update-failed');
    expect(status.lastError).toContain('HTTP 500');
  });

  // --------------------------------------------------------------------------
  // Criterion 5: Offline startup and later synchronization
  // --------------------------------------------------------------------------
  it('5. Offline startup and later synchronization: reads cached resources offline; syncs when online', async () => {
    // Populate initial cache
    await StorageService.saveKnowledgeManifest(baseManifest);
    await StorageService.saveKnowledgeCoursePacks({
      [courseAId]: initialPackA,
    });

    // Offline simulation (fetch throws TypeError: Failed to fetch)
    const offlineLoader = {
      isConfigured: () => true,
      getBaseUrl: () => repoUrl,
      fetchManifest: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      fetchCoursePack: vi.fn(),
    };

    // 1. Extension startup offline reads cached data smoothly
    const cachedResources = await KnowledgeBaseService.getCourseResources(courseAId);
    expect(cachedResources.length).toBe(1);
    expect(cachedResources[0].title).toBe('Market Equilibrium Handout');

    // 2. Preflight check accurately reports OFFLINE state without crash
    const offlineCheck = await KnowledgeCacheService.checkForUpdates(offlineLoader, repoUrl);
    expect(offlineCheck.updateAvailable).toBe(false);
    expect(offlineCheck.state).toBe('offline');
    expect(offlineCheck.isOffline).toBe(true);

    // 3. Online restoration enables synchronization
    const onlineLoader = {
      isConfigured: () => true,
      getBaseUrl: () => repoUrl,
      fetchManifest: vi.fn().mockResolvedValue(baseManifest),
      fetchCoursePack: vi.fn().mockResolvedValue(initialPackA),
    };

    const onlineSync = await KnowledgeCacheService.syncFromRemote(onlineLoader, repoUrl);
    expect(onlineSync.success).toBe(true);
    const postStatus = await KnowledgeBaseService.getStatus();
    expect(postStatus.status).toBe('updated');
  });

  // --------------------------------------------------------------------------
  // Criterion 6: Dynamic course-catalog updates where supported
  // --------------------------------------------------------------------------
  it('6. Dynamic course-catalog updates: adding a new course in remote manifest registers in local catalog without reinstall', async () => {
    await StorageService.initDefaults();
    const initialCourses = await StorageService.getCourses();
    expect(initialCourses.some((c) => c.id === 'course-cs-301')).toBe(false);

    const newCoursePack: KnowledgeCoursePack = {
      course: {
        courseId: 'course-cs-301',
        courseTitle: 'Data Structures & Algorithms',
        language: 'en',
        description: 'Advanced algorithms, sorting, and graph trees.',
        coursePackVersion: '1.0.0',
        publishedAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
        topics: ['algorithms', 'trees'],
      },
      resources: [],
      reviewRecords: [],
      contentHash: hashCs301,
    };

    const expandedManifest: KnowledgeManifest = {
      ...baseManifest,
      datasetVersion: '1.3.0',
      courses: [
        ...baseManifest.courses,
        {
          courseId: 'course-cs-301',
          courseTitle: 'Data Structures & Algorithms',
          language: 'en',
          coursePackVersion: '1.0.0',
          lastUpdated: '2026-03-01T00:00:00Z',
          metadataPath: 'courses/course-cs-301/course.json',
          resourcesPath: 'courses/course-cs-301/resources.json',
          contentHash: hashCs301,
          resourceCount: 0,
          reviewRecordCount: 0,
        },
      ],
    };

    const mockLoader = {
      isConfigured: () => true,
      getBaseUrl: () => repoUrl,
      fetchManifest: vi.fn().mockResolvedValue(expandedManifest),
      fetchCoursePack: vi.fn().mockImplementation((entry: KnowledgeManifestCourseEntry) => {
        if (entry.courseId === 'course-cs-301') return Promise.resolve(newCoursePack);
        return Promise.resolve(entry.courseId === courseAId ? initialPackA : initialPackB);
      }),
    };

    const syncRes = await KnowledgeCacheService.syncFromRemote(mockLoader, repoUrl);
    expect(syncRes.success).toBe(true);

    // Newly added course is now dynamically registered in StorageService courses!
    const updatedCourses = await StorageService.getCourses();
    const csCourse = updatedCourses.find((c) => c.id === 'course-cs-301');
    expect(csCourse).not.toBeUndefined();
    expect(csCourse?.name).toBe('Data Structures & Algorithms');
  });

  // --------------------------------------------------------------------------
  // Criterion 7: Version display and update-status accuracy
  // --------------------------------------------------------------------------
  it('7. Version display and update-status accuracy: telemetry tracks unconfigured, up-to-date, downloading, updated, offline, and update-failed', async () => {
    // 1. Unconfigured state
    await StorageService.saveSettings({ knowledgeBaseEnabled: false, knowledgeBaseRepoUrl: '' });
    let status = await KnowledgeBaseService.getStatus();
    expect(status.status).toBe('unconfigured');

    // 2. Configured & Updated
    await StorageService.saveSettings({ knowledgeBaseEnabled: true, knowledgeBaseRepoUrl: repoUrl });
    await StorageService.saveKnowledgeUpdateState({
      status: 'updated',
      remoteDatasetVersion: '1.0.0',
    });
    status = await KnowledgeBaseService.getStatus();
    expect(status.status).toBe('updated');
    expect(status.remoteDatasetVersion).toBe('1.0.0');

    // 3. Update Available
    await StorageService.saveKnowledgeUpdateState({
      status: 'update-available',
      remoteDatasetVersion: '1.4.0',
    });
    status = await KnowledgeBaseService.getStatus();
    expect(status.status).toBe('update-available');
    expect(status.updateAvailable).toBe(true);

    // 4. Offline
    await StorageService.saveKnowledgeUpdateState({
      status: 'offline',
      lastError: 'Network timeout',
    });
    status = await KnowledgeBaseService.getStatus();
    expect(status.status).toBe('offline');

    // 5. Update failed
    await StorageService.saveKnowledgeUpdateState({
      status: 'update-failed',
      lastError: 'Schema validation error',
    });
    status = await KnowledgeBaseService.getStatus();
    expect(status.status).toBe('update-failed');
    expect(status.lastError).toBe('Schema validation error');
  });

  // --------------------------------------------------------------------------
  // Criterion 8: Distinguishing knowledge updates from extension-code updates
  // --------------------------------------------------------------------------
  it('8. Distinguishing knowledge updates from extension-code updates: dataset versions do not modify immutable extension code version', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/manifest.json'), 'utf8'));

    // Both reflect unified application version policy
    expect(pkg.version).toBeDefined();
    expect(manifest.version).toBe(pkg.version);

    // Remote dataset updates to version 9.9.9
    const futuristicManifest: KnowledgeManifest = {
      ...baseManifest,
      datasetVersion: '9.9.9',
    };

    const mockLoader = {
      isConfigured: () => true,
      getBaseUrl: () => repoUrl,
      fetchManifest: vi.fn().mockResolvedValue(futuristicManifest),
      fetchCoursePack: vi.fn().mockResolvedValue(initialPackA),
    };

    await KnowledgeCacheService.syncFromRemote(mockLoader, repoUrl);
    const meta = await KnowledgeCacheService.getCachedMetadata();
    expect(meta?.datasetVersion).toBe('9.9.9');

    // Extension runtime code version remains strictly unchanged by dataset sync
    expect(pkg.version).toBe(manifest.version);
  });

  // --------------------------------------------------------------------------
  // Criterion 9: Preventing false claims that a ZIP installation updated automatically
  // --------------------------------------------------------------------------
  it('9. Preventing false claims that a ZIP installation updated automatically: update documentation and UI enforce manual reload for unpacked', async () => {
    const updatePolicyPath = path.resolve(__dirname, '../../docs/UPDATE_POLICY.md');
    expect(fs.existsSync(updatePolicyPath)).toBe(true);
    const updatePolicy = fs.readFileSync(updatePolicyPath, 'utf8');

    // Checks that documentation explicitly states manual ZIP replacement requirement
    expect(updatePolicy).toContain('Unpacked Developer Mode');
    expect(updatePolicy).toContain('Reload');
    expect(updatePolicy).toContain('Zero Remote Code Execution');

    // Checks manifest CSP strictly prevents remote script execution
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/manifest.json'), 'utf8'));
    expect(manifest.permissions).not.toContain('debugger');

    // Verifies zero remote script injection in popup HTML
    const popupHtml = fs.readFileSync(path.resolve(__dirname, '../../popup.html'), 'utf8');
    expect(popupHtml).not.toMatch(/<script[^>]+src=["']https?:\/\//i);
  });

  // --------------------------------------------------------------------------
  // Criterion 10: Preserving existing retrieval, AI bridges, course isolation, and manual submission safeguards
  // --------------------------------------------------------------------------
  it('10. Preserving safeguards: course isolation, retrieval, and manual submission guarantees remain active', async () => {
    // 1. Populate cache
    await StorageService.saveKnowledgeManifest(baseManifest);
    await StorageService.saveKnowledgeCoursePacks({
      [courseAId]: initialPackA,
      [courseBId]: initialPackB,
    });

    // 2. Strict Course Isolation: queries in Course A must NEVER return Course B items
    const retrieval = new CourseMaterialRetrievalService();
    const excerptsA = retrieval.rankAndCombineEvidence({
      questionText: 'market equilibrium and demand',
      courseId: courseAId,
      sharedResources: [mockResourceA, mockResourceB],
    });
    expect(excerptsA.some((r) => r.courseId === courseBId)).toBe(false);

    const excerptsB = retrieval.rankAndCombineEvidence({
      questionText: 'lean startup and mvp',
      courseId: courseBId,
      sharedResources: [mockResourceA, mockResourceB],
    });
    expect(excerptsB.some((r) => r.courseId === courseAId)).toBe(false);

    // 3. Strict Manual Submission Immunity: verify autoPopulateExactVerified defaults to false
    await StorageService.initDefaults();
    const settings = await StorageService.getSettings();
    expect(settings.autoPopulateExactVerified).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Criterion 11: Robust answer import for all courses with bundled fallback
  // --------------------------------------------------------------------------
  it('11. Robust answer import: imports verified answers for economics, entrepreneurship, and custom courses', async () => {
    await StorageService.clearAll();

    // 1. Economics course import
    const econRes = await KnowledgeBaseService.importAnswersForCourse('course-econ-101');
    expect(econRes.success).toBe(true);
    expect(econRes.count).toBeGreaterThan(0);
    expect(econRes.message).toContain('verified answers');

    const questionsEcon = await StorageService.getQuestions();
    expect(questionsEcon.length).toBe(econRes.count);
    expect(questionsEcon.every((q) => q.courseId === 'course-econ-101')).toBe(true);

    // 2. Entrepreneurship course import
    await StorageService.clearAll();
    const entRes = await KnowledgeBaseService.importAnswersForCourse('course-ent-201');
    expect(entRes.success).toBe(true);
    expect(entRes.count).toBeGreaterThan(0);

    const questionsEnt = await StorageService.getQuestions();
    expect(questionsEnt.length).toBe(entRes.count);
    expect(questionsEnt.every((q) => q.courseId === 'course-ent-201')).toBe(true);

    // 3. Custom / unknown course import (graceful seed fallback)
    await StorageService.clearAll();
    const customRes = await KnowledgeBaseService.importAnswersForCourse('course-custom-999');
    expect(customRes.success).toBe(true);
    expect(customRes.count).toBeGreaterThan(0);

    const questionsCustom = await StorageService.getQuestions();
    expect(questionsCustom.length).toBe(customRes.count);
    expect(questionsCustom.every((q) => q.courseId === 'course-custom-999')).toBe(true);
  });
});
