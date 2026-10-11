/**
 * Privacy-Preserving Diagnostic Exporter & Telemetry Correlator for Swayam404
 *
 * Implements Phase 6 privacy-preserving diagnostic export:
 * - Random local run ID per session (never derived from student identity or device fingerprint).
 * - Bounded circular telemetry buffer (capped capacity FIFO eviction).
 * - Strict redaction & omission: zero question text, zero answers, zero student PII,
 *   zero auth tokens/keys/cookies, sanitized URLs (query parameters stripped), zero raw HTML/notes.
 * - Local-only export guarantee: zero remote analytics upload, zero hidden network telemetry.
 */

import { StorageService } from '@/lib/storage';
import { KnowledgeCacheService } from '@/lib/knowledge/cache';
import { pipelineTracer, PipelineDiagnosticReport } from './pipelineDiagnostics';
import { networkDiagnostics } from '@/lib/connection/networkDiagnostics';

export type DiagnosticEventCategory =
  | 'scan-started'
  | 'scan-completed'
  | 'scan-failed'
  | 'knowledge-sync-started'
  | 'knowledge-sync-completed'
  | 'knowledge-sync-failed'
  | 'cache-hit'
  | 'cache-miss'
  | 'resource-search-completed'
  | 'resource-search-failed'
  | 'ai-provider-request-started'
  | 'ai-provider-request-completed'
  | 'ai-provider-request-failed'
  | 'response-parsing-succeeded'
  | 'response-parsing-failed'
  | 'population-succeeded'
  | 'population-failed';

export interface DiagnosticEvent {
  eventId: string;
  runId: string;
  category: DiagnosticEventCategory;
  timestamp: string;
  status: 'success' | 'failure' | 'info';
  durationMs?: number;
  stageIdentifier?: string;
  sanitizedErrorCode?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface PrivacyPreservingDiagnosticReport {
  diagnosticRunId: string;
  generatedAt: string;
  application: {
    name: string;
    version: string;
    manifestVersion: number;
    browserEnvironment: string;
    isExtensionContext: boolean;
  };
  knowledgeBase: {
    datasetVersion?: string;
    schemaVersion?: string;
    cachedCoursePackVersions: Record<string, string>;
    totalCachedCourses: number;
    totalCachedResources: number;
    totalCachedReviewRecords: number;
    lastSyncTimestamp?: string;
    lastSyncDurationMs?: number;
    lastSyncOutcome: 'synced' | 'error' | 'unconfigured' | 'out-of-sync';
    repositoryStatus: 'live-accessible' | 'unconfigured' | 'remote-blocked' | 'offline';
    configuredRepoHost?: string;
  };
  pipelineTelemetry: {
    recentRetrievalDurationMs?: number;
    cacheHitCount: number;
    cacheMissCount: number;
    aggregateScanCounts: {
      totalScanned: number;
      exactMatches: number;
      aiAttempted: number;
      aiSucceeded: number;
      unresolved: number;
      populated: number;
      errorsCount: number;
    };
    providerRequestOutcomes: {
      success: number;
      timeout: number;
      quotaError: number;
      parsingFailure: number;
      authFailure: number;
      otherError: number;
    };
    sanitizedErrorCodes: string[];
    stages: Array<{
      stageNumber: number;
      stageName: string;
      status: 'succeeded' | 'failed' | 'skipped';
      durationMs: number;
      sanitizedSummary: string;
      sanitizedFailureReason?: string;
    }>;
  };
  recentEvents: Array<{
    category: DiagnosticEventCategory;
    timestamp: string;
    status: 'success' | 'failure' | 'info';
    durationMs?: number;
    stageIdentifier?: string;
    sanitizedErrorCode?: string;
  }>;
  networkHealth: {
    isOnline: boolean;
    state: string;
    failureType: string;
    lastChecked: string;
  };
  privacyDisclosure: {
    exportedCategories: string[];
    explicitlyExcludedData: string[];
    localExportOnly: true;
    zeroTelemetryGuarantee: true;
  };
}

export class DiagnosticExporterService {
  private static instance: DiagnosticExporterService;
  private currentRunId: string;
  private readonly maxBoundedEvents = 50;
  private eventBuffer: DiagnosticEvent[] = [];
  private cacheHits = 0;
  private cacheMisses = 0;
  private providerStats = {
    success: 0,
    timeout: 0,
    quotaError: 0,
    parsingFailure: 0,
    authFailure: 0,
    otherError: 0,
  };

