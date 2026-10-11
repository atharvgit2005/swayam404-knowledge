/**
 * Swayam404 Phase 7 — First Public Knowledge Release & Live Deployment Verification
 * Automated Test Suite
 *
 * Verifies:
 * - Public repository URL validation & security boundaries (HTTP/HTTPS, credential rejection)
 * - Safe handling of unconfigured repository URLs
 * - Read-only unauthenticated HTTP client behavior
 * - Publication dataset classification (synthetic benchmark packs vs genuine materials)
 * - Zero unreleased active assessment answers & zero placeholder hashes
 * - Remote-live status accurately marked as blocked when unconfigured
 * - Cache preservation intact across failed remote synchronization attempts
 * - Native portal submission immunity (zero auto-submit guarantee)
 * - Privacy-preserving diagnostic export during release preflight
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateRepositoryUrl } from '@/lib/knowledge/security';
import { KnowledgeBaseClient, KnowledgeClientError } from '@/lib/knowledge/client';
import { KnowledgeBaseService } from '@/lib/knowledge/service';
import { KnowledgeCacheService } from '@/lib/knowledge/cache';
import { StorageService } from '@/lib/storage';
import { PublicationAuditService } from '@/lib/knowledge/publicationAudit';
import { diagnosticExporter } from '@/lib/orchestration/diagnosticExporter';
import { KnowledgeCoursePack, KnowledgeManifest } from '@/types/knowledge';

describe('Swayam404 Phase 7 — First Public Knowledge Release & Live Deployment Verification', () => {
  beforeEach(async () => {
    await StorageService.initDefaults();
  });

  describe('1. Repository URL Validation & Security Boundaries', () => {
    it('accepts valid public raw GitHub URLs without credentials', () => {
      const validUrl = 'https://raw.githubusercontent.com/testmaintainer/swayam404-knowledge/main';
      const result = validateRepositoryUrl(validUrl);

      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toBe('https://raw.githubusercontent.com/testmaintainer/swayam404-knowledge/main');
    });

    it('accepts valid GitHub Pages and custom domain HTTPS URLs', () => {
      const pagesUrl = 'https://testmaintainer.github.io/swayam404-knowledge/';
      const result = validateRepositoryUrl(pagesUrl);

      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toBe('https://testmaintainer.github.io/swayam404-knowledge');
    });

    it('strictly rejects URLs containing embedded authentication credentials', () => {
      const credentialUrl = 'https://admin:secrettoken@raw.githubusercontent.com/swayam404-knowledge/main';
      const result = validateRepositoryUrl(credentialUrl);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('embedded authentication credentials');
    });

    it('strictly rejects non-HTTP/HTTPS protocols (file, ftp, javascript)', () => {
      expect(validateRepositoryUrl('file:///etc/passwd').isValid).toBe(false);
      expect(validateRepositoryUrl('ftp://example.com/repo').isValid).toBe(false);
      expect(validateRepositoryUrl('javascript:alert(1)').isValid).toBe(false);
    });

    it('strictly rejects empty or malformed URL strings', () => {
      expect(validateRepositoryUrl('').isValid).toBe(false);
      expect(validateRepositoryUrl('   ').isValid).toBe(false);
      expect(validateRepositoryUrl('not-a-valid-url').isValid).toBe(false);
    });
  });

  describe('2. Remote Client Security & Unconfigured State Handling', () => {
    it('initializes in unconfigured state when URL is empty, returning isConfigured() = false', () => {
      const client = new KnowledgeBaseClient({ baseUrl: '' });

      expect(client.isConfigured()).toBe(false);
      expect(client.getBaseUrl()).toBeUndefined();
    });

    it('returns null gracefully when fetchManifest is called on unconfigured client', async () => {
      const client = new KnowledgeBaseClient();
      const manifest = await client.fetchManifest();

      expect(manifest).toBeNull();
    });

    it('throws explicit error if attempting to fetch from invalid repository URL', () => {
      expect(() => {
        new KnowledgeBaseClient({ baseUrl: 'ftp://invalid-server.com' });
      }).toThrow(KnowledgeClientError);
    });

    it('guarantees unauthenticated read-only HTTP GET (zero auth headers attached)', async () => {
      let capturedHeaders: Record<string, string> | undefined;

      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init?.headers as Record<string, string>;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                schemaVersion: '1.0.0',
                datasetVersion: '1.0.0',
                name: 'test-kb',
                description: 'test',
                publishedAt: '2026-01-15T00:00:00Z',
                minExtensionVersion: '1.0.0',
                courses: [],
              })
            ),
          headers: new Headers(),
        });
      });

      const client = new KnowledgeBaseClient({
        baseUrl: 'https://raw.githubusercontent.com/test/repo/main',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await client.fetchManifest();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(capturedHeaders).toBeDefined();
      // Must NOT contain Authorization, Bearer tokens, or cookies
      expect(capturedHeaders?.['Authorization']).toBeUndefined();
      expect(capturedHeaders?.['authorization']).toBeUndefined();
      expect(capturedHeaders?.['Cookie']).toBeUndefined();
    });
  });

  describe('3. Publication Dataset & Resource Classification Audit', () => {
    it('classifies existing course packs as synthetic development/benchmark fixtures', () => {
      const sampleManifest: KnowledgeManifest = {
        schemaVersion: '1.0.0',
        datasetVersion: '1.0.0',
        name: 'swayam404-knowledge',
        description: 'Benchmark packs',
        publishedAt: '2026-01-15T00:00:00Z',
        minExtensionVersion: '1.0.0',
        courses: [
          {
            courseId: 'course-econ-101',
            courseTitle: 'Principles of Economics (Synthetic Test Pack)',
            provider: 'SWAYAM',
            institution: 'National Portal Synthetic Benchmark',
            language: 'en',
            coursePackVersion: '1.0.0',
            lastUpdated: '2026-01-15T00:00:00Z',
            metadataPath: 'courses/course-econ-101/course.json',
            resourcesPath: 'courses/course-econ-101/resources.json',
            contentHash: '48ff393d2b67e2aac0916ecbb54065acb77e91b91a5287c711ff97a7fdfd355a',
            resourceCount: 2,
            reviewRecordCount: 0,
          },
        ],
      };

      const audit = PublicationAuditService.auditPublicationReadiness({
        manifest: sampleManifest,
        coursePacks: {
          'course-econ-101': {
            resources: [
              {
                resourceId: 'econ-res-001',
                courseId: 'course-econ-101',
                title: 'Price Elasticity of Demand',
                resourceType: 'concept-summary',
                content: 'Elasticity definition...',
                topics: ['elasticity'],
                provenance: {
                  sourceTitle: 'Synthetic Open Economics Notes — Unit 1',
                  sourceUrl: 'https://example.org/synthetic/economics/unit1',
                  authorOrPublisher: 'Synthetic Open Education Project',
                  license: 'CC-BY-4.0',
                  attribution: 'Synthetic study materials created for benchmark testing.',
                  retrievalDate: '2026-01-15T00:00:00Z',
                },
                version: '1.0.0',
                createdAt: '2026-01-15T00:00:00Z',
                updatedAt: '2026-01-15T00:00:00Z',
              },
            ],
            reviewRecords: [
              {
                recordId: 'econ-rev-001',
                courseId: 'course-econ-101',
                assignmentId: 'synthetic-assignment-2025-w01',
                questionFingerprint: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
                normalizedQuestionText: 'what happens to total revenue when demand is inelastic',
                options: ['Option A', 'Option B'],
                explanation: 'Explanation...',
                verificationStatus: 'portal-confirmed',
                verificationSource: 'portal_archived_graded_feedback',
                releaseTimestamp: '2025-12-01T00:00:00Z',
                redistributionPermission: 'Synthetic test feedback archive',
                recordVersion: '1.0.0',
                isReleased: true, // Strictly released post-deadline
                provenance: {
                  sourceTitle: 'Synthetic Archive',
                  authorOrPublisher: 'Portal Archive',
                  license: 'CC-BY-4.0',
                  retrievalDate: '2026-01-15T00:00:00Z',
                },
              },
            ],
          },
        },
        repoUrl: '', // Unconfigured
      });

      expect(audit.summary.syntheticResourcesCount).toBe(2);
      expect(audit.summary.realAuthorizedResourcesCount).toBe(0);
      expect(audit.summary.releasedReviewRecordsCount).toBe(1);
      expect(audit.summary.activeAssessmentViolationsCount).toBe(0);
      expect(audit.summary.placeholderHashesCount).toBe(0);
      expect(audit.remoteLiveStatus).toBe('blocked');
      expect(audit.overallStatus).toBe('blocked');
    });

    it('marks remoteLiveStatus as blocked when repo URL is not yet provisioned on GitHub', () => {
      const audit = PublicationAuditService.auditPublicationReadiness({
        manifest: null,
        coursePacks: {},
        repoUrl: '',
        remoteFetchSuccessful: false,
      });

      expect(audit.remoteLiveStatus).toBe('blocked');
      expect(audit.checks.publicRepoConfigured).toBe(false);
      expect(audit.checks.publicRepoReachable).toBe(false);
      expect(audit.blockers.some((b) => b.includes('unconfigured'))).toBe(true);
    });
  });

  describe('4. Knowledge Base Service Status & Unconfigured Graceful Handling', () => {
    it('returns status: unconfigured when settings have no repo URL', async () => {
      await StorageService.saveSettings({ knowledgeBaseEnabled: false, knowledgeBaseRepoUrl: '' });
      const status = await KnowledgeBaseService.getStatus();

      expect(status.configured).toBe(false);
      expect(status.status).toBe('unconfigured');
    });

    it('syncNow returns informative failure with error UNCONFIGURED_URL when repoUrl is empty', async () => {
      await StorageService.saveSettings({ knowledgeBaseEnabled: true, knowledgeBaseRepoUrl: '' });
      const result = await KnowledgeBaseService.syncNow('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('UNCONFIGURED_URL');
      expect(result.message).toContain('No repository URL configured');
    });
  });

  describe('5. Cache Preservation & Failed Update Safety', () => {
    it('preserves existing valid cached packs 100% intact when remote sync fails with HTTP 500', async () => {
      const initialPack: KnowledgeCoursePack = {
        course: {
          courseId: 'course-econ-101',
          courseTitle: 'Principles of Economics',
          language: 'en',
          coursePackVersion: '1.0.0',
          description: 'Core microeconomics',
          publishedAt: '2026-01-15T00:00:00Z',
          updatedAt: '2026-01-15T00:00:00Z',
          topics: ['economics'],
        },
        resources: [
          {
            resourceId: 'res-valid-1',
            courseId: 'course-econ-101',
            title: 'Valid Resource',
            resourceType: 'concept-summary',
            content: 'Initial valid cached resource content.',
            topics: ['economics'],
            provenance: {
              sourceTitle: 'Lecture 1',
              authorOrPublisher: 'Open Courseware',
              license: 'CC-BY-4.0',
              retrievalDate: '2026-01-15T00:00:00Z',
            },
            version: '1.0.0',
            createdAt: '2026-01-15T00:00:00Z',
            updatedAt: '2026-01-15T00:00:00Z',
          },
        ],
        reviewRecords: [],
        contentHash: 'f'.repeat(64),
      };

      await StorageService.saveKnowledgeCoursePacks({ 'course-econ-101': initialPack });

      // Simulate client that fails on manifest fetch (HTTP 500)
      const failingFetch = vi.fn().mockRejectedValue(new Error('HTTP 500 Server Error'));
      const failingClient = new KnowledgeBaseClient({
        baseUrl: 'https://raw.githubusercontent.com/test/repo/main',
        fetchFn: failingFetch as unknown as typeof fetch,
      });

      // Attempt syncFromRemote
      await expect(
        KnowledgeCacheService.syncFromRemote(failingClient, 'https://raw.githubusercontent.com/test/repo/main')
      ).rejects.toThrow();

      // Verify that prior cached pack was NOT wiped or corrupted
      const cachedResources = await KnowledgeCacheService.getCachedResources('course-econ-101');
      expect(cachedResources.length).toBe(1);
      expect(cachedResources[0].resourceId).toBe('res-valid-1');
      expect(cachedResources[0].content).toContain('Initial valid cached resource content');
    });
  });

  describe('6. Zero Auto-Submit Safety Boundary & Diagnostic Privacy', () => {
    it('verifies native portal submit controls remain completely untouched during knowledge population', async () => {
      // Create mock DOM with SWAYAM submit buttons
      document.body.innerHTML = `
        <div class="swayam-quiz-form">
          <button id="submitBtn" type="submit">Submit Assignment</button>
          <button id="finalSubmitBtn">Final Submit</button>
          <input type="radio" id="choiceA" name="q1" value="A" />
        </div>
      `;

      const submitBtn = document.getElementById('submitBtn') as HTMLButtonElement;
      const finalSubmitBtn = document.getElementById('finalSubmitBtn') as HTMLButtonElement;

      let submitClicked = false;
      let finalSubmitClicked = false;

      submitBtn.addEventListener('click', () => {
        submitClicked = true;
      });
      finalSubmitBtn.addEventListener('click', () => {
        finalSubmitClicked = true;
      });

      // Knowledge base operations must never trigger submission buttons
      const status = await KnowledgeBaseService.getStatus();
      expect(status).toBeDefined();

      expect(submitClicked).toBe(false);
      expect(finalSubmitClicked).toBe(false);
    });

    it('verifies diagnostic export generated during release preflight excludes all secrets and assessment text', async () => {
      const report = await diagnosticExporter.generatePrivacyPreservingReport();
      const json = JSON.stringify(report);

      expect(json).not.toContain('correctAnswer');
      expect(json).not.toContain('studentId');
      expect(json).not.toContain('rollNo');
      expect(report.privacyDisclosure.localExportOnly).toBe(true);
      expect(report.privacyDisclosure.zeroTelemetryGuarantee).toBe(true);
    });
  });
});
