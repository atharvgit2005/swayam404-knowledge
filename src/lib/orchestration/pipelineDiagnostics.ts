export interface DiagnosticStep {
  stepNumber: number;
  name: string;
  ran: boolean;
  success: boolean;
  inputCount?: number;
  outputCount?: number;
  summary: string;
  failureReason?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

export interface QuestionDiagnosticTrace {
  questionId: string;
  questionIndex: number;
  questionTextSnippet: string;
  steps: DiagnosticStep[];
  finalState: string;
  providerUsed?: string;
  modelUsed?: string;
}

export interface PipelineStepTrace {
  stageNumber: number;
  stageName: string;
  questionId?: string;
  status: 'succeeded' | 'failed' | 'skipped';
  durationMs: number;
  details: string;
  failureReason?: string;
  inputCount?: number;
  outputCount?: number;
}

export interface PipelineDiagnosticReport {
  sessionId: string;
  timestamp: string;
  durationMs: number;
  courseId: string;
  courseTitle: string;
  globalSteps: DiagnosticStep[];
  questionTraces: QuestionDiagnosticTrace[];
  steps: PipelineStepTrace[];
  summary: {
    totalScanned: number;
    historicalMatches: number;
    aiAttempted: number;
    aiSucceeded: number;
    unresolved: number;
    populated: number;
    errorsCount: number;
  };
}

export type PipelineDiagnosticsReport = PipelineDiagnosticReport;

/**
 * Privacy-conscious Pipeline Diagnostics Tracer.
 * Records execution trace across all 16 stages with input/output counts
 * and explicit failure reasons. Strictly redacts API keys, auth tokens,
 * and credentials.
 */
export class PipelineDiagnosticsTracer {
  private sessionId = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  private startTime = Date.now();
  private courseId = '';
  private courseTitle = '';
  private globalSteps: DiagnosticStep[] = [];
  private questionTraces = new Map<string, QuestionDiagnosticTrace>();

  startSession(courseId: string, courseTitle: string): void {
    this.sessionId = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.startTime = Date.now();
    this.courseId = courseId;
    this.courseTitle = courseTitle;
    this.globalSteps = [];
    this.questionTraces.clear();
  }

  recordGlobalStep(
    stepNumber: number,
    name: string,
    success: boolean,
    summary: string,
    opts?: {
      inputCount?: number;
      outputCount?: number;
      failureReason?: string;
      durationMs?: number;
      details?: Record<string, unknown>;
    }
  ): DiagnosticStep {
    const step: DiagnosticStep = {
      stepNumber,
      name,
      ran: true,
      success,
      summary,
      inputCount: opts?.inputCount,
      outputCount: opts?.outputCount,
      failureReason: opts?.failureReason,
      durationMs: opts?.durationMs,
      details: this.sanitizeDetails(opts?.details),
    };
    this.globalSteps.push(step);
    return step;
  }

  initQuestionTrace(questionId: string, questionIndex: number, questionText: string): void {
    if (!this.questionTraces.has(questionId)) {
      this.questionTraces.set(questionId, {
        questionId,
        questionIndex,
        questionTextSnippet: questionText.slice(0, 80),
        steps: [],
        finalState: 'unresolved',
      });
    }
  }

  recordQuestionStep(
    questionId: string,
    stepNumber: number,
    name: string,
    success: boolean,
    summary: string,
    opts?: {
      ran?: boolean;
      inputCount?: number;
      outputCount?: number;
      failureReason?: string;
      durationMs?: number;
      details?: Record<string, unknown>;
    }
  ): void {
    const trace = this.questionTraces.get(questionId);
    if (!trace) return;

    trace.steps.push({
      stepNumber,
      name,
      ran: opts?.ran !== undefined ? opts.ran : true,
      success,
      summary,
      inputCount: opts?.inputCount,
      outputCount: opts?.outputCount,
      failureReason: opts?.failureReason,
      durationMs: opts?.durationMs,
      details: this.sanitizeDetails(opts?.details),
    });
  }

  setQuestionFinalState(
    questionId: string,
    finalState: string,
    providerUsed?: string,
    modelUsed?: string
  ): void {
    const trace = this.questionTraces.get(questionId);
    if (trace) {
      trace.finalState = finalState;
      trace.providerUsed = providerUsed;
      trace.modelUsed = modelUsed;
    }
  }

  private sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!details) return undefined;
    const sanitized: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(details)) {
      const lowerKey = k.toLowerCase();
      if (
        lowerKey.includes('key') ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('password') ||
        lowerKey.includes('cookie')
      ) {
        sanitized[k] = '[REDACTED]';
      } else {
        sanitized[k] = v;
      }
    }

    return sanitized;
  }

  generateReport(summaryOverride?: Partial<PipelineDiagnosticReport['summary']>): PipelineDiagnosticReport {
    const traces = Array.from(this.questionTraces.values());

    const summary = {
      totalScanned: traces.length,
      historicalMatches: traces.filter(
        (t) => t.finalState === 'portal-confirmed' || t.finalState === 'exact-match'
      ).length,
      aiAttempted: traces.filter((t) => t.steps.some((s) => s.stepNumber === 10 && s.ran)).length,
      aiSucceeded: traces.filter((t) => t.finalState === 'ai-suggested').length,
      unresolved: traces.filter((t) => t.finalState === 'unresolved' || t.finalState === 'ambiguous').length,
      populated: 0,
      errorsCount: traces.filter((t) => t.finalState === 'provider-error' || t.finalState === 'population-failed').length,
      ...summaryOverride,
    };

    const allSteps: PipelineStepTrace[] = [
      ...this.globalSteps.map((s) => ({
        stageNumber: s.stepNumber,
        stageName: s.name,
        status: (s.success ? 'succeeded' : s.ran ? 'failed' : 'skipped') as 'succeeded' | 'failed' | 'skipped',
        durationMs: s.durationMs || 0,
        details: s.summary,
        failureReason: s.failureReason,
        inputCount: s.inputCount,
        outputCount: s.outputCount,
      })),
      ...traces.flatMap((t) =>
        t.steps.map((s) => ({
          stageNumber: s.stepNumber,
          stageName: s.name,
          questionId: t.questionId,
          status: (s.success ? 'succeeded' : s.ran ? 'failed' : 'skipped') as 'succeeded' | 'failed' | 'skipped',
          durationMs: s.durationMs || 0,
          details: s.summary,
          failureReason: s.failureReason,
          inputCount: s.inputCount,
          outputCount: s.outputCount,
        }))
      ),
    ];

    return {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - this.startTime,
      courseId: this.courseId,
      courseTitle: this.courseTitle,
      globalSteps: this.globalSteps,
      questionTraces: traces,
      steps: allSteps,
      summary,
    };
  }
}

export const pipelineTracer = new PipelineDiagnosticsTracer();
