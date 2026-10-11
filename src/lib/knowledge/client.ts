/**
 * Read-Only Remote Client for Swayam404 Knowledge Base
 *
 * Exclusively performs unauthenticated HTTP GET operations against a configured public repository.
 * Zero tokens, zero credentials, zero write APIs.
 *
 * Phase 4 Enhancements:
 * - Conditional HTTP requests (ETag / If-None-Match, Last-Modified / If-Modified-Since).
 * - Safe handling of HTTP 304 Not Modified.
 * - Granular course pack loading without full repository redownloads.
 */

import {
  KnowledgeManifest,
  KnowledgeManifestCourseEntry,
  KnowledgeCourse,
  KnowledgeResource,
  KnowledgeReviewRecord,
  KnowledgeCoursePack,
} from '@/types/knowledge';
import { KnowledgeValidator } from './validator';
import { computeSha256, verifyIntegrity } from './hasher';
import { validateRelativeRepoPath, validateRepositoryUrl } from './security';

export class KnowledgeClientError extends Error {
  public statusCode?: number;
  public url?: string;
  public isTimeout: boolean;
  public isNetworkError: boolean;
  public isIntegrityError: boolean;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      url?: string;
      isTimeout?: boolean;
      isNetworkError?: boolean;
      isIntegrityError?: boolean;
    }
  ) {
    super(message);
    this.name = 'KnowledgeClientError';
    this.statusCode = options?.statusCode;
    this.url = options?.url;
    this.isTimeout = options?.isTimeout ?? false;
    this.isNetworkError = options?.isNetworkError ?? false;
    this.isIntegrityError = options?.isIntegrityError ?? false;
  }
}

export interface KnowledgeClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchFn?: typeof fetch;
}

export interface FetchConditionalResult<T> {
  data: T | null;
  notModified: boolean;
  etag?: string;
  lastModified?: string;
}

export interface IKnowledgeLoader {
  isConfigured(): boolean;
  getBaseUrl(): string | undefined;
  fetchManifest(signal?: AbortSignal): Promise<KnowledgeManifest | null>;
  fetchCoursePack(
    entry: KnowledgeManifestCourseEntry,
    signal?: AbortSignal
  ): Promise<KnowledgeCoursePack>;
  fetchManifestConditional?(options?: {
    etag?: string;
    lastModified?: string;
    signal?: AbortSignal;
  }): Promise<FetchConditionalResult<KnowledgeManifest>>;
  fetchCoursePackConditional?(
    entry: KnowledgeManifestCourseEntry,
    options?: {
      etag?: string;
      lastModified?: string;
      signal?: AbortSignal;
    }
  ): Promise<FetchConditionalResult<KnowledgeCoursePack>>;
}

export class KnowledgeBaseClient implements IKnowledgeLoader {
  private baseUrl?: string;
  private timeoutMs: number;
  private maxRetries: number;
  private fetchFn: typeof fetch;

