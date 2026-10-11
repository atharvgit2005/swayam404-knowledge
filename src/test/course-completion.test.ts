import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SwayamPortalAdapter } from '@/adapters';
import { StorageService } from '@/lib/storage';
import { matchAssignment } from '@/lib/matching/matcher';
import {
  CourseTask,
  CourseMapping,
  QuestionRecord,
  PopulationTarget,
} from '@/types';

describe('Milestone 2: Course Completion Mode Suite', () => {
  let outlineHtml: string;
  let econAssignmentHtml: string;
  let adapter: SwayamPortalAdapter;

  beforeEach(async () => {
    adapter = new SwayamPortalAdapter();
    outlineHtml = fs.readFileSync(
      path.resolve(__dirname, '../../public/fixtures/economics-course-outline.html'),
      'utf-8'
    );
    econAssignmentHtml = fs.readFileSync(
      path.resolve(__dirname, '../../public/fixtures/economics-assignment.html'),
      'utf-8'
    );
    await StorageService.clearAll();
    await StorageService.initDefaults();

    const econBankRaw = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../src/sample-data/economics-sample.json'), 'utf-8')
    );
    const entBankRaw = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../src/sample-data/entrepreneurship-sample.json'), 'utf-8')
    );
    await StorageService.saveQuestions(econBankRaw.questions);
    await StorageService.saveQuestions(entBankRaw.questions);
  });

  describe('1. Course Identity Detection & Mapping Isolation', () => {
    it('detects course title and external course ID from the course outline DOM', () => {
      document.body.innerHTML = outlineHtml;
      const identity = adapter.detectCourseIdentity(document, 'https://swayam.gov.in/course/noc24-hs101');

      expect(identity.courseTitle).toBe('Principles of Economics');
      expect(identity.externalId).toBe('noc24-hs101');
    });

    it('finds existing course mappings and isolates unmapped portal courses', async () => {
      // Default mappings initialized in storage
      const defaultMappings = await StorageService.getCourseMappings();
      expect(defaultMappings.length).toBeGreaterThan(0);

      // Exact match
      const econMapping = await StorageService.findMappingForPortalCourse(
        'Principles of Economics',
        'noc24-hs101'
      );
      expect(econMapping).toBeDefined();
      expect(econMapping?.localCourseId).toBe('course-econ-101');

      // Fuzzy title match
      const fuzzyMapping = await StorageService.findMappingForPortalCourse(
        'Economics Course on SWAYAM'
      );
      expect(fuzzyMapping?.localCourseId).toBe('course-econ-101');

      // Unmapped / unrecognized course returns undefined
      const unmapped = await StorageService.findMappingForPortalCourse('Quantum Computing 301');
      expect(unmapped).toBeUndefined();
    });

    it('persists custom course mappings and updates them safely', async () => {
      const customMapping: CourseMapping = {
        id: 'map-custom-1',
        portalCourseTitle: 'Advanced Macroeconomic Policy',
        localCourseId: 'course-econ-101',
        externalCourseId: 'noc24-econ99',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await StorageService.saveCourseMapping(customMapping);

      const found = await StorageService.findMappingForPortalCourse(
        'Advanced Macroeconomic Policy',
        'noc24-econ99'
      );
      expect(found).toBeDefined();
      expect(found?.localCourseId).toBe('course-econ-101');
      expect(found?.id).toBe('map-custom-1');

      // Update mapping
      const updatedMapping = { ...customMapping, portalCourseTitle: 'Advanced Macroeconomics (Updated)' };
      await StorageService.saveCourseMapping(updatedMapping);

      const updatedFound = await StorageService.findMappingForPortalCourse(
        'Advanced Macroeconomics (Updated)'
      );
      expect(updatedFound?.portalCourseTitle).toBe('Advanced Macroeconomics (Updated)');
    });
  });

  describe('2. Course Outline Parsing & Completion Detection', () => {
    it('scans course outline and correctly discovers tasks with units and types', () => {
      document.body.innerHTML = outlineHtml;
      const result = adapter.scanCourseOutline(document, 'https://swayam.gov.in/course/noc24-hs101');

      expect(result.portalCourseTitle).toBe('Principles of Economics');
      expect(result.externalCourseId).toBe('noc24-hs101');
      expect(result.tasks.length).toBe(8); // 3 in Week 1, 3 in Week 2, 2 in Week 3

      // Verify task types
      const quizzes = result.tasks.filter((t) => t.type === 'quiz');
      const assignments = result.tasks.filter((t) => t.type === 'assignment');
      const lectures = result.tasks.filter((t) => t.type === 'resource');
      const practices = result.tasks.filter((t) => t.type === 'practice');
      const surveys = result.tasks.filter((t) => t.type === 'feedback');

      expect(quizzes.length).toBe(1); // Week 1 Quiz
      expect(assignments.length).toBe(3); // Week 1, Week 2, Week 3 Assignments
      expect(lectures.length).toBe(2); // Lecture 1 & Lecture 2
      expect(practices.length).toBe(1); // Week 2 Practice
      expect(surveys.length).toBe(1); // Week 3 Feedback
    });

    it('accurately identifies portal-reported completed tasks from DOM indicators', () => {
      document.body.innerHTML = outlineHtml;
      const result = adapter.scanCourseOutline(document);

      // Week 1 Assignment has class 'submitted' and text 'Score: 100%'
      const w1Assignment = result.tasks.find((t) => t.title.includes('Week 1 Assignment'));
      expect(w1Assignment).toBeDefined();
      expect(w1Assignment?.status).toBe('completed');
      expect(w1Assignment?.portalReportedComplete).toBe(true);
      expect(w1Assignment?.portalStatusText).toBe('Score: 100%');

      // Week 1 Quiz is not submitted
      const w1Quiz = result.tasks.find((t) => t.title.includes('Week 1 Quiz'));
      expect(w1Quiz?.status).toBe('ready-to-prepare');
      expect(w1Quiz?.portalReportedComplete).toBe(false);

      // Lectures are resource type and not-scanned
      const lecture = result.tasks.find((t) => t.type === 'resource');
      expect(lecture?.status).toBe('not-scanned');
    });
  });

  describe('3. Answer-Bank Pre-flight Readiness Assessment', () => {
    it('assesses readiness accurately for default Economics course bank', async () => {
      const readiness = await StorageService.assessCourseReadiness('course-econ-101');

      expect(readiness.courseId).toBe('course-econ-101');
      expect(readiness.totalStoredQuestions).toBe(5);
      expect(readiness.usableAnswersCount).toBe(5);
      expect(readiness.verifiedAnswersCount).toBe(5);
      expect(readiness.isSampleData).toBe(true);
      expect(readiness.isReadyForPrep).toBe(true);
      expect(readiness.sampleDataWarning).toContain('sample data');
    });

    it('returns not-ready for course with zero stored questions', async () => {
      // Create empty course
      await StorageService.saveCourse({
        id: 'course-empty-101',
        name: 'Empty Test Course',
        description: 'No questions in bank',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const readiness = await StorageService.assessCourseReadiness('course-empty-101');
      expect(readiness.totalStoredQuestions).toBe(0);
      expect(readiness.isReadyForPrep).toBe(false);
      expect(readiness.readinessReason).toContain('empty');
    });
  });

  describe('4. Task Queue & Workflow Checkpoint Persistence', () => {
    it('persists discovered tasks and tracks status updates across storage reloads', async () => {
      const mockTasks: CourseTask[] = [
        {
          id: 'task-w1-q1',
          courseId: 'course-econ-101',
          title: 'Week 1 Quiz',
          type: 'quiz',
          status: 'ready-to-prepare',
          portalReportedComplete: false,
        },
        {
          id: 'task-w2-a2',
          courseId: 'course-econ-101',
          title: 'Week 2 Assignment',
          type: 'assignment',
          status: 'ready-to-prepare',
          portalReportedComplete: false,
        },
      ];

      await StorageService.saveTasksForCourse('course-econ-101', mockTasks);

      // Verify retrieval
      const retrieved = await StorageService.getTasksForCourse('course-econ-101');
      expect(retrieved.length).toBe(2);
      expect(retrieved[0].id).toBe('task-w1-q1');

      // Update task status with match summary
      await StorageService.updateTaskStatus('course-econ-101', 'task-w1-q1', {
        status: 'awaiting-submission',
        matchSummary: {
          scanned: 5,
          exactMatches: 5,
          reviewRequired: 0,
          unmatched: 0,
        },
      });

      const updated = await StorageService.getTasksForCourse('course-econ-101');
      const q1 = updated.find((t) => t.id === 'task-w1-q1');
      expect(q1?.status).toBe('awaiting-submission');
      expect(q1?.matchSummary?.exactMatches).toBe(5);

      // Clear tasks
      await StorageService.clearTasksForCourse('course-econ-101');
      const cleared = await StorageService.getTasksForCourse('course-econ-101');
      expect(cleared.length).toBe(0);
    });

    it('persists workflow checkpoint state across pause and resume cycles', async () => {
      await StorageService.saveCheckpoint({
        courseId: 'course-econ-101',
        activeTaskId: 'task-w2-a2',
        stepIndex: 2,
        totalTasks: 4,
        status: 'paused',
        pauseReason: 'Week 2 Assignment prepared. Student review required.',
        nextActionPrompt: 'Inspect answers in tab, then click Submit on SWAYAM.',
        updatedAt: new Date().toISOString(),
      });

      const cp = await StorageService.getCheckpoint('course-econ-101');
      expect(cp).toBeDefined();
      expect(cp?.status).toBe('paused');
      expect(cp?.stepIndex).toBe(2);
      expect(cp?.pauseReason).toContain('Student review required');

      await StorageService.clearCheckpoint('course-econ-101');
      const emptyCp = await StorageService.getCheckpoint('course-econ-101');
      expect(emptyCp).toBeUndefined();
    });
  });

  describe('5. Safe Assignment Preparation & Strict Submit Button Immunity', () => {
    it('auto-populates only exact verified answers and guarantees submit button is untouched', async () => {
      document.body.innerHTML = econAssignmentHtml;
      const scanned = adapter.scanQuestions(document);
      const econBank = await StorageService.getQuestions('course-econ-101');

      // Match against Economics bank
      const matches = matchAssignment(scanned, econBank);
      expect(matches.length).toBe(6);

      // Build population targets for exact verified answers only
      const exactVerifiedTargets: PopulationTarget[] = [];
      for (const m of matches) {
        if (m.status === 'exact-match' && m.matchedRecord?.reviewStatus === 'verified') {
          exactVerifiedTargets.push({
            questionId: m.scannedQuestion.id,
            questionText: m.scannedQuestion.questionText,
            questionType: m.scannedQuestion.questionType,
            selectedAnswers: m.proposedAnswers,
            options: m.scannedQuestion.options,
          });
        }
      }

      expect(exactVerifiedTargets.length).toBe(5); // Q1, Q2, Q3, Q4, Q5 are exact & verified

      // Populate into DOM
      let populatedCount = 0;
      for (const target of exactVerifiedTargets) {
        const res = adapter.populateQuestion(document, target);
        if (res.success) populatedCount++;
      }

      expect(populatedCount).toBe(5);

      // Verify DOM inputs populated
      const q1OptC = document.querySelector<HTMLInputElement>('#q1_opt_c');
      expect(q1OptC?.checked).toBe(true);

      const q5Text = document.querySelector<HTMLInputElement>('#q5_text');
      expect(q5Text?.value).toBe('Opportunity cost');

      // CRITICAL SAFETY CHECK: Submit button must NOT have been clicked or submitted!
      const submitBtn = document.getElementById('final-submit-btn') as HTMLButtonElement;
      expect(submitBtn).not.toBeNull();
      const submitAlert = document.getElementById('submit-alert');
      expect(submitAlert?.style.display).not.toBe('block');
    });

    it('flags modified numerical values or ambiguous questions as needs-attention without populating', async () => {
      document.body.innerHTML = econAssignmentHtml;
      const scanned = adapter.scanQuestions(document);

      // Create modified bank where Q1 has different price/numerical parameters
      const modifiedBank: QuestionRecord[] = [
        {
          id: 'q-mod-1',
          courseId: 'course-econ-101',
          questionText: 'What happens to the demand curve of a normal good when consumer income decreases by 50%?', // Modified!
          questionType: 'single-choice',
          options: ['Shifts to the left', 'Shifts to the right', 'Remains unchanged', 'Becomes vertical'],
          correctOptions: ['Shifts to the left'],
          reviewStatus: 'verified',
          source: 'Modified Bank',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const matches = matchAssignment(scanned, modifiedBank);
      // Scanned Q1 is income increases, modifiedBank has income decreases
      const q1Match = matches.find((m) => m.scannedQuestion.index === 1);

      // Must NOT be an exact match
      expect(q1Match?.status).not.toBe('exact-match');
      expect(q1Match?.isApproved).toBe(false);
      // Confidence is reduced or requiresReview is true
      expect(q1Match?.requiresReview).toBe(true);
    });

    it('enforces strict course isolation between Economics and Entrepreneurship answer banks', async () => {
      document.body.innerHTML = econAssignmentHtml;
      const scanned = adapter.scanQuestions(document);

      // Attempt matching Economics assignment against Entrepreneurship bank
      const entBank = await StorageService.getQuestions('course-ent-201');
      const matches = matchAssignment(scanned, entBank);

      // Zero exact matches allowed across courses
      const exactMatches = matches.filter((m) => m.status === 'exact-match');
      expect(exactMatches.length).toBe(0);

      // All questions must be rejected from auto-population
      const autoPopulateEligible = matches.filter(
        (m) => m.status === 'exact-match' && m.matchedRecord?.reviewStatus === 'verified'
      );
      expect(autoPopulateEligible.length).toBe(0);
    });
  });
});
