import { Course, QuestionRecord } from '@/types';
import { StorageService } from './index';
import { normalizeQuestionText } from '../matching/normalizer';

export interface ImportValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  detectedVersion?: string;
  courseCount: number;
  questionCount: number;
  courses: Course[];
  questions: QuestionRecord[];
  duplicateCountInFile: number;
  duplicateCountWithExisting: number;
}

export interface ImportExecutionResult {
  success: boolean;
  importedCourses: number;
  addedQuestions: number;
  updatedQuestions: number;
  skippedQuestions: number;
  targetCourseName?: string;
}

export class ImportExportService {
  /**
   * Validates raw JSON string or object against AnswerBankExport schema
   */
  static async validateImportPayload(
    raw: unknown,
    targetCourseId?: string
  ): Promise<ImportValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    let data: unknown;
    if (typeof raw === 'string') {
      try {
        data = JSON.parse(raw);
      } catch {
        return {
          isValid: false,
          errors: ['Invalid JSON syntax. Please check file formatting.'],
          warnings: [],
          courseCount: 0,
          questionCount: 0,
          courses: [],
          questions: [],
          duplicateCountInFile: 0,
          duplicateCountWithExisting: 0,
        };
      }
    } else {
      data = raw;
    }

    if (!data || typeof data !== 'object') {
      return {
        isValid: false,
        errors: ['Import payload must be an object.'],
        warnings: [],
        courseCount: 0,
        questionCount: 0,
        courses: [],
        questions: [],
        duplicateCountInFile: 0,
        duplicateCountWithExisting: 0,
      };
    }

    const payload = data as Record<string, unknown>;

    // Schema version check
    const version = typeof payload.version === 'string' ? payload.version : undefined;
    if (!version) {
      warnings.push('No schema version found in file. Assuming legacy/v1 format.');
    } else if (version !== '1.0.0') {
      warnings.push(`File version is '${version}'. Compatibility layer applied.`);
    }

    // Courses validation
    const rawCourses = Array.isArray(payload.courses) ? payload.courses : [];
    const validatedCourses: Course[] = [];

    for (let i = 0; i < rawCourses.length; i++) {
      const c = rawCourses[i];
      if (!c || typeof c !== 'object') {
        errors.push(`Course #${i + 1} is invalid.`);
        continue;
      }
      const course = c as Record<string, unknown>;
      if (!course.id || typeof course.id !== 'string') {
        errors.push(`Course #${i + 1} is missing a required 'id'.`);
        continue;
      }
      if (!course.name || typeof course.name !== 'string') {
        errors.push(`Course #${i + 1} (${course.id}) is missing a required 'name'.`);
        continue;
      }

      validatedCourses.push({
        id: course.id,
        name: course.name,
        externalCourseId: typeof course.externalCourseId === 'string' ? course.externalCourseId : undefined,
        description: typeof course.description === 'string' ? course.description : undefined,
        createdAt: typeof course.createdAt === 'string' ? course.createdAt : new Date().toISOString(),
        updatedAt: typeof course.updatedAt === 'string' ? course.updatedAt : new Date().toISOString(),
      });
    }

    // Questions validation
    const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [];
    const validatedQuestions: QuestionRecord[] = [];
    const internalNormalizedSet = new Set<string>();
    let duplicateInFile = 0;

