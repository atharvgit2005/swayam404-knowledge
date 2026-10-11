/**
 * Core Data Models for swayam404
 */

export * from './knowledge';
import { RetrievedExcerpt, RetrievalSourceType } from './knowledge';

export type QuestionType = 'single-choice' | 'multiple-choice' | 'true-false' | 'short-text';

export type VerificationStatus =
  | 'portal-confirmed'
  | 'student-reviewed'
  | 'ai-suggested'
  | 'unverified'
  | 'conflicted';

// Backwards-compatible alias for previous ReviewStatus
export type ReviewStatus = VerificationStatus | 'verified' | 'unreviewed' | 'flagged';

export interface Course {
  id: string;
  name: string;
  code?: string;
  externalCourseId?: string;
  description?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionRecord {
  id: string;
  courseId: string;
  portalCourseTitle?: string;
  externalCourseId?: string;
  assignmentId?: string;
  assignmentTitle?: string;
  unitId?: string;
  unitTitle?: string;
  week?: string;
  weekNumber?: number;
  userSessionId?: string;
  userEmail?: string;
  questionText: string;
  normalizedText?: string;
  questionType: QuestionType;
  options?: string[]; // Array of option strings
  correctOptions?: string[]; // Content-based matched options (e.g., ["Inelastic", "Elastic"])
  acceptedAnswers?: string[]; // Content-based accepted answers (alias for correctOptions)
  answerText?: string; // For short text or numerical answer
  explanation?: string;
  reviewStatus: ReviewStatus;
  verificationSource?: string; // e.g. "portal-feedback", "student-manual", "gemini-1.5-flash"
  contentFingerprint?: string;
  source: string; // e.g., "Assignment 2 - Economics 101"
  createdAt: string;
  updatedAt: string;
  capturedAt?: string;
}

export interface CapturedQuestionRecord {
  id: string;
  questionIndex: number;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  selectedOptions: string[];
  acceptedAnswers: string[]; // Explicitly confirmed correct answers from portal feedback
  explanation?: string;
  verificationStatus: VerificationStatus;
  verificationSource: string; // e.g. "portal_accepted_answers", "portal_correct_indicator", "score_only"
  hasExplicitFeedback: boolean; // True ONLY if portal explicitly showed the correct answer
  feedbackText?: string;
  ambiguityWarning?: string;
  isSelectedForSave: boolean;
  portalCourseTitle?: string;
  externalCourseId?: string;
  assignmentTitle?: string;
  unitTitle?: string;
}

export interface ScannedOption {
  id: string;
  text: string;
  value?: string;
  inputSelector?: string;
}

export interface ScannedQuestion {
  id: string;
  index: number;
  questionText: string;
  questionType: QuestionType;
  options: ScannedOption[];
  controlSelector?: string;
  formType: 'radio' | 'checkbox' | 'select' | 'text' | 'unknown';
  currentValue?: string | string[];
}

export type MatchStatus =
  | 'exact-match'
  | 'probable-match'
  | 'ambiguous-match'
  | 'no-match'
  | 'unsupported-type';

export type AnswerBasis =
  | 'portal-confirmed'
  | 'course-material'
  | 'course-context'
  | 'historical-match'
  | 'ai-reasoning'
  | 'unresolved';

export type ResolutionState =
  | 'portal-confirmed'
  | 'student-reviewed'
  | 'ai-suggested'
  | 'chatgpt-suggested'
  | 'ambiguous'
  | 'unresolved'
  | 'provider-error'
  | 'population-failed';

export interface QuestionMatchResult {
  scannedQuestion: ScannedQuestion;
  matchedRecord?: QuestionRecord;
  status: MatchStatus;
  resolutionState?: ResolutionState;
  confidence: number;
  reasons: string[];
  proposedAnswers: string[]; // Options or text strings approved for population
  isApproved: boolean; // Explicit student approval
  requiresReview: boolean;
  userOverrideAnswer?: string[];
  candidateOptions?: string[]; // Options found on the current page
  basis?: AnswerBasis;
  evidence?: string;
  aiExplanation?: string;
  providerUsed?: string;
  modelUsed?: string;
  providerError?: string;
  retrievedEvidence?: RetrievedExcerpt[];
  evidenceSources?: {
    title: string;
    sourceTitle?: string;
    sourceUrl?: string;
    retrievalSource?: RetrievalSourceType;
    lectureId?: string;
    timestamp?: string;
    license?: string;
    relevanceScore?: number;
  }[];
}

export interface PopulationTarget {
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  selectedAnswers: string[];
  controlSelector?: string;
  options: ScannedOption[];
}

export interface PopulationItemResult {
  questionId: string;
  questionText: string;
  success: boolean;
  message: string;
  populatedAnswers: string[];
}

export interface PopulationSummary {
  timestamp: string;
  totalApproved: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: PopulationItemResult[];
}

export interface AnswerBankExport {
  version: '1.0.0';
  app: 'swayam404';
  exportedAt: string;
  courses: Course[];
  questions: QuestionRecord[];
  materials?: CourseMaterial[];
}

export type LlmProviderType = 'gemini' | 'grok' | 'openai' | 'custom-proxy';
export type WebAiProviderType = 'chatgpt' | 'claude' | 'gemini';

export interface ExtensionSettings {
  theme: 'dark';
  selectedCourseId: string;
  autoScanOnLoad: boolean;
  aiAssistedReviewEnabled: boolean;
  aiProvider?: LlmProviderType;
  webAiProvider?: WebAiProviderType; // 'chatgpt' | 'claude' | 'gemini'
  aiApiKey?: string;
  aiModel?: string; // Default: 'gemini-1.5-flash'
  grokApiKey?: string;
  grokModel?: string; // Default: 'grok-2-latest'
  openaiApiKey?: string;
  openaiModel?: string; // Default: 'gpt-4o-mini'
  enableProviderFallback?: boolean; // Default true: auto-routes to secondary provider on rate limit / 5xx
  enableDirectApiProviders?: boolean; // Paused by default in favor of Web AI (ChatGPT Web)
  aiEndpoint?: string;
  autoPopulateExactVerified: boolean; // Opt-in trusted auto-fill for exact verified answers
  autoApplyHighConfidence?: boolean; // Opt-in single-click fill for verified + high-evidence AI answers
  knowledgeBaseEnabled?: boolean;
  knowledgeBaseRepoUrl?: string;
  courseCompletionModeActive?: boolean;
}

export type MaterialType = 'notes' | 'transcript' | 'pdf-text' | 'lecture-summary';

export interface CourseMaterial {
  id: string;
  courseId: string;
  title: string;
  unitTitle?: string;
  unitId?: string;
  type: MaterialType;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface LlmQuestionRequest {
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  courseTitle: string;
  topicOrUnit?: string;
  retrievedContext?: string[];
  historicalExamples?: { questionText: string; correctAnswers: string[] }[];
}

export interface LlmRecommendation {
  questionId: string;
  recommendedAnswers: string[];
  explanation: string;
  evidence?: string;
  confidence?: number;
  basis: AnswerBasis;
  uncertaintyReasons?: string[];
  needsReview: boolean;
}

export interface LlmAnswerResponse {
  recommendations: LlmRecommendation[];
  provider: string;
  model: string;
  usageTokens?: number;
  error?: string;
}

export type TaskStatus =
  | 'not-scanned'
  | 'ready-to-prepare'
  | 'prepared'
  | 'needs-attention'
  | 'awaiting-submission'
  | 'completed'
  | 'unsupported'
  | 'error';

export type TaskType =
  | 'assignment'
  | 'quiz'
  | 'practice'
  | 'feedback'
  | 'resource'
  | 'unknown';

export interface TaskMatchSummary {
  scanned: number;
  exactMatches: number;
  reviewRequired: number;
  unmatched: number;
}

export interface CourseTask {
  id: string;
  courseId: string;
  title: string;
  unitTitle?: string;
  type: TaskType;
  url?: string;
  targetSelector?: string;
  status: TaskStatus;
  portalReportedComplete: boolean;
  portalStatusText?: string;
  questionsCount?: number;
  preparedCount?: number;
  lastScannedAt?: string;
  lastPreparedAt?: string;
  statusMessage?: string;
  matchSummary?: TaskMatchSummary;
}

export interface CourseMapping {
  id: string;
  portalCourseTitle: string;
  localCourseId: string;
  externalCourseId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CourseReadiness {
  courseId: string;
  courseName: string;
  totalStoredQuestions: number;
  usableAnswersCount: number;
  verifiedAnswersCount: number;
  portalConfirmedCount: number;
  studentReviewedCount: number;
  aiSuggestedCount: number;
  conflictedCount: number;
  isSampleData: boolean;
  sampleDataWarning?: string;
  isReadyForPrep: boolean;
  readinessReason: string;
}

export interface WorkflowCheckpoint {
  courseId: string;
  activeTaskId?: string;
  stepIndex: number;
  totalTasks: number;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  pauseReason?: string;
  nextActionPrompt?: string;
  updatedAt: string;
}

export interface SubmissionStatus {
  isSubmitted: boolean;
  isLocked: boolean;
  isPastDue: boolean;
  statusText?: string;
  scoreText?: string;
  dueDateText?: string;
  submittedAt?: string;
  details?: string;
}

export interface WeekInfo {
  weekNumber?: number;
  formattedWeek?: string;
  rawText?: string;
}

export interface ActiveScanSession {
  url?: string;
  pageTitle?: string;
  courseId: string;
  courseTitle?: string;
  assignmentTitle?: string;
  unitTitle?: string;
  detectedWeek?: string;
  detectedWeekNumber?: number;
  isAlreadySubmitted?: boolean;
  submissionStatus?: SubmissionStatus;
  externalId?: string;
  results: QuestionMatchResult[];
  savedAt: string;
}

export interface ScanHistoryRecord {
  id: string;
  url?: string;
  pageTitle: string;
  courseId: string;
  courseTitle: string;
  assignmentTitle: string;
  detectedWeek?: string;
  isAlreadySubmitted?: boolean;
  totalQuestions: number;
  approvedCount: number;
  results: QuestionMatchResult[];
  timestamp: string;
}

export interface PortalTabInfo {
  isSwayam: boolean;
  isChatGpt: boolean;
  isWebAi?: boolean;
  webAiProvider?: WebAiProviderType;
  isSupported: boolean;
  url?: string;
  tabTitle?: string;
  detectedCourseTitle?: string;
  detectedAssignmentTitle?: string;
  detectedExternalId?: string;
  userSessionId?: string;
  userEmail?: string;
  questionCount?: number;
  detectedWeek?: string;
  detectedWeekNumber?: number;
  isAlreadySubmitted?: boolean;
  submissionStatus?: SubmissionStatus;
  tabId?: number;
}

// Extension Messages
export interface PingMessage {
  type: 'PING';
}

export interface PongMessage {
  type: 'PONG';
  version: string;
  url: string;
  title?: string;
  detectedCourseTitle?: string;
  detectedAssignmentTitle?: string;
  detectedExternalId?: string;
  userSessionId?: string;
  userEmail?: string;
  questionCount?: number;
  detectedWeek?: string;
  detectedWeekNumber?: number;
  isAlreadySubmitted?: boolean;
  submissionStatus?: SubmissionStatus;
  timestamp?: number;
}

export interface ScanAssignmentMessage {
  type: 'SCAN_ASSIGNMENT';
}

export interface ScanResultMessage {
  type: 'SCAN_RESULT';
  success: boolean;
  error?: string;
  url?: string;
  pageTitle?: string;
  detectedCourseTitle?: string;
  detectedExternalId?: string;
  userSessionId?: string;
  userEmail?: string;
  detectedUnitId?: string;
  detectedAssessmentId?: string;
  detectedAssignmentTitle?: string;
  detectedWeek?: string;
  detectedWeekNumber?: number;
  isAlreadySubmitted?: boolean;
  submissionStatus?: SubmissionStatus;
  questions?: ScannedQuestion[];
}

export interface ScanCourseOutlineMessage {
  type: 'SCAN_COURSE_OUTLINE';
}

export interface CourseOutlineResultMessage {
  type: 'COURSE_OUTLINE_RESULT';
  success: boolean;
  error?: string;
  url?: string;
  portalCourseTitle?: string;
  externalCourseId?: string;
  tasks: CourseTask[];
}

export interface PopulateAnswersMessage {
  type: 'POPULATE_ANSWERS';
  targets: PopulationTarget[];
}

export interface PopulateResultMessage {
  type: 'POPULATE_RESULT';
  summary: PopulationSummary;
}

export interface CaptureFeedbackMessage {
  type: 'CAPTURE_ASSIGNMENT_FEEDBACK';
}

export interface CaptureFeedbackResultMessage {
  type: 'CAPTURE_FEEDBACK_RESULT';
  success: boolean;
  error?: string;
  url?: string;
  portalCourseTitle?: string;
  externalCourseId?: string;
  assignmentTitle?: string;
  unitTitle?: string;
  capturedRecords: CapturedQuestionRecord[];
}

export interface SinglePrepResultMessage {
  type: 'PREPARE_ASSIGNMENT_RESULT';
  success: boolean;
  taskTitle: string;
  scannedQuestions: number;
  exactVerifiedPopulated: number;
  reviewRequired: number;
  unmatched: number;
  error?: string;
}

export interface SetCourseCompletionModeMessage {
  type: 'SET_COURSE_COMPLETION_MODE';
  enabled: boolean;
  approvedTaskIds?: string[];
}

export interface ApplyCourseCompletionMessage {
  type: 'APPLY_COURSE_COMPLETION_CHECKMARKS';
  approvedTaskIds?: string[];
}

export interface ApproveAndSolveTaskMessage {
  type: 'APPROVE_AND_SOLVE_TASK';
  taskId: string;
  taskTitle?: string;
  unitTitle?: string;
  taskUrl?: string;
  autoTick?: boolean;
}

export interface CourseCompletionResultMessage {
  type: 'COURSE_COMPLETION_RESULT';
  success: boolean;
  enabled: boolean;
  appliedCount: number;
  totalBlocks: number;
  pendingQuizzes?: number;
}

export type ExtensionMessage =
  | PingMessage
  | PongMessage
  | ScanAssignmentMessage
  | ScanResultMessage
  | ScanCourseOutlineMessage
  | CourseOutlineResultMessage
  | PopulateAnswersMessage
  | PopulateResultMessage
  | CaptureFeedbackMessage
  | CaptureFeedbackResultMessage
  | SinglePrepResultMessage
  | SetCourseCompletionModeMessage
  | ApplyCourseCompletionMessage
  | ApproveAndSolveTaskMessage
  | CourseCompletionResultMessage;

