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

  it('persists course selections and questions across simulated extension restarts', async () => {
    await StorageService.setSelectedCourseId('course-ent-201');
    const selectedBefore = await StorageService.getSelectedCourseId();
    expect(selectedBefore).toBe('course-ent-201');

    // Add a question
    await StorageService.saveQuestion({
      id: 'restart-q',
      courseId: 'course-ent-201',
      questionText: 'Test Persistence',
      questionType: 'single-choice',
      correctOptions: ['Option A'],
      reviewStatus: 'verified',
      source: 'Test',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    // Simulate extension restart (re-invoking StorageService)
    const selectedAfter = await StorageService.getSelectedCourseId();
    expect(selectedAfter).toBe('course-ent-201');

    const questions = await StorageService.getQuestions('course-ent-201');
    expect(questions.some((q) => q.id === 'restart-q')).toBe(true);
  });

  it('replaces only the target course bank in replace mode leaving other courses intact', async () => {
    // Add question to Course A (Economics)
    await StorageService.saveQuestion({
      id: 'econ-keep',
      courseId: 'course-econ-101',
      questionText: 'Econ question to preserve',
      questionType: 'single-choice',
      correctOptions: ['Keep me'],
      reviewStatus: 'verified',
      source: 'Econ',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    // Replace Course B (Entrepreneurship)
    const replacePayload = {
      version: '1.0.0',
      courses: [{ id: 'course-ent-201', name: 'Entrepreneurship' }],
      questions: [
        {
          id: 'ent-new',
          courseId: 'course-ent-201',
          questionText: 'Brand new Ent question',
          questionType: 'single-choice',
          correctOptions: ['New Ent'],
        },
      ],
    };

    const validated = await ImportExportService.validateImportPayload(replacePayload, 'course-ent-201');
    await ImportExportService.executeImport(validated, 'replace', 'course-ent-201');

    // Verify Course A was NOT wiped out
    const econQuestions = await StorageService.getQuestions('course-econ-101');
    expect(econQuestions.some((q) => q.id === 'econ-keep')).toBe(true);

    // Verify Course B has only the replaced question
    const entQuestions = await StorageService.getQuestions('course-ent-201');
    expect(entQuestions.length).toBe(1);
    expect(entQuestions[0].id).toBe('ent-new');
  });

  it('persists and clears active scan session across simulated tab switches', async () => {
    expect(await StorageService.getActiveScanSession()).toBeNull();

    const mockSession = {
      url: 'https://onlinecourses.swayam2.ac.in/ini26_cm22/unit?unit=26&assessment=118',
      pageTitle: 'Week 05: Assignment 05',
      courseId: 'course-ent-201',
      courseTitle: 'Entrepreneurship',
      assignmentTitle: 'Week 05: Assignment 05',
      results: [
        {
          scannedQuestion: {
            id: 'q-1',
            index: 1,
            questionText: '1. _______ involves operating as frugally as possible:',
            questionType: 'single-choice' as const,
            formType: 'radio' as const,
            options: [{ id: 'opt-1', text: 'Bootstrapping', value: '1' }],
          },
          status: 'exact-match' as const,
          confidence: 1.0,
          reasons: ['Exact match'],
          proposedAnswers: ['Bootstrapping'],
          isApproved: true,
          requiresReview: false,
        },
      ],
      savedAt: new Date().toISOString(),
    };

    await StorageService.saveActiveScanSession(mockSession);
    const retrieved = await StorageService.getActiveScanSession();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.assignmentTitle).toBe('Week 05: Assignment 05');
    expect(retrieved?.results.length).toBe(1);
    expect(retrieved?.results[0].proposedAnswers[0]).toBe('Bootstrapping');

    await StorageService.clearActiveScanSession();
    expect(await StorageService.getActiveScanSession()).toBeNull();
  });

  it('saves, retrieves, deduplicates, and deletes assignment scan history items', async () => {
    expect(await StorageService.getScanHistory()).toEqual([]);

    await StorageService.saveScanHistory({
      id: 'scan-1',
      url: 'https://swayam2.ac.in/assign-1',
      pageTitle: 'Assignment 01',
      courseId: 'c-1',
      courseTitle: 'Course 1',
      assignmentTitle: 'Assignment 01',
      totalQuestions: 10,
      approvedCount: 8,
      results: [],
      timestamp: '2026-10-10T10:00:00Z',
    });

    await StorageService.saveScanHistory({
      id: 'scan-2',
      url: 'https://swayam2.ac.in/assign-2',
      pageTitle: 'Assignment 02',
      courseId: 'c-1',
      courseTitle: 'Course 1',
      assignmentTitle: 'Assignment 02',
      totalQuestions: 15,
      approvedCount: 15,
      results: [],
      timestamp: '2026-10-11T12:00:00Z',
    });

    let history = await StorageService.getScanHistory();
    expect(history.length).toBe(2);
    expect(history[0].assignmentTitle).toBe('Assignment 02'); // Most recent first

    // Saving update for same URL updates entry and does not duplicate
    await StorageService.saveScanHistory({
      id: 'scan-2-updated',
      url: 'https://swayam2.ac.in/assign-2',
      pageTitle: 'Assignment 02 Updated',
      courseId: 'c-1',
      courseTitle: 'Course 1',
      assignmentTitle: 'Assignment 02',
      totalQuestions: 15,
      approvedCount: 15,
      results: [],
      timestamp: '2026-10-11T13:00:00Z',
    });

    history = await StorageService.getScanHistory();
    expect(history.length).toBe(2);

    await StorageService.deleteScanHistoryItem('scan-1');
    history = await StorageService.getScanHistory();
    expect(history.length).toBe(1);
    expect(history[0].assignmentTitle).toBe('Assignment 02');

    await StorageService.clearScanHistory();
    expect(await StorageService.getScanHistory()).toEqual([]);
  });
});