  constructor(options: KnowledgeClientOptions = {}) {
    if (options.baseUrl && options.baseUrl.trim()) {
      const check = validateRepositoryUrl(options.baseUrl);
      if (!check.isValid) {
        throw new KnowledgeClientError(`Invalid repository URL: ${check.error}`);
      }
      this.baseUrl = check.normalizedUrl;
    }
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchFn =
      options.fetchFn ??
      (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (undefined as unknown as typeof fetch));
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.baseUrl.trim().length > 0);
  }

  getBaseUrl(): string | undefined {
    return this.baseUrl;
  }

  setBaseUrl(url: string | undefined): void {
    if (!url || !url.trim()) {
      this.baseUrl = undefined;
      return;
    }
    const check = validateRepositoryUrl(url);
    if (!check.isValid) {
      throw new KnowledgeClientError(`Invalid repository URL: ${check.error}`);
    }
    this.baseUrl = check.normalizedUrl;
  }

  /**
   * Internal HTTP GET with timeout, cancellation, bounded retries, and conditional headers.
   */
  private async getJson<T>(
    relativePath: string,
    externalSignal?: AbortSignal,
    conditionalHeaders?: { etag?: string; lastModified?: string }
  ): Promise<{
    data: T | null;
    rawText: string;
    url: string;
    notModified: boolean;
    etag?: string;
    lastModified?: string;
  }> {
    if (!this.isConfigured() || !this.baseUrl) {
      throw new KnowledgeClientError('Knowledge repository URL is not configured.', {
        isNetworkError: false,
      });
    }

    const pathCheck = validateRelativeRepoPath(relativePath);
    if (!pathCheck.isValid) {
      throw new KnowledgeClientError(`Invalid relative path '${relativePath}': ${pathCheck.error}`);
    }

    const url = `${this.baseUrl}/${pathCheck.normalizedPath}`;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.maxRetries) {
      attempt++;

      // Create linked controller for timeout and cancellation
      const controller = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      if (this.timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          controller.abort(new Error(`Request timed out after ${this.timeoutMs}ms`));
        }, this.timeoutMs);
      }

      // Link external signal if provided
      const abortListener = () => controller.abort(externalSignal?.reason);
      if (externalSignal) {
        externalSignal.addEventListener('abort', abortListener);
      }

      try {
        const headers: Record<string, string> = {
          Accept: 'application/json, text/plain, */*',
        };
        if (conditionalHeaders?.etag) {
          headers['If-None-Match'] = conditionalHeaders.etag;
        }
        if (conditionalHeaders?.lastModified) {
          headers['If-Modified-Since'] = conditionalHeaders.lastModified;
        }

        const response = await this.fetchFn(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        if (timeoutId) clearTimeout(timeoutId);
        if (externalSignal) externalSignal.removeEventListener('abort', abortListener);

        // Safely extract ETag and Last-Modified headers if exposed
        const respEtag =
          typeof response.headers?.get === 'function'
            ? response.headers.get('etag') || response.headers.get('ETag') || undefined
            : undefined;
        const respLastMod =
          typeof response.headers?.get === 'function'
            ? response.headers.get('last-modified') || response.headers.get('Last-Modified') || undefined
            : undefined;

        // HTTP 304 Not Modified
        if (response.status === 304) {
          return {
            data: null,
            rawText: '',
            url,
            notModified: true,
            etag: respEtag || conditionalHeaders?.etag,
            lastModified: respLastMod || conditionalHeaders?.lastModified,
          };
        }

        if (!response.ok) {
          const err = new KnowledgeClientError(
            `HTTP ${response.status} (${response.statusText}) when fetching ${url}`,
            { statusCode: response.status, url }
          );

          // 4xx client errors (404, 403, 400) should NOT be retried
          if (response.status >= 400 && response.status < 500) {
            throw err;
          }
          throw err;
        }

        const rawText = await response.text();
        let parsed: T;
        try {
          parsed = JSON.parse(rawText) as T;
        } catch (jsonErr) {
          throw new KnowledgeClientError(
            `Malformed JSON received from ${url}: ${(jsonErr as Error).message}`,
            { url }
          );
        }

        return {
          data: parsed,
          rawText,
          url,
          notModified: false,
          etag: respEtag,
          lastModified: respLastMod,
        };
      } catch (err: unknown) {
        if (timeoutId) clearTimeout(timeoutId);
        if (externalSignal) externalSignal.removeEventListener('abort', abortListener);

        const error = err as Error;
        const isTimeout =
          error.name === 'AbortError' ||
          error.message.includes('timed out') ||
          (controller.signal.aborted && !externalSignal?.aborted);

        const clientErr =
          err instanceof KnowledgeClientError
            ? err
            : new KnowledgeClientError(
                isTimeout
                  ? `Request timed out after ${this.timeoutMs}ms when contacting ${url}`
                  : `Network error when contacting ${url}: ${error.message}`,
                {
                  url,
                  isTimeout,
                  isNetworkError: !isTimeout,
                }
              );

        lastError = clientErr;

        // If client aborted or 4xx error or max retries reached, do not retry
        if (
          externalSignal?.aborted ||
          (clientErr.statusCode && clientErr.statusCode >= 400 && clientErr.statusCode < 500) ||
          attempt > this.maxRetries
        ) {
          throw clientErr;
        }

        // Bounded exponential backoff before retry (e.g. 150ms * attempt)
        await new Promise((res) => setTimeout(res, attempt * 150));
      }
    }

    throw lastError || new KnowledgeClientError(`Failed to fetch ${url} after ${this.maxRetries} retries.`);
  }

  /**
   * Fetches and validates the root manifest.json.
   * Returns null gracefully if repository is unconfigured.
   */
  async fetchManifest(signal?: AbortSignal): Promise<KnowledgeManifest | null> {
    const res = await this.fetchManifestConditional({ signal });
    return res.data;
  }

  /**
   * Fetches the root manifest conditionally with ETag and Last-Modified support.
   */
  async fetchManifestConditional(options: {
    etag?: string;
    lastModified?: string;
    signal?: AbortSignal;
  } = {}): Promise<FetchConditionalResult<KnowledgeManifest>> {
    if (!this.isConfigured()) {
      return { data: null, notModified: false };
    }

    const { data, notModified, etag, lastModified } = await this.getJson<unknown>(
      'manifest.json',
      options.signal,
      {
        etag: options.etag,
        lastModified: options.lastModified,
      }
    );

    if (notModified) {
      return { data: null, notModified: true, etag, lastModified };
    }

    const validation = KnowledgeValidator.validateManifest(data);
    if (!validation.isValid || !validation.data) {
      const msgs = validation.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
      throw new KnowledgeClientError(`Remote manifest validation failed: ${msgs}`);
    }

    return {
      data: validation.data,
      notModified: false,
      etag,
      lastModified,
    };
  }

  /**
   * Fetches and validates a complete course pack according to the manifest entry.
   * Checks SHA-256 integrity hash against manifest contentHash.
   */
  async fetchCoursePack(
    entry: KnowledgeManifestCourseEntry,
    signal?: AbortSignal
  ): Promise<KnowledgeCoursePack> {
    const res = await this.fetchCoursePackConditional(entry, { signal });
    if (res.notModified || !res.data) {
      throw new KnowledgeClientError(`Received 304 Not Modified without prior cached pack for '${entry.courseId}'`);
    }
    return res.data;
  }

  /**
   * Fetches and validates a course pack conditionally with ETag/304 support.
   */
  async fetchCoursePackConditional(
    entry: KnowledgeManifestCourseEntry,
    options: {
      etag?: string;
      lastModified?: string;
      signal?: AbortSignal;
    } = {}
  ): Promise<FetchConditionalResult<KnowledgeCoursePack>> {
    if (!this.isConfigured()) {
      throw new KnowledgeClientError('Knowledge repository URL is not configured.');
    }

    // 1. Fetch course metadata (e.g., courses/course-econ-101/course.json)
    const { data: rawCourse } = await this.getJson<unknown>(entry.metadataPath, options.signal);
    const courseVal = KnowledgeValidator.validateCourse(rawCourse);
    if (!courseVal.isValid || !courseVal.data) {
      const msgs = courseVal.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
      throw new KnowledgeClientError(`Validation failed for course metadata '${entry.metadataPath}': ${msgs}`);
    }
    const course: KnowledgeCourse = courseVal.data;

    // 2. Fetch resources (e.g., courses/course-econ-101/resources.json) with conditional headers
    const {
      data: rawResources,
      rawText: resourcesRawText,
      notModified: resNotModified,
      etag: resEtag,
      lastModified: resLastMod,
    } = await this.getJson<unknown>(entry.resourcesPath, options.signal, {
      etag: options.etag,
      lastModified: options.lastModified,
    });

    if (resNotModified) {
      return {
        data: null,
        notModified: true,
        etag: resEtag || options.etag,
        lastModified: resLastMod || options.lastModified,
      };
    }

    const resourcesVal = KnowledgeValidator.validateResources(rawResources, entry.courseId);
    if (!resourcesVal.isValid || !resourcesVal.data) {
      const msgs = resourcesVal.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
      throw new KnowledgeClientError(`Validation failed for resources in '${entry.resourcesPath}': ${msgs}`);
    }
    const resources: KnowledgeResource[] = resourcesVal.data;

    // 3. Fetch optional review records (e.g., courses/course-econ-101/review-records.json)
    let reviewRecords: KnowledgeReviewRecord[] = [];
    if (entry.reviewRecordsPath) {
      const { data: rawRR } = await this.getJson<unknown>(entry.reviewRecordsPath, options.signal);
      const rrVal = KnowledgeValidator.validateReviewRecords(rawRR, entry.courseId);
      if (!rrVal.isValid || !rrVal.data) {
        const msgs = rrVal.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
        throw new KnowledgeClientError(`Validation failed for review records in '${entry.reviewRecordsPath}': ${msgs}`);
      }
      reviewRecords = rrVal.data;
    }

    // 4. SHA-256 Integrity Verification
    const packPayload = {
      courseId: entry.courseId,
      coursePackVersion: entry.coursePackVersion,
      course,
      resources,
      reviewRecords,
    };
    const computedHash = await computeSha256(packPayload);

    // Verify against entry.contentHash
    if (entry.contentHash) {
      const integrity = await verifyIntegrity(packPayload, entry.contentHash);
      if (!integrity.matches) {
        const resourceFileIntegrity = await verifyIntegrity(resourcesRawText, entry.contentHash);
        if (!resourceFileIntegrity.matches) {
          throw new KnowledgeClientError(
            `Content hash integrity verification failed for course '${entry.courseId}'. Expected ${entry.contentHash}, but computed ${computedHash}.`,
            { isIntegrityError: true }
          );
        }
      }
    }

    return {
      data: {
        course,
        resources,
        reviewRecords,
        contentHash: computedHash,
      },
      notModified: false,
      etag: resEtag,
      lastModified: resLastMod,
    };
  }
}
