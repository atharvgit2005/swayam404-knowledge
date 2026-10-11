import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SwayamPortalAdapter } from '@/adapters';
import { StorageService } from '@/lib/storage';
import { CapturedQuestionRecord, QuestionRecord } from '@/types';

describe('Feature A: Answer Capture & Knowledge Base Integration', () => {
  let adapter: SwayamPortalAdapter;
  let feedbackHtml: string;

  beforeEach(async () => {
    adapter = new SwayamPortalAdapter();
    feedbackHtml = fs.readFileSync(
      path.resolve(__dirname, '../../public/fixtures/submitted-feedback-assignment.html'),
      'utf-8'
    );
    await StorageService.clearAll();
    await StorageService.initDefaults();
  });

  it('correctly extracts assignment metadata, questions, and feedback from submitted assignment fixture', () => {
    document.body.innerHTML = feedbackHtml;
    const url = 'https://onlinecourses.swayam2.ac.in/e-learning/course/ini26_cm22?unitId=26&assessmentId=118';

    const result = adapter.captureAssignmentFeedback(document, url);

    expect(result.portalCourseTitle).toBe('Principles of Economics');
    expect(result.externalCourseId).toBe('ini26_cm22');
    expect(result.capturedRecords.length).toBe(6);
  });

  it('captures accepted answer from explicit option-level indicator (.correct / badge)', () => {
    document.body.innerHTML = feedbackHtml;
    const result = adapter.captureAssignmentFeedback(document);
    const q1 = result.capturedRecords.find((r) => r.questionIndex === 1);

    expect(q1).toBeDefined();
    expect(q1?.hasExplicitFeedback).toBe(true);
    expect(q1?.verificationStatus).toBe('portal-confirmed');
    expect(q1?.acceptedAnswers).toContain('Scarcity');
    expect(q1?.explanation).toContain('Scarcity arises because human wants are unlimited');
    expect(q1?.verificationSource).toBe('option_correct_indicator');
  });

  it('captures accepted answer from question-level .accepted-answers block below question', () => {
    document.body.innerHTML = feedbackHtml;
    const result = adapter.captureAssignmentFeedback(document);
    const q2 = result.capturedRecords.find((r) => r.questionIndex === 2);

    expect(q2).toBeDefined();
    expect(q2?.hasExplicitFeedback).toBe(true);
    expect(q2?.verificationStatus).toBe('portal-confirmed');
    expect(q2?.acceptedAnswers).toContain('Burn rate');
    expect(q2?.explanation).toContain('Burn rate tracks monthly net negative cash flow');
  });

  it('captures complete multiple-choice accepted-answer sets from checkboxes', () => {
    document.body.innerHTML = feedbackHtml;
    const result = adapter.captureAssignmentFeedback(document);
    const q3 = result.capturedRecords.find((r) => r.questionIndex === 3);

    expect(q3).toBeDefined();
    expect(q3?.hasExplicitFeedback).toBe(true);
    expect(q3?.verificationStatus).toBe('portal-confirmed');
    expect(q3?.acceptedAnswers.length).toBe(2);
    expect(q3?.acceptedAnswers).toContain('Increase in consumer income for normal goods');
    expect(q3?.acceptedAnswers).toContain('Favorable change in consumer tastes');
  });

  it('NEVER infers student incorrect selection as correct answer (Q4 test)', () => {
    document.body.innerHTML = feedbackHtml;
    const result = adapter.captureAssignmentFeedback(document);
    const q4 = result.capturedRecords.find((r) => r.questionIndex === 4);

    expect(q4).toBeDefined();
    // Student selected 'True' (which was wrong)
    expect(q4?.selectedOptions).toContain('True');
    // But portal explicitly accepted 'False'
    expect(q4?.acceptedAnswers).toEqual(['False']);
    expect(q4?.acceptedAnswers).not.toContain('True');
    expect(q4?.verificationStatus).toBe('portal-confirmed');
  });

  it('NEVER infers verified answer from score alone when portal provides no answer feedback (Q5 test)', () => {
    document.body.innerHTML = feedbackHtml;
    const result = adapter.captureAssignmentFeedback(document);
    const q5 = result.capturedRecords.find((r) => r.questionIndex === 5);

    expect(q5).toBeDefined();
    // Q5 has Score: 1/1 but no explicit correct indicator or accepted answers block
    expect(q5?.hasExplicitFeedback).toBe(false);
    expect(q5?.verificationStatus).toBe('unverified');
    expect(q5?.acceptedAnswers.length).toBe(0);
    expect(q5?.ambiguityWarning).toContain('Score visible');
    expect(q5?.ambiguityWarning).toContain('not explicitly state which option is correct');
    // Must NOT be selected for save automatically
    expect(q5?.isSelectedForSave).toBe(false);
  });

  it('captures short text accepted answer from feedback block (Q6 test)', () => {
    document.body.innerHTML = feedbackHtml;
    const result = adapter.captureAssignmentFeedback(document);
    const q6 = result.capturedRecords.find((r) => r.questionIndex === 6);

    expect(q6).toBeDefined();
    expect(q6?.hasExplicitFeedback).toBe(true);
    expect(q6?.acceptedAnswers).toContain('Opportunity cost');
    expect(q6?.explanation).toContain('Opportunity cost is the fundamental tradeoff');
  });

  it('persists captured records to local knowledge base and updates duplicates', async () => {
    document.body.innerHTML = feedbackHtml;
    const result = adapter.captureAssignmentFeedback(document);
    const courseId = 'course-econ-101';

    // First save
    const stats1 = await StorageService.saveCapturedQuestions(result.capturedRecords, courseId);
    expect(stats1.saved).toBeGreaterThanOrEqual(4);

    const stored = await StorageService.getQuestions(courseId);
    const scarcityQ = stored.find((q) => q.questionText.includes('fundamental economic problem'));
    expect(scarcityQ).toBeDefined();
    expect(scarcityQ?.reviewStatus).toBe('portal-confirmed');
    expect(scarcityQ?.correctOptions).toContain('Scarcity');

    // Second save of identical records (should detect duplicates, not create duplicate records)
    const stats2 = await StorageService.saveCapturedQuestions(result.capturedRecords, courseId);
    expect(stats2.saved).toBe(0);
    expect(stats2.duplicates).toBeGreaterThanOrEqual(4);
  });

  it('detects and flags conflicts when same question has differing answers across captures', async () => {
    const courseId = 'course-econ-101';
    const initialRecord: QuestionRecord = {
      id: 'existing-q1',
      courseId,
      questionText: 'What is the fundamental economic problem that all societies face?',
      normalizedText: 'what is the fundamental economic problem that all societies face',
      questionType: 'single-choice',
      options: ['Inflation', 'Scarcity', 'Recession'],
      correctOptions: ['Inflation'], // Conflicting previous record!
      reviewStatus: 'portal-confirmed',
      source: 'Previous Assignment 1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await StorageService.saveQuestion(initialRecord);

    const conflictingCapture: CapturedQuestionRecord = {
      id: 'cap-conflict-1',
      questionIndex: 1,
      questionText: 'What is the fundamental economic problem that all societies face?',
      questionType: 'single-choice',
      options: ['Inflation', 'Scarcity', 'Recession'],
      selectedOptions: ['Scarcity'],
      acceptedAnswers: ['Scarcity'], // Differing answer!
      verificationStatus: 'portal-confirmed',
      verificationSource: 'portal_feedback',
      hasExplicitFeedback: true,
      isSelectedForSave: true,
    };

    const stats = await StorageService.saveCapturedQuestions([conflictingCapture], courseId);
    expect(stats.conflicts).toBe(1);

    const stored = await StorageService.getQuestions(courseId);
    const conflicted = stored.find((q) => q.questionText.includes('fundamental economic problem'));
    expect(conflicted?.reviewStatus).toBe('conflicted');
    expect(conflicted?.explanation).toContain('CONFLICT: Previously recorded');
  });

  it('enforces strict course isolation for captured records', async () => {
    document.body.innerHTML = feedbackHtml;
    const result = adapter.captureAssignmentFeedback(document);

    // Save to Economics
    await StorageService.saveCapturedQuestions(result.capturedRecords, 'course-econ-101');

    // Verify Entrepreneurship bank contains 0 captured Economics questions
    const entQuestions = await StorageService.getQuestions('course-ent-201');
    const hasEconInEnt = entQuestions.some((q) =>
      q.questionText.includes('fundamental economic problem')
    );
    expect(hasEconInEnt).toBe(false);
  });
});
