import {
  Course,
  QuestionRecord,
  CapturedQuestionRecord,
  CourseMaterial,
  AnswerBankExport,
  ExtensionSettings,
  CourseMapping,
  CourseTask,
  CourseReadiness,
  WorkflowCheckpoint,
  ActiveScanSession,
  ScanHistoryRecord,
  KnowledgeManifest,
  KnowledgeCoursePack,
  KnowledgeCacheMetadata,
  ContributionProposal,
} from '@/types';
import { normalizeQuestionText } from '@/lib/matching/normalizer';

const STORAGE_KEYS = {
  COURSES: 'swayam404_courses_v1',
  QUESTIONS: 'swayam404_questions_v1',
  SELECTED_COURSE_ID: 'swayam404_selected_course_v1',
  SETTINGS: 'swayam404_settings_v1',
  COURSE_MAPPINGS: 'swayam404_course_mappings_v1',
  TASK_QUEUES: 'swayam404_task_queues_v1',
  CHECKPOINTS: 'swayam404_checkpoints_v1',
  COURSE_MATERIALS: 'swayam404_course_materials_v1',
  ACTIVE_SCAN_SESSION: 'swayam404_active_scan_session_v1',
  SCAN_HISTORY: 'swayam404_scan_history_v1',
  KB_MANIFEST: 'swayam404_kb_manifest_v1',
  KB_COURSE_PACKS: 'swayam404_kb_course_packs_v1',
  KB_METADATA: 'swayam404_kb_metadata_v1',
  KB_CONTRIBUTION_PROPOSALS: 'swayam404_kb_proposals_v1',
};

const DEFAULT_COURSES: Course[] = [
  {
    id: 'course-econ-101',
    name: 'Economics (Common Course)',
    externalCourseId: 'SWAYAM-ECON-CORE',
    description: 'Shared core course for micro/macroeconomics assignments',
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'course-ent-201',
    name: 'Entrepreneurship (Minor Course)',
    externalCourseId: 'SWAYAM-ENTR-MINOR',
    description: 'Specialized minor course in startup mechanics & venture creation',
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const DEFAULT_MAPPINGS: CourseMapping[] = [
  {
    id: 'map-econ-default',
    portalCourseTitle: 'Principles of Economics',
    localCourseId: 'course-econ-101',
    externalCourseId: 'SWAYAM-ECON-CORE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'map-ent-default',
    portalCourseTitle: 'Entrepreneurship & Venture Initiation',
    localCourseId: 'course-ent-201',
    externalCourseId: 'SWAYAM-ENTR-MINOR',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const DEFAULT_SETTINGS: ExtensionSettings = {
  theme: 'dark',
  selectedCourseId: 'course-econ-101',
  autoScanOnLoad: false,
  aiAssistedReviewEnabled: false,
  aiProvider: 'gemini',
  webAiProvider: 'chatgpt',
  aiModel: 'gemini-1.5-flash',
  grokModel: 'grok-2-latest',
  openaiModel: 'gpt-4o-mini',
  enableProviderFallback: true,
  autoPopulateExactVerified: false, // Explicit opt-in required for auto-fill
  autoApplyHighConfidence: false,
  knowledgeBaseEnabled: false,
  knowledgeBaseRepoUrl: '',
};

// Check if running in real Chrome Extension context
function isChromeStorageAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome?.storage?.local;
}

// In-memory fallback if neither chrome.storage nor localStorage is present
const memoryStore: Record<string, unknown> = {};

async function getItem<T>(key: string, defaultValue: T): Promise<T> {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          console.warn(`Storage get error for ${key}:`, chrome.runtime.lastError);
          resolve(defaultValue);
          return;
        }
        if (result && result[key] !== undefined) {
          resolve(result[key] as T);
        } else {
          resolve(defaultValue);
        }
      });
    });
  }

  // Fallback to browser localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const val = window.localStorage.getItem(key);
      if (val !== null) {
        return JSON.parse(val) as T;
      }
    } catch (e) {
      console.warn(`localStorage read error for ${key}:`, e);
    }
  }

  return (memoryStore[key] as T) ?? defaultValue;
}

