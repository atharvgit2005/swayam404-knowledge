import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SwayamPortalAdapter,
  extractWeekInfo,
  detectSubmissionStatus,
} from '@/adapters';
import {
  networkDiagnostics,
} from '@/lib/connection/networkDiagnostics';
import { PageConnectionService } from '@/lib/connection/pageConnection';
import { PopulationTarget } from '@/types';

describe('Failure Points, Week Identification & Internet Issue Identifier', () => {
  let adapter: SwayamPortalAdapter;

  beforeEach(() => {
    adapter = new SwayamPortalAdapter();
    document.body.innerHTML = '';
    document.title = '';
  });

  describe('1. Current Week Identification', () => {
    it('detects week from breadcrumb navigation elements', () => {
      document.body.innerHTML = `
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb">
            <li class="breadcrumb-item"><a href="#">Home</a></li>
            <li class="breadcrumb-item"><a href="#">Economics 101</a></li>
            <li class="breadcrumb-item active">Week 3: Consumer Demand & Elasticity</li>
            <li class="breadcrumb-item">Assignment 3</li>
          </ol>
        </nav>
      `;

      const week = extractWeekInfo(document, 'https://onlinecourses.swayam2.ac.in/course/123');
      expect(week.weekNumber).toBe(3);
      expect(week.formattedWeek).toBe('Week 3');
      expect(week.rawText).toContain('Week 3');
    });

    it('detects week from unit headers and accordion components', () => {
      document.body.innerHTML = `
        <div class="week-header">Week 04: Macroeconomic Indicators</div>
        <div class="problem-container">
          <div class="qt-question">Question 1</div>
        </div>
      `;

      const week = extractWeekInfo(document);
      expect(week.weekNumber).toBe(4);
      expect(week.formattedWeek).toBe('Week 4');
    });

    it('detects week from assignment headings', () => {
      document.body.innerHTML = `
        <h2 class="assignment-title">Week 5 Assignment: Game Theory Fundamentals</h2>
      `;

      const week = extractWeekInfo(document);
      expect(week.weekNumber).toBe(5);
      expect(week.formattedWeek).toBe('Week 5');
    });

    it('maps Assignment numbering to Week when explicit week keyword is absent', () => {
      document.body.innerHTML = `
        <h1 class="header">Assignment 06</h1>
      `;

      const week = extractWeekInfo(document);
      expect(week.weekNumber).toBe(6);
      expect(week.formattedWeek).toBe('Week 6');
    });

    it('detects week from document.title if body headers are generic', () => {
      document.title = 'NPTEL :: Computer Architecture - Week 8 Assignment 8';
      document.body.innerHTML = `<div class="content"><p>Quiz form</p></div>`;

      const week = extractWeekInfo(document);
      expect(week.weekNumber).toBe(8);
      expect(week.formattedWeek).toBe('Week 8');
    });

    it('detects week from URL query parameters (unit=7)', () => {
      document.body.innerHTML = `<div>Generic content</div>`;
      const week = extractWeekInfo(document, 'https://onlinecourses.swayam2.ac.in/noc24_cs01/unit?unit=7&assessment=14');

      expect(week.weekNumber).toBe(7);
      expect(week.formattedWeek).toBe('Week 7');
    });

    it('detects week from URL path slug (/week-9/)', () => {
      document.body.innerHTML = `<div>Generic content</div>`;
      const week = extractWeekInfo(document, 'https://onlinecourses.swayam2.ac.in/courses/course-v1:edX+CS101/week-9/quiz');

      expect(week.weekNumber).toBe(9);
      expect(week.formattedWeek).toBe('Week 9');
    });
  });

  describe('2. Assignment Already Done / Completed / Closed Detection', () => {
    it('detects submission from portal confirmation text', () => {
      document.body.innerHTML = `
        <div class="header">
          <h1>Assignment 2</h1>
          <p class="status-msg">You have already submitted this assignment.</p>
          <p class="timestamp">Submission date: 10-Oct-2026 18:30 IST</p>
        </div>
      `;

      const status = detectSubmissionStatus(document);
      expect(status.isSubmitted).toBe(true);
      expect(status.isPastDue).toBe(false);
      expect(status.statusText).toContain('Submitted');
    });

    it('detects submission and extracts score if assignment is graded', () => {
      document.body.innerHTML = `
        <div class="assessment-container">
          <h2>Week 3 Quiz</h2>
          <div class="score-banner">Score: 10/10 (100%)</div>
          <div class="feedback">Accepted Answers: B</div>
        </div>
      `;

      const status = detectSubmissionStatus(document);
      expect(status.isSubmitted).toBe(true);
      expect(status.scoreText).toBe('Score: 10/10');
      expect(status.statusText).toContain('Score: 10/10');
    });

    it('detects submission when CSS submitted class is present', () => {
      document.body.innerHTML = `
        <div class="assignment-submitted">
          <p>Your response has been recorded.</p>
        </div>
      `;

      const status = detectSubmissionStatus(document);
      expect(status.isSubmitted).toBe(true);
    });

    it('detects when assignment due date has passed (closed)', () => {
      document.body.innerHTML = `
        <div class="warning">
          The due date for submitting this assignment has passed.
        </div>
      `;

      const status = detectSubmissionStatus(document);
      expect(status.isPastDue).toBe(true);
      expect(status.statusText).toContain('Closed');
    });

    it('detects locked form when all form inputs are disabled', () => {
      document.body.innerHTML = `
        <form>
          <input type="radio" name="q1" value="A" disabled />
          <input type="radio" name="q1" value="B" disabled />
          <input type="checkbox" name="q2" value="C" disabled />
        </form>
      `;

      const status = detectSubmissionStatus(document);
      expect(status.isLocked).toBe(true);
    });

    it('returns Open & Active for an unsubmitted assignment with enabled inputs', () => {
      document.body.innerHTML = `
        <form>
          <input type="radio" name="q1" value="A" />
          <input type="radio" name="q1" value="B" />
        </form>
      `;

      const status = detectSubmissionStatus(document);
      expect(status.isSubmitted).toBe(false);
      expect(status.isLocked).toBe(false);
      expect(status.isPastDue).toBe(false);
      expect(status.statusText).toBe('Open & Active');
    });

    it('populateQuestion returns descriptive failure message if control is disabled', () => {
      document.body.innerHTML = `
        <div class="problem">
          <label><input type="radio" id="opt-1" name="q1" disabled /> Option A</label>
          <label><input type="radio" id="opt-2" name="q1" disabled /> Option B</label>
        </div>
      `;

      const target: PopulationTarget = {
        questionId: 'q1',
        questionText: 'Test Question',
        questionType: 'single-choice',
        selectedAnswers: ['Option A'],
        options: [
          { id: 'opt-1', text: 'Option A', inputSelector: '#opt-1' },
          { id: 'opt-2', text: 'Option B', inputSelector: '#opt-2' },
        ],
      };

      const result = adapter.populateQuestion(document, target);
      expect(result.success).toBe(false);
      expect(result.message).toContain('locked/disabled');
    });
  });

  describe('3. Combined Identity & Week Integration in detectCourseIdentity', () => {
    it('returns course title, week number, and submission status in a unified payload', () => {
      document.body.innerHTML = `
        <div class="portal-course-header">
          <h1>Principles of Economics - Week 3</h1>
        </div>
        <div class="breadcrumb-item">Week 3: Microeconomics</div>
        <div class="assignment-title">Week 3 Assignment</div>
        <div class="score-badge">Score: 9/10</div>
        <div class="submitted">Submission date: 05-Oct-2026</div>
      `;

      const identity = adapter.detectCourseIdentity(
        document,
        'https://onlinecourses.swayam2.ac.in/noc24_hs101/unit?unit=3'
      );

      expect(identity.courseTitle).toBe('Principles of Economics');
      expect(identity.detectedWeek).toBe('Week 3');
      expect(identity.detectedWeekNumber).toBe(3);
      expect(identity.isAlreadySubmitted).toBe(true);
      expect(identity.submissionStatus?.isSubmitted).toBe(true);
      expect(identity.submissionStatus?.scoreText).toBe('Score: 9/10');
    });
  });

  describe('4. Internet Issue Identifier & Network Diagnostics', () => {
    it('returns healthy status when navigator is online', () => {
      const diag = networkDiagnostics.getCurrentDiagnosis();
      expect(diag.isOnline).toBe(true);
      expect(diag.failureType).toBe('NONE');
    });

    it('correctly categorizes offline error from network failure', () => {
      const offlineErr = new Error('net::ERR_INTERNET_DISCONNECTED: failed to connect');
      const diag = networkDiagnostics.diagnoseFailure(offlineErr, 'scan');

      expect(diag.isOnline).toBe(false);
      expect(diag.failureType).toBe('OFFLINE_NO_CONNECTION');
      expect(diag.message).toContain('offline');
      expect(diag.suggestedAction).toContain('Wi-Fi');
    });

    it('correctly categorizes timeout latency error', () => {
      const timeoutErr = new Error('Page response timed out after 12s.');
      const diag = networkDiagnostics.diagnoseFailure(timeoutErr, 'AI request');

      expect(diag.failureType).toBe('TIMEOUT_LATENCY');
      expect(diag.message).toContain('timeout');
    });

    it('correctly categorizes portal communication drop', () => {
      const portErr = new Error('Could not connect to page content script.');
      const diag = networkDiagnostics.diagnoseFailure(portErr, 'handshake');

      expect(diag.failureType).toBe('PORTAL_UNREACHABLE');
      expect(diag.message).toContain('SWAYAM portal tab');
    });

    it('correctly categorizes external AI endpoint failure', () => {
      const apiErr = new Error('TypeError: Failed to fetch from generativelanguage.googleapis.com');
      const diag = networkDiagnostics.diagnoseFailure(apiErr, 'Gemini LLM');

      expect(diag.failureType).toBe('API_UNREACHABLE');
      expect(diag.message).toContain('AI Provider endpoint unreachable');
    });

    it('notifies subscribers on network diagnosis change', () => {
      const listener = vi.fn();
      const unsubscribe = networkDiagnostics.subscribe(listener);

      expect(listener).toHaveBeenCalled();
      unsubscribe();
    });
  });

  describe('4. SWAYAM Week & Quiz Switch Detection (PageConnectionService.isAssignmentOrWeekDifferent)', () => {
    it('detects when the student switches from Week 1 to Week 2', () => {
      const currentSession = {
        url: 'https://onlinecourses.nptel.ac.in/noc24_cs01/unit?unit=1&assessment=10',
        detectedWeek: 'Week 1',
        assignmentTitle: 'Assignment 1',
      };
      const newPortal = {
        url: 'https://onlinecourses.nptel.ac.in/noc24_cs01/unit?unit=2&assessment=20',
        detectedWeek: 'Week 2',
        detectedAssignmentTitle: 'Assignment 2',
      };

      const isDifferent = PageConnectionService.isAssignmentOrWeekDifferent(currentSession, newPortal);
      expect(isDifferent).toBe(true);
    });

    it('detects when the week string has different formatting like Week 03 vs Week 4', () => {
      const currentSession = {
        detectedWeek: 'Week 03',
      };
      const newPortal = {
        detectedWeek: 'Week 4',
      };

      expect(PageConnectionService.isAssignmentOrWeekDifferent(currentSession, newPortal)).toBe(true);
    });

    it('returns false when weeks are identical despite whitespace or casing differences', () => {
      const currentSession = {
        url: 'https://onlinecourses.nptel.ac.in/noc24_cs01/unit?unit=1&assessment=10',
        detectedWeek: 'Week 3',
        assignmentTitle: 'Assignment 3',
      };
      const portal = {
        url: 'https://onlinecourses.nptel.ac.in/noc24_cs01/unit?unit=1&assessment=10',
        detectedWeek: 'week 3',
        detectedAssignmentTitle: 'Assignment 3',
      };

      expect(PageConnectionService.isAssignmentOrWeekDifferent(currentSession, portal)).toBe(false);
    });

    it('detects when assignment title changes on the same week (e.g. Quiz A vs Quiz B)', () => {
      const currentSession = {
        url: 'https://onlinecourses.nptel.ac.in/noc24_cs01/unit?unit=1',
        detectedWeek: 'Week 1',
        assignmentTitle: 'Practice Quiz 1',
      };
      const portal = {
        url: 'https://onlinecourses.nptel.ac.in/noc24_cs01/unit?unit=1',
        detectedWeek: 'Week 1',
        detectedAssignmentTitle: 'Graded Assessment 1',
      };

      expect(PageConnectionService.isAssignmentOrWeekDifferent(currentSession, portal)).toBe(true);
    });

    it('detects when unit or assessment query parameter changes in URL', () => {
      const currentSession = {
        url: 'https://onlinecourses.swayam2.ac.in/course/unit?unit=5&assessment=51',
      };
      const portal = {
        url: 'https://onlinecourses.swayam2.ac.in/course/unit?unit=5&assessment=52',
      };

      expect(PageConnectionService.isAssignmentOrWeekDifferent(currentSession, portal)).toBe(true);
    });

    it('detects when SPA hash routes change between units', () => {
      const currentSession = {
        url: 'https://swayam.gov.in/courses/econ#unit=1&assessment=1',
      };
      const portal = {
        url: 'https://swayam.gov.in/courses/econ#unit=2&assessment=2',
      };

      expect(PageConnectionService.isAssignmentOrWeekDifferent(currentSession, portal)).toBe(true);
    });

    it('returns false safely when either context is null or undefined', () => {
      expect(PageConnectionService.isAssignmentOrWeekDifferent(null, { detectedWeek: 'Week 1' })).toBe(false);
      expect(PageConnectionService.isAssignmentOrWeekDifferent({ detectedWeek: 'Week 1' }, null)).toBe(false);
    });
  });
});
