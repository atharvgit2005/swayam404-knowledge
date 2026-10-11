import React, { useState, useEffect, useCallback } from 'react';
import {
  Course,
  CourseTask,
  CourseMapping,
  CourseReadiness,
  WorkflowCheckpoint,
  QuestionMatchResult,
  PopulationTarget,
  CourseOutlineResultMessage,
  ScanResultMessage,
  PopulateResultMessage,
  CaptureFeedbackResultMessage,
} from '@/types';
import { StorageService } from '@/lib/storage';
import { pageConnectionService } from '@/lib/connection/pageConnection';
import { AnswerResolutionPipeline } from '@/lib/orchestration/answerResolutionPipeline';
import { CourseMappingModal } from './CourseMappingModal';
import { TaskQueueView } from './TaskQueueView';
import { CapturePreviewModal } from '@/features/answer-bank/CapturePreviewModal';
import { KnowledgeBaseService } from '@/lib/knowledge';
import {
  Play,
  ScanLine,
  Layers,
  Link2,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  ArrowRight,
  Eye,
  Sparkles,
  Database,
} from 'lucide-react';

interface CourseCompletionDashboardProps {
  courses: Course[];
  selectedCourse: Course;
  onSelectCourse: (courseId: string) => void;
  onNavigateToScan: () => void;
  setAppScanResults: (results: QuestionMatchResult[]) => void;
  onRefreshData?: () => Promise<void>;
}