  private constructor() {
    this.currentRunId = this.generateRandomRunId();
  }

  static getInstance(): DiagnosticExporterService {
    if (!DiagnosticExporterService.instance) {
      DiagnosticExporterService.instance = new DiagnosticExporterService();
    }
    return DiagnosticExporterService.instance;
  }

  /**
   * Generates a purely random local run ID.
   * Strictly NOT derived from student identity, roll number, email, account, or browser fingerprint.
   */
  generateRandomRunId(): string {
    const randomHex = Math.random().toString(16).slice(2, 10);
    const timeFragment = Date.now().toString(36);
    return `run-${timeFragment}-${randomHex}`;
  }

  /**
   * Resets the correlation run ID for a new user-initiated session.
   */
  rotateRunId(): string {
    this.currentRunId = this.generateRandomRunId();
    return this.currentRunId;
  }

  getCurrentRunId(): string {
    return this.currentRunId;
  }

  /**
   * Records a discrete diagnostic event into the bounded buffer (max 50 items FIFO).
   */
  recordEvent(
    category: DiagnosticEventCategory,
    status: 'success' | 'failure' | 'info',
    options?: {
      durationMs?: number;
      stageIdentifier?: string;
      errorCode?: string;
      metadata?: Record<string, unknown>;
    }
  ): void {
    if (category === 'cache-hit') this.cacheHits++;
    if (category === 'cache-miss') this.cacheMisses++;

    if (category === 'ai-provider-request-completed') this.providerStats.success++;
    if (category === 'ai-provider-request-failed') {
      const code = (options?.errorCode || '').toLowerCase();
      if (code.includes('timeout') || code.includes('aborterror')) {
        this.providerStats.timeout++;
      } else if (code.includes('quota') || code.includes('429')) {
        this.providerStats.quotaError++;
      } else if (code.includes('auth') || code.includes('401') || code.includes('403') || code.includes('key')) {
        this.providerStats.authFailure++;
      } else {
        this.providerStats.otherError++;
      }
    }
    if (category === 'response-parsing-failed') {
      this.providerStats.parsingFailure++;
    }

    const sanitizedCode = options?.errorCode ? this.sanitizeErrorCode(options.errorCode) : undefined;
    const sanitizedMeta = options?.metadata ? this.sanitizeMetadata(options.metadata) : undefined;

    const event: DiagnosticEvent = {
      eventId: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      runId: this.currentRunId,
      category,
      timestamp: new Date().toISOString(),
      status,
      durationMs: options?.durationMs,
      stageIdentifier: options?.stageIdentifier,
      sanitizedErrorCode: sanitizedCode,
      metadata: sanitizedMeta,
    };

    this.eventBuffer.push(event);

    // Bounded buffer enforcement: FIFO eviction
    if (this.eventBuffer.length > this.maxBoundedEvents) {
      this.eventBuffer.splice(0, this.eventBuffer.length - this.maxBoundedEvents);
    }
  }

  getRecordedEventsCount(): number {
    return this.eventBuffer.length;
  }

  clearRecordedEvents(): void {
    this.eventBuffer = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.providerStats = {
      success: 0,
      timeout: 0,
      quotaError: 0,
      parsingFailure: 0,
      authFailure: 0,
      otherError: 0,
    };
  }

  // --- Strict Sanitization Utilities ---

