import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '@/lib/storage';
import { ImportExportService } from '@/lib/storage/importExport';

describe('Storage & Import/Export Engine', () => {
  beforeEach(async () => {
    await StorageService.clearAll();
  });

  it('initializes default courses (Economics and Entrepreneurship)', async () => {
    const courses = await StorageService.getCourses();
    expect(courses.length).toBeGreaterThanOrEqual(2);
    expect(courses.some((c) => c.name.includes('Economics'))).toBe(true);
    expect(courses.some((c) => c.name.includes('Entrepreneurship'))).toBe(true);
  });

  it('can create, update, and delete custom courses', async () => {
    const newCourse = {
      id: 'course-law-101',
      name: 'Business Law',
      description: 'Minor elective',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    await StorageService.saveCourse(newCourse);
    let courses = await StorageService.getCourses();
    expect(courses.some((c) => c.id === 'course-law-101')).toBe(true);

    await StorageService.deleteCourse('course-law-101');
    courses = await StorageService.getCourses();
    expect(courses.some((c) => c.id === 'course-law-101')).toBe(false);
  });

  it('validates import payload detecting malformed data and duplicates', async () => {
    const invalidPayload = { version: '1.0.0', questions: [{ id: '1' }] }; // missing questionText & questionType
    const res1 = await ImportExportService.validateImportPayload(invalidPayload);
    expect(res1.isValid).toBe(false);
    expect(res1.errors.length).toBeGreaterThan(0);

    const validPayload = {
      version: '1.0.0',
      app: 'swayam404',
      courses: [
        { id: 'c-test', name: 'Test Course' },
      ],
      questions: [
        {
          id: 'q-1',
          courseId: 'c-test',
          questionText: 'What is opportunity cost?',
          questionType: 'single-choice',
          options: ['Highest valued alternative forgone', 'Accounting cost'],
          correctOptions: ['Highest valued alternative forgone'],
        },
        {
          // Duplicate question
          id: 'q-2',
          courseId: 'c-test',
          questionText: 'What is opportunity cost?',
          questionType: 'single-choice',
          options: ['Highest valued alternative forgone', 'Accounting cost'],
          correctOptions: ['Highest valued alternative forgone'],
        },
      ],
    };

    const res2 = await ImportExportService.validateImportPayload(validPayload);
    expect(res2.isValid).toBe(true);
    expect(res2.duplicateCountInFile).toBe(1);
  });

  it('handles merge mode updating existing questions without destroying unmentioned records', async () => {
    const testCourseId = 'c-merge-test';
    await StorageService.saveCourse({
      id: testCourseId,
      name: 'Merge Test',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    await StorageService.saveQuestion({
      id: 'existing-q1',
      courseId: testCourseId,
      questionText: 'What is elasticity?',
      questionType: 'single-choice',
      correctOptions: ['Responsiveness to price changes'],
      reviewStatus: 'unreviewed',
      source: 'Old note',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const validated = await ImportExportService.validateImportPayload({
      version: '1.0.0',
      courses: [{ id: testCourseId, name: 'Merge Test' }],
      questions: [
        {
          id: 'new-q1',
          courseId: testCourseId,
          questionText: 'What is elasticity?', // Same question
          questionType: 'single-choice',
          correctOptions: ['Responsiveness to price changes'],
          explanation: 'Standard microeconomics definition',
          reviewStatus: 'verified', // Upgraded
          source: 'Verified Assignment',
        },
        {
          id: 'new-q2',
          courseId: testCourseId,
          questionText: 'What is cross elasticity?',
          questionType: 'single-choice',
          correctOptions: ['Response of demand to price of substitute'],
          reviewStatus: 'verified',
          source: 'Verified Assignment',
        },
      ],
    });

    const execResult = await ImportExportService.executeImport(validated, 'merge', testCourseId);
    expect(execResult.updatedQuestions).toBe(1);
    expect(execResult.addedQuestions).toBe(1);

    const questionsAfter = await StorageService.getQuestions(testCourseId);
    expect(questionsAfter.length).toBe(2);
    const updated = questionsAfter.find((q) => q.questionText === 'What is elasticity?');
    expect(updated?.explanation).toBe('Standard microeconomics definition');
    expect(updated?.reviewStatus).toBe('verified');
  });

  it('exports course-specific data cleanly for backup and transfer', async () => {
    const backup = await StorageService.exportAll();
    expect(backup.version).toBe('1.0.0');
    expect(backup.app).toBe('swayam404');
    expect(Array.isArray(backup.courses)).toBe(true);
    expect(Array.isArray(backup.questions)).toBe(true);
  });
});