async function setItem<T>(key: string, value: T): Promise<void> {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`localStorage write error for ${key}:`, e);
    }
  }

  memoryStore[key] = value;
}

export class StorageService {
  /**
   * Initializes default course seeds if none exist
   */
  static async initDefaults(): Promise<void> {
    const courses = await getItem<Course[]>(STORAGE_KEYS.COURSES, []);
    if (courses.length === 0) {
      await setItem(STORAGE_KEYS.COURSES, DEFAULT_COURSES);
    }

    const selected = await getItem<string>(STORAGE_KEYS.SELECTED_COURSE_ID, '');
    if (!selected) {
      await setItem(STORAGE_KEYS.SELECTED_COURSE_ID, DEFAULT_COURSES[0].id);
    }

    const mappings = await getItem<CourseMapping[]>(STORAGE_KEYS.COURSE_MAPPINGS, []);
    if (mappings.length === 0) {
      await setItem(STORAGE_KEYS.COURSE_MAPPINGS, DEFAULT_MAPPINGS);
    }
  }

  static async getCourses(): Promise<Course[]> {
    const courses = await getItem<Course[]>(STORAGE_KEYS.COURSES, []);
    if (courses.length === 0) {
      await this.initDefaults();
      return DEFAULT_COURSES;
    }
    return courses;
  }

  static async saveCourse(course: Course): Promise<void> {
    const courses = await this.getCourses();
    const existingIdx = courses.findIndex((c) => c.id === course.id);
    const updated = [...courses];
    const now = new Date().toISOString();

    if (existingIdx >= 0) {
      updated[existingIdx] = { ...course, updatedAt: now };
    } else {
      updated.push({ ...course, createdAt: now, updatedAt: now });
    }
    await setItem(STORAGE_KEYS.COURSES, updated);
  }

  static async deleteCourse(courseId: string): Promise<void> {
    const courses = await this.getCourses();
    const filtered = courses.filter((c) => c.id !== courseId);
    await setItem(STORAGE_KEYS.COURSES, filtered);

    // Also remove associated questions
    const questions = await this.getQuestions();
    const remainingQuestions = questions.filter((q) => q.courseId !== courseId);
    await setItem(STORAGE_KEYS.QUESTIONS, remainingQuestions);

    // If active course was deleted, fallback to first available
    const activeId = await this.getSelectedCourseId();
    if (activeId === courseId && filtered.length > 0) {
      await this.setSelectedCourseId(filtered[0].id);
    }
  }

  static async getSelectedCourseId(): Promise<string> {
    const active = await getItem<string>(STORAGE_KEYS.SELECTED_COURSE_ID, '');
    if (!active) {
      const courses = await this.getCourses();
      return courses[0]?.id ?? 'course-econ-101';
    }
    return active;
  }

  static async setSelectedCourseId(id: string): Promise<void> {
    await setItem(STORAGE_KEYS.SELECTED_COURSE_ID, id);
  }

  static async getQuestions(courseId?: string): Promise<QuestionRecord[]> {
    const questions = await getItem<QuestionRecord[]>(STORAGE_KEYS.QUESTIONS, []);
    if (courseId) {
      return questions.filter((q) => q.courseId === courseId);
    }
    return questions;
  }

  static async saveQuestion(question: QuestionRecord): Promise<void> {
    const all = await this.getQuestions();
    const now = new Date().toISOString();
    const idx = all.findIndex((q) => q.id === question.id);
    const updated = [...all];

    if (idx >= 0) {
      updated[idx] = { ...question, updatedAt: now };
    } else {
      updated.push({ ...question, createdAt: now, updatedAt: now });
    }
    await setItem(STORAGE_KEYS.QUESTIONS, updated);
  }