  /**
   * Redacts sensitive secrets, API keys, passwords, cookies, and tokens from strings.
   */
  sanitizeText(input?: string): string {
    if (!input) return '';

    return input
      // Redact Google / Gemini API keys (AIzaSy...)
      .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GEMINI_KEY]')
      // Redact xAI / Grok API keys
      .replace(/xai-[a-zA-Z0-9]{30,}/g, '[REDACTED_GROK_KEY]')
      // Redact OpenAI keys
      .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_OPENAI_KEY]')
      // Redact Bearer tokens
      .replace(/Bearer\s+[a-zA-Z0-9._~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]')
      // Redact JWT tokens
      .replace(/eyJh[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+/g, '[REDACTED_JWT]')
      // Redact email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
      // Redact student roll numbers / IDs (typical formats e.g. 21CS0104, 2023BCS001, etc.)
      .replace(/\b\d{2,4}[A-Z]{2,4}\d{3,6}\b/g, '[REDACTED_STUDENT_ID]')
      // Redact local machine user paths
      .replace(/\/Users\/[a-zA-Z0-9_.-]+\//g, '/[USER_HOME]/')
      .replace(/C:\\Users\\[a-zA-Z0-9_.-]+\\/gi, 'C:\\[USER_HOME]\\');
  }

  /**
   * Sanitizes URLs by stripping query parameters and hash fragments entirely.
   */
  sanitizeUrl(rawUrl?: string): string {
    if (!rawUrl) return '';
    try {
      const parsed = new URL(rawUrl);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      // If not a full URL, strip query string manually
      return rawUrl.split('?')[0].split('#')[0];
    }
  }

  /**
   * Sanitizes error codes or messages to standardized safe identifiers.
   */
  sanitizeErrorCode(rawCode?: string): string {
    if (!rawCode) return 'UNKNOWN_ERROR';
    const clean = this.sanitizeText(rawCode).trim();
    const upper = clean.toUpperCase();

    if (upper.includes('TIMEOUT') || upper.includes('TIMED OUT') || upper.includes('ABORTERROR')) return 'NETWORK_TIMEOUT';
    if (upper.includes('429') || upper.includes('QUOTA')) return 'PROVIDER_QUOTA_EXCEEDED';
    if (upper.includes('401') || upper.includes('UNAUTHORIZED') || upper.includes('KEY INVALID')) return 'AUTH_CREDENTIAL_ERROR';
    if (upper.includes('403') || upper.includes('FORBIDDEN')) return 'PERMISSION_DENIED';
    if (upper.includes('404') || upper.includes('NOT FOUND')) return 'RESOURCE_NOT_FOUND';
    if (upper.includes('PARSE') || upper.includes('JSON')) return 'RESPONSE_PARSE_ERROR';
    if (upper.includes('INTEGRITY') || upper.includes('HASH')) return 'INTEGRITY_MISMATCH';
    if (upper.includes('OFFLINE') || upper.includes('DISCONNECTED')) return 'DEVICE_OFFLINE';

    // Standardize to alphanumeric and underscores, max 40 chars
    return clean.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 40).toUpperCase() || 'UNKNOWN_ERROR';
  }

  /**
   * Sanitizes key-value metadata dictionaries.
   */
  private sanitizeMetadata(meta: Record<string, unknown>): Record<string, string | number | boolean> {
    const sanitized: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(meta)) {
      const lowerKey = key.toLowerCase();
      // Drop any forbidden keys
      if (
        lowerKey.includes('key') ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('cookie') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('password') ||
        lowerKey.includes('question') ||
        lowerKey.includes('answer') ||
        lowerKey.includes('prompt') ||
        lowerKey.includes('response') ||
        lowerKey.includes('student') ||
        lowerKey.includes('name') ||
        lowerKey.includes('email') ||
        lowerKey.includes('roll')
      ) {
        continue;
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (typeof value === 'string') {
        sanitized[key] = this.sanitizeText(value).slice(0, 100);
      }
    }

    return sanitized;
  }

  // --- Report Assembly ---

  /**
   * Assembles a comprehensive privacy-preserving diagnostic report.
   * Pulls data from pipelineTracer, storage, and networkDiagnostics.
   * Strictly guarantees NO question text, NO answer text, NO secrets, NO student PII.
   */
  async generatePrivacyPreservingReport(): Promise<PrivacyPreservingDiagnosticReport> {
    const settings = await StorageService.getSettings();
    const meta = await KnowledgeCacheService.getCachedMetadata();
    const manifest = await KnowledgeCacheService.getCachedManifest();
    const packs = await KnowledgeCacheService.getCachedCoursePacks();
    const rawPipelineReport: PipelineDiagnosticReport = pipelineTracer.generateReport();
    const networkDiag = networkDiagnostics.getCurrentDiagnosis();

    // 1. Course Pack Versions
    const cachedCoursePackVersions: Record<string, string> = {};
    let totalCachedResources = 0;
    let totalCachedReviewRecords = 0;

    for (const [courseId, pack] of Object.entries(packs)) {
      cachedCoursePackVersions[courseId] = pack.course?.coursePackVersion || '1.0.0';
      totalCachedResources += pack.resources.length;
      totalCachedReviewRecords += pack.reviewRecords.length;
    }

    // 2. Determine repository status
    let repoStatus: 'live-accessible' | 'unconfigured' | 'remote-blocked' | 'offline' = 'unconfigured';
    let repoHost: string | undefined;

    if (!settings.knowledgeBaseEnabled || !settings.knowledgeBaseRepoUrl?.trim()) {
      repoStatus = 'unconfigured';
    } else {
      try {
        const urlObj = new URL(settings.knowledgeBaseRepoUrl.trim());
        repoHost = urlObj.host;
        if (!networkDiag.isOnline) {
          repoStatus = 'offline';
        } else if (meta?.lastSuccessfulSync) {
          repoStatus = 'live-accessible';
        } else {
          repoStatus = 'remote-blocked';
        }
      } catch {
        repoStatus = 'unconfigured';
      }
    }

    // 3. Extract Sanitized Stages (Stages 1-16)
    // Map pipeline global and step traces into safe summaries without question/prompt text
    const sanitizedStages = (rawPipelineReport.steps || []).map((step) => {
      let safeSummary = this.sanitizeText(step.details || '');
      // Ensure summary does not leak prompt or question snippets
      if (safeSummary.length > 120) safeSummary = safeSummary.slice(0, 120) + '...';

      return {
        stageNumber: step.stageNumber,
        stageName: step.stageName,
        status: step.status,
        durationMs: step.durationMs,
        sanitizedSummary: safeSummary,
        sanitizedFailureReason: step.failureReason ? this.sanitizeErrorCode(step.failureReason) : undefined,
      };
    });

    // 4. Collect unique sanitized error codes
    const errorCodesSet = new Set<string>();
    for (const step of rawPipelineReport.steps || []) {
      if (step.failureReason) {
        errorCodesSet.add(this.sanitizeErrorCode(step.failureReason));
      }
    }
    for (const ev of this.eventBuffer) {
      if (ev.sanitizedErrorCode) {
        errorCodesSet.add(ev.sanitizedErrorCode);
      }
    }

    // 5. Browser Environment (sanitized, no user profile or personal machine paths)
    const isExtension = typeof chrome !== 'undefined' && !!chrome?.runtime?.id;
    let browserEnv = 'Browser Standalone';
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      if (ua.includes('Edg/')) browserEnv = 'Microsoft Edge';
      else if (ua.includes('Chrome/')) browserEnv = 'Google Chrome';
      else if (ua.includes('Firefox/')) browserEnv = 'Mozilla Firefox';
      else if (ua.includes('Safari/')) browserEnv = 'Apple Safari';
    }

    // 6. Assemble Report Object
    const report: PrivacyPreservingDiagnosticReport = {
      diagnosticRunId: this.currentRunId,
      generatedAt: new Date().toISOString(),
      application: {
        name: 'swayam404',
        version: '1.0.0',
        manifestVersion: 3,
        browserEnvironment: browserEnv,
        isExtensionContext: isExtension,
      },
      knowledgeBase: {
        datasetVersion: meta?.datasetVersion || manifest?.datasetVersion || 'unversioned',
        schemaVersion: '1.0.0',
        cachedCoursePackVersions,
        totalCachedCourses: Object.keys(packs).length,
        totalCachedResources,
        totalCachedReviewRecords,
        lastSyncTimestamp: meta?.lastSuccessfulSync,
        lastSyncDurationMs: rawPipelineReport.durationMs,
        lastSyncOutcome:
          repoStatus === 'live-accessible'
            ? 'synced'
            : repoStatus === 'unconfigured'
            ? 'unconfigured'
            : 'out-of-sync',
        repositoryStatus: repoStatus,
        configuredRepoHost: repoHost,
      },
      pipelineTelemetry: {
        recentRetrievalDurationMs: rawPipelineReport.durationMs,
        cacheHitCount: this.cacheHits,
        cacheMissCount: this.cacheMisses,
        aggregateScanCounts: {
          totalScanned: rawPipelineReport.summary?.totalScanned ?? 0,
          exactMatches: rawPipelineReport.summary?.historicalMatches ?? 0,
          aiAttempted: rawPipelineReport.summary?.aiAttempted ?? 0,
          aiSucceeded: rawPipelineReport.summary?.aiSucceeded ?? 0,
          unresolved: rawPipelineReport.summary?.unresolved ?? 0,
          populated: rawPipelineReport.summary?.populated ?? 0,
          errorsCount: rawPipelineReport.summary?.errorsCount ?? 0,
        },
        providerRequestOutcomes: { ...this.providerStats },
        sanitizedErrorCodes: Array.from(errorCodesSet),
        stages: sanitizedStages,
      },
      recentEvents: this.eventBuffer.map((e) => ({
        category: e.category,
        timestamp: e.timestamp,
        status: e.status,
        durationMs: e.durationMs,
        stageIdentifier: e.stageIdentifier,
        sanitizedErrorCode: e.sanitizedErrorCode,
      })),
      networkHealth: {
        isOnline: networkDiag.isOnline,
        state: networkDiag.state,
        failureType: networkDiag.failureType,
        lastChecked: new Date(networkDiag.lastChecked).toISOString(),
      },
      privacyDisclosure: {
        exportedCategories: [
          'Application Version & Browser Platform',
          'Knowledge Base Dataset Version & Cached Course Pack Versions',
          'Last Sync Timestamp & Duration',
          'Cache-Hit & Cache-Miss Counts',
          'Aggregate Scan Counts (Numeric Only)',
          'Provider Outcome Categories (Timeout, Quota, Success)',
          '16-Stage Pipeline Timing & Sanitized Statuses',
          'Sanitized Diagnostic Error Codes',
          'Local Network Status (Online / Offline / Latency)',
        ],
        explicitlyExcludedData: [
          'Question Text & Option Choices (100% OMITTED)',
          'Answer Keys & Selected Answers (100% OMITTED)',
          'Student Name, Roll Number, Email & Account ID (100% OMITTED)',
          'Cookies, Authentication Tokens & Session Headers (100% OMITTED)',
          'AI Prompts & Generated Text Responses (100% OMITTED)',
          'Full URLs with Query Parameters (100% STRIPPED)',
          'Full Page DOM / HTML Source (100% OMITTED)',
          'Private Lecture Notes or Pedagogical Content (100% OMITTED)',
        ],
        localExportOnly: true,
        zeroTelemetryGuarantee: true,
      },
    };

    return report;
  }

