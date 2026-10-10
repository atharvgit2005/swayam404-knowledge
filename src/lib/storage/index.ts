import { Course, QuestionRecord, AnswerBankExport, ExtensionSettings } from '@/types';

const STORAGE_KEYS = {
  COURSES: 'swayam404_courses_v1',
  QUESTIONS: 'swayam404_questions_v1',
  SELECTED_COURSE_ID: 'swayam404_selected_course_v1',
  SETTINGS: 'swayam404_settings_v1',
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

const DEFAULT_SETTINGS: ExtensionSettings = {
  theme: 'dark',
  selectedCourseId: 'course-econ-101',
  autoScanOnLoad: false,
  aiAssistedReviewEnabled: false,
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
    return getItem<ExtensionSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
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
  }
}