  static async saveQuestions(newQuestions: QuestionRecord[]): Promise<void> {
    const all = await this.getQuestions();
    const map = new Map<string, QuestionRecord>(all.map((q) => [q.id, q]));
    const now = new Date().toISOString();

    for (const q of newQuestions) {
      map.set(q.id, {
        ...q,
        updatedAt: now,
        createdAt: q.createdAt || now,
      });
    }
    await setItem(STORAGE_KEYS.QUESTIONS, Array.from(map.values()));
  }

  static async deleteQuestion(id: string): Promise<void> {
    const all = await this.getQuestions();
    await setItem(STORAGE_KEYS.QUESTIONS, all.filter((q) => q.id !== id));
  }

  /**
   * Saves questions to Question Bank tagged with course, week, and user session ID
   */
  static async saveQuestionsForWeekAndSession(opts: {
    courseId: string;
    week?: string;
    weekNumber?: number;
    userSessionId?: string;
    userEmail?: string;
    questions: QuestionRecord[];
  }): Promise<number> {
    const all = await this.getQuestions();
    const now = new Date().toISOString();
    let savedCount = 0;

    for (const q of opts.questions) {
      const qNorm = normalizeQuestionText(q.questionText);
      const existingIdx = all.findIndex((existing) => {
        const sameCourse =
          existing.courseId === opts.courseId ||
          (opts.userSessionId && existing.externalCourseId === opts.userSessionId);
        const sameText = normalizeQuestionText(existing.questionText) === qNorm;
        return sameCourse && sameText;
      });

      const updatedRecord: QuestionRecord = {
        ...q,
        courseId: opts.courseId,
        week: opts.week || q.week,
        weekNumber: opts.weekNumber || q.weekNumber,
        userSessionId: opts.userSessionId || q.userSessionId,
        userEmail: opts.userEmail || q.userEmail,
        updatedAt: now,
        createdAt: existingIdx >= 0 ? all[existingIdx].createdAt : (q.createdAt || now),
      };

      if (existingIdx >= 0) {
        all[existingIdx] = updatedRecord;
      } else {
        all.push(updatedRecord);
      }
      savedCount++;
    }

    await setItem(STORAGE_KEYS.QUESTIONS, all);
    return savedCount;
  }

  /**
   * Retrieves questions specifically filtered for course, week, and session ID
   */
  static async getQuestionsForWeekAndSession(opts: {
    courseId: string;
    week?: string;
    userSessionId?: string;
  }): Promise<QuestionRecord[]> {
    const all = await this.getQuestions();
    return all.filter((q) => {
      const courseMatch =
        q.courseId === opts.courseId ||
        (opts.userSessionId && q.externalCourseId === opts.userSessionId) ||
        (opts.userSessionId && q.userSessionId === opts.userSessionId);
      if (!courseMatch) return false;
      if (opts.week && q.week && q.week.toLowerCase() !== opts.week.toLowerCase()) {
        return false;
      }
      return true;
    });
  }

  static async replaceQuestionsForCourse(courseId: string, questions: QuestionRecord[]): Promise<void> {
    const all = await this.getQuestions();
    const remaining = all.filter((q) => q.courseId !== courseId);
    const formatted = questions.map((q) => ({
      ...q,
      courseId,
      updatedAt: new Date().toISOString(),
    }));
    await setItem(STORAGE_KEYS.QUESTIONS, [...remaining, ...formatted]);
  }

  static async getSettings(): Promise<ExtensionSettings> {
    const settings = await getItem<ExtensionSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    if (settings && !settings.aiModel) {
      settings.aiModel = 'gemini-1.5-flash';
    }
    if (settings && !settings.grokModel) {
      settings.grokModel = 'grok-2-latest';
    }
    if (settings && !settings.webAiProvider) {
      settings.webAiProvider = 'chatgpt';
    }
    return settings;
  }

  static async saveSettings(patch: Partial<ExtensionSettings>): Promise<void> {
    const current = await this.getSettings();
    await setItem(STORAGE_KEYS.SETTINGS, { ...current, ...patch });
  }

  static async exportAll(): Promise<AnswerBankExport> {
    const courses = await this.getCourses();
    const questions = await this.getQuestions();
    return {
      version: '1.0.0',
      app: 'swayam404',
      exportedAt: new Date().toISOString(),
      courses,
      questions,
    };
  }