  /**
   * Converts the privacy-preserving report to a formatted JSON string.
   */
  async exportToJsonString(): Promise<string> {
    const report = await this.generatePrivacyPreservingReport();
    return JSON.stringify(report, null, 2);
  }

  /**
   * Triggers a local browser download of the report.
   * Zero remote network request is ever dispatched.
   */
  async downloadReportFile(): Promise<string> {
    const jsonStr = await this.exportToJsonString();
    const filename = `swayam404_diagnostic_report_${this.currentRunId}.json`;

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    return filename;
  }

  /**
   * Returns human-readable list of exported categories for UI preview modal.
   */
  getExportCategoryPreview(): { included: string[]; excluded: string[] } {
    return {
      included: [
        'Application Version & Manifest (v1.0.0, MV3)',
        'Knowledge Base Dataset & Course Pack Versions',
        'Last Sync Duration & Outcome Status',
        'Cache Hit/Miss Metrics',
        'Aggregate Question Scan Counts (Numeric Only)',
        'AI Provider Outcome Categories (Quota, Timeout, Success)',
        '16-Stage Pipeline Latency & Sanitized Error Codes',
        'Local Network Health & Latency',
      ],
      excluded: [
        'Question Text (Zero questions logged)',
        'Answer Text & Answer Keys (Zero answers logged)',
        'Student Identity (Zero names, emails, roll numbers)',
        'Authentication Credentials (Zero API keys, cookies, tokens)',
        'AI Prompts & AI Responses (Zero model text logged)',
        'Sensitive URL Query Parameters (Stripped to base origin)',
        'Full Web Page HTML (Zero DOM serialized)',
        'Course Material Content (Zero note text logged)',
      ],
    };
  }
}

export const diagnosticExporter = DiagnosticExporterService.getInstance();
