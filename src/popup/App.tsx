import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Course, QuestionRecord, QuestionMatchResult, PortalTabInfo } from '@/types';
import { StorageService } from '@/lib/storage';
import { PageConnectionService } from '@/lib/connection/pageConnection';
import { Header } from '@/components/Header';
import { Navigation, ActiveTab } from '@/components/Navigation';
import { DiagnosticsModal } from '@/components/DiagnosticsModal';
import { DashboardTab } from '@/features/dashboard/DashboardTab';
import { CourseCompletionDashboard } from '@/features/course-completion/CourseCompletionDashboard';
import { ScannerTab } from '@/features/scanner/ScannerTab';
import { CourseLibraryTab } from '@/features/courses/CourseLibraryTab';
import { ImportExportTab } from '@/features/answer-bank/ImportExportTab';
import { SettingsTab } from '@/features/settings/SettingsTab';

function normalizeCourseForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\((?:common course|minor course|core course|elective|major course)[^)]*\)/gi, '')
    .replace(/^(?:course|swayam|nptel|portal)\s*[:\/-]\s*/gi, '')
    .replace(/\s*[-—|:]\s*(?:swayam|nptel).*/gi, '')
    .replace(/[^a-z0-9]/gi, '')
    .trim();
}

export const App: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [scanResults, setScanResults] = useState<QuestionMatchResult[]>([]);
  const activeScanContextRef = useRef<{
    url?: string;
    detectedWeek?: string;
    assignmentTitle?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  const [portalInfo, setPortalInfo] = useState<PortalTabInfo | null>(null);

  // Proactively detects active tab, auto-identifies SWAYAM portal, and auto-matches course
  const syncPortalContext = useCallback(async (currentCourses: Course[]) => {
    try {
      const detected = await PageConnectionService.detectActivePortal();
      setPortalInfo(detected);

      // Detect if user navigated to a different week or quiz on the SWAYAM portal
      if (detected.isSwayam && activeScanContextRef.current) {
        if (PageConnectionService.isAssignmentOrWeekDifferent(activeScanContextRef.current, detected)) {
          console.log('[swayam404] Week or quiz changed on active SWAYAM tab. Resetting scan to prompt for new quiz:', {
            prev: activeScanContextRef.current,
            newPortal: { week: detected.detectedWeek, title: detected.detectedAssignmentTitle },
          });
          // Clear stale results from previous week so the extension reloads for the new quiz
          setScanResults([]);
          activeScanContextRef.current = null;
          StorageService.clearActiveScanSession();
          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.remove(['swayam_persisted_results']);
          }
          setActiveTab('scanner');
        }
      }

      if (detected.isSwayam && detected.detectedCourseTitle) {
        const portalTitleNorm = normalizeCourseForMatch(detected.detectedCourseTitle);
        const matchedCourse = currentCourses.find((c) => {
          const cNameNorm = normalizeCourseForMatch(c.name);
          return (
            cNameNorm === portalTitleNorm ||
            (portalTitleNorm.length > 3 && cNameNorm.includes(portalTitleNorm)) ||
            (cNameNorm.length > 3 && portalTitleNorm.includes(cNameNorm))
          );
        });

        if (matchedCourse) {
          setSelectedCourseId(matchedCourse.id);
          await StorageService.setSelectedCourseId(matchedCourse.id);
        } else if (currentCourses.length > 0) {
          // Auto-register new course record for the newly discovered portal course
          const cleanedName = detected.detectedCourseTitle
            .replace(/^(?:course|swayam|nptel|portal)\s*[:\/-]\s*/gi, '')
            .replace(/\s*[-—|:]\s*(?:swayam|nptel).*/gi, '')
            .trim();
          const newCourseId = `course-${Date.now()}`;
          const newCourse: Course = {
            id: newCourseId,
            name: cleanedName || detected.detectedCourseTitle,
            externalCourseId: detected.detectedExternalId,
            description: `Auto-discovered course on SWAYAM portal (${cleanedName || detected.detectedCourseTitle})`,
            isDefault: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await StorageService.saveCourse(newCourse);
          setCourses((prev) => [...prev, newCourse]);
          setSelectedCourseId(newCourseId);
          await StorageService.setSelectedCourseId(newCourseId);
        }
      }
    } catch {
      // Non-blocking fallback
    }
  }, []);

  // Load courses and initial data + restore active scan session
  const loadData = useCallback(async () => {
    try {
      await StorageService.initDefaults();
      const allCourses = await StorageService.getCourses();

      // Sanitize legacy course titles and deduplicate if duplicate discovered
      const sanitizedCourses: Course[] = [];
      for (const course of allCourses) {
        const cleanedName = course.name
          .replace(/^(?:course|swayam|nptel|portal)\s*[:\/-]\s*/gi, '')
          .replace(/\s*[-—|:]\s*(?:swayam|nptel).*/gi, '')
          .trim();
        const updatedCourse =
          cleanedName && cleanedName !== course.name
            ? { ...course, name: cleanedName }
            : course;

        const norm = normalizeCourseForMatch(updatedCourse.name);
        const existingIdx = sanitizedCourses.findIndex(
          (u) => normalizeCourseForMatch(u.name) === norm
        );

        if (existingIdx === -1) {
          sanitizedCourses.push(updatedCourse);
        } else if (course.isDefault) {
          sanitizedCourses[existingIdx] = updatedCourse;
        }
      }
      setCourses(sanitizedCourses);

      const activeId = await StorageService.getSelectedCourseId();
      setSelectedCourseId(activeId);

      const allQuestions = await StorageService.getQuestions();
      setQuestions(allQuestions);

      // Proactively detect active portal tab first
      const detected = await PageConnectionService.detectActivePortal();
      setPortalInfo(detected);

      // Check and restore active scan session (prevents reset when switching tabs or reopening popup)
      const savedSession = await StorageService.getActiveScanSession();
      if (savedSession && savedSession.results && savedSession.results.length > 0) {
        // If the active portal tab is on a DIFFERENT week or quiz than the saved session, clear stale questions
        const isDifferentWeekOrQuiz =
          detected.isSwayam &&
          PageConnectionService.isAssignmentOrWeekDifferent(
            {
              url: savedSession.url,
              detectedWeek: savedSession.detectedWeek,
              assignmentTitle: savedSession.assignmentTitle,
            },
            detected
          );

        if (isDifferentWeekOrQuiz) {
          console.log('[swayam404] Active portal tab is on a different week/quiz than saved session. Clearing stale questions:', {
            savedWeek: savedSession.detectedWeek,
            portalWeek: detected.detectedWeek,
          });
          await StorageService.clearActiveScanSession();
          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            await chrome.storage.local.remove(['swayam_persisted_results']);
          }
          setScanResults([]);
          activeScanContextRef.current = null;
          setActiveTab('scanner');
        } else {
          setScanResults(savedSession.results);
          activeScanContextRef.current = {
            url: savedSession.url,
            detectedWeek: savedSession.detectedWeek,
            assignmentTitle: savedSession.assignmentTitle,
          };
          if (savedSession.courseId) {
            setSelectedCourseId(savedSession.courseId);
          }
          // Auto-navigate to scanner if saved questions exist
          setActiveTab('scanner');
        }
      } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const persisted = await new Promise<any>((resolve) => {
          chrome.storage.local.get(['swayam_persisted_results'], (res) => resolve(res?.swayam_persisted_results));
        });
        if (persisted && Array.isArray(persisted) && persisted.length > 0) {
          setScanResults(persisted);
          setActiveTab('scanner');
        }
      }

      await syncPortalContext(allCourses);
    } catch (e) {
      console.error('Failed to load swayam404 storage:', e);
    } finally {
      setIsLoading(false);
    }
  }, [syncPortalContext]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update active scan context whenever scanResults changes
  useEffect(() => {
    if (scanResults.length > 0 && portalInfo?.isSwayam) {
      activeScanContextRef.current = {
        url: portalInfo.url,
        detectedWeek: portalInfo.detectedWeek,
        assignmentTitle: portalInfo.detectedAssignmentTitle || portalInfo.tabTitle,
      };
    } else if (scanResults.length === 0) {
      activeScanContextRef.current = null;
    }
  }, [scanResults.length, portalInfo?.url, portalInfo?.detectedWeek, portalInfo?.detectedAssignmentTitle, portalInfo?.tabTitle, portalInfo?.isSwayam]);

  // Listen for tab switching, window focus, and SPA navigation messages
  useEffect(() => {
    const handleTabChange = () => {
      syncPortalContext(courses);
    };

    const handleRuntimeMessage = (message: any) => {
      if (message?.type === 'SWAYAM_TAB_NAVIGATION' || message?.type === 'SWAYAM_PORTAL_UPDATED') {
        syncPortalContext(courses);
      }
    };

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.onActivated?.addListener(handleTabChange);
      chrome.tabs.onUpdated?.addListener(handleTabChange);
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleTabChange);
    }

    return () => {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.onActivated?.removeListener(handleTabChange);
        chrome.tabs.onUpdated?.removeListener(handleTabChange);
      }
      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleTabChange);
      }
    };
  }, [courses, syncPortalContext]);

  // System-based Dark Mode sync
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark');
      }
    };
    handleThemeChange(mediaQuery);
    mediaQuery.addEventListener('change', handleThemeChange);
    return () => mediaQuery.removeEventListener('change', handleThemeChange);
  }, []);

  // Handle active course change (without wiping active scan results)
  const handleSelectCourse = async (courseId: string) => {
    setSelectedCourseId(courseId);
    await StorageService.setSelectedCourseId(courseId);
  };

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];
  const courseQuestions = questions.filter((q) => q.courseId === selectedCourseId);
  const pendingReviewCount = scanResults.filter(
    (r) => r.status === 'probable-match' || r.status === 'ambiguous-match' || r.requiresReview
  ).length;

  if (isLoading) {
    return (
      <div
        className="app-container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          fontFamily: 'var(--font-headline)',
          fontSize: '12px',
          fontWeight: 700,
          color: 'var(--text-main)',
        }}
      >
        Initializing swayam404…
      </div>
    );
  }

  return (
    <div className="app-container">
      <div style={{ position: 'sticky', top: 0, zIndex: 40, background: 'var(--bg-surface-elevated)' }}>
        <Header
          courses={courses}
          selectedCourseId={selectedCourseId}
          portalInfo={portalInfo}
          onSelectCourse={handleSelectCourse}
          onOpenSettings={() => setActiveTab('settings')}
        />

        <Navigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
          reviewCount={pendingReviewCount}
          onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
        />
      </div>

      <main className="main-content">
        {activeTab === 'dashboard' && (
          <DashboardTab
            courses={courses}
            selectedCourse={selectedCourse}
            questionCount={courseQuestions.length}
            scanResults={scanResults}
            onNavigateToScan={() => setActiveTab('scanner')}
            onNavigateToCompletion={() => setActiveTab('course-completion')}
            onNavigateToCourses={() => setActiveTab('courses')}
            onNavigateToImport={() => setActiveTab('import-export')}
            onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
          />
        )}

        {activeTab === 'course-completion' && (
          <CourseCompletionDashboard
            courses={courses}
            selectedCourse={selectedCourse}
            onSelectCourse={handleSelectCourse}
            onNavigateToScan={() => setActiveTab('scanner')}
            setAppScanResults={setScanResults}
            onRefreshData={loadData}
          />
        )}

        {activeTab === 'scanner' && (
          <ScannerTab
            courses={courses}
            selectedCourse={selectedCourse}
            portalInfo={portalInfo}
            answerBank={courseQuestions}
            results={scanResults}
            setResults={setScanResults}
            onRefreshData={loadData}
            onSelectCourse={handleSelectCourse}
          />
        )}

        {activeTab === 'courses' && (
          <CourseLibraryTab
            courses={courses}
            selectedCourseId={selectedCourseId}
            onSelectCourse={handleSelectCourse}
            onRefreshCourses={loadData}
            questions={questions}
          />
        )}

        {activeTab === 'import-export' && (
          <ImportExportTab
            courses={courses}
            selectedCourseId={selectedCourseId}
            onRefreshData={loadData}
          />
        )}

        {activeTab === 'settings' && <SettingsTab onRefreshData={loadData} />}
      </main>

      <DiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
      />
    </div>
  );
};
