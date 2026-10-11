import React, { useState, useEffect } from 'react';
import {
  QuestionMatchResult,
  PopulationTarget,
  PopulationSummary,
  Course,
  QuestionRecord,
  ScanResultMessage,
  PopulateResultMessage,
  CaptureFeedbackResultMessage,
  ActiveScanSession,
  ScanHistoryRecord,
  PortalTabInfo,
  SubmissionStatus,
} from '@/types';
import { pageConnectionService, PageConnectionService } from '@/lib/connection/pageConnection';
import { StorageService } from '@/lib/storage';
import {
  networkDiagnostics,
  NetworkDiagnosis,
} from '@/lib/connection/networkDiagnostics';
import {
  AnswerResolutionPipeline,
} from '@/lib/orchestration/answerResolutionPipeline';
import {
  pipelineTracer,
  PipelineDiagnosticReport,
  PipelineStepTrace,
} from '@/lib/orchestration/pipelineDiagnostics';
import { CapturePreviewModal } from '@/features/answer-bank/CapturePreviewModal';
import { ChatGptBridgeService } from '@/lib/ai/chatgptBridge';
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Activity,
  Download,
  Copy,
  ExternalLink,
  History,
  Trash2,
  X,
  Zap,
  Wifi,
  WifiOff,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ScannerTabProps {
  courses?: Course[];
  selectedCourse: Course | undefined;
  portalInfo?: PortalTabInfo | null;
  answerBank: QuestionRecord[];
  results: QuestionMatchResult[];
  setResults: React.Dispatch<React.SetStateAction<QuestionMatchResult[]>>;
  onRefreshData?: () => Promise<void>;
  onSelectCourse?: (id: string) => void;
}