  static async exportCourse(courseId: string): Promise<AnswerBankExport> {
    const courses = await this.getCourses();
    const course = courses.find((c) => c.id === courseId);
    const questions = await this.getQuestions(courseId);
    return {
      version: '1.0.0',
      app: 'swayam404',
      exportedAt: new Date().toISOString(),
      courses: course ? [course] : [],
      questions,
    };
  }

  static async clearAll(): Promise<void> {
    await setItem(STORAGE_KEYS.COURSES, []);
    await setItem(STORAGE_KEYS.QUESTIONS, []);
    await setItem(STORAGE_KEYS.COURSE_MAPPINGS, []);
    await setItem(STORAGE_KEYS.TASK_QUEUES, {});
    await setItem(STORAGE_KEYS.CHECKPOINTS, {});
    await setItem(STORAGE_KEYS.KB_MANIFEST, null);
    await setItem(STORAGE_KEYS.KB_COURSE_PACKS, {});
    await setItem(STORAGE_KEYS.KB_METADATA, null);
  }

  // --- Course Identity Mapping ---

  static async getCourseMappings(): Promise<CourseMapping[]> {
    const mappings = await getItem<CourseMapping[]>(STORAGE_KEYS.COURSE_MAPPINGS, []);
    if (mappings.length === 0) {
      await setItem(STORAGE_KEYS.COURSE_MAPPINGS, DEFAULT_MAPPINGS);
      return DEFAULT_MAPPINGS;
    }
    return mappings;
  }

  static async saveCourseMapping(mapping: CourseMapping): Promise<void> {
    const all = await this.getCourseMappings();
    const idx = all.findIndex((m) => m.id === mapping.id);
    const updated = [...all];
    const now = new Date().toISOString();
    if (idx >= 0) {
      updated[idx] = { ...mapping, updatedAt: now };
    } else {
      updated.push({ ...mapping, createdAt: now, updatedAt: now });
    }
    await setItem(STORAGE_KEYS.COURSE_MAPPINGS, updated);
  }

  static async deleteCourseMapping(mappingId: string): Promise<void> {
    const all = await this.getCourseMappings();
    await setItem(STORAGE_KEYS.COURSE_MAPPINGS, all.filter((m) => m.id !== mappingId));
  }

  static async findMappingForPortalCourse(
    portalTitle: string,
    externalId?: string
  ): Promise<CourseMapping | undefined> {
    if (!portalTitle) return undefined;
    const mappings = await this.getCourseMappings();
    const cleanPortal = portalTitle.trim().toLowerCase();

    // 1. Match by externalCourseId if provided
    if (externalId) {
      const extMatch = mappings.find(
        (m) => m.externalCourseId && m.externalCourseId.toLowerCase() === externalId.toLowerCase()
      );
      if (extMatch) return extMatch;
    }

    // 2. Exact portal title match
    const exact = mappings.find(
      (m) => m.portalCourseTitle.trim().toLowerCase() === cleanPortal
    );
    if (exact) return exact;

    // 3. Conservative containment match
    const containmentMatch = mappings.find((m) => {
      const mTitle = m.portalCourseTitle.toLowerCase();
      return cleanPortal.includes(mTitle) || mTitle.includes(cleanPortal);
    });
    if (containmentMatch) return containmentMatch;

    // 4. Distinctive keyword overlap (keywords with length >= 5, e.g. "economics", "entrepreneurship")
    const portalWords = cleanPortal.split(/[\s\-–—:,()]+/).filter((w) => w.length >= 5);
    return mappings.find((m) => {
      const mWords = m.portalCourseTitle.toLowerCase().split(/[\s\-–—:,()]+/);
      return portalWords.some((w) => mWords.includes(w));
    });
  }

  // --- Task Queue Management ---

  static async getTasksForCourse(courseId: string): Promise<CourseTask[]> {
    const allQueues = await getItem<Record<string, CourseTask[]>>(STORAGE_KEYS.TASK_QUEUES, {});
    return allQueues[courseId] || [];
  }

