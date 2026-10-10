import React, { useState, useEffect, useCallback } from 'react';
import { Course, QuestionRecord, QuestionMatchResult } from '@/types';
import { StorageService } from '@/lib/storage';
import { Header } from '@/components/Header';
import { Navigation, ActiveTab } from '@/components/Navigation';
import { DashboardTab } from '@/features/dashboard/DashboardTab';
import { ScannerTab } from '@/features/scanner/ScannerTab';
import { CourseLibraryTab } from '@/features/courses/CourseLibraryTab';
import { ImportExportTab } from '@/features/answer-bank/ImportExportTab';
import { SettingsTab } from '@/features/settings/SettingsTab';

export const App: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [scanResults, setScanResults] = useState<QuestionMatchResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load courses and initial data
  const loadData = useCallback(async () => {
    try {
      await StorageService.initDefaults();
      const allCourses = await StorageService.getCourses();
      setCourses(allCourses);

      const activeId = await StorageService.getSelectedCourseId();
      setSelectedCourseId(activeId);

      const allQuestions = await StorageService.getQuestions();
      setQuestions(allQuestions);
    } catch (e) {
      console.error('Failed to load swayam404 storage:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle active course change
  const handleSelectCourse = async (courseId: string) => {
    setSelectedCourseId(courseId);
    await StorageService.setSelectedCourseId(courseId);
    // If scan results were present, reset or prompt user since course context changed
    if (scanResults.length > 0) {
      setScanResults([]);
    }
  };

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];
  const courseQuestions = questions.filter((q) => q.courseId === selectedCourseId);
  const pendingReviewCount = scanResults.filter(
    (r) => r.status === 'probable-match' || r.status === 'ambiguous-match'
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
          color: '#94a3b8',
          fontSize: '12px',
        }}
      >
        Initializing swayam404...
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header
        courses={courses}
        selectedCourseId={selectedCourseId}
        onSelectCourse={handleSelectCourse}
      />

      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        reviewCount={pendingReviewCount}
      />

      <main className="main-content">
        {activeTab === 'dashboard' && (
          <DashboardTab
            courses={courses}
            selectedCourse={selectedCourse}
            questionCount={courseQuestions.length}
            onNavigateToScan={() => setActiveTab('scanner')}
            onNavigateToCourses={() => setActiveTab('courses')}
            onNavigateToImport={() => setActiveTab('import-export')}
          />
        )}

        {activeTab === 'scanner' && (
          <ScannerTab
            selectedCourse={selectedCourse}
            answerBank={courseQuestions}
            results={scanResults}
            setResults={setScanResults}
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
    </div>
  );
};
