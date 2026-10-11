/**
 * Swayam404 Phase 6 — Live Knowledge Deployment, Privacy-Preserving Diagnostics & College Pilot
 * Automated Test Suite
 *
 * Verifies:
 * - Diagnostic export schema & random run ID generation
 * - Sensitive-field exclusion (questions, answers, student PII, credentials)
 * - URL sanitization & query string stripping
 * - Secret redaction (API keys, tokens, auth headers, machine usernames)
 * - Omission of AI prompt and response bodies
 * - Bounded diagnostic storage buffer (FIFO eviction)
 * - Local-only export guarantees (zero network transmission)
 * - Accurate status representation & blocked checks marking
 * - Knowledge-base publication readiness & resource inventory audit
 * - Preservation of existing cache behavior, course isolation, retrieval, and submission boundaries
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  diagnosticExporter,
  PrivacyPreservingDiagnosticReport,
} from '@/lib/orchestration/diagnosticExporter';
import { pipelineTracer } from '@/lib/orchestration/pipelineDiagnostics';
import { PublicationAuditService } from '@/lib/knowledge/publicationAudit';
import { KnowledgeBaseService } from '@/lib/knowledge/service';
import { KnowledgeCacheService } from '@/lib/knowledge/cache';
import { StorageService } from '@/lib/storage';
import { KnowledgeResource, KnowledgeReviewRecord, KnowledgeManifest } from '@/types/knowledge';

describe('Swayam404 Phase 6 — Live Knowledge Deployment & Privacy-Preserving Diagnostics', () => {
  beforeEach(() => {
    diagnosticExporter.clearRecordedEvents();
  });

  describe('1. Privacy-Preserving Diagnostic Export & Schema Compliance', () => {
    it('generates a valid, complete diagnostic report conforming to the privacy schema', async () => {
      pipelineTracer.startSession('course-econ-101', 'Principles of Economics');
      pipelineTracer.recordGlobalStep(1, 'Tab Detection', true, 'Connected to SWAYAM tab');
      pipelineTracer.recordGlobalStep(2, 'DOM Question Scan', true, 'Scanned 5 questions', { inputCount: 1, outputCount: 5 });

      const report: PrivacyPreservingDiagnosticReport = await diagnosticExporter.generatePrivacyPreservingReport();

      expect(report.diagnosticRunId).toMatch(/^run-[a-z0-9]+-[a-f0-9]+$/);
      expect(report.generatedAt).toBeDefined();
      expect(report.application.name).toBe('swayam404');
      expect(report.application.version).toBe('1.0.0');
      expect(report.application.manifestVersion).toBe(3);
      expect(report.knowledgeBase).toBeDefined();
      expect(report.pipelineTelemetry.aggregateScanCounts).toBeDefined();
      expect(report.privacyDisclosure.localExportOnly).toBe(true);
      expect(report.privacyDisclosure.zeroTelemetryGuarantee).toBe(true);
      expect(Array.isArray(report.privacyDisclosure.exportedCategories)).toBe(true);
      expect(Array.isArray(report.privacyDisclosure.explicitlyExcludedData)).toBe(true);
    });

    it('generates purely random local run IDs not derived from student identity or fingerprint', () => {
      const id1 = diagnosticExporter.generateRandomRunId();
      const id2 = diagnosticExporter.generateRandomRunId();
      const id3 = diagnosticExporter.generateRandomRunId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).toMatch(/^run-[a-z0-9]+-[a-f0-9]{8}$/);
      expect(id1).not.toContain('student');
      expect(id1).not.toContain('roll');
      expect(id1).not.toContain('user');
    });

    it('rotates run ID cleanly upon explicit user request', () => {
      const initialId = diagnosticExporter.getCurrentRunId();
      const newId = diagnosticExporter.rotateRunId();

      expect(newId).not.toBe(initialId);
      expect(diagnosticExporter.getCurrentRunId()).toBe(newId);
    });
  });

  describe('2. Strict Sensitive-Field Exclusion & Privacy Redaction', () => {
    it('strictly excludes question text snippets from exported pipeline traces', async () => {
      pipelineTracer.startSession('course-econ-101', 'Principles of Economics');
      // Simulate question trace with sensitive question text
      pipelineTracer.initQuestionTrace('q1', 1, 'What is the price elasticity of demand for essential insulin medication?');
      pipelineTracer.recordQuestionStep('q1', 10, 'AI Provider Request', true, 'Inferred answer choice B');

      const jsonString = await diagnosticExporter.exportToJsonString();
      const report: PrivacyPreservingDiagnosticReport = JSON.parse(jsonString);

      // The exported report must NOT contain the sensitive question text
      expect(jsonString).not.toContain('What is the price elasticity of demand for essential insulin medication?');
      expect(jsonString).not.toContain('insulin medication');

      // Stage details must be sanitized
      for (const stage of report.pipelineTelemetry.stages) {
        expect(stage.sanitizedSummary).not.toContain('insulin medication');
      }
    });

    it('strictly excludes answer keys, option choices, and student selections', async () => {
      pipelineTracer.startSession('course-econ-101', 'Principles of Economics');
      pipelineTracer.initQuestionTrace('q2', 2, 'Question about monopoly pricing');
      pipelineTracer.setQuestionFinalState('q2', 'exact-match');

      const jsonString = await diagnosticExporter.exportToJsonString();

      // Check absence of question answers or choices
      expect(jsonString).not.toContain('Option A');
      expect(jsonString).not.toContain('Option B');
      expect(jsonString).not.toContain('correctAnswer');
      expect(jsonString).not.toContain('selectedChoice');
    });

    it('redacts student personal identifying information (emails, roll numbers, names)', () => {
      const rawTextWithPii = 'Error for student roll number 21CS0104 with email rahul.sharma21@university.edu on task';
      const sanitized = diagnosticExporter.sanitizeText(rawTextWithPii);

      expect(sanitized).not.toContain('rahul.sharma21@university.edu');
      expect(sanitized).not.toContain('21CS0104');
      expect(sanitized).toContain('[REDACTED_EMAIL]');
      expect(sanitized).toContain('[REDACTED_STUDENT_ID]');
    });

    it('redacts Gemini, xAI/Grok, OpenAI API keys and Bearer authentication tokens', () => {
      const mockGeminiKey = ['AIza', 'SyD1234567890abcdefghijklmnopqrstuv'].join('');
      const sensitiveString =
        `Failed auth with Gemini key ${mockGeminiKey} and Grok key xai-998877665544332211aabbccddeeff001122 and OpenAI sk-1234567890abcdef123456 and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDc`;

      const sanitized = diagnosticExporter.sanitizeText(sensitiveString);

      expect(sanitized).not.toContain(mockGeminiKey);
      expect(sanitized).not.toContain('xai-998877665544332211aabbccddeeff001122');
      expect(sanitized).not.toContain('sk-1234567890abcdef123456');
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');

      expect(sanitized).toContain('[REDACTED_GEMINI_KEY]');
      expect(sanitized).toContain('[REDACTED_GROK_KEY]');
      expect(sanitized).toContain('[REDACTED_OPENAI_KEY]');
      expect(sanitized).toContain('Bearer [REDACTED_TOKEN]');
    });

    it('sanitizes URLs by stripping query parameters and auth tokens', () => {
      const rawUrlWithToken =
        'https://onlinecourses.nptel.ac.in/noc24_hs101/unit?unit=12&assessment=3&session_token=secret9988&student_id=std101';
      const sanitized = diagnosticExporter.sanitizeUrl(rawUrlWithToken);

      expect(sanitized).toBe('https://onlinecourses.nptel.ac.in/noc24_hs101/unit');
      expect(sanitized).not.toContain('session_token');
      expect(sanitized).not.toContain('secret9988');
      expect(sanitized).not.toContain('student_id');
      expect(sanitized).not.toContain('std101');
    });

    it('redacts local machine usernames from file paths', () => {
      const stackWithUser =
        'Error at Object.fetch (/Users/johndoe/Desktop/Projects/swayam404/src/client.ts:45:12) and C:\\Users\\alice\\AppData\\';
      const sanitized = diagnosticExporter.sanitizeText(stackWithUser);

      expect(sanitized).not.toContain('johndoe');
      expect(sanitized).not.toContain('alice');
      expect(sanitized).toContain('/[USER_HOME]/');
      expect(sanitized).toContain('C:\\[USER_HOME]\\');
    });
  });

  describe('3. Bounded Event Telemetry & Discrete Event Tracking', () => {
    it('records discrete diagnostic event categories correctly', () => {
      diagnosticExporter.recordEvent('scan-started', 'info', { stageIdentifier: 'Stage 1' });
      diagnosticExporter.recordEvent('knowledge-sync-started', 'info', { stageIdentifier: 'Stage 2' });
      diagnosticExporter.recordEvent('cache-hit', 'success');
      diagnosticExporter.recordEvent('cache-miss', 'info');
      diagnosticExporter.recordEvent('ai-provider-request-failed', 'failure', {
        errorCode: 'PROVIDER_QUOTA_EXCEEDED (429)',
      });

      expect(diagnosticExporter.getRecordedEventsCount()).toBe(5);
    });

    it('strictly bounds event telemetry storage to max 50 items (FIFO eviction)', () => {
      // Record 75 events into the exporter
      for (let i = 1; i <= 75; i++) {
        diagnosticExporter.recordEvent('scan-completed', 'success', {
          stageIdentifier: `Stage ${i}`,
          metadata: { iteration: i },
        });
      }

      // Buffer must be capped at max 50
      expect(diagnosticExporter.getRecordedEventsCount()).toBe(50);
    });

    it('sanitizes event metadata and drops prohibited keys', async () => {
      diagnosticExporter.recordEvent('resource-search-completed', 'success', {
        durationMs: 4,
        metadata: {
          searchQuery: 'Safe search query keyword',
          questionText: 'FORBIDDEN QUESTION TEXT',
          userEmail: 'student@college.edu',
          apiKey: 'AIzaSySecret',
          matchCount: 3,
        },
      });

      const report = await diagnosticExporter.generatePrivacyPreservingReport();
      const lastEvent = report.recentEvents[report.recentEvents.length - 1];

      expect(lastEvent.category).toBe('resource-search-completed');
      // The event metadata in the exported JSON must not contain forbidden keys
      const json = JSON.stringify(report);
      expect(json).not.toContain('FORBIDDEN QUESTION TEXT');
      expect(json).not.toContain('student@college.edu');
      expect(json).not.toContain('AIzaSySecret');
    });
  });

  describe('4. Local-Only Export Guarantee & Category Preview', () => {
    it('guarantees zero remote network calls during export generation', async () => {
      const fetchSpy = vi.fn();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = fetchSpy;

      try {
        const json = await diagnosticExporter.exportToJsonString();
        expect(json.length).toBeGreaterThan(100);
        // fetch must NOT have been called during export
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('provides accurate category preview for UI transparency', () => {
      const preview = diagnosticExporter.getExportCategoryPreview();

      expect(preview.included.length).toBeGreaterThan(5);
      expect(preview.excluded.length).toBeGreaterThan(5);

      expect(preview.included.some((s) => s.includes('Application Version'))).toBe(true);
      expect(preview.included.some((s) => s.includes('Pipeline Latency'))).toBe(true);
      expect(preview.excluded.some((s) => s.includes('Question Text'))).toBe(true);
      expect(preview.excluded.some((s) => s.includes('Student Identity'))).toBe(true);
      expect(preview.excluded.some((s) => s.includes('Authentication Credentials'))).toBe(true);
    });

    it('normalizes error messages into standardized error codes', () => {
      expect(diagnosticExporter.sanitizeErrorCode('Request timed out after 8000ms')).toBe('NETWORK_TIMEOUT');
      expect(diagnosticExporter.sanitizeErrorCode('HTTP 429: Resource has been exhausted (quota)')).toBe(
        'PROVIDER_QUOTA_EXCEEDED'
      );
      expect(diagnosticExporter.sanitizeErrorCode('API key invalid or unauthorized 401')).toBe('AUTH_CREDENTIAL_ERROR');
      expect(diagnosticExporter.sanitizeErrorCode('Content hash integrity verification failed')).toBe('INTEGRITY_MISMATCH');
      expect(diagnosticExporter.sanitizeErrorCode('Network is offline')).toBe('DEVICE_OFFLINE');
    });
  });

  describe('5. Publication Readiness & Resource Inventory Audit', () => {
    it('classifies synthetic benchmark resources correctly and flags placeholder URLs', () => {
      const syntheticResource: KnowledgeResource = {
        resourceId: 'econ-res-001',
        courseId: 'course-econ-101',
        title: 'Concept Summary: Price Elasticity of Demand',
        resourceType: 'concept-summary',
        content: 'Price elasticity of demand measures responsiveness...',
        topics: ['price-elasticity', 'demand'],
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
      };

      const result = PublicationAuditService.classifyResource(syntheticResource);

      expect(result.classification).toBe('synthetic-test-fixture');
      expect(result.isSynthetic).toBe(true);
      expect(result.findings.some((f) => f.includes('synthetic'))).toBe(true);
      expect(result.findings.some((f) => f.includes('example.org'))).toBe(true);
    });

    it('classifies genuine authorized resources correctly when verified', () => {
      const realResource: KnowledgeResource = {
        resourceId: 'econ-res-real',
        courseId: 'course-econ-101',
        title: 'Lecture 1: Principles of Economics Handout',
        resourceType: 'lecture-notes',
        content: 'Real university lecture notes on scarcity and choice.',
        topics: ['scarcity', 'choice'],
        provenance: {
          sourceTitle: 'NPTEL Official Lecture Handouts',
          sourceUrl: 'https://nptel.ac.in/courses/106/101/handout.pdf',
          authorOrPublisher: 'Department of Humanities & Social Sciences',
          license: 'CC-BY-4.0',
          attribution: 'Used under Creative Commons Attribution 4.0 International.',
          retrievalDate: '2026-01-15T00:00:00Z',
        },
        version: '1.0.0',
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-01-15T00:00:00Z',
      };

      const result = PublicationAuditService.classifyResource(realResource);

      expect(result.classification).toBe('real-authorized-learning-resource');
      expect(result.isSynthetic).toBe(false);
      expect(result.findings.length).toBe(0);
    });

    it('detects unreleased assessment records and flags critical safety violations', () => {
      const unreleasedRecord: KnowledgeReviewRecord = {
        recordId: 'rev-unreleased-001',
        courseId: 'course-econ-101',
        assignmentId: 'active-assignment-week-05',
        questionFingerprint: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        normalizedQuestionText: 'active graded quiz question',
        options: ['Choice 1', 'Choice 2'],
        verificationStatus: 'portal-confirmed',
        verificationSource: 'portal_archived_graded_feedback',
        explanation: 'Active assignment explanation',
        releaseTimestamp: '2026-01-15T00:00:00Z',
        redistributionPermission: 'Private assignment data',
        recordVersion: '1.0.0',
        isReleased: false, // VIOLATION: Unreleased active assignment!
        provenance: {
          sourceTitle: 'Active Quiz Form',
          authorOrPublisher: 'Portal',
          license: 'CC-BY-4.0',
          retrievalDate: '2026-01-15T00:00:00Z',
        },
      };

      const result = PublicationAuditService.classifyReviewRecord(unreleasedRecord);

      expect(result.classification).toBe('missing-evidence-or-permission');
      expect(result.findings.some((f) => f.includes('NOT marked as released'))).toBe(true);
    });

    it('audits repository publication readiness and marks remote-live status as blocked when unconfigured', () => {
      const sampleManifest: KnowledgeManifest = {
        schemaVersion: '1.0.0',
        datasetVersion: '1.0.0',
        name: 'swayam404-knowledge',
        description: 'Test catalog',
        publishedAt: '2026-01-15T00:00:00Z',
        minExtensionVersion: '1.0.0',
        courses: [],
      };

      const audit = PublicationAuditService.auditPublicationReadiness({
        manifest: sampleManifest,
        coursePacks: {
          'course-econ-101': {
            resources: [
              {
                resourceId: 'econ-res-001',
                courseId: 'course-econ-101',
                title: 'Synthetic Price Elasticity',
                resourceType: 'concept-summary',
                content: 'Test content',
                topics: ['test'],
                provenance: {
                  sourceTitle: 'Synthetic Notes',
                  sourceUrl: 'https://example.org/test',
                  authorOrPublisher: 'Synthetic Project',
                  license: 'CC-BY-4.0',
                  retrievalDate: '2026-01-15T00:00:00Z',
                },
                version: '1.0.0',
                createdAt: '2026-01-15T00:00:00Z',
                updatedAt: '2026-01-15T00:00:00Z',
              },
            ],
            reviewRecords: [],
          },
        },
        repoUrl: '', // Unconfigured URL
        remoteFetchSuccessful: false,
      });

      expect(audit.overallStatus).toBe('blocked');
      expect(audit.remoteLiveStatus).toBe('blocked');
      expect(audit.checks.publicRepoConfigured).toBe(false);
      expect(audit.checks.publicRepoReachable).toBe(false);
      expect(audit.checks.realCourseMaterialsSupplied).toBe(false);
      expect(audit.summary.syntheticResourcesCount).toBe(1);
      expect(audit.summary.realAuthorizedResourcesCount).toBe(0);
      expect(audit.blockers.some((b) => b.includes('unconfigured'))).toBe(true);
    });
  });

  describe('6. Preservation of Cache, Isolation & Safety Boundaries', () => {
    it('preserves cached course resources accessible offline in storage', async () => {
      const testPack = {
        course: {
          courseId: 'course-econ-101',
          courseTitle: 'Principles of Economics',
          title: 'Principles of Economics',
          language: 'en',
          coursePackVersion: '1.0.0',
          lastUpdated: '2026-01-15T00:00:00Z',
          description: 'Core microeconomics',
          publishedAt: '2026-01-15T00:00:00Z',
          updatedAt: '2026-01-15T00:00:00Z',
          topics: ['economics'],
        },
        resources: [
          {
            resourceId: 'econ-res-persist',
            courseId: 'course-econ-101',
            title: 'Price Elasticity Definition',
            resourceType: 'concept-summary' as const,
            content: 'Elasticity formula: % delta Q / % delta P',
            topics: ['elasticity'],
            provenance: {
              sourceTitle: 'Economics Notes',
              authorOrPublisher: 'Open Education',
              license: 'CC-BY-4.0',
              retrievalDate: '2026-01-15T00:00:00Z',
            },
            version: '1.0.0',
            createdAt: '2026-01-15T00:00:00Z',
            updatedAt: '2026-01-15T00:00:00Z',
          },
        ],
        reviewRecords: [],
        contentHash: 'a'.repeat(64),
      };

      await StorageService.saveKnowledgeCoursePacks({
        'course-econ-101': testPack,
      });
      const cached = await KnowledgeCacheService.getCachedResources('course-econ-101');

      expect(cached.length).toBe(1);
      expect(cached[0].resourceId).toBe('econ-res-persist');
      expect(cached[0].content).toContain('Elasticity formula');
    });

    it('enforces strict course isolation (zero cross-course leakage)', async () => {
      // Searching Entrepreneurship course for economics topics must return 0 results
      const results = await KnowledgeBaseService.searchResources('course-ent-201', 'price elasticity of demand');
      expect(results.every((r) => r.courseId === 'course-ent-201')).toBe(true);
    });
  });
});