export const ScannerTab: React.FC<ScannerTabProps> = ({
  courses = [],
  selectedCourse,
  portalInfo,
  answerBank,
  results,
  setResults,
  onRefreshData,
  onSelectCourse,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [selectedQIds, setSelectedQIds] = useState<Set<string>>(new Set());
  const [isCapturing, setIsCapturing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [pageInfo, setPageInfo] = useState<{ title?: string; url?: string } | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Internet connectivity & network diagnostics state
  const [netDiagnosis, setNetDiagnosis] = useState<NetworkDiagnosis>(
    networkDiagnostics.getCurrentDiagnosis()
  );

  // Week and Submission state
  const [detectedWeek, setDetectedWeek] = useState<string | undefined>(
    portalInfo?.detectedWeek
  );
  const [scannedWeek, setScannedWeek] = useState<string | undefined>(
    portalInfo?.detectedWeek
  );
  const [scannedTitle, setScannedTitle] = useState<string | undefined>(
    portalInfo?.detectedAssignmentTitle
  );
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus | undefined>(
    portalInfo?.submissionStatus
  );
  const [isAlreadySubmitted, setIsAlreadySubmitted] = useState<boolean>(
    Boolean(portalInfo?.isAlreadySubmitted)
  );
  const [expandedEvidenceQIds, setExpandedEvidenceQIds] = useState<Set<string>>(new Set());

  const toggleEvidence = (qId: string) => {
    setExpandedEvidenceQIds((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) {
        next.delete(qId);
      } else {
        next.add(qId);
      }
      return next;
    });
  };

  useEffect(() => {
    return networkDiagnostics.subscribe(setNetDiagnosis);
  }, []);

  useEffect(() => {
    if (portalInfo?.detectedWeek) {
      setDetectedWeek(portalInfo.detectedWeek);
    }
    if (portalInfo?.submissionStatus) {
      setSubmissionStatus(portalInfo.submissionStatus);
    }
    if (portalInfo?.isAlreadySubmitted !== undefined) {
      setIsAlreadySubmitted(portalInfo.isAlreadySubmitted);
    }
  }, [portalInfo]);

  // Determine if active portal has navigated to a different week or quiz than what is currently scanned
  const isWeekOrQuizSwitched =
    results.length > 0 &&
    Boolean(portalInfo?.isSwayam) &&
    PageConnectionService.isAssignmentOrWeekDifferent(
      {
        url: pageInfo?.url,
        detectedWeek: scannedWeek || detectedWeek,
        assignmentTitle: scannedTitle || pageInfo?.title,
      },
      portalInfo
    );

  // Scan history state
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanHistoryRecord[]>([]);

  const loadHistory = async () => {
    try {
      const historyList = await StorageService.getScanHistory();
      setScanHistory(historyList);
    } catch {
      // Non-blocking
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Synchronize active tab context on mount
  useEffect(() => {
    const fetchActiveTabInfo = async () => {
      try {
        const tabCheck = await PageConnectionService.getActiveTab();
        if (tabCheck.isSupported && tabCheck.tab) {
          setPageInfo((prev) => prev || {
            title: tabCheck.tab?.title || 'Active SWAYAM / NPTEL Tab',
            url: tabCheck.url,
          });
        }
      } catch {
        // Not in extension context
      }
    };
    fetchActiveTabInfo();
  }, []);

  // Auto-persist active scan session and update history so switching tabs never resets state
  useEffect(() => {
    if (results.length > 0) {
      const sessionData: ActiveScanSession = {
        url: pageInfo?.url,
        pageTitle: pageInfo?.title || 'Assignment Page',
        courseId: effectiveCourse.id,
        courseTitle: effectiveCourse.name,
        assignmentTitle: pageInfo?.title,
        detectedWeek: scannedWeek || detectedWeek || portalInfo?.detectedWeek,
        detectedWeekNumber: portalInfo?.detectedWeekNumber,
        isAlreadySubmitted,
        submissionStatus,
        results,
        savedAt: new Date().toISOString(),
      };
      StorageService.saveActiveScanSession(sessionData);

      const approvedCount = results.filter((r) => r.isApproved).length;
      StorageService.saveScanHistory({
        id: pageInfo?.url || `scan-${effectiveCourse.id}-${results.length}`,
        url: pageInfo?.url,
        pageTitle: pageInfo?.title || 'Assignment Page',
        courseId: effectiveCourse.id,
        courseTitle: effectiveCourse.name,
        assignmentTitle: pageInfo?.title || `${effectiveCourse.name} Assignment`,
        detectedWeek: scannedWeek || detectedWeek || portalInfo?.detectedWeek,
        isAlreadySubmitted,
        totalQuestions: results.length,
        approvedCount,
        results,
        timestamp: new Date().toISOString(),
      }).then(() => loadHistory());
    }
  }, [results, pageInfo?.url, pageInfo?.title, selectedCourse?.id, selectedCourse?.name, scannedWeek, detectedWeek, portalInfo?.detectedWeek, portalInfo?.detectedWeekNumber, isAlreadySubmitted, submissionStatus]);

  // Capture preview modal state
  const [captureData, setCaptureData] = useState<CaptureFeedbackResultMessage | null>(null);
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);

  // Diagnostics modal state
  const [isDiagnosticsModalOpen, setIsDiagnosticsModalOpen] = useState(false);
  const [lastTracerReport, setLastTracerReport] = useState<PipelineDiagnosticReport | null>(null);
  const [diagnosticsFilterQ, setDiagnosticsFilterQ] = useState<string>('all');

  // Population execution state
  const [isPopulating, setIsPopulating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [popSummary, setPopSummary] = useState<PopulationSummary | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 5000);
  };

  // Safe effective course
  const effectiveCourse: Course = selectedCourse || {
    id: 'default',
    name: 'General Assignment',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Clear active scan session to start fresh
  const handleClearActiveScan = async () => {
    setResults([]);
    setSelectedQIds(new Set());
    setScannedWeek(undefined);
    setScannedTitle(undefined);
    await StorageService.clearActiveScanSession();
    showNotification('Scan session cleared. You can start fresh or resume from History.');
  };

  // Restore previous assignment scan from History
  const handleRestoreHistoryItem = async (item: ScanHistoryRecord) => {
    setResults(item.results);
    setSelectedQIds(new Set());
    setScannedWeek(item.detectedWeek);
    setScannedTitle(item.assignmentTitle);
    if (item.url || item.assignmentTitle) {
      setPageInfo({
        title: item.assignmentTitle,
        url: item.url,
      });
    }
    await StorageService.saveActiveScanSession({
      url: item.url,
      pageTitle: item.assignmentTitle,
      courseId: item.courseId,
      courseTitle: item.courseTitle,
      assignmentTitle: item.assignmentTitle,
      detectedWeek: item.detectedWeek,
      isAlreadySubmitted: item.isAlreadySubmitted,
      results: item.results,
      savedAt: new Date().toISOString(),
    });
    setIsHistoryModalOpen(false);
    showNotification(`✓ Restored "${item.assignmentTitle}" (${item.totalQuestions} questions)`);
  };

  // 1. Scan Questions (Stage A & B historical retrieval, skip LLM for initial inspection)
  const handleScan = async () => {
    setIsScanning(true);
    setScanError(null);
    setPopSummary(null);

    try {
      const response = await pageConnectionService.queryTab<ScanResultMessage>({
        type: 'SCAN_ASSIGNMENT',
      });

      if (!response.questions || response.questions.length === 0) {
        throw new Error('Assignment page detected, but no recognizable question containers were found.');
      }

      setPageInfo({
        title: response.detectedAssignmentTitle || response.pageTitle || 'Assignment Page',
        url: response.url,
      });

      const settings = await StorageService.getSettings();
      const materials = selectedCourse ? await StorageService.getCourseMaterials(selectedCourse.id) : [];

      const resolution = await AnswerResolutionPipeline.resolveAssignment({
        questions: response.questions,
        selectedCourse: effectiveCourse,
        answerBank,
        materials,
        settings,
        skipLlm: true,
      });

      setResults(resolution.results);
      setSelectedQIds(new Set());
      setLastTracerReport(resolution.tracerReport);
      if (response.detectedWeek) {
        setDetectedWeek(response.detectedWeek);
        setScannedWeek(response.detectedWeek);
      }
      setScannedTitle(response.detectedAssignmentTitle || response.pageTitle);
      if (response.submissionStatus) {
        setSubmissionStatus(response.submissionStatus);
      }
      if (response.isAlreadySubmitted !== undefined) {
        setIsAlreadySubmitted(response.isAlreadySubmitted);
      }

      if (response.isAlreadySubmitted) {
        showNotification(
          `🏁 Assignment is already submitted on SWAYAM (${response.submissionStatus?.scoreText || 'Completed'}). Inputs are locked. Use "Capture Graded Feedback" to save answers.`
        );
      } else if (answerBank.length === 0) {
        showNotification(
          `Scanned ${resolution.results.length} questions. Answer bank is empty: click "Prepare Quiz" or "Analyze All with AI" to generate suggestions.`
        );
      } else {
        showNotification(
          `Scanned ${resolution.results.length} questions. Found ${resolution.summary.portalConfirmed} confirmed match(es).`
        );
      }
    } catch (err) {
      const diag = networkDiagnostics.diagnoseFailure(err, 'assignment scan');
      if (!diag.isOnline) {
        setScanError(`Offline: ${diag.message} Local answer bank and notes remain operational.`);
      } else {
        setScanError((err as Error).message || 'Failed to scan active tab.');
      }
    } finally {
      setIsScanning(false);
    }
  };

  // 2. Capture Correct Answers from submitted assignment feedback
  const handleCaptureFeedback = async () => {
    setIsCapturing(true);
    setScanError(null);

    try {
      const response = await pageConnectionService.queryTab<CaptureFeedbackResultMessage>({
        type: 'CAPTURE_ASSIGNMENT_FEEDBACK',
      });

      if (!response.capturedRecords || response.capturedRecords.length === 0) {
        throw new Error(
          'No visible questions or feedback containers found on this tab. Make sure the assignment has been submitted and feedback is displayed.'
        );
      }

      setCaptureData(response);
      setIsCaptureModalOpen(true);
    } catch (err) {
      setScanError((err as Error).message || 'Failed to capture assignment feedback.');
    } finally {
      setIsCapturing(false);
    }
  };

  // Toggle approval checkbox
  const handleToggleApproval = (idx: number) => {
    setResults((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], isApproved: !copy[idx].isApproved };
      return copy;
    });
  };

  // Manual choice override
  const handleOptionSelect = (qIdx: number, optionText: string) => {
    setResults((prev) => {
      const copy = [...prev];
      const current = copy[qIdx];
      const isMulti = current.scannedQuestion.questionType === 'multiple-choice';

      let newAnswers: string[];
      if (isMulti) {
        const existing = current.proposedAnswers || [];
        if (existing.includes(optionText)) {
          newAnswers = existing.filter((a) => a !== optionText);
        } else {
          newAnswers = [...existing, optionText];
        }
      } else {
        newAnswers = [optionText];
      }

      copy[qIdx] = {
        ...current,
        proposedAnswers: newAnswers,
        isApproved: newAnswers.length > 0,
      };
      return copy;
    });
  };

  // Manual text answer override
  const handleTextAnswerChange = (qIdx: number, text: string) => {
    setResults((prev) => {
      const copy = [...prev];
      copy[qIdx] = {
        ...copy[qIdx],
        proposedAnswers: text ? [text] : [],
        isApproved: !!text.trim(),
      };
      return copy;
    });
  };

  const handleDeselectAll = () => {
    setSelectedQIds(new Set());
  };

  // Batch answer approval: approves all valid proposed answers
  const handleApproveAllEligible = () => {
    setResults((prev) =>
      prev.map((r) =>
        r.proposedAnswers.length > 0 && r.resolutionState !== 'ambiguous' && r.resolutionState !== 'provider-error'
          ? { ...r, isApproved: true }
          : r
      )
    );
  };

  // Only approved, eligible answers are populated into active tab DOM
  const approvedFillItems = results.filter(
    (r) =>
      r.isApproved &&
      r.proposedAnswers.length > 0 &&
      r.resolutionState !== 'ambiguous' &&
      r.resolutionState !== 'provider-error' &&
      r.resolutionState !== 'unresolved'
  );
  const approvedFillCount = approvedFillItems.length;

  const handleExecutePopulate = async () => {
    setShowConfirmModal(false);
    if (isAlreadySubmitted || submissionStatus?.isSubmitted) {
      setScanError(
        'Cannot populate answers: Assignment has already been completed on SWAYAM. Portal form controls are locked.'
      );
      return;
    }

    setIsPopulating(true);

    try {
      if (approvedFillItems.length === 0) {
        throw new Error('No approved answers selected for population.');
      }

      const targets: PopulationTarget[] = approvedFillItems.map((r) => ({
        questionId: r.scannedQuestion.id,
        questionText: r.scannedQuestion.questionText,
        questionType: r.scannedQuestion.questionType,
        selectedAnswers: r.proposedAnswers,
        options: r.scannedQuestion.options,
      }));

      const response = await pageConnectionService.queryTab<PopulateResultMessage>({
        type: 'POPULATE_ANSWERS',
        targets,
      });

      if (response && response.summary) {
        setPopSummary(response.summary);
      }
    } catch (err) {
      setScanError(`Population error: ${(err as Error).message}`);
    } finally {
      setIsPopulating(false);
    }
  };

  // Web AI Bridge state (ChatGPT Web / Claude Web)
  const [webAiPastedText, setWebAiPastedText] = useState('');
  const [isWebAiPanelOpen, setIsWebAiPanelOpen] = useState(false);
  const [copiedPromptFeedback, setCopiedPromptFeedback] = useState(false);
  const [webAiError, setWebAiError] = useState<string | null>(null);
  const [isApplyingWebAi, setIsApplyingWebAi] = useState(false);

  // Copy 1-Click Prompt for Web AI (ChatGPT Web / Claude Web)
  const handleCopyWebAiPrompt = async () => {
    if (results.length === 0) return;
    const questionsToPrompt =
      selectedQIds.size > 0
        ? results.filter((r) => selectedQIds.has(r.scannedQuestion.id)).map((r) => r.scannedQuestion)
        : results.map((r) => r.scannedQuestion);

    const promptText = ChatGptBridgeService.buildPrompt({
      questions: questionsToPrompt,
      courseName: effectiveCourse.name,
      assignmentTitle: pageInfo?.title,
    });

    const copied = await ChatGptBridgeService.copyToClipboard(promptText);
    if (copied) {
      setCopiedPromptFeedback(true);
      setTimeout(() => setCopiedPromptFeedback(false), 4000);
      showNotification(`✓ Prompt for ${questionsToPrompt.length} questions copied to clipboard!`);

      // Store in chrome.storage.local for content script sync
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({
          pendingChatGptPrompt: promptText,
          pendingQuestionsCount: questionsToPrompt.length,
        });
      }
    } else {
      showNotification('Could not copy automatically. Please open import view to copy.');
    }
  };

  // Open ChatGPT Web in new tab with auto-prepared prompt
  const handleOpenChatGptWeb = async () => {
    if (!netDiagnosis.isOnline) {
      showNotification('⚠️ You are offline. Cannot open external ChatGPT. Please reconnect to Wi-Fi.');
      return;
    }
    if (results.length > 0) {
      await handleCopyWebAiPrompt();
    }
    await ChatGptBridgeService.openChatGptTab('https://chatgpt.com/');
  };

  // ⚡ 1-Click Master Auto-Pilot Loop: Scan -> ChatGPT -> Solve -> Fill
  const handleAutoPilotFlow = async () => {
    if (isAlreadySubmitted || submissionStatus?.isSubmitted) {
      showNotification(
        '🏁 This assignment is already submitted on SWAYAM. Auto-fill is locked. Launching Feedback Capture...'
      );
      handleCaptureFeedback();
      return;
    }

    if (!netDiagnosis.isOnline) {
      showNotification(
        '⚠️ Internet issue: Device is offline. External AI is unavailable. You can review with local answer bank.'
      );
      return;
    }

    setIsScanning(true);
    showNotification('⚡ Auto-Pilot: Scanning assignment questions...');
    try {
      let currentResults = results;
      if (currentResults.length === 0) {
        const response = await pageConnectionService.queryTab<ScanResultMessage>({
          type: 'SCAN_ASSIGNMENT',
        });

        if (response.detectedWeek) {
          setDetectedWeek(response.detectedWeek);
        }
        if (response.submissionStatus) {
          setSubmissionStatus(response.submissionStatus);
        }
        if (response.isAlreadySubmitted !== undefined) {
          setIsAlreadySubmitted(response.isAlreadySubmitted);
        }

        if (response.isAlreadySubmitted) {
          showNotification('🏁 Assignment is already submitted on portal. Capturing feedback...');
          handleCaptureFeedback();
          return;
        }

        if (!response.questions || response.questions.length === 0) {
          throw new Error('Assignment page detected, but no recognizable question containers were found.');
        }

        setPageInfo({
          title: response.detectedAssignmentTitle || response.pageTitle || 'Assignment Page',
          url: response.url,
        });

        const settings = await StorageService.getSettings();
        const materials = selectedCourse ? await StorageService.getCourseMaterials(selectedCourse.id) : [];

        const resolution = await AnswerResolutionPipeline.resolveAssignment({
          questions: response.questions,
          selectedCourse: effectiveCourse,
          answerBank,
          materials,
          settings,
          skipLlm: true,
        });

        currentResults = resolution.results;
        setResults(currentResults);
      }

      if (currentResults.length === 0) {
        throw new Error('No questions found to solve.');
      }

      const questionsToPrompt = currentResults.map((r) => r.scannedQuestion);
      const promptText = ChatGptBridgeService.buildPrompt({
        questions: questionsToPrompt,
        courseName: effectiveCourse.name,
        assignmentTitle: pageInfo?.title,
      });

      await ChatGptBridgeService.copyToClipboard(promptText);

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        let activeTabId: number | undefined;
        let activeTabUrl: string | undefined;
        try {
          const tabCheck = await PageConnectionService.getActiveTab();
          activeTabId = tabCheck.tab?.id;
          activeTabUrl = tabCheck.url;
        } catch {}

        await chrome.storage.local.set({
          pendingChatGptPrompt: promptText,
          pendingQuestionsCount: questionsToPrompt.length,
          autoPilotActive: true,
          swayam_pilot_context: {
            tabId: activeTabId,
            url: activeTabUrl,
            timestamp: Date.now(),
          },
        });
      }

      showNotification(`⚡ Auto-Pilot: Questions copied! Opening ChatGPT to solve...`);
      await ChatGptBridgeService.openChatGptTab('https://chatgpt.com/');
    } catch (err) {
      showNotification(`Auto-Pilot Error: ${(err as Error).message}`);
    } finally {
      setIsScanning(false);
    }
  };

  // 1-Click Paste from Clipboard & Auto-Mark Page Inputs
  const handlePasteFromClipboardAndApply = async () => {
    setIsApplyingWebAi(true);
    setWebAiError(null);
    try {
      let clipboardText = '';
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        try {
          clipboardText = await navigator.clipboard.readText();
        } catch {
          // Clipboard permission denied or unavailable
        }
      }

      const textToUse = clipboardText.trim() || webAiPastedText.trim();
      if (!textToUse) {
        setIsWebAiPanelOpen(true);
        throw new Error('Clipboard is empty. Please copy ChatGPT or Claude answers first, or paste into the box below.');
      }

      const allQuestions = results.map((r) => r.scannedQuestion);
      const parsed = ChatGptBridgeService.parseResponse(textToUse, allQuestions);

      if (!parsed.success || parsed.matchedCount === 0) {
        setIsWebAiPanelOpen(true);
        throw new Error(
          parsed.errors[0] ||
            'Could not match options. Ensure response contains numbered answers (e.g. "1. B" or "Question 1: Option A") or JSON.'
        );
      }

      const merged = ChatGptBridgeService.mergeImportedAnswers(results, parsed);
      // Auto-approve newly imported answers
      const autoApproved = merged.updatedResults.map((r) =>
        r.resolutionState === 'chatgpt-suggested' && r.proposedAnswers.length > 0
          ? { ...r, isApproved: true }
          : r
      );
      setResults(autoApproved);
      setWebAiPastedText('');
      setIsWebAiPanelOpen(false);

      // Immediately mark all radio buttons / checkboxes on the SWAYAM page!
      const approvedFillItems = autoApproved.filter((r) => r.isApproved && r.proposedAnswers.length > 0);
      if (approvedFillItems.length > 0) {
        const targets: PopulationTarget[] = approvedFillItems.map((r) => ({
          questionId: r.scannedQuestion.id,
          questionText: r.scannedQuestion.questionText,
          questionType: r.scannedQuestion.questionType,
          selectedAnswers: r.proposedAnswers,
          options: r.scannedQuestion.options,
        }));

        try {
          const popRes = await pageConnectionService.queryTab<PopulateResultMessage>({
            type: 'POPULATE_ANSWERS',
            targets,
          });
          if (popRes && popRes.summary) {
            setPopSummary(popRes.summary);
            showNotification(
              `🎉 All ${popRes.summary.succeeded} of ${targets.length} answers marked on SWAYAM! Review choices and click Submit.`
            );
          }
        } catch (fillErr) {
          showNotification(
            `✓ Applied & approved ${merged.mergedCount} answers! Click "Fill Reviewed Answers" to populate: ${(fillErr as Error).message}`
          );
        }
      } else {
        showNotification(
          `✓ Applied & approved ${merged.mergedCount} answers from Web AI! Ready to fill. (${merged.protectedCount} verified answers preserved)`
        );
      }
    } catch (err) {
      setWebAiError((err as Error).message);
    } finally {
      setIsApplyingWebAi(false);
    }
  };

  // Apply Pasted Response Text & Auto-Mark Page Inputs
  const handleApplyPastedText = async () => {
    if (!webAiPastedText.trim()) return;
    setIsApplyingWebAi(true);
    setWebAiError(null);

    try {
      let currentResults = results;
      if (currentResults.length === 0) {
        try {
          const scanResp = await pageConnectionService.queryTab<ScanResultMessage>({
            type: 'SCAN_ASSIGNMENT',
          });
          if (scanResp?.questions && scanResp.questions.length > 0) {
            currentResults = scanResp.questions.map((q) => ({
              scannedQuestion: q,
              status: 'no-match',
              confidence: 0,
              reasons: ['Initial scan for Web AI auto-solve'],
              requiresReview: true,
              proposedAnswers: [],
              resolutionState: 'unresolved',
              isApproved: false,
            }));
          }
        } catch {}
      }

      const allQuestions = currentResults.map((r) => r.scannedQuestion);
      const parsed = ChatGptBridgeService.parseResponse(webAiPastedText, allQuestions);

      if (!parsed.success || parsed.matchedCount === 0) {
        throw new Error(
          parsed.errors[0] ||
            'Could not match options. Ensure response contains numbered answers (e.g. "1. B") or JSON.'
        );
      }

      const merged = ChatGptBridgeService.mergeImportedAnswers(currentResults, parsed);
      const autoApproved = merged.updatedResults.map((r) =>
        r.resolutionState === 'chatgpt-suggested' && r.proposedAnswers.length > 0
          ? { ...r, isApproved: true }
          : r
      );
      setResults(autoApproved);
      setWebAiPastedText('');
      setIsWebAiPanelOpen(false);

      // Immediately mark all radio buttons / checkboxes on the page!
      const approvedFillItems = autoApproved.filter((r) => r.isApproved && r.proposedAnswers.length > 0);
      if (approvedFillItems.length > 0) {
        const targets: PopulationTarget[] = approvedFillItems.map((r) => ({
          questionId: r.scannedQuestion.id,
          questionText: r.scannedQuestion.questionText,
          questionType: r.scannedQuestion.questionType,
          selectedAnswers: r.proposedAnswers,
          options: r.scannedQuestion.options,
        }));

        try {
          const popRes = await pageConnectionService.queryTab<PopulateResultMessage>({
            type: 'POPULATE_ANSWERS',
            targets,
          });
          if (popRes && popRes.summary) {
            setPopSummary(popRes.summary);
            showNotification(
              `🎉 All ${popRes.summary.succeeded} of ${targets.length} answers marked on SWAYAM! Review choices and click Submit.`
            );
          }
        } catch (fillErr) {
          showNotification(
            `✓ Applied & approved ${merged.mergedCount} answers! Click "Fill Reviewed Answers" to populate: ${(fillErr as Error).message}`
          );
        }
      } else {
        showNotification(
          `✓ Applied & approved ${merged.mergedCount} answers from Web AI! Ready to fill. (${merged.protectedCount} verified answers preserved)`
        );
      }
    } catch (err) {
      setWebAiError((err as Error).message);
    } finally {
      setIsApplyingWebAi(false);
    }
  };

  // Listen to chrome.storage for automated ChatGPT / Claude tab sync
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === 'local' && changes.swayam_chatgpt_sync?.newValue) {
          const syncedText = changes.swayam_chatgpt_sync.newValue;
          if (typeof syncedText === 'string' && syncedText.trim()) {
            (async () => {
              let currentResults = results;
              if (currentResults.length === 0) {
                try {
                  const scanResp = await pageConnectionService.queryTab<ScanResultMessage>({
                    type: 'SCAN_ASSIGNMENT',
                  });
                  if (scanResp?.questions && scanResp.questions.length > 0) {
                    currentResults = scanResp.questions.map((q) => ({
                      scannedQuestion: q,
                      status: 'no-match',
                      confidence: 0,
                      reasons: ['Initial scan for Web AI auto-solve'],
                      requiresReview: true,
                      proposedAnswers: [],
                      resolutionState: 'unresolved',
                      isApproved: false,
                    }));
                  }
                } catch {}
              }

              if (currentResults.length === 0) {
                showNotification('⚠️ Answers received from Web AI, but no questions scanned. Click "Scan Assignment" first!');
                chrome.storage.local.remove('swayam_chatgpt_sync');
                return;
              }

              const allQuestions = currentResults.map((r) => r.scannedQuestion);
              const parsed = ChatGptBridgeService.parseResponse(syncedText, allQuestions);
              if (parsed.success && parsed.matchedCount > 0) {
                const merged = ChatGptBridgeService.mergeImportedAnswers(currentResults, parsed);
                const autoApproved = merged.updatedResults.map((r) =>
                  r.resolutionState === 'chatgpt-suggested' && r.proposedAnswers.length > 0
                    ? { ...r, isApproved: true }
                    : r
                );
                setResults(autoApproved);

                // Auto-fill into SWAYAM page inputs!
                const approvedFillItems = autoApproved.filter((r) => r.isApproved && r.proposedAnswers.length > 0);
                if (approvedFillItems.length > 0) {
                  const targets: PopulationTarget[] = approvedFillItems.map((r) => ({
                    questionId: r.scannedQuestion.id,
                    questionText: r.scannedQuestion.questionText,
                    questionType: r.scannedQuestion.questionType,
                    selectedAnswers: r.proposedAnswers,
                    options: r.scannedQuestion.options,
                  }));

                  pageConnectionService
                    .queryTab<PopulateResultMessage>({
                      type: 'POPULATE_ANSWERS',
                      targets,
                    })
                    .then((popRes) => {
                      if (popRes && popRes.summary) {
                        setPopSummary(popRes.summary);
                        showNotification(
                          `🎉 Auto-Pilot Complete! ${popRes.summary.succeeded} of ${targets.length} answers filled on SWAYAM. Review and submit manually!`
                        );
                      }
                    })
                    .catch((err) => {
                      showNotification(`⚡ Auto-synced answers! Click "Fill Reviewed Answers" to populate: ${(err as Error).message}`);
                    });
                } else {
                  showNotification(`⚡ Auto-synced & approved ${merged.mergedCount} answers directly from Web AI tab! Ready to fill.`);
                }
              } else {
                showNotification(`⚠️ Web AI answers received, but 0 options matched. Try "Review & Import" to paste or inspect.`);
              }
              chrome.storage.local.remove('swayam_chatgpt_sync');
            })();
          }
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, [results]);

  // Metrics
  const totalScanned = results.length;

  // Download Diagnostics Report as JSON
  const handleDownloadDiagnostics = () => {
    const report = lastTracerReport || pipelineTracer.generateReport();
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `swayam404-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Copy Diagnostics Report to clipboard
  const handleCopyDiagnostics = async () => {
    const report = lastTracerReport || pipelineTracer.generateReport();
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    showNotification('Diagnostic trace report copied to clipboard.');
  };

  const currentReport = lastTracerReport || pipelineTracer.generateReport();
  const filteredSteps =
    diagnosticsFilterQ === 'all'
      ? currentReport.steps
      : currentReport.steps.filter((s: PipelineStepTrace) => s.questionId === diagnosticsFilterQ);

  const renderQuestionTextWithHighlights = (text: string) => {
    const parts = text.split(/\b(NOT|EXCEPT|INCORRECT|FALSE)\b/gi);
    return (
      <span>
        {parts.map((part, pIdx) => {
          const isCritical = /^(NOT|EXCEPT|INCORRECT|FALSE)$/i.test(part);
          return isCritical ? (
            <span
              key={pIdx}
              style={{
                background: '#ffcc00',
                color: '#1a1a1a',
                padding: '1px 5px',
                borderBottom: '2px solid #1a1a1a',
                fontWeight: 800,
              }}
            >
              {part}
            </span>
          ) : (
            <span key={pIdx}>{part}</span>
          );
        })}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: totalScanned > 0 ? '64px' : '0' }}>
      {/* Real-time Pre-Flight & Diagnostics Status Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '6px',
          padding: '8px 12px',
          background: 'var(--color-surface-high)',
          border: '1.5px solid #1a1a1a',
          boxShadow: '2px 2px 0px #1a1a1a',
          fontSize: '10px',
          fontFamily: 'var(--font-headline)',
          fontWeight: 700,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {/* Week Indicator */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              background: detectedWeek ? '#dbeafe' : '#f3f4f6',
              border: '1px solid #1a1a1a',
              color: detectedWeek ? '#1e40af' : '#6b7280',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
            }}
            title={detectedWeek ? `Current Detected Week: ${detectedWeek}` : 'Week number not yet detected from page'}
          >
            <span>📅</span>
            <span>{detectedWeek ? detectedWeek.toUpperCase() : 'WEEK --'}</span>
          </span>

          {/* Submission Status Indicator */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              background: isAlreadySubmitted
                ? '#bbf7d0'
                : submissionStatus?.isPastDue
                ? '#fecaca'
                : '#fef08a',
              border: '1px solid #1a1a1a',
              color: isAlreadySubmitted ? '#166534' : submissionStatus?.isPastDue ? '#991b1b' : '#854d0e',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
            }}
            title={submissionStatus?.statusText || (isAlreadySubmitted ? 'Assignment Submitted' : 'Assignment Open')}
          >
            <span>{isAlreadySubmitted ? '🏁' : submissionStatus?.isPastDue ? '🔒' : '📝'}</span>
            <span>{isAlreadySubmitted ? 'SUBMITTED' : submissionStatus?.isPastDue ? 'CLOSED' : 'OPEN'}</span>
          </span>
        </div>

        {/* Internet Connection Status */}
        <div
          onClick={() => networkDiagnostics.checkConnectivity(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 6px',
            background: !netDiagnosis.isOnline ? '#fee2e2' : netDiagnosis.state === 'unstable' ? '#fef3c7' : '#dcfce7',
            border: '1px solid #1a1a1a',
            color: !netDiagnosis.isOnline ? '#991b1b' : netDiagnosis.state === 'unstable' ? '#b45309' : '#166534',
            cursor: 'pointer',
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
          }}
          title={`${netDiagnosis.message} Click to test network.`}
        >
          {!netDiagnosis.isOnline ? (
            <>
              <WifiOff size={10} />
              <span>OFFLINE</span>
            </>
          ) : (
            <>
              <Wifi size={10} />
              <span>{netDiagnosis.latencyMs ? `${netDiagnosis.latencyMs}MS` : 'ONLINE'}</span>
            </>
          )}
        </div>
      </div>

      {/* 🏁 Assignment Already Submitted Warning & Action Card */}
      {isAlreadySubmitted && (
        <div
          style={{
            background: '#dcfce7',
            border: '2px solid #16a34a',
            boxShadow: '3px 3px 0px #16a34a',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#166534', fontSize: '12px' }}>
              <span>🏁</span>
              <span>ASSIGNMENT ALREADY SUBMITTED ON SWAYAM</span>
            </div>
            {submissionStatus?.scoreText && (
              <span style={{ background: '#16a34a', color: '#ffffff', padding: '2px 6px', fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                {submissionStatus.scoreText}
              </span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: '#14532d', lineHeight: 1.4 }}>
            {submissionStatus?.statusText ? `${submissionStatus.statusText}. ` : ''}
            Form inputs are locked on the portal. Auto-populate is safely suspended to prevent dead clicks.
            Click below to capture the confirmed answers directly into your local Answer Bank!
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
            <button
              className="btn btn-primary"
              onClick={handleCaptureFeedback}
              disabled={isCapturing}
              style={{
                fontSize: '11px',
                padding: '6px 14px',
                background: '#16a34a',
                color: '#ffffff',
                border: '1.5px solid #14532d',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ShieldCheck size={13} className={isCapturing ? 'animate-spin' : ''} />
              <span>Capture Correct Answers to Bank</span>
            </button>
          </div>
        </div>
      )}

      {/* ⚠️ Internet Issue Identifier Alert */}
      {!netDiagnosis.isOnline && (
        <div
          style={{
            background: '#fee2e2',
            border: '2px solid #b91c1c',
            boxShadow: '3px 3px 0px #b91c1c',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#991b1b', fontSize: '12px' }}>
              <WifiOff size={14} />
              <span>INTERNET ISSUE IDENTIFIED: OFFLINE</span>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => networkDiagnostics.checkConnectivity(true)}
              style={{ fontSize: '9px', padding: '2px 8px', fontWeight: 800 }}
            >
              <span>Test Connection</span>
            </button>
          </div>
          <div style={{ fontSize: '11px', color: '#7f1d1d', lineHeight: 1.4 }}>
            {netDiagnosis.message} Cloud AI features (ChatGPT & Gemini) cannot be reached until reconnected.
            <b> Your local verified Answer Bank and stored notes remain 100% operational offline.</b>
          </div>
        </div>
      )}

      {/* Course Context Mismatch Warning */}
      {portalInfo?.detectedCourseTitle &&
        selectedCourse &&
        !selectedCourse.name.toLowerCase().includes(portalInfo.detectedCourseTitle.toLowerCase()) &&
        !portalInfo.detectedCourseTitle.toLowerCase().includes(selectedCourse.name.toLowerCase()) && (
          <div
            style={{
              background: '#fef3c7',
              border: '2px solid #d97706',
              boxShadow: '3px 3px 0px #d97706',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '11px',
              color: '#78350f',
            }}
          >
            <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span>⚠️</span>
              <span>COURSE PROFILE MISMATCH</span>
            </div>
            <div>
              Portal tab is "<b>{portalInfo.detectedCourseTitle}</b>", but active extension profile is set to "<b>{selectedCourse.name}</b>".
            </div>
            {courses.find((c) => c.name.toLowerCase().includes(portalInfo.detectedCourseTitle!.toLowerCase())) && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  const target = courses.find((c) =>
                    c.name.toLowerCase().includes(portalInfo.detectedCourseTitle!.toLowerCase())
                  );
                  if (target && onSelectCourse) {
                    onSelectCourse(target.id);
                  }
                }}
                style={{ alignSelf: 'flex-start', fontSize: '10px', padding: '3px 8px', fontWeight: 800 }}
              >
                Switch Profile to "{portalInfo.detectedCourseTitle}"
              </button>
            )}
          </div>
        )}

      {/* ⚠️ Week/Quiz Switch Detected on Portal */}
      {isWeekOrQuizSwitched && (
        <div
          style={{
            background: '#fef3c7',
            border: '2px solid #d97706',
            boxShadow: '3px 3px 0px #d97706',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#92400e', fontSize: '12px' }}>
              <AlertTriangle size={15} />
              <span>PORTAL SWITCHED TO {portalInfo?.detectedWeek?.toUpperCase() || 'NEW QUIZ'}</span>
            </div>
            <button
              className="btn btn-primary"
              onClick={async () => {
                await handleClearActiveScan();
                handleScan();
              }}
              style={{
                fontSize: '11px',
                padding: '6px 14px',
                fontWeight: 800,
                background: '#ffcc00',
                color: '#1a1a1a',
                border: '1.5px solid #1a1a1a',
                boxShadow: '2px 2px 0px #1a1a1a',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} className={isScanning ? 'animate-spin' : ''} />
              <span>⚡ Reload & Scan {portalInfo?.detectedWeek || 'New Quiz'} →</span>
            </button>
          </div>
          <div style={{ fontSize: '11px', color: '#78350f', lineHeight: 1.4 }}>
            The active SWAYAM portal tab changed to <b>{portalInfo?.detectedWeek || 'a new week'}</b> ({portalInfo?.detectedAssignmentTitle || 'new assignment'}), but the {results.length} questions displayed below are from {scannedWeek || detectedWeek || 'the previous week'}. Click above to reload questions for this week.
          </div>
        </div>
      )}

      {/* Scan Error & Troubleshooting Wrapup Card */}
      {scanError && (
        <div
          style={{
            background: '#fee2e2',
            border: '2px solid #b91c1c',
            boxShadow: '3px 3px 0px #b91c1c',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#991b1b', fontSize: '12px' }}>
            <AlertTriangle size={14} />
            <span>SCAN FAILURE DIAGNOSIS</span>
          </div>
          <div style={{ fontSize: '11px', color: '#7f1d1d' }}>
            {scanError}
          </div>
          <div style={{ fontSize: '10px', color: '#1a1a1a', background: '#ffffff', border: '1px solid #1a1a1a', padding: '6px 8px', lineHeight: 1.5 }}>
            <b>Troubleshooting Checklist:</b><br />
            • <b>Delayed Loading:</b> Scroll down on the SWAYAM page so delayed React/edX question blocks render.<br />
            • <b>Iframe Content:</b> If questions appear inside an iframe, click inside the assessment frame first.<br />
            • <b>Already Graded:</b> If the assessment is already submitted, click "Capture Graded Feedback" above.<br />
            • <b>Internet Issues:</b> Verify network connection if content script communication timed out.
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="btn btn-secondary"
              onClick={handleScan}
              disabled={isScanning}
              style={{ fontSize: '10px', padding: '4px 10px', fontWeight: 800 }}
            >
              <RefreshCw size={11} className={isScanning ? 'animate-spin' : ''} />
              <span>Retry Deep Scan</span>
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setIsDiagnosticsModalOpen(true)}
              style={{ fontSize: '10px', padding: '4px 8px' }}
            >
              <Activity size={11} />
              <span>View Diagnostics Trace</span>
            </button>
          </div>
        </div>
      )}

      {/* 1. BEFORE SCANNING: Clean Single Assignment Target Card */}
      {totalScanned === 0 && (
        <section className="card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '10px', fontFamily: 'var(--font-headline)', fontWeight: 800, textTransform: 'uppercase', color: '#71717a', letterSpacing: '0.04em' }}>
              Target Course Context
            </div>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '18px', textTransform: 'uppercase', color: 'var(--text-main, #1a1a1a)', marginTop: '2px', letterSpacing: '-0.02em' }}>
              {selectedCourse?.name || 'Assignment Review'}
            </h2>
            <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted, #4a4a4a)', marginTop: '4px' }}>
              {portalInfo?.detectedAssignmentTitle || pageInfo?.title || 'Active SWAYAM / NPTEL Assignment Tab'}
            </div>
          </div>

          {/* Active Week/Quiz Indicator Banner */}
          {portalInfo?.detectedWeek && (
            <div
              style={{
                background: '#dbeafe',
                border: '1.5px solid #1e40af',
                boxShadow: '2px 2px 0px #1e40af',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '6px',
              }}
            >
              <div style={{ fontSize: '11px', color: '#1e3a8a', fontWeight: 700 }}>
                ✨ Active Portal Tab: <b>{portalInfo.detectedWeek}</b>
                {portalInfo.detectedAssignmentTitle ? ` • ${portalInfo.detectedAssignmentTitle}` : ''}
              </div>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  background: '#ffffff',
                  color: '#1e40af',
                  border: '1px solid #1e40af',
                  padding: '2px 6px',
                }}
              >
                Ready to Scan
              </span>
            </div>
          )}

          {/* ONE Prominent Primary Action */}
          <button
            className="btn btn-primary"
            onClick={handleScan}
            disabled={isScanning}
            style={{
              padding: '12px 18px',
              fontSize: '13px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {isScanning ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Scanning assignment questions…</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>Scan {portalInfo?.detectedWeek ? `${portalInfo.detectedWeek} ` : ''}Assignment →</span>
              </>
            )}
          </button>

          {/* ⚡ 1-Click Auto-Pilot Master CTA */}
          <button
            className="btn btn-primary"
            onClick={handleAutoPilotFlow}
            disabled={isScanning || isPopulating}
            style={{
              width: '100%',
              padding: '12px 14px',
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: '#ffcc00',
              color: '#1a1a1a',
              border: '2px solid #1a1a1a',
              boxShadow: '3px 3px 0px #1a1a1a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '8px',
              cursor: isScanning || isPopulating ? 'not-allowed' : 'pointer',
            }}
            title="Automatically scan questions, send to ChatGPT, wait for answers, and auto-fill into SWAYAM page!"
          >
            <Zap size={15} />
            <span>⚡ 1-Click Auto-Pilot {portalInfo?.detectedWeek ? `for ${portalInfo.detectedWeek}` : ''} (Scan → Solve → Fill)</span>
          </button>

          {/* Recent Assignment Scan Shortcut */}
          {scanHistory.length > 0 && (
            <div
              style={{
                marginTop: '10px',
                padding: '10px 12px',
                background: 'var(--color-surface-low)',
                border: '1.5px solid #1a1a1a',
                boxShadow: '2px 2px 0px #1a1a1a',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-headline)', textTransform: 'uppercase', color: 'var(--text-main, #1a1a1a)' }}>
                  🕒 Saved Assignment History
                </span>
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim, #666)' }}>
                  {new Date(scanHistory[0].timestamp).toLocaleDateString()}
                </span>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main, #1a1a1a)' }}>
                {scanHistory[0].assignmentTitle}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted, #4a4a4a)', display: 'flex', gap: '8px' }}>
                <span style={{ fontWeight: 600 }}>{scanHistory[0].totalQuestions} Questions</span>
                <span>•</span>
                <span>{scanHistory[0].approvedCount} Approved</span>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => handleRestoreHistoryItem(scanHistory[0])}
                style={{ fontSize: '10px', padding: '4px 8px', alignSelf: 'flex-start', marginTop: '4px', fontWeight: 800 }}
              >
                <span>⚡ Resume This Assignment</span>
              </button>
            </div>
          )}

          {/* Quiet Secondary Actions Strip */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #1a1a1a', paddingTop: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className="btn btn-secondary"
                onClick={handleCaptureFeedback}
                disabled={isCapturing}
                style={{ fontSize: '10px', padding: '4px 8px' }}
                title="Capture accepted answers from a submitted assignment with feedback"
              >
                <ShieldCheck size={11} className={isCapturing ? 'animate-spin' : ''} />
                <span>Capture Graded Feedback</span>
              </button>

              <button
                className="btn btn-secondary"
                onClick={() => {
                  loadHistory();
                  setIsHistoryModalOpen(true);
                }}
                style={{ fontSize: '10px', padding: '4px 8px' }}
                title="View scan history & past assignments"
              >
                <History size={11} />
                <span>History {scanHistory.length > 0 ? `(${scanHistory.length})` : ''}</span>
              </button>
            </div>

            <button
              className="btn btn-secondary"
              onClick={() => setIsDiagnosticsModalOpen(true)}
              style={{ fontSize: '10px', padding: '4px 8px' }}
              title="Inspect 16-stage diagnostics trace"
            >
              <Activity size={11} />
              <span>Diagnostics ({currentReport.steps.length})</span>
            </button>
          </div>
        </section>
      )}

      {/* 2. AFTER SCANNING: Compact Control Strip & Batch Action Toolbar */}
      {totalScanned > 0 && (
        <section className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Row 1: Title, Assignment Context, and Counts */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-main, #1a1a1a)' }}>
                  Assignment Review
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#666666' }}>
                  ({totalScanned} Questions)
                </span>
              </div>
              {pageInfo?.title && (
                <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#4a4a4a', marginTop: '1px' }}>
                  {pageInfo.title}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  loadHistory();
                  setIsHistoryModalOpen(true);
                }}
                title="View scan history & past assignments"
                style={{ padding: '4px 8px', fontSize: '10px' }}
              >
                <History size={11} />
                <span>History {scanHistory.length > 0 ? `(${scanHistory.length})` : ''}</span>
              </button>

              <button
                className="btn btn-secondary"
                onClick={handleScan}
                disabled={isScanning}
                title="Rescan portal DOM"
                style={{ padding: '4px 8px', fontSize: '10px' }}
              >
                <RefreshCw size={11} className={isScanning ? 'animate-spin' : ''} />
                <span>Rescan</span>
              </button>

              <button
                className="btn btn-secondary"
                onClick={handleClearActiveScan}
                title="Clear current scan and start fresh"
                style={{ padding: '4px 8px', fontSize: '10px', color: '#b91c1c' }}
              >
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* ⚡ 1-Click Auto-Pilot Master Button */}
          <button
            className="btn btn-primary"
            onClick={handleAutoPilotFlow}
            disabled={isScanning || isPopulating}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: '#ffcc00',
              color: '#1a1a1a',
              border: '2px solid #1a1a1a',
              boxShadow: '2.5px 2.5px 0px #1a1a1a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: isScanning || isPopulating ? 'not-allowed' : 'pointer',
            }}
            title="Automatically send questions to ChatGPT, wait for answers, and auto-fill into SWAYAM page!"
          >
            <Zap size={14} />
            <span>⚡ 1-Click Auto-Pilot (ChatGPT → Auto-Fill)</span>
          </button>

          {/* Primary Action Strip: 3-Step Web AI Execution */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            <button
              className="btn btn-primary"
              onClick={handleCopyWebAiPrompt}
              style={{ fontSize: '10px', padding: '8px 4px', fontWeight: 800 }}
              title="Copy prompt for all questions with options and instructions"
            >
              <Copy size={12} />
              <span>{copiedPromptFeedback ? '✓ Copied!' : '1. Copy for AI'}</span>
            </button>

            <button
              className="btn btn-secondary"
              onClick={handleOpenChatGptWeb}
              style={{ fontSize: '10px', padding: '8px 4px', fontWeight: 700 }}
              title="Auto-copy prompt and open ChatGPT in browser tab"
            >
              <ExternalLink size={12} />
              <span>2. ChatGPT ↗</span>
            </button>

            <button
              className="btn btn-primary"
              onClick={handlePasteFromClipboardAndApply}
              disabled={isApplyingWebAi}
              style={{ fontSize: '10px', padding: '8px 4px', fontWeight: 800 }}
              title="Read clipboard, auto-match options, and immediately mark all radio buttons on SWAYAM in 1 click"
            >
              <Sparkles size={12} />
              <span>{isApplyingWebAi ? 'Marking...' : '3. ⚡ Paste & Mark Answers'}</span>
            </button>
          </div>

          {/* Quick Batch Actions & Fill Strip */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px',
              padding: '6px 8px',
              background: 'var(--color-surface-low)',
              border: '1.5px solid var(--border-medium)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                className="btn btn-secondary"
                onClick={handleApproveAllEligible}
                style={{ fontSize: '9px', padding: '3px 7px' }}
                title="Approve all questions that have proposed answers"
              >
                Approve All ({totalScanned})
              </button>
              <button
                className="btn btn-tertiary"
                onClick={() => setIsWebAiPanelOpen((prev) => !prev)}
                style={{ fontSize: '9px', padding: '3px 6px' }}
                title="Toggle manual text paste box"
              >
                {isWebAiPanelOpen ? '▲ Hide Paste Box' : '▼ Manual Paste'}
              </button>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleExecutePopulate}
              disabled={approvedFillCount === 0 || isPopulating}
              style={{ fontSize: '10px', padding: '4px 10px', fontWeight: 800 }}
              title="Populate only approved answers into active tab assignment"
            >
              <CheckCircle2 size={12} />
              <span>{isPopulating ? 'Filling...' : `Fill Reviewed Answers (${approvedFillCount})`}</span>
            </button>
          </div>

          {/* Expandable Manual Paste Box (Fallback when clipboard permission is restricted) */}
          {isWebAiPanelOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)' }}>
              <textarea
                value={webAiPastedText}
                onChange={(e) => {
                  setWebAiPastedText(e.target.value);
                  setWebAiError(null);
                }}
                placeholder="Paste response from ChatGPT here (e.g., '1. B, 2. A' or JSON)..."
                rows={3}
                style={{
                  width: '100%',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  padding: '6px 8px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
              {webAiError && (
                <div style={{ fontSize: '10px', color: 'var(--color-error)', fontFamily: 'var(--font-mono)' }}>
                  ⚠ {webAiError}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setWebAiPastedText('');
                    setWebAiError(null);
                  }}
                  style={{ fontSize: '9px', padding: '3px 8px' }}
                >
                  Clear
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleApplyPastedText}
                  disabled={!webAiPastedText.trim() || isApplyingWebAi}
                  style={{ fontSize: '10px', padding: '4px 10px', fontWeight: 800 }}
                >
                  Parse & Apply
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Notifications and Error Banners */}
      {notification && (
        <div
          style={{
            fontSize: '11px',
            color: 'var(--color-on-primary-container)',
            background: 'var(--color-primary-container)',
            padding: '8px 12px',
            border: '2px solid var(--border-medium)',
            boxShadow: '2px 2px 0px var(--shadow-brutal-sm)',
            fontFamily: 'var(--font-headline)',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <CheckCircle2 size={14} />
          <span>{notification}</span>
        </div>
      )}

      {scanError && (
        <div
          style={{
            fontSize: '11px',
            color: '#ffffff',
            background: 'var(--color-secondary)',
            padding: '8px 12px',
            border: '2px solid var(--border-medium)',
            boxShadow: '2px 2px 0px var(--shadow-brutal-sm)',
            fontFamily: 'var(--font-headline)',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '6px',
          }}
        >
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{scanError}</span>
        </div>
      )}

      {/* Population Summary Banner */}
      {popSummary && (
        <div
          style={{
            background: 'var(--accent-hover)',
            color: '#1a1a1a',
            border: '2px solid var(--border-medium)',
            boxShadow: '3px 3px 0px var(--shadow-brutal-sm)',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ fontFamily: 'var(--font-headline)', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={15} />
            Population Finished: {popSummary.succeeded} Successful, {popSummary.failed} Failed
          </div>
          <div style={{ fontSize: '11px', fontFamily: 'var(--font-body)' }}>
            Submit button untouched. Review populated choices on the assignment page before manual submission.
          </div>
        </div>
      )}

      {/* Streamlined Question Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '90px' }}>
        {results.map((item, origIdx) => {
          const q = item.scannedQuestion;
          const isPortal = item.resolutionState === 'portal-confirmed';
          const isAi = item.resolutionState === 'chatgpt-suggested' || item.resolutionState === 'ai-suggested';
          const hasAnswer = (item.proposedAnswers || []).length > 0;

          return (
            <article
              key={q.id}
              className="card"
              style={{
                padding: 0,
                border: '2px solid var(--border-medium)',
                boxShadow: '4px 4px 0px var(--shadow-brutal)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Clean Card Header Strip */}
              <div
                style={{
                  padding: '8px 12px',
                  borderBottom: '2px solid var(--border-medium)',
                  background: 'var(--color-surface-low)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-headline)',
                      fontWeight: 800,
                      fontSize: '11px',
                      background: 'var(--color-primary)',
                      color: 'var(--color-on-primary)',
                      padding: '2px 6px',
                    }}
                  >
                    Q.{q.index < 10 ? `0${q.index}` : q.index}
                  </span>

                  {isPortal ? (
                    <span
                      style={{
                        padding: '1px 6px',
                        background: 'var(--accent-hover)',
                        color: '#1a1a1a',
                        fontFamily: 'var(--font-headline)',
                        fontSize: '9px',
                        fontWeight: 800,
                        border: '1px solid var(--border-medium)',
                        textTransform: 'uppercase',
                      }}
                    >
                      ✓ Verified Key
                    </span>
                  ) : isAi ? (
                    <span
                      style={{
                        padding: '1px 6px',
                        background: 'var(--color-surface-container)',
                        color: 'var(--text-main)',
                        fontFamily: 'var(--font-headline)',
                        fontSize: '9px',
                        fontWeight: 700,
                        border: '1px solid var(--border-medium)',
                        textTransform: 'uppercase',
                      }}
                    >
                      ChatGPT Pick
                    </span>
                  ) : (
                    <span
                      style={{
                        padding: '1px 6px',
                        background: 'transparent',
                        color: 'var(--text-dim)',
                        fontFamily: 'var(--font-headline)',
                        fontSize: '9px',
                        fontWeight: 600,
                        border: '1px dashed var(--border-subtle)',
                        textTransform: 'uppercase',
                      }}
                    >
                      Pending AI
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={async () => {
                      const singlePrompt = ChatGptBridgeService.buildPrompt({
                        questions: [q],
                        courseName: effectiveCourse.name,
                        assignmentTitle: pageInfo?.title,
                      });
                      await ChatGptBridgeService.copyToClipboard(singlePrompt);
                      showNotification(`✓ Copied Q.${q.index} prompt for ChatGPT!`);
                    }}
                    style={{ fontSize: '9px', padding: '2px 7px' }}
                    title="Copy this single question for ChatGPT"
                  >
                    <Copy size={10} />
                    <span>Copy Q</span>
                  </button>

                  <button
                    className={`btn ${item.isApproved ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handleToggleApproval(origIdx)}
                    style={{
                      fontSize: '9px',
                      padding: '2px 8px',
                      fontWeight: 800,
                      opacity: hasAnswer ? 1 : 0.6,
                    }}
                    title="Toggle approval for auto-fill"
                  >
                    {item.isApproved ? 'Approved ✓' : 'Approve'}
                  </button>
                </div>
              </div>

              {/* Question Body */}
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p
                  style={{
                    fontFamily: 'var(--font-headline)',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--text-main)',
                    lineHeight: 1.4,
                  }}
                >
                  {renderQuestionTextWithHighlights(q.questionText)}
                </p>

                {q.questionType === 'multiple-choice' && (
                  <span style={{ fontFamily: 'var(--font-headline)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-secondary)' }}>
                    [Multiple Choice — Select all that apply]
                  </span>
                )}

                {/* Option Set */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {q.options.map((opt, oIdx) => {
                    const isProposed = (item.proposedAnswers || []).includes(opt.text);
                    return (
                      <div
                        key={oIdx}
                        onClick={() => handleOptionSelect(origIdx, opt.text)}
                        className={`brutal-option-card ${isProposed ? (isPortal ? 'selected-verified' : 'selected-ai') : ''}`}
                      >
                        <input
                          type={q.questionType === 'multiple-choice' ? 'checkbox' : 'radio'}
                          name={`q-${q.id}`}
                          checked={isProposed}
                          readOnly
                          style={{ marginTop: '2px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1, fontSize: '12px', fontWeight: isProposed ? 700 : 400, color: 'var(--text-main)' }}>
                          <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, marginRight: '6px' }}>
                            ({String.fromCharCode(65 + oIdx)})
                          </span>
                          {opt.text}
                        </div>

                        {isProposed && (
                          <span
                            style={{
                              padding: '1px 6px',
                              background: 'var(--color-primary)',
                              color: 'var(--color-on-primary)',
                              fontFamily: 'var(--font-headline)',
                              fontSize: '9px',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              flexShrink: 0,
                            }}
                          >
                            {isPortal ? '✓ Verified' : 'Selected'}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* Short text input */}
                  {q.questionType === 'short-text' && (
                    <div style={{ padding: '8px', background: 'var(--color-surface-low)', border: '1.5px solid var(--border-medium)' }}>
                      <label style={{ fontFamily: 'var(--font-headline)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '4px', color: 'var(--text-main)' }}>
                        Short Text / Numerical Answer:
                      </label>
                      <input
                        type="text"
                        value={item.proposedAnswers[0] || ''}
                        onChange={(e) => handleTextAnswerChange(origIdx, e.target.value)}
                        placeholder="Enter short answer..."
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700 }}
                      />
                    </div>
                  )}
                </div>

                {/* Compact Neo-Brutalist Evidence Affordance */}
                {(() => {
                  const evidenceList = item.retrievedEvidence && item.retrievedEvidence.length > 0
                    ? item.retrievedEvidence
                    : item.evidence
                    ? [{
                        materialId: 'fallback-evidence',
                        materialTitle: item.matchedRecord?.source || 'Course Context',
                        sourceTitle: item.matchedRecord?.source || 'Course Context',
                        excerpt: item.evidence,
                        relevanceScore: 1,
                        retrievalSource: 'local-course-material' as const,
                      }]
                    : [];

                  const isExpanded = expandedEvidenceQIds.has(q.id);
                  const hasSharedKb = evidenceList.some((e) => e.retrievalSource === 'shared-knowledge-base');
                  const count = evidenceList.length;

                  let originLabel = 'Unresolved';
                  if (isPortal) originLabel = 'Portal Confirmed';
                  else if (item.resolutionState === 'student-reviewed') originLabel = 'Student Reviewed';
                  else if (item.basis === 'course-material') originLabel = 'Course Grounded';
                  else if (isAi) originLabel = 'AI Suggestion';

                  return (
                    <div style={{ marginTop: '4px', borderTop: '1px dashed var(--border-subtle)', paddingTop: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => toggleEvidence(q.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: '2px 0',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: 'var(--text-main)',
                            fontSize: '11px',
                            fontFamily: 'var(--font-headline)',
                            fontWeight: 700,
                          }}
                          title="Click to toggle course source evidence"
                        >
                          <BookOpen size={12} color="#1a1a1a" />
                          <span>
                            {count > 0 ? `Evidence (${count})` : 'Course Evidence'}
                          </span>
                          {count > 0 && (
                            <span
                              style={{
                                fontSize: '8px',
                                padding: '1px 5px',
                                background: hasSharedKb ? '#ffcc00' : 'var(--color-surface-container)',
                                color: '#1a1a1a',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                border: '1px solid var(--border-medium)',
                              }}
                            >
                              {hasSharedKb ? 'Shared KB' : 'Local Notes'}
                            </span>
                          )}
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>

                        <span
                          style={{
                            fontSize: '9px',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-dim)',
                            textTransform: 'uppercase',
                          }}
                        >
                          {originLabel}
                        </span>
                      </div>

                      {/* Expanded Evidence Drawer */}
                      {isExpanded && (
                        <div
                          style={{
                            marginTop: '8px',
                            padding: '10px',
                            background: 'var(--color-surface-low)',
                            border: '1.5px solid var(--border-medium)',
                            boxShadow: '2px 2px 0px var(--shadow-brutal)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          {count > 0 ? (
                            evidenceList.map((ev, eIdx) => {
                              const sTitle = ev.sourceTitle || ev.title || ev.materialTitle || 'Course Source';
                              const isKb = ev.retrievalSource === 'shared-knowledge-base';
                              return (
                                <div
                                  key={eIdx}
                                  style={{
                                    padding: '8px',
                                    background: '#ffffff',
                                    border: '1px solid var(--border-medium)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '5px',
                                  }}
                                >
                                  {/* Title + Badges */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                      <span style={{ fontWeight: 800, fontSize: '11px', fontFamily: 'var(--font-headline)', color: 'var(--text-main)' }}>
                                        {sTitle}
                                      </span>
                                      {ev.resourceType && (
                                        <span style={{ fontSize: '8px', padding: '1px 4px', background: '#eee9e0', border: '1px solid #1a1a1a', textTransform: 'uppercase', fontFamily: 'var(--font-headline)', fontWeight: 700 }}>
                                          {ev.resourceType}
                                        </span>
                                      )}
                                    </div>
                                    <span
                                      style={{
                                        fontSize: '8px',
                                        fontWeight: 800,
                                        padding: '1px 5px',
                                        background: isKb ? 'var(--color-primary)' : '#e0dbcf',
                                        color: '#1a1a1a',
                                        border: '1px solid #1a1a1a',
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      {isKb ? 'Shared KB' : 'Local Material'}
                                    </span>
                                  </div>

                                  {/* Passage */}
                                  <p
                                    style={{
                                      margin: 0,
                                      fontSize: '11px',
                                      color: 'var(--text-main)',
                                      lineHeight: 1.4,
                                      fontFamily: 'var(--font-body)',
                                      fontStyle: 'italic',
                                      background: '#faf8f5',
                                      padding: '6px 8px',
                                      borderLeft: '3px solid #ffcc00',
                                    }}
                                  >
                                    "{ev.excerpt}"
                                  </p>

                                  {/* Provenance Metadata footer */}
                                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', marginTop: '2px' }}>
                                    {ev.lectureId && <span>Lecture: {ev.lectureId}</span>}
                                    {ev.timestamp && <span>Time: {ev.timestamp}</span>}
                                    {ev.unitTitle && <span>Unit: {ev.unitTitle}</span>}
                                    {ev.sourceUrl && (
                                      <a
                                        href={ev.sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: 'var(--color-secondary)', display: 'inline-flex', alignItems: 'center', gap: '2px', textDecoration: 'underline' }}
                                      >
                                        Source Link <ExternalLink size={8} />
                                      </a>
                                    )}
                                    {ev.license && <span>({ev.license})</span>}
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic', padding: '4px 0' }}>
                              No relevant course source found in local notes or shared knowledge base.
                            </div>
                          )}

                          {/* Provenance Classification Footer */}
                          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', fontFamily: 'var(--font-headline)', flexWrap: 'wrap', gap: '4px' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                              {isPortal
                                ? '✓ Portal-Confirmed Answer Key'
                                : item.resolutionState === 'student-reviewed'
                                ? '✓ Verified Student-Reviewed Record'
                                : count > 0
                                ? '⚡ Source-Supported Explanation'
                                : '⚡ AI Domain Inference'}
                            </span>
                            {item.requiresReview && (
                              <span style={{ color: '#e63b2e', fontWeight: 800 }}>⚠️ Needs Student Review</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </article>

          );
        })}
      </div>

      {/* Fixed Bottom Action Bar */}
      {totalScanned > 0 && (
        <aside className="bottom-fixed-bar">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '8px', height: '8px', background: '#1a1a1a', display: 'inline-block' }}></span>
                <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase' }}>
                  {approvedFillCount} of {totalScanned} Approved
                </span>
              </div>
              <span style={{ padding: '2px 6px', background: '#eee9e0', border: '1px solid #1a1a1a', fontFamily: 'var(--font-headline)', fontSize: '10px', fontWeight: 700 }}>
                {totalScanned - approvedFillCount} Pending Review
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className="btn btn-secondary"
                onClick={handleDeselectAll}
                style={{ fontSize: '10px', padding: '6px 10px' }}
              >
                Reset Selection
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setShowConfirmModal(true)}
                disabled={approvedFillCount === 0 || isPopulating}
                style={{ fontSize: '11px', padding: '8px 16px' }}
              >
                FILL REVIEWED ANSWERS ({approvedFillCount}) →
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* DOM Injection Inspector & Safe Population Modal */}
      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-content-brutal">
            {/* Modal Header */}
            <div style={{ padding: '12px 16px', background: '#1a1a1a', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1a1a1a' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', background: '#ffcc00', display: 'inline-block' }}></span>
                <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  DOM Injection Inspector & Safe Population
                </span>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                style={{ background: 'none', border: 'none', color: '#ffffff', fontWeight: 800, cursor: 'pointer', fontSize: '14px' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Safety Alert */}
              <div style={{ padding: '12px', border: '2px solid #e63b2e', background: '#ffdad6', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ width: '18px', height: '18px', background: '#e63b2e', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '11px', flexShrink: 0 }}>
                  !
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', color: '#cc0000' }}>
                    Submission Protection Active
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: '#1a1a1a', marginTop: '2px', lineHeight: 1.4 }}>
                    Swayam404 will safely select radio buttons and write input fields in your active tab. The final portal <strong>"Submit Assignment" button will NOT be clicked automatically</strong>. You retain 100% manual grading control.
                  </div>
                </div>
              </div>

              {/* Execution Queue Table */}
              <div style={{ border: '2px solid #1a1a1a' }}>
                <div style={{ padding: '6px 10px', background: '#eee9e0', borderBottom: '2px solid #1a1a1a', fontFamily: 'var(--font-headline)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Target Execution Queue</span>
                  <span>{approvedFillCount} Dispatches Ready</span>
                </div>
                <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '8px', background: '#ffffff', fontFamily: 'var(--font-mono)', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {approvedFillItems.map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee9e0', paddingBottom: '3px' }}>
                      <span>Q{r.scannedQuestion.index}: {r.proposedAnswers.join(', ').slice(0, 32)}</span>
                      <span style={{ fontWeight: 700, color: '#1a1a1a' }}>READY</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Skipped Items Notice if any */}
              {totalScanned - approvedFillCount > 0 && (
                <div style={{ padding: '8px 10px', background: '#eee9e0', border: '1.5px solid #1a1a1a', fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#1a1a1a' }}>
                  <strong>Bypassed ({totalScanned - approvedFillCount} questions):</strong> Unapproved or unresolved questions are intentionally skipped to ensure you retain full review control.
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#71717a' }}>
                <span>Active Target: <strong>SWAYAM / NPTEL Tab</strong></span>
                <span>Immunity Boundary: <strong>Armed</strong></span>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 16px', background: '#f2ede5', borderTop: '2px solid #1a1a1a', display: 'flex', justifyContent: 'space-between' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleExecutePopulate}
              >
                Execute Live Fill ({approvedFillCount} Answers)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diagnostics Modal */}
      {isDiagnosticsModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content-brutal" style={{ maxWidth: '640px' }}>
            <div style={{ padding: '12px 16px', background: '#1a1a1a', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1a1a1a' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={14} style={{ color: '#ffcc00' }} />
                <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase' }}>
                  16-Stage Pipeline Diagnostics Trace
                </span>
              </div>
              <button
                onClick={() => setIsDiagnosticsModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#ffffff', fontWeight: 800, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button className="btn btn-secondary" onClick={handleCopyDiagnostics} style={{ fontSize: '10px', padding: '4px 8px' }}>
                    <Copy size={11} /> Copy JSON
                  </button>
                  <button className="btn btn-secondary" onClick={handleDownloadDiagnostics} style={{ fontSize: '10px', padding: '4px 8px' }}>
                    <Download size={11} /> Download Report
                  </button>
                  <select
                    value={diagnosticsFilterQ}
                    onChange={(e) => setDiagnosticsFilterQ(e.target.value)}
                    style={{ fontSize: '10px', padding: '3px 6px', fontFamily: 'var(--font-headline)' }}
                  >
                    <option value="all">All Steps</option>
                    {results.map((r) => (
                      <option key={r.scannedQuestion.id} value={r.scannedQuestion.id}>
                        Q{r.scannedQuestion.index} Trace
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                  Steps: {filteredSteps.length}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {filteredSteps.map((step: PipelineStepTrace, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      border: '1.5px solid #1a1a1a',
                      padding: '8px',
                      background: step.status === 'failed' ? '#ffdad6' : '#ffffff',
                      fontSize: '11px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                      <span>Stage {step.stageNumber}: {step.stageName}</span>
                      <span style={{ color: step.status === 'failed' ? '#cc0000' : '#1a1a1a' }}>
                        {step.status.toUpperCase()} ({step.durationMs}ms)
                      </span>
                    </div>
                    <div style={{ marginTop: '2px', color: '#4a4a4a' }}>{step.details}</div>
                    {step.failureReason && (
                      <div style={{ color: '#cc0000', fontWeight: 600, marginTop: '2px' }}>
                        Failure: {step.failureReason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
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
          selectedCourseId={selectedCourse?.id || 'course-econ-101'}
          onSaveSuccess={async (stats) => {
            showNotification(
              `Saved ${stats.saved} new, updated ${stats.duplicates} existing, flagged ${stats.conflicts} conflict(s).`
            );
            if (onRefreshData) {
              await onRefreshData();
            }
          }}
        />
      )}

      {/* Scan History Modal */}
      {isHistoryModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setIsHistoryModalOpen(false)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '480px',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              background: '#ffffff',
              border: '2px solid #1a1a1a',
              boxShadow: '6px 6px 0px #1a1a1a',
              padding: 0,
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '2px solid #1a1a1a',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#ffcc00',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <History size={14} color="#1a1a1a" />
                <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', color: '#1a1a1a' }}>
                  Assignment Scan History
                </span>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => setIsHistoryModalOpen(false)}
                style={{ padding: '2px 6px', fontSize: '10px' }}
              >
                <X size={12} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '12px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '55vh' }}>
              {scanHistory.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#666', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                  No past assignment scans recorded yet.
                </div>
              ) : (
                scanHistory.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    style={{
                      border: '1.5px solid #1a1a1a',
                      padding: '10px 12px',
                      background: 'var(--color-surface-low)',
                      boxShadow: '2px 2px 0px #1a1a1a',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#1a1a1a', fontFamily: 'var(--font-headline)' }}>
                        {item.assignmentTitle}
                      </div>
                      <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#666' }}>
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ fontSize: '10px', color: '#4a4a4a', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ background: '#e5e7eb', padding: '1px 5px', fontWeight: 700, border: '1px solid #1a1a1a' }}>
                        {item.courseTitle}
                      </span>
                      <span>{item.totalQuestions} Questions</span>
                      <span>•</span>
                      <span>{item.approvedCount} Approved</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleRestoreHistoryItem(item)}
                        style={{ fontSize: '10px', padding: '4px 10px', fontWeight: 800 }}
                      >
                        ⚡ Restore & Resume
                      </button>

                      <button
                        className="btn btn-secondary"
                        onClick={async () => {
                          await StorageService.deleteScanHistoryItem(item.id);
                          loadHistory();
                        }}
                        title="Delete from history"
                        style={{ fontSize: '10px', padding: '3px 6px', color: '#b91c1c' }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            {scanHistory.length > 0 && (
              <div
                style={{
                  padding: '8px 14px',
                  borderTop: '1.5px solid #1a1a1a',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#f9f9f9',
                }}
              >
                <span style={{ fontSize: '10px', color: '#666', fontFamily: 'var(--font-mono)' }}>
                  {scanHistory.length} saved scan(s)
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={async () => {
                    await StorageService.clearScanHistory();
                    loadHistory();
                  }}
                  style={{ fontSize: '10px', padding: '3px 8px', color: '#b91c1c' }}
                >
                  Clear All History
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