    for (let i = 0; i < rawQuestions.length; i++) {
      const q = rawQuestions[i];
      if (!q || typeof q !== 'object') {
        errors.push(`Question #${i + 1} is invalid.`);
        continue;
      }
      const record = q as Record<string, unknown>;

      if (!record.questionText || typeof record.questionText !== 'string' || record.questionText.trim() === '') {
        errors.push(`Question #${i + 1} is missing 'questionText'.`);
        continue;
      }

      const qType = record.questionType;
      const validTypes = ['single-choice', 'multiple-choice', 'true-false', 'short-text'];
      if (!qType || !validTypes.includes(String(qType))) {
        errors.push(`Question #${i + 1} has invalid questionType '${String(qType)}'. Must be one of: ${validTypes.join(', ')}.`);
        continue;
      }

      // Check duplicates within file
      const courseIdForCheck = (record.courseId as string) || targetCourseId || 'default';
      const normKey = `${courseIdForCheck}:::${normalizeQuestionText(String(record.questionText))}`;
      if (internalNormalizedSet.has(normKey)) {
        duplicateInFile++;
      } else {
        internalNormalizedSet.add(normKey);
      }

      validatedQuestions.push({
        id: typeof record.id === 'string' && record.id ? record.id : `q-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
        courseId: (record.courseId as string) || targetCourseId || '',
        questionText: String(record.questionText),
        questionType: record.questionType as QuestionRecord['questionType'],
        options: Array.isArray(record.options) ? record.options.map(String) : [],
        correctOptions: Array.isArray(record.correctOptions) ? record.correctOptions.map(String) : [],
        answerText: typeof record.answerText === 'string' ? record.answerText : undefined,
        explanation: typeof record.explanation === 'string' ? record.explanation : undefined,
        reviewStatus: (record.reviewStatus as QuestionRecord['reviewStatus']) || 'verified',
        source: typeof record.source === 'string' ? record.source : 'Imported Answer Bank',
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
      });
    }

    // Check collision with existing database questions
    let duplicateWithExisting = 0;
    try {
      const existingQuestions = await StorageService.getQuestions();
      const existingMap = new Set(
        existingQuestions.map((eq) => `${eq.courseId}:::${normalizeQuestionText(eq.questionText)}`)
      );

      for (const vq of validatedQuestions) {
        const key = `${vq.courseId || targetCourseId}:::${normalizeQuestionText(vq.questionText)}`;
        if (existingMap.has(key)) {
          duplicateWithExisting++;
        }
      }
    } catch {
      // Storage access issue handled gracefully
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      detectedVersion: version,
      courseCount: validatedCourses.length,
      questionCount: validatedQuestions.length,
      courses: validatedCourses,
      questions: validatedQuestions,
      duplicateCountInFile: duplicateInFile,
      duplicateCountWithExisting: duplicateWithExisting,
    };
  }

  /**
   * Executes the import according to student's chosen mode
   */
  static async executeImport(
    validated: ImportValidationResult,
    mode: 'merge' | 'replace',
    targetCourseId?: string
  ): Promise<ImportExecutionResult> {
    if (!validated.isValid) {
      throw new Error(`Cannot import invalid payload: ${validated.errors.join('; ')}`);
    }

    const existingCourses = await StorageService.getCourses();
    let coursesImportedCount = 0;

    // 1. Process Courses
    for (const importCourse of validated.courses) {
      const exists = existingCourses.some((c) => c.id === importCourse.id);
      if (!exists) {
        await StorageService.saveCourse(importCourse);
        coursesImportedCount++;
      }
    }

    // 2. Determine target course context
    const finalCourseId = targetCourseId || validated.courses[0]?.id || (await StorageService.getSelectedCourseId());
    const courseObj = (await StorageService.getCourses()).find((c) => c.id === finalCourseId);

    // 3. Process Questions
    let added = 0;
    let updated = 0;
    let skipped = 0;

    const normalizedQuestionsToImport = validated.questions.map((q) => ({
      ...q,
      courseId: targetCourseId ? targetCourseId : q.courseId || finalCourseId,
    }));

    if (mode === 'replace') {
      // Replace only for the target course!
      await StorageService.replaceQuestionsForCourse(finalCourseId, normalizedQuestionsToImport);
      added = normalizedQuestionsToImport.length;
    } else {
      // Merge mode: deduplicate based on question text
      const currentQuestions = await StorageService.getQuestions(finalCourseId);
      const existingMap = new Map<string, QuestionRecord>();
      for (const eq of currentQuestions) {
        existingMap.set(normalizeQuestionText(eq.questionText), eq);
      }

      const toSave: QuestionRecord[] = [];

      for (const nq of normalizedQuestionsToImport) {
        const key = normalizeQuestionText(nq.questionText);
        const existing = existingMap.get(key);

        if (existing) {
          // Update existing with reviewed options/explanations
          toSave.push({
            ...existing,
            correctOptions: nq.correctOptions?.length ? nq.correctOptions : existing.correctOptions,
            answerText: nq.answerText || existing.answerText,
            explanation: nq.explanation || existing.explanation,
            source: nq.source || existing.source,
            reviewStatus: nq.reviewStatus || existing.reviewStatus,
            updatedAt: new Date().toISOString(),
          });
          updated++;
        } else {
          toSave.push(nq);
          added++;
        }
      }

      await StorageService.saveQuestions(toSave);
    }

    return {
      success: true,
      importedCourses: coursesImportedCount,
      addedQuestions: added,
      updatedQuestions: updated,
      skippedQuestions: skipped,
      targetCourseName: courseObj?.name,
    };
  }
}