export const CourseCompletionDashboard: React.FC<CourseCompletionDashboardProps> = ({
  courses,
  selectedCourse,
  onSelectCourse,
  onNavigateToScan,
  setAppScanResults,
  onRefreshData,
}) => {
  const [tasks, setTasks] = useState<CourseTask[]>([]);
  const [readiness, setReadiness] = useState<CourseReadiness | null>(null);
  const [mapping, setMapping] = useState<CourseMapping | null>(null);
  const [checkpoint, setCheckpoint] = useState<WorkflowCheckpoint | null>(null);
  const [detectedPortalTitle, setDetectedPortalTitle] = useState<string>('');
  const [detectedExternalId, setDetectedExternalId] = useState<string>('');
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [isScanningOutline, setIsScanningOutline] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureData, setCaptureData] = useState<CaptureFeedbackResultMessage | null>(null);
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [isCourseCompletionActive, setIsCourseCompletionActive] = useState(false);
  const [isApplyingCheckmarks, setIsApplyingCheckmarks] = useState(false);
  const [approvedTaskIds, setApprovedTaskIds] = useState<string[]>([]);
  const [isImportingFromGitHub, setIsImportingFromGitHub] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: 'info' | 'success' | 'warn' | 'error';
  } | null>(null);

  const handleImportAnswersFromGitHub = async () => {
    setIsImportingFromGitHub(true);
    showStatus('Syncing and taking verified answers from GitHub Answer Bank...', 'info');
    try {
      const res = await KnowledgeBaseService.importAnswersForCourse(selectedCourse.id);
      if (res.success) {
        showStatus(res.message, 'success');
        await loadCourseData();
        if (onRefreshData) {
          await onRefreshData();
        }
      } else {
        showStatus(res.message, 'warn');
      }
    } catch (err: unknown) {
      showStatus((err as Error)?.message || 'Failed to take answers from GitHub bank.', 'error');
    } finally {
      setIsImportingFromGitHub(false);
    }
  };

  // Load readiness, mapping, tasks, and checkpoint for current course
  const loadCourseData = useCallback(async () => {
    try {
      const readyInfo = await StorageService.assessCourseReadiness(selectedCourse.id);
      setReadiness(readyInfo);

      const courseTasks = await StorageService.getTasksForCourse(selectedCourse.id);
      setTasks(courseTasks);

      const approved = await StorageService.getApprovedTaskIds(selectedCourse.id);
      setApprovedTaskIds(approved);

      const currentCheckpoint = await StorageService.getCheckpoint(selectedCourse.id);
      setCheckpoint(currentCheckpoint || null);

      const allMappings = await StorageService.getCourseMappings();
      const existingMapping = allMappings.find((m) => m.localCourseId === selectedCourse.id);
      setMapping(existingMapping || null);

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(['courseCompletionModeActive'], (res) => {
          if (res?.courseCompletionModeActive) {
            setIsCourseCompletionActive(true);
          }
        });
      }
    } catch (e) {
      console.error('Failed to load course completion data:', e);
    }
  }, [selectedCourse.id]);


  useEffect(() => {
    loadCourseData();
  }, [loadCourseData]);

  const showStatus = (text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    setStatusMessage({ text, type });
    if (type !== 'error') {
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  // Scan Course Outline from active tab
  const handleScanOutline = async () => {
    setIsScanningOutline(true);
    setStatusMessage(null);

    try {
      const response = await pageConnectionService.queryTab<CourseOutlineResultMessage>({
        type: 'SCAN_COURSE_OUTLINE',
      });

      if (!response.success) {
        showStatus(response.error || 'Failed to parse course outline.', 'error');
        return;
      }

      if (response.portalCourseTitle) {
        setDetectedPortalTitle(response.portalCourseTitle);
      }
      if (response.externalCourseId) {
        setDetectedExternalId(response.externalCourseId);
      }

      // Verify mapping
      let activeLocalId = selectedCourse.id;
      if (response.portalCourseTitle) {
        const mapped = await StorageService.findMappingForPortalCourse(
          response.portalCourseTitle,
          response.externalCourseId
        );
        if (mapped) {
          setMapping(mapped);
          if (mapped.localCourseId !== selectedCourse.id) {
            onSelectCourse(mapped.localCourseId);
            activeLocalId = mapped.localCourseId;
          }
        } else {
          // Course unmapped — prompt student
          setIsMappingModalOpen(true);
        }
      }

      const discoveredTasks = response.tasks.map((t) => ({
        ...t,
        courseId: activeLocalId,
      }));

      setTasks(discoveredTasks);
      await StorageService.saveTasksForCourse(activeLocalId, discoveredTasks);

      showStatus(
        `Discovered ${discoveredTasks.length} tasks (${
          discoveredTasks.filter((t) => t.status === 'ready-to-prepare').length
        } ready to prepare).`,
        'success'
      );
    } catch (e) {
      showStatus((e as Error).message || 'Outline scan error', 'error');
    } finally {
      setIsScanningOutline(false);
    }
  };

  // Save Course Mapping
  const handleSaveMapping = async (localCourseId: string) => {
    const titleToMap = detectedPortalTitle || selectedCourse.name;
    const newMapping: CourseMapping = {
      id: `map-${Date.now()}`,
      portalCourseTitle: titleToMap,
      localCourseId,
      externalCourseId: detectedExternalId || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await StorageService.saveCourseMapping(newMapping);
    setMapping(newMapping);
    setIsMappingModalOpen(false);

    if (localCourseId !== selectedCourse.id) {
      onSelectCourse(localCourseId);
    }

    showStatus(
      `Linked portal course to local profile "${
        courses.find((c) => c.id === localCourseId)?.name
      }".`,
      'success'
    );
  };

  // Prepare a single task (either active tab or selected task)
  const handlePrepareTask = async (taskToPrepare?: CourseTask): Promise<boolean> => {
    setStatusMessage(null);

    try {
      const response = await pageConnectionService.queryTab<ScanResultMessage>({
        type: 'SCAN_ASSIGNMENT',
      });

      if (!response.questions || response.questions.length === 0) {
        showStatus('No questions detected on this assignment tab.', 'warn');
        return false;
      }

      const scanned = response.questions;

      // Course Isolation Check
      if (response.detectedCourseTitle) {
        const mapped = await StorageService.findMappingForPortalCourse(
          response.detectedCourseTitle,
          response.detectedExternalId
        );
        if (mapped && mapped.localCourseId !== selectedCourse.id) {
          showStatus(
            `Course mismatch: Tab is "${response.detectedCourseTitle}" (mapped to different course). Isolated from current bank.`,
            'error'
          );
          return false;
        }
      }

      // Run unified 5-stage answer resolution pipeline
      const allQuestions = await StorageService.getQuestions();
      const answerBank = allQuestions.filter((q) => q.courseId === selectedCourse.id);
      const settings = await StorageService.getSettings();
      const materials = await StorageService.getCourseMaterials(selectedCourse.id);

      const resolution = await AnswerResolutionPipeline.resolveAssignment({
        questions: scanned,
        selectedCourse,
        answerBank,
        materials,
        settings,
        skipLlm: false,
      });
      const matches = resolution.results;

      // Update app scan results for student review
      setAppScanResults(matches);

      let populatedCount = 0;

      // Auto-fill eligible answers if enabled in settings
      if (settings.autoPopulateExactVerified || settings.autoApplyHighConfidence) {
        const eligibleTargets: PopulationTarget[] = [];
        for (const match of matches) {
          const isExactVerified =
            match.status === 'exact-match' &&
            (match.resolutionState === 'portal-confirmed' ||
              match.resolutionState === 'student-reviewed' ||
              match.matchedRecord?.reviewStatus === 'portal-confirmed' ||
              match.matchedRecord?.reviewStatus === 'student-reviewed' ||
              match.matchedRecord?.reviewStatus === 'verified');

          const isHighConfidenceAi =
            settings.autoApplyHighConfidence &&
            match.resolutionState === 'ai-suggested' &&
            !match.requiresReview &&
            match.proposedAnswers.length > 0;

          if ((isExactVerified || isHighConfidenceAi) && match.proposedAnswers.length > 0) {
            eligibleTargets.push({
              questionId: match.scannedQuestion.id,
              questionText: match.scannedQuestion.questionText,
              questionType: match.scannedQuestion.questionType,
              selectedAnswers: match.proposedAnswers,
              options: match.scannedQuestion.options,
            });
          }
        }

        if (eligibleTargets.length > 0) {
          const popRes = await pageConnectionService.queryTab<PopulateResultMessage>({
            type: 'POPULATE_ANSWERS',
            targets: eligibleTargets,
          });
          if (popRes.summary) {
            populatedCount = popRes.summary.succeeded;
          }
        }
      }

      const exactMatchesCount = matches.filter((m) => m.status === 'exact-match').length;
      const reviewNeededCount = matches.filter(
        (m) => m.status === 'probable-match' || m.status === 'ambiguous-match'
      ).length;
      const unmatchedCount = matches.filter((m) => m.status === 'no-match').length;

      // Determine updated task status
      let updatedStatus: CourseTask['status'] = 'prepared';
      if (reviewNeededCount > 0 || unmatchedCount > 0) {
        updatedStatus = 'needs-attention';
      } else if (populatedCount > 0 && populatedCount === exactMatchesCount) {
        updatedStatus = 'awaiting-submission';
      }

      // Update task in queue if matched
      const currentTaskId =
        taskToPrepare?.id || tasks.find((t) => t.status === 'ready-to-prepare')?.id;
      if (currentTaskId) {
        await StorageService.updateTaskStatus(selectedCourse.id, currentTaskId, {
          status: updatedStatus,
          matchSummary: {
            scanned: scanned.length,
            exactMatches: exactMatchesCount,
            reviewRequired: reviewNeededCount,
            unmatched: unmatchedCount,
          },
        });
        const updatedList = await StorageService.getTasksForCourse(selectedCourse.id);
        setTasks(updatedList);
      }

      if (updatedStatus === 'needs-attention') {
        showStatus(
          `Prepared with ${reviewNeededCount} question(s) requiring review. Inspect in Scan & Review.`,
          'warn'
        );
      } else if (populatedCount > 0) {
        showStatus(
          `Populated ${populatedCount} exact verified answer(s). Submit button untouched for manual review.`,
          'success'
        );
      } else {
        showStatus(
          `Scanned ${scanned.length} questions. Inspect proposed answers in Scan & Review tab.`,
          'info'
        );
      }

      return true;
    } catch (err) {
      showStatus((err as Error).message || 'Failed to prepare assignment.', 'error');
      return false;
    }
  };

  // Capture answers from submitted assignment feedback
  const handleCaptureFeedback = async () => {
    setIsCapturing(true);
    setStatusMessage(null);

    try {
      const response = await pageConnectionService.queryTab<CaptureFeedbackResultMessage>({
        type: 'CAPTURE_ASSIGNMENT_FEEDBACK',
      });

      if (!response.capturedRecords || response.capturedRecords.length === 0) {
        showStatus(
          'No questions with visible feedback found on current tab. Open a submitted assignment with revealed answers.',
          'warn'
        );
        return;
      }

      setCaptureData(response);
      setIsCaptureModalOpen(true);
    } catch (err) {
      showStatus((err as Error).message || 'Failed to capture feedback.', 'error');
    } finally {
      setIsCapturing(false);
    }
  };

  // Run sequential pipeline for all ready tasks
  const handlePrepareCourse = async () => {
    if (tasks.length === 0) {
      showStatus('No tasks discovered yet. Run "Scan Outline" first.', 'warn');
      return;
    }

    const readyTasks = tasks.filter((t) => t.status === 'ready-to-prepare');
    if (readyTasks.length === 0) {
      showStatus('All tasks are already prepared, completed, or reviewed.', 'info');
      return;
    }

    setIsProcessingQueue(true);
    setStatusMessage(null);

    const firstReady = readyTasks[0];
    const taskIdx = tasks.findIndex((t) => t.id === firstReady.id);

    const cp: WorkflowCheckpoint = {
      courseId: selectedCourse.id,
      activeTaskId: firstReady.id,
      stepIndex: taskIdx + 1,
      totalTasks: tasks.length,
      status: 'paused',
      pauseReason: `Paused before "${firstReady.title}". Open task tab in browser to prepare.`,
      nextActionPrompt: 'Open assignment page, then click "Prepare Current Tab".',
      updatedAt: new Date().toISOString(),
    };

    await StorageService.saveCheckpoint(cp);
    setCheckpoint(cp);
    setIsProcessingQueue(false);

    showStatus(
      `Queue initialized. Checkpoint created at task ${taskIdx + 1}/${tasks.length}: "${
        firstReady.title
      }".`,
      'info'
    );
  };

  const handleClearQueue = async () => {
    const confirm = window.confirm(
      'Clear all discovered tasks and checkpoints for this course?'
    );
    if (confirm) {
      await StorageService.clearTasksForCourse(selectedCourse.id);
      await StorageService.clearCheckpoint(selectedCourse.id);
      setTasks([]);
      setCheckpoint(null);
      showStatus('Course tasks and checkpoint cleared.', 'info');
    }
  };

  const handleClearCheckpoint = async () => {
    await StorageService.clearCheckpoint(selectedCourse.id);
    setCheckpoint(null);
    showStatus('Checkpoint dismissed.', 'info');
  };

  // Course Completion Mode Actions
  const handleToggleCourseCompletionMode = async () => {
    const nextState = !isCourseCompletionActive;
    setIsCourseCompletionActive(nextState);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({
        courseCompletionModeActive: nextState,
        approvedCourseTaskIds: approvedTaskIds,
      });
    }

    try {
      const res = await pageConnectionService.queryTab<{
        success: boolean;
        appliedCount: number;
        totalBlocks: number;
        pendingQuizzes?: number;
      }>({
        type: 'SET_COURSE_COMPLETION_MODE',
        enabled: nextState,
        approvedTaskIds,
      });

      if (nextState) {
        if (res.pendingQuizzes && res.pendingQuizzes > 0) {
          showStatus(
            `Course Completion Mode active (${res.appliedCount || 'Non-quiz'} blocks marked). ${res.pendingQuizzes} unfinished quiz(zes) require student approval and answered options.`,
            'info'
          );
        } else {
          showStatus(
            `Course Completion Mode activated! ${res.appliedCount || 'All'} blocks marked with green checkmarks on SWAYAM.`,
            'success'
          );
        }
      } else {
        showStatus('Course Completion Mode deactivated.', 'info');
        loadCourseData();
      }
    } catch {
      showStatus(
        nextState
          ? 'Course Completion Mode enabled locally. Open a SWAYAM tab to apply checkmarks.'
          : 'Course Completion Mode disabled.',
        'info'
      );
    }
  };

  const handleApplyCheckmarksToPortal = async () => {
    setIsApplyingCheckmarks(true);
    try {
      const res = await pageConnectionService.queryTab<{
        success: boolean;
        appliedCount: number;
        totalBlocks: number;
        pendingQuizzes?: number;
      }>({
        type: 'APPLY_COURSE_COMPLETION_CHECKMARKS',
        approvedTaskIds,
      });

      setIsCourseCompletionActive(true);
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({
          courseCompletionModeActive: true,
          approvedCourseTaskIds: approvedTaskIds,
        });
      }

      if (res.pendingQuizzes && res.pendingQuizzes > 0) {
        showStatus(
          `Applied checkmarks to ${res.appliedCount} block(s). ${res.pendingQuizzes} quiz(zes) pending approval & solution.`,
          'info'
        );
      } else {
        showStatus(
          `Injected green checkmarks to ${res.appliedCount || 'all'} blocks on SWAYAM portal! (100% Progress)`,
          'success'
        );
      }
    } catch {
      showStatus('Unable to reach active SWAYAM tab. Ensure a SWAYAM course tab is active.', 'warn');
    } finally {
      setIsApplyingCheckmarks(false);
    }
  };

  const handleApproveAndSolveTask = async (task: CourseTask) => {
    setIsProcessingQueue(true);
    setStatusMessage(null);
    try {
      const nextApproved = Array.from(new Set([...approvedTaskIds, task.id]));
      setApprovedTaskIds(nextApproved);
      await StorageService.saveApprovedTaskIds(selectedCourse.id, nextApproved);

      // 1. Send APPROVE_AND_SOLVE_TASK to active tab to tick options into the DOM
      try {
        await pageConnectionService.queryTab<{
          success: boolean;
          appliedCount: number;
          totalBlocks: number;
          pendingQuizzes?: number;
        }>({
          type: 'APPROVE_AND_SOLVE_TASK',
          taskId: task.id,
          taskTitle: task.title,
          unitTitle: task.unitTitle,
          taskUrl: task.url,
          autoTick: true,
        });
      } catch {
        // Tab not currently on this task; will solve when opened
      }

      // 2. Run answer resolution pipeline to populate questions
      await handlePrepareTask(task);

      // 3. Update task status in storage and state
      await StorageService.updateTaskStatus(selectedCourse.id, task.id, {
        status: 'awaiting-submission',
        portalReportedComplete: true,
        portalStatusText: 'Approved & Solved (Ready to Submit)',
      });

      const updatedList = await StorageService.getTasksForCourse(selectedCourse.id);
      setTasks(updatedList);

      // 4. Update checkmarks on portal
      try {
        await pageConnectionService.queryTab({
          type: 'APPLY_COURSE_COMPLETION_CHECKMARKS',
          approvedTaskIds: nextApproved,
        });
      } catch {}

      showStatus(
        `"${task.title}" approved! Verified options ticked in SWAYAM DOM. Review and submit on portal.`,
        'success'
      );
    } catch (err) {
      showStatus((err as Error).message || 'Failed to approve task.', 'error');
    } finally {
      setIsProcessingQueue(false);
    }
  };

  const handleApproveAllIncomplete = async () => {
    if (incompleteTasks.length === 0) {
      showStatus('All tasks are already completed or approved.', 'info');
      return;
    }

    setIsProcessingQueue(true);
    setStatusMessage(null);

    try {
      const taskIdsToApprove = incompleteTasks.map((t) => t.id);
      const nextApproved = Array.from(new Set([...approvedTaskIds, ...taskIdsToApprove]));
      setApprovedTaskIds(nextApproved);
      await StorageService.saveApprovedTaskIds(selectedCourse.id, nextApproved);

      for (const t of incompleteTasks) {
        await StorageService.updateTaskStatus(selectedCourse.id, t.id, {
          status: 'awaiting-submission',
          portalReportedComplete: true,
          portalStatusText: 'Approved & Solved',
        });
      }

      const updatedList = await StorageService.getTasksForCourse(selectedCourse.id);
      setTasks(updatedList);

      try {
        await pageConnectionService.queryTab({
          type: 'APPLY_COURSE_COMPLETION_CHECKMARKS',
          approvedTaskIds: nextApproved,
        });
      } catch {}

      showStatus(
        `Approved ${taskIdsToApprove.length} incomplete task(s)! Options populated and ready for submission.`,
        'success'
      );
    } catch (err) {
      showStatus((err as Error).message || 'Failed to approve tasks.', 'error');
    } finally {
      setIsProcessingQueue(false);
    }
  };

  const incompleteTasks = tasks.filter((t) => {
    if (t.type === 'resource') return false;
    const isApproved = approvedTaskIds.includes(t.id);
    return !t.portalReportedComplete && t.status !== 'completed' && !isApproved;
  });

  const totalTasks = tasks.length;
  const completedCount = tasks.filter(
    (t) => t.status === 'completed' || t.portalReportedComplete || approvedTaskIds.includes(t.id)
  ).length;
  const readyCount = tasks.filter(
    (t) => (t.status === 'ready-to-prepare' || t.status === 'prepared') && !approvedTaskIds.includes(t.id)
  ).length;
  const attentionCount = tasks.filter((t) => t.status === 'needs-attention').length;
  const progressPercent = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  const displayedTasks = tasks.map((t) => {
    const isApproved = approvedTaskIds.includes(t.id);
    if (isApproved) {
      return {
        ...t,
        status: 'awaiting-submission' as const,
        portalReportedComplete: true,
        portalStatusText: t.portalStatusText || 'Approved & Solved',
      };
    }
    return t;
  });

  // Determine dynamic single next recommended action
  const getNextRecommendedAction = () => {
    if (totalTasks === 0) {
      return {
        title: 'Discover Syllabus & Assignments',
        subtitle: 'Scan the active SWAYAM / NPTEL course outline tab to build the completion task queue.',
        buttonLabel: isScanningOutline ? 'Scanning Outline...' : 'Scan Course Outline',
        buttonIcon: <RefreshCw size={14} className={isScanningOutline ? 'animate-spin' : ''} />,
        onClick: handleScanOutline,
        disabled: isScanningOutline,
      };
    }

    if (incompleteTasks.length > 0) {
      const firstIncomplete = incompleteTasks[0];
      return {
        title: `Approve & Solve: ${firstIncomplete.title}`,
        subtitle: `${firstIncomplete.unitTitle || 'Week Unit'} quiz is unsubmitted. Click to approve, populate verified answers into form options, and prepare for submission.`,
        buttonLabel: 'Approve & Solve',
        buttonIcon: <CheckCircle2 size={14} />,
        onClick: () => handleApproveAndSolveTask(firstIncomplete),
        disabled: isProcessingQueue,
      };
    }


    if (checkpoint && checkpoint.status === 'paused') {
      return {
        title: `Workflow Checkpoint: Step ${checkpoint.stepIndex} of ${checkpoint.totalTasks}`,
        subtitle: checkpoint.pauseReason || checkpoint.nextActionPrompt || 'Paused waiting for tab confirmation.',
        buttonLabel: isProcessingQueue ? 'Resuming...' : 'Resume Next Task',
        buttonIcon: <Play size={14} />,
        onClick: handlePrepareCourse,
        disabled: isProcessingQueue,
        canDismiss: true,
      };
    }

    if (attentionCount > 0) {
      return {
        title: `${attentionCount} Task(s) Require Review`,
        subtitle: 'Discovered questions have ambiguous or unverified matches that need student confirmation.',
        buttonLabel: 'Review in Scanner',
        buttonIcon: <Eye size={14} />,
        onClick: onNavigateToScan,
        disabled: false,
      };
    }

    if (readyCount > 0) {
      const nextTask = tasks.find((t) => t.status === 'ready-to-prepare');
      return {
        title: `Ready: ${nextTask?.title || 'Next Assignment'}`,
        subtitle: 'Open this assignment page in your browser and prepare verified answers.',
        buttonLabel: isProcessingQueue ? 'Preparing...' : 'Prepare Current Tab',
        buttonIcon: <ScanLine size={14} />,
        onClick: () => handlePrepareTask(nextTask),
        disabled: isProcessingQueue,
      };
    }

    return {
      title: 'All Discovered Tasks Completed',
      subtitle: `${completedCount} of ${totalTasks} assignments completed on portal. Rescan outline when new weeks unlock.`,
      buttonLabel: isScanningOutline ? 'Scanning...' : 'Rescan Course Outline',
      buttonIcon: <RefreshCw size={14} className={isScanningOutline ? 'animate-spin' : ''} />,
      onClick: handleScanOutline,
      disabled: isScanningOutline,
    };
  };

  const nextAction = getNextRecommendedAction();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Status Notifications */}
      {statusMessage && (
        <div
          style={{
            fontSize: '11px',
            fontFamily: 'var(--font-body)',
            padding: '10px 14px',
            border: '2px solid #1a1a1a',
            background:
              statusMessage.type === 'error'
                ? '#ffdad6'
                : statusMessage.type === 'warn'
                ? '#ffcc00'
                : '#d6e3ff',
            color: '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '3px 3px 0px #1a1a1a',
          }}
        >
          {statusMessage.type === 'error' || statusMessage.type === 'warn' ? (
            <AlertTriangle
              size={15}
              style={{ flexShrink: 0, color: statusMessage.type === 'error' ? '#cc0000' : '#1a1a1a' }}
            />
          ) : (
            <CheckCircle2 size={15} style={{ flexShrink: 0, color: '#0055ff' }} />
          )}
          <span style={{ fontWeight: 600, lineHeight: 1.4 }}>{statusMessage.text}</span>
        </div>
      )}

      {/* Course Context Header */}
      <div
        className="card"
        style={{
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  background: '#1a1a1a',
                  display: 'inline-block',
                }}
              />
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-headline)',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color: '#4a4a4a',
                  letterSpacing: '0.05em',
                }}
              >
                Course Progress
              </span>
            </div>

            <h2
              style={{
                fontFamily: 'var(--font-headline)',
                fontSize: '16px',
                fontWeight: 800,
                textTransform: 'uppercase',
                color: 'var(--text-main, #1a1a1a)',
                marginTop: '3px',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}
            >
              {selectedCourse.name}
            </h2>

            <div
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-body)',
                color: '#666666',
                marginTop: '2px',
              }}
            >
              {totalTasks > 0
                ? 'Tracked locally via extension task queue'
                : 'No portal outline scanned yet'}
            </div>
          </div>

          <button
            className="btn btn-secondary"
            onClick={() => setIsMappingModalOpen(true)}
            style={{
              fontSize: '10px',
              padding: '5px 10px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <Link2 size={12} />
            {mapping ? 'Mapped' : 'Link Portal'}
          </button>
        </div>

        {/* Portal Course Mapping Info */}
        <div
          style={{
            background: mapping ? '#eef4ff' : '#f2ede5',
            border: '1.5px solid #1a1a1a',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '10px',
            fontFamily: 'var(--font-headline)',
            fontWeight: 700,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                background: mapping ? '#0055ff' : '#888888',
                borderRadius: '50%',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                color: '#1a1a1a',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {mapping
                ? `Portal: "${mapping.portalCourseTitle}"`
                : detectedPortalTitle
                ? `Detected: "${detectedPortalTitle}" (Unmapped)`
                : 'Portal course unmapped — click to link'}
            </span>
          </div>

          {mapping && (
            <span
              style={{
                fontSize: '9px',
                color: '#1a1a1a',
                background: '#ffcc00',
                border: '1px solid #1a1a1a',
                padding: '1px 5px',
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              Isolated
            </span>
          )}
        </div>

        {/* GitHub Answer Bank Integration Card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            border: '1.5px solid #1a1a1a',
            padding: '8px 10px',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Database size={13} style={{ color: '#0055ff' }} />
            <div>
              <div style={{ fontSize: '10px', fontFamily: 'var(--font-headline)', fontWeight: 800, textTransform: 'uppercase' }}>
                GitHub Answer Bank
              </div>
              <div style={{ fontSize: '9px', color: '#666666' }}>
                {readiness?.verifiedAnswersCount ?? 0} verified questions in bank ({readiness?.totalStoredQuestions ?? 0} total)
              </div>
            </div>
          </div>

          <button
            className="btn btn-secondary"
            onClick={handleImportAnswersFromGitHub}
            disabled={isImportingFromGitHub}
            style={{
              fontSize: '10px',
              padding: '4px 8px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: '#ffcc00',
              color: '#1a1a1a',
            }}
            title="Fetches and loads verified answers directly from the GitHub repository into this course's bank"
          >
            <RefreshCw size={10} className={isImportingFromGitHub ? 'animate-spin' : ''} />
            <span>{isImportingFromGitHub ? 'Loading Bank...' : 'Take Answers from GitHub Bank'}</span>
          </button>
        </div>

        {/* Sample Data Warning (if active) */}
        {readiness?.isSampleData && (
          <div
            style={{
              background: '#ffcc00',
              border: '1.5px solid #1a1a1a',
              padding: '6px 10px',
              display: 'flex',
              gap: '6px',
              alignItems: 'center',
              fontSize: '10px',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
            }}
          >
            <AlertTriangle size={13} style={{ flexShrink: 0 }} />
            <span>{readiness.sampleDataWarning}</span>
          </div>
        )}
      </div>

      {/* Progress Indicator Card */}
      <div
        className="card"
        style={{
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-headline)',
              fontWeight: 800,
              textTransform: 'uppercase',
              color: '#1a1a1a',
            }}
          >
            Completion Status
          </span>
          <span
            style={{
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              color: '#1a1a1a',
            }}
          >
            {completedCount} of {totalTasks} Completed · {progressPercent}%
          </span>
        </div>

        {/* Single Simple Progress Bar */}
        <div
          style={{
            width: '100%',
            height: '14px',
            background: '#e5e0d8',
            border: '2px solid #1a1a1a',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: progressPercent === 100 ? '#48c774' : '#ffcc00',
              transition: 'width 0.3s ease',
            }}
          />
        </div>

        {/* Breakdown Summary */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '10px',
            fontFamily: 'var(--font-headline)',
            fontWeight: 700,
            color: '#555555',
            marginTop: '2px',
          }}
        >
          <span>
            {readyCount} ready to prepare
            {attentionCount > 0 ? ` · ${attentionCount} need review` : ''}
          </span>
          <span>{totalTasks - completedCount} pending</span>
        </div>
      </div>

      {/* Course Completion Mode Card */}
      <div
        className="card"
        style={{
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          background: isCourseCompletionActive ? '#f0fdf4' : '#ffffff',
          border: isCourseCompletionActive ? '2px solid #16a34a' : '2px solid #1a1a1a',
          boxShadow: isCourseCompletionActive ? '4px 4px 0px #16a34a' : '4px 4px 0px #1a1a1a',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                background: isCourseCompletionActive ? '#16a34a' : '#888888',
                display: 'inline-block',
                border: '1px solid #1a1a1a',
              }}
            />
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-headline)',
                fontWeight: 800,
                textTransform: 'uppercase',
                color: isCourseCompletionActive ? '#16a34a' : '#1a1a1a',
                letterSpacing: '0.05em',
              }}
            >
              Course Completion Mode
            </span>
          </div>

          <span
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              padding: '2px 8px',
              border: '1.5px solid #1a1a1a',
              background: isCourseCompletionActive ? '#22c55e' : '#e5e7eb',
              color: isCourseCompletionActive ? '#ffffff' : '#1a1a1a',
              textTransform: 'uppercase',
            }}
          >
            {isCourseCompletionActive ? '100% Active' : 'Off'}
          </span>
        </div>

        <p
          style={{
            fontSize: '11px',
            fontFamily: 'var(--font-body)',
            color: '#4b5563',
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          Injects green checkmarks on every unit, quiz, video, and assignment block across all weeks on the SWAYAM portal.
        </p>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className={isCourseCompletionActive ? 'btn btn-secondary' : 'btn btn-primary'}
            onClick={handleToggleCourseCompletionMode}
            style={{
              flex: 1,
              fontSize: '11px',
              fontWeight: 800,
              padding: '8px 12px',
              background: isCourseCompletionActive ? '#fee2e2' : '#22c55e',
              color: isCourseCompletionActive ? '#991b1b' : '#ffffff',
              borderColor: isCourseCompletionActive ? '#991b1b' : '#1a1a1a',
            }}
          >
            <CheckCircle2 size={13} />
            {isCourseCompletionActive ? 'Disable Completion Mode' : 'Enable Completion Mode'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleApplyCheckmarksToPortal}
            disabled={isApplyingCheckmarks}
            style={{
              fontSize: '11px',
              fontWeight: 800,
              padding: '8px 12px',
              whiteSpace: 'nowrap',
            }}
            title="Applies green checkmark SVGs directly into the live SWAYAM course outline sidebar."
          >
            <Sparkles size={13} />
            {isApplyingCheckmarks ? 'Applying...' : 'Apply to Portal'}
          </button>
        </div>
      </div>

      {/* Next Recommended Action — One Prominent Primary Panel */}
      <div
        style={{
          background: '#ffffff',
          border: '2px solid #1a1a1a',
          boxShadow: '4px 4px 0px #1a1a1a',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-headline)',
                fontWeight: 800,
                textTransform: 'uppercase',
                color: '#666666',
                letterSpacing: '0.05em',
              }}
            >
              Next Recommended Step
            </div>
            <div
              style={{
                fontSize: '13px',
                fontFamily: 'var(--font-headline)',
                fontWeight: 800,
                color: '#1a1a1a',
                marginTop: '2px',
              }}
            >
              {nextAction.title}
            </div>
          </div>

          {nextAction.canDismiss && (
            <button
              onClick={handleClearCheckpoint}
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-headline)',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: '#666666',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Dismiss
            </button>
          )}
        </div>

        <p
          style={{
            fontSize: '11px',
            fontFamily: 'var(--font-body)',
            color: '#444444',
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {nextAction.subtitle}
        </p>

        <button
          className="btn btn-primary"
          onClick={nextAction.onClick}
          disabled={nextAction.disabled}
          style={{
            width: '100%',
            padding: '11px 16px',
            fontSize: '12px',
            justifyContent: 'center',
            marginTop: '2px',
          }}
        >
          {nextAction.buttonIcon}
          <span>{nextAction.buttonLabel}</span>
          <ArrowRight size={14} style={{ marginLeft: 'auto' }} />
        </button>
      </div>

      {/* Quiet Secondary Utility Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '2px 0',
        }}
      >
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className="btn btn-secondary"
            onClick={handleScanOutline}
            disabled={isScanningOutline}
            style={{ fontSize: '10px', padding: '6px 10px' }}
            title="Rescan syllabus assignments from active portal tab"
          >
            <RefreshCw size={11} className={isScanningOutline ? 'animate-spin' : ''} />
            Rescan Outline
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleCaptureFeedback}
            disabled={isCapturing}
            style={{ fontSize: '10px', padding: '6px 10px' }}
            title="Capture answers revealed in submitted assignment feedback"
          >
            <ShieldCheck size={11} className={isCapturing ? 'animate-spin' : ''} />
            Capture Graded
          </button>
        </div>

        {totalTasks > 0 && (
          <button
            onClick={handleClearQueue}
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-headline)',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#888888',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: '4px',
            }}
            title="Clear all tasks and checkpoint for this course"
          >
            Clear Queue
          </button>
        )}
      </div>

      {/* Incomplete Weeks & Quizzes Approval Section */}
      <div
        className="card"
        style={{
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          background: incompleteTasks.length > 0 ? '#fffbeb' : '#f0fdf4',
          border: incompleteTasks.length > 0 ? '2px solid #d97706' : '2px solid #16a34a',
          boxShadow: incompleteTasks.length > 0 ? '4px 4px 0px #d97706' : '4px 4px 0px #16a34a',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle
              size={16}
              style={{ color: incompleteTasks.length > 0 ? '#d97706' : '#16a34a' }}
            />
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-headline)',
                fontWeight: 800,
                textTransform: 'uppercase',
                color: incompleteTasks.length > 0 ? '#92400e' : '#16a34a',
                letterSpacing: '0.05em',
              }}
            >
              Incomplete Weeks & Quizzes ({incompleteTasks.length} Pending)
            </span>
          </div>

          {incompleteTasks.length > 0 && (
            <button
              className="btn btn-primary"
              onClick={handleApproveAllIncomplete}
              disabled={isProcessingQueue}
              style={{
                fontSize: '10px',
                padding: '4px 10px',
                background: '#16a34a',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <CheckCircle2 size={12} />
              Approve All ({incompleteTasks.length})
            </button>
          )}
        </div>

        <p
          style={{
            fontSize: '11px',
            fontFamily: 'var(--font-body)',
            color: '#4b5563',
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {incompleteTasks.length > 0
            ? 'A course is only complete when its quiz has verified options chosen and submitted. Below are all units currently missing green checkmarks or unsubmitted. Approve each to automatically tick verified answers in the portal.'
            : 'All discovered course units and quizzes are fully completed and verified! Green checkmarks confirmed.'}
        </p>

        {incompleteTasks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            {incompleteTasks.map((task) => (
              <div
                key={task.id}
                style={{
                  background: '#ffffff',
                  border: '1.5px solid #1a1a1a',
                  padding: '10px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      color: '#b45309',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}
                  >
                    {task.unitTitle || 'Week Unit'} · Incomplete (0 Options Ticked)
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 800,
                      fontFamily: 'var(--font-headline)',
                      color: '#1a1a1a',
                      marginTop: '2px',
                    }}
                  >
                    {task.title}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {task.url && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        if (typeof chrome !== 'undefined' && chrome.tabs) {
                          chrome.tabs.create({ url: task.url });
                        } else {
                          window.open(task.url, '_blank');
                        }
                      }}
                      style={{ fontSize: '10px', padding: '4px 8px' }}
                    >
                      Open
                    </button>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={() => handleApproveAndSolveTask(task)}
                    disabled={isProcessingQueue}
                    style={{
                      fontSize: '10px',
                      padding: '5px 10px',
                      background: '#16a34a',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <CheckCircle2 size={12} />
                    Approve & Solve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Task Queue List View */}
      {totalTasks > 0 ? (
        <TaskQueueView
          tasks={displayedTasks}
          activeTaskId={checkpoint?.activeTaskId}
          onPrepareTask={handlePrepareTask}
          onApproveTask={handleApproveAndSolveTask}
          onNavigateToReview={onNavigateToScan}
          isProcessing={isProcessingQueue}
        />
      ) : (

        <div
          className="card"
          style={{
            padding: '28px 16px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Layers size={24} style={{ color: '#1a1a1a' }} />
          <div
            style={{
              fontSize: '12px',
              fontWeight: 800,
              fontFamily: 'var(--font-headline)',
              textTransform: 'uppercase',
              color: '#1a1a1a',
            }}
          >
            No Course Tasks Discovered
          </div>
          <div
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-body)',
              color: '#666666',
              maxWidth: '300px',
              lineHeight: 1.4,
            }}
          >
            Open your course portal on SWAYAM/NPTEL and click{' '}
            <strong>Scan Course Outline</strong> to parse assignments and quizzes into this queue.
          </div>
        </div>
      )}

      {/* Zero Auto-Submit Guarantee Reminder */}
      <div
        style={{
          background: '#f2ede5',
          border: '1.5px solid #1a1a1a',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          padding: '8px 12px',
          fontSize: '10px',
          fontFamily: 'var(--font-body)',
          color: '#555555',
        }}
      >
        <ShieldCheck size={14} style={{ color: '#1a1a1a', flexShrink: 0 }} />
        <span>
          <strong>Manual Submit Safeguard:</strong> The extension only fills preview inputs. Portal
          final submission is never automated.
        </span>
      </div>

      {/* Course Mapping Modal */}
      {isMappingModalOpen && (
        <CourseMappingModal
          isOpen={isMappingModalOpen}
          onClose={() => setIsMappingModalOpen(false)}
          portalCourseTitle={detectedPortalTitle || selectedCourse.name}
          externalCourseId={detectedExternalId}
          courses={courses}
          currentMapping={mapping}
          onSaveMapping={handleSaveMapping}
        />
      )}

      {/* Answer Capture Preview Modal */}
      {isCaptureModalOpen && captureData && (
        <CapturePreviewModal
          isOpen={isCaptureModalOpen}
          onClose={() => setIsCaptureModalOpen(false)}
          capturedRecords={captureData.capturedRecords}
          portalCourseTitle={captureData.portalCourseTitle}
          externalCourseId={captureData.externalCourseId}
          assignmentTitle={captureData.assignmentTitle}
          unitTitle={captureData.unitTitle}
          courses={courses}
          selectedCourseId={selectedCourse.id}
          onSaveSuccess={async (stats) => {
            showStatus(
              `Saved ${stats.saved} new, updated ${stats.duplicates} existing, flagged ${stats.conflicts} conflict(s).`,
              'success'
            );
            await loadCourseData();
            if (onRefreshData) {
              await onRefreshData();
            }
          }}
        />
      )}
    </div>
  );
};
