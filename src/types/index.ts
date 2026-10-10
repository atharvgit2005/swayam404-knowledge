/**
 * Core Data Models for swayam404
 */

export type QuestionType = 'single-choice' | 'multiple-choice' | 'true-false' | 'short-text';

export type ReviewStatus = 'unreviewed' | 'verified' | 'flagged';

export interface Course {
  id: string;
  name: string;
  externalCourseId?: string;
  description?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionRecord {
  id: string;
  courseId: string;
  questionText: string;
  questionType: QuestionType;
  options?: string[]; // Array of option strings
  correctOptions?: string[]; // Content-based matched options (e.g., ["Inelastic", "Elastic"])
  answerText?: string; // For short text or numerical answer
  explanation?: string;
  reviewStatus: ReviewStatus;
  source: string; // e.g., "Assignment 2 - Economics 101"
  createdAt: string;
  updatedAt: string;
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

export interface QuestionMatchResult {
  scannedQuestion: ScannedQuestion;
  matchedRecord?: QuestionRecord;
  status: MatchStatus;
  confidence: number;
  reasons: string[];
  proposedAnswers: string[]; // Options or text strings approved for population
  isApproved: boolean; // Explicit student approval
  requiresReview: boolean;
  userOverrideAnswer?: string[];
  candidateOptions?: string[]; // Options found on the current page
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
}

export interface ExtensionSettings {
  theme: 'dark';
  selectedCourseId: string;
  autoScanOnLoad: boolean;
  aiAssistedReviewEnabled: boolean;
  aiApiKey?: string;
  aiEndpoint?: string;
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
  questions?: ScannedQuestion[];
}

export interface PopulateAnswersMessage {
  type: 'POPULATE_ANSWERS';
  targets: PopulationTarget[];
}

export interface PopulateResultMessage {
  type: 'POPULATE_RESULT';
  summary: PopulationSummary;
}

export type ExtensionMessage =
  | ScanAssignmentMessage
  | ScanResultMessage
  | PopulateAnswersMessage
  | PopulateResultMessage;