  static async saveTasksForCourse(courseId: string, tasks: CourseTask[]): Promise<void> {
    const allQueues = await getItem<Record<string, CourseTask[]>>(STORAGE_KEYS.TASK_QUEUES, {});
    allQueues[courseId] = tasks;
    await setItem(STORAGE_KEYS.TASK_QUEUES, allQueues);
  }

  static async updateTaskStatus(
    courseId: string,
    taskId: string,
    patch: Partial<CourseTask>
  ): Promise<void> {
    const tasks = await this.getTasksForCourse(courseId);
    const updated = tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t));
    await this.saveTasksForCourse(courseId, updated);
  }

  static async clearTasksForCourse(courseId: string): Promise<void> {
    const allQueues = await getItem<Record<string, CourseTask[]>>(STORAGE_KEYS.TASK_QUEUES, {});
    delete allQueues[courseId];
    await setItem(STORAGE_KEYS.TASK_QUEUES, allQueues);
  }

  static async getApprovedTaskIds(courseId: string): Promise<string[]> {
    const all = await getItem<Record<string, string[]>>('swayam404_approved_tasks_v1', {});
    return all[courseId] || [];
  }

  static async saveApprovedTaskIds(courseId: string, taskIds: string[]): Promise<void> {
    const all = await getItem<Record<string, string[]>>('swayam404_approved_tasks_v1', {});
    all[courseId] = taskIds;
    await setItem('swayam404_approved_tasks_v1', all);
  }

  static async clearApprovedTaskIds(courseId: string): Promise<void> {
    const all = await getItem<Record<string, string[]>>('swayam404_approved_tasks_v1', {});
    delete all[courseId];
    await setItem('swayam404_approved_tasks_v1', all);
  }


  // --- Workflow Checkpoints ---

  static async getCheckpoint(courseId: string): Promise<WorkflowCheckpoint | undefined> {
    const all = await getItem<Record<string, WorkflowCheckpoint>>(STORAGE_KEYS.CHECKPOINTS, {});
    return all[courseId];
  }

  static async saveCheckpoint(checkpoint: WorkflowCheckpoint): Promise<void> {
    const all = await getItem<Record<string, WorkflowCheckpoint>>(STORAGE_KEYS.CHECKPOINTS, {});
    all[checkpoint.courseId] = { ...checkpoint, updatedAt: new Date().toISOString() };
    await setItem(STORAGE_KEYS.CHECKPOINTS, all);
  }

  static async clearCheckpoint(courseId: string): Promise<void> {
    const all = await getItem<Record<string, WorkflowCheckpoint>>(STORAGE_KEYS.CHECKPOINTS, {});
    delete all[courseId];
    await setItem(STORAGE_KEYS.CHECKPOINTS, all);
  }

  // --- Answer-Bank Readiness Assessment ---

  static async assessCourseReadiness(courseId: string): Promise<CourseReadiness> {
    const courses = await this.getCourses();
    const course = courses.find((c) => c.id === courseId);
    const courseName = course ? course.name : 'Unknown Course';
    const questions = await this.getQuestions(courseId);

    const totalStoredQuestions = questions.length;
    let usableAnswersCount = 0;
    let verifiedAnswersCount = 0;
    let portalConfirmedCount = 0;
    let studentReviewedCount = 0;
    let aiSuggestedCount = 0;
    let conflictedCount = 0;
    let sampleDataCount = 0;

    for (const q of questions) {
      const hasOption = q.correctOptions && q.correctOptions.length > 0;
      const hasText = q.answerText && q.answerText.trim() !== '';
      if (hasOption || hasText) {
        usableAnswersCount++;
      }

      if (q.reviewStatus === 'portal-confirmed') {
        portalConfirmedCount++;
        verifiedAnswersCount++;
      } else if (q.reviewStatus === 'student-reviewed' || q.reviewStatus === 'verified') {
        studentReviewedCount++;
        verifiedAnswersCount++;
      } else if (q.reviewStatus === 'ai-suggested') {
        aiSuggestedCount++;
      } else if (q.reviewStatus === 'conflicted') {
        conflictedCount++;
      }

      if (
        (q.source && q.source.toLowerCase().includes('sample')) ||
        (q.id && q.id.startsWith('sample-'))
      ) {
        sampleDataCount++;
      }
    }

    const settings = await this.getSettings();
    const isAiConfigured =
      !!settings.aiAssistedReviewEnabled &&
      (!!settings.webAiProvider ||
        (settings.aiProvider === 'grok'
          ? !!(settings.grokApiKey || settings.aiApiKey)
          : !!settings.aiApiKey));

    const isSampleData = totalStoredQuestions > 0 && sampleDataCount >= totalStoredQuestions * 0.8;
    const isReadyForPrep = usableAnswersCount > 0 || isAiConfigured;

    let readinessReason = '';
    let sampleDataWarning: string | undefined = undefined;

    if (totalStoredQuestions === 0) {
      if (isAiConfigured) {
        readinessReason = `Web AI Ready: No historical answers saved yet. ${
          settings.webAiProvider === 'claude'
            ? 'Claude Web'
            : settings.webAiProvider === 'gemini'
            ? 'Gemini Web'
            : settings.webAiProvider === 'chatgpt'
            ? 'ChatGPT Web'
            : settings.aiProvider === 'grok'
            ? 'xAI Grok'
            : 'Google Gemini'
        } & course materials active for new questions.`;
      } else {
        readinessReason =
          'No historical answers are saved for this course yet (empty bank). Swayam404 will use available course materials and your configured Web AI bridge.';
      }
    } else if (usableAnswersCount === 0) {
      if (isAiConfigured) {
        readinessReason = 'Stored questions lack verified answers. Active Web AI provider will assist with question analysis.';
      } else {
        readinessReason = 'Stored questions have no recorded answers. Mark answers as verified or configure Web AI in Settings.';
      }
    } else if (isSampleData) {
      sampleDataWarning = 'Current answer bank contains fictional sample data. Not verified for graded submissions.';
      readinessReason = `Ready for test workflow (${verifiedAnswersCount} verified answers). Sample data warning active.`;
    } else {
      readinessReason = `Ready: ${verifiedAnswersCount} verified answers (${portalConfirmedCount} portal-confirmed, ${studentReviewedCount} student-reviewed) in bank.`;
    }

    return {
      courseId,
      courseName,
      totalStoredQuestions,
      usableAnswersCount,
      verifiedAnswersCount,
      portalConfirmedCount,
      studentReviewedCount,
      aiSuggestedCount,
      conflictedCount,
      isSampleData,
      sampleDataWarning,
      isReadyForPrep,
      readinessReason,
    };
  }

  // --- Course Material (Context Retrieval) ---

  static async getCourseMaterials(courseId?: string): Promise<CourseMaterial[]> {
    const all = await getItem<CourseMaterial[]>(STORAGE_KEYS.COURSE_MATERIALS, []);
    if (courseId) {
      return all.filter((m) => m.courseId === courseId);
    }
    return all;
  }

  static async saveCourseMaterial(material: CourseMaterial): Promise<void> {
    const all = await this.getCourseMaterials();
    const idx = all.findIndex((m) => m.id === material.id);
    const updated = [...all];
    const now = new Date().toISOString();
    if (idx >= 0) {
      updated[idx] = { ...material, updatedAt: now };
    } else {
      updated.push({ ...material, createdAt: now, updatedAt: now });
    }
    await setItem(STORAGE_KEYS.COURSE_MATERIALS, updated);
  }

  static async deleteCourseMaterial(id: string): Promise<void> {
    const all = await this.getCourseMaterials();
    await setItem(
      STORAGE_KEYS.COURSE_MATERIALS,
      all.filter((m) => m.id !== id)
    );
  }

  // --- Historical Answer Capture with Deduplication & Conflict Detection ---

  static async saveCapturedQuestions(
    capturedList: CapturedQuestionRecord[],
    courseId: string
  ): Promise<{ saved: number; conflicts: number; duplicates: number }> {
    const allQuestions = await this.getQuestions();
    const now = new Date().toISOString();
    let saved = 0;
    let conflicts = 0;
    let duplicates = 0;

    const updatedQuestions = [...allQuestions];

    for (const item of capturedList) {
      if (!item.isSelectedForSave) continue;

      const norm = normalizeQuestionText(item.questionText);
      const existingIdx = updatedQuestions.findIndex(
        (q) => q.courseId === courseId && normalizeQuestionText(q.questionText) === norm
      );

      if (existingIdx >= 0) {
        const existing = updatedQuestions[existingIdx];
        const existingAnswers = existing.correctOptions || (existing.answerText ? [existing.answerText] : []);
        const newAnswers = item.acceptedAnswers;

        const existingSet = new Set(existingAnswers.map((a) => normalizeQuestionText(a)));
        const newSet = new Set(newAnswers.map((a) => normalizeQuestionText(a)));

        const isIdentical =
          existingSet.size === newSet.size &&
          [...existingSet].every((a) => newSet.has(a));

        if (isIdentical) {
          updatedQuestions[existingIdx] = {
            ...existing,
            portalCourseTitle: item.portalCourseTitle || existing.portalCourseTitle,
            externalCourseId: item.externalCourseId || existing.externalCourseId,
            assignmentTitle: item.assignmentTitle || existing.assignmentTitle,
            unitTitle: item.unitTitle || existing.unitTitle,
            explanation: item.explanation || existing.explanation,
            reviewStatus: item.verificationStatus,
            verificationSource: item.verificationSource,
            capturedAt: now,
            updatedAt: now,
          };
          duplicates++;
        } else {
          updatedQuestions[existingIdx] = {
            ...existing,
            correctOptions: Array.from(new Set([...existingAnswers, ...newAnswers])),
            explanation: `[CONFLICT: Previously recorded (${existingAnswers.join(', ')}), but newly captured (${newAnswers.join(', ')}). Manual review required.] ${item.explanation || existing.explanation || ''}`.trim(),
            reviewStatus: 'conflicted',
            verificationSource: 'conflict_detected',
            capturedAt: now,
            updatedAt: now,
          };
          conflicts++;
        }
      } else {
        const newRecord: QuestionRecord = {
          id: `captured-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          courseId,
          portalCourseTitle: item.portalCourseTitle,
          externalCourseId: item.externalCourseId,
          assignmentTitle: item.assignmentTitle,
          unitTitle: item.unitTitle,
          questionText: item.questionText,
          normalizedText: norm,
          questionType: item.questionType,
          options: item.options,
          correctOptions: item.acceptedAnswers,
          answerText: item.acceptedAnswers.length === 1 ? item.acceptedAnswers[0] : undefined,
          explanation: item.explanation,
          reviewStatus: item.verificationStatus,
          verificationSource: item.verificationSource,
          source: item.assignmentTitle || 'Captured Submitted Assignment',
          createdAt: now,
          updatedAt: now,
          capturedAt: now,
        };
        updatedQuestions.push(newRecord);
        saved++;
      }
    }

    await setItem(STORAGE_KEYS.QUESTIONS, updatedQuestions);
    return { saved, conflicts, duplicates };
  }

  // --- Active Scan Session Persistence (Prevents Reset on Tab Switch) ---

  static async getActiveScanSession(): Promise<ActiveScanSession | null> {
    return await getItem<ActiveScanSession | null>(STORAGE_KEYS.ACTIVE_SCAN_SESSION, null);
  }

  static async saveActiveScanSession(session: ActiveScanSession): Promise<void> {
    await setItem(STORAGE_KEYS.ACTIVE_SCAN_SESSION, session);
  }

  static async clearActiveScanSession(): Promise<void> {
    await setItem(STORAGE_KEYS.ACTIVE_SCAN_SESSION, null);
  }

  // --- Assignment Scan History ---

  static async getScanHistory(): Promise<ScanHistoryRecord[]> {
    return await getItem<ScanHistoryRecord[]>(STORAGE_KEYS.SCAN_HISTORY, []);
  }

  static async saveScanHistory(item: ScanHistoryRecord): Promise<void> {
    const history = await this.getScanHistory();
    // Deduplicate by URL or assignment title
    const filtered = history.filter(
      (h) => (item.url && h.url === item.url) || (h.assignmentTitle && h.assignmentTitle === item.assignmentTitle) ? false : true
    );
    // Keep most recent first, max 20 entries
    const updated = [item, ...filtered].slice(0, 20);
    await setItem(STORAGE_KEYS.SCAN_HISTORY, updated);
  }

  static async deleteScanHistoryItem(id: string): Promise<void> {
    const history = await this.getScanHistory();
    await setItem(
      STORAGE_KEYS.SCAN_HISTORY,
      history.filter((h) => h.id !== id)
    );
  }

  static async clearScanHistory(): Promise<void> {
    await setItem(STORAGE_KEYS.SCAN_HISTORY, []);
  }

  // --- Shared Knowledge Base Caching ---

  static async getKnowledgeManifest(): Promise<KnowledgeManifest | null> {
    return await getItem<KnowledgeManifest | null>(STORAGE_KEYS.KB_MANIFEST, null);
  }

  static async saveKnowledgeManifest(manifest: KnowledgeManifest | null): Promise<void> {
    await setItem(STORAGE_KEYS.KB_MANIFEST, manifest);
  }

  static async getKnowledgeCoursePacks(): Promise<Record<string, KnowledgeCoursePack>> {
    return await getItem<Record<string, KnowledgeCoursePack>>(STORAGE_KEYS.KB_COURSE_PACKS, {});
  }

  static async saveKnowledgeCoursePacks(packs: Record<string, KnowledgeCoursePack>): Promise<void> {
    await setItem(STORAGE_KEYS.KB_COURSE_PACKS, packs);
  }

  static async getKnowledgeMetadata(): Promise<KnowledgeCacheMetadata | null> {
    return await getItem<KnowledgeCacheMetadata | null>(STORAGE_KEYS.KB_METADATA, null);
  }

  static async saveKnowledgeMetadata(meta: KnowledgeCacheMetadata | null): Promise<void> {
    await setItem(STORAGE_KEYS.KB_METADATA, meta);
  }

  static async clearKnowledgeCache(): Promise<void> {
    await setItem(STORAGE_KEYS.KB_MANIFEST, null);
    await setItem(STORAGE_KEYS.KB_COURSE_PACKS, {});
    await setItem(STORAGE_KEYS.KB_METADATA, null);
  }

  // --- Community Knowledge Contribution Proposals ---

  static async getContributionProposals(): Promise<ContributionProposal[]> {
    return await getItem<ContributionProposal[]>(STORAGE_KEYS.KB_CONTRIBUTION_PROPOSALS, []);
  }

  static async saveContributionProposal(proposal: ContributionProposal): Promise<void> {
    const list = await this.getContributionProposals();
    const existingIdx = list.findIndex((p) => p.proposalId === proposal.proposalId);
    if (existingIdx >= 0) {
      list[existingIdx] = proposal;
    } else {
      list.unshift(proposal);
    }
    await setItem(STORAGE_KEYS.KB_CONTRIBUTION_PROPOSALS, list);
  }

  static async deleteContributionProposal(proposalId: string): Promise<void> {
    const list = await this.getContributionProposals();
    await setItem(
      STORAGE_KEYS.KB_CONTRIBUTION_PROPOSALS,
      list.filter((p) => p.proposalId !== proposalId)
    );
  }

  static parseWeekNumber(weekStr?: string): number | undefined {
    if (!weekStr) return undefined;
    const match = weekStr.match(/\b(?:week|w)\s*(\d+)\b/i);
    return match ? parseInt(match[1], 10) : undefined;
  }
}

export { STORAGE_KEYS, getItem, setItem };
