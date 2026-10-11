import React, { useState, useEffect, useCallback } from 'react';
import { Course, QuestionMatchResult, ScanResultMessage } from '@/types';
import { PageConnectionService, pageConnectionService } from '@/lib/connection/pageConnection';
import {
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Zap,
  BookOpen,
} from 'lucide-react';

interface DashboardTabProps {
  courses: Course[];
  selectedCourse: Course | undefined;
  questionCount: number;
  scanResults?: QuestionMatchResult[];
  onNavigateToScan: () => void;
  onNavigateToCompletion?: () => void;
  onNavigateToCourses: () => void;
  onNavigateToImport?: () => void;
  onOpenDiagnostics?: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  courses: _courses,
  selectedCourse,
  questionCount,
  scanResults = [],
  onNavigateToScan,
  onNavigateToCompletion,
  onNavigateToCourses,
  onNavigateToImport: _onNavigateToImport,
  onOpenDiagnostics: _onOpenDiagnostics,
}) => {
  const [detectionState, setDetectionState] = useState<
    'detecting' | 'ready-to-scan' | 'assignment-detected' | 'unsupported-page' | 'connection-error'
  >('detecting');
  const [detectedTitle, setDetectedTitle] = useState<string>('');
  const [detectedQuestionCount, setDetectedQuestionCount] = useState<number | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Check active tab on mount
  const checkActiveTab = useCallback(async () => {
    setDetectionState('detecting');
    setStatusMessage(null);

    try {
      const tabInfo = await PageConnectionService.getActiveTab();
      if (!tabInfo.isSupported) {
        setDetectionState('unsupported-page');
        setDetectedTitle('No assignment detected');
        setStatusMessage(tabInfo.error || 'Open a SWAYAM/NPTEL assignment tab to begin.');
        return;
      }

      // Check if page has an assignment form via quick scan or tab title
      try {
        const pingResponse = await pageConnectionService.queryTab<ScanResultMessage>({
          type: 'SCAN_ASSIGNMENT',
        });

        if (pingResponse.questions && pingResponse.questions.length > 0) {
          setDetectionState('assignment-detected');
          setDetectedTitle(pingResponse.detectedAssignmentTitle || pingResponse.pageTitle || 'Active Assignment Form');
          setDetectedQuestionCount(pingResponse.questions.length);
        } else {
          setDetectionState('ready-to-scan');
          setDetectedTitle(pingResponse.detectedAssignmentTitle || pingResponse.pageTitle || 'SWAYAM / NPTEL Course Tab');
          setDetectedQuestionCount(null);
        }
      } catch {
        // Tab is supported URL but content script or assignment questions not parsed yet
        const title = tabInfo.tab?.title || 'SWAYAM / NPTEL Tab';
        setDetectionState('ready-to-scan');
        setDetectedTitle(title);
      }
    } catch {
      setDetectionState('connection-error');
      setDetectedTitle('Page connection required');
      setStatusMessage('Could not reach active tab. Click reconnect to retry.');
    }
  }, []);

  useEffect(() => {
    checkActiveTab();
  }, [checkActiveTab]);

  const handlePrimaryAction = () => {
    if (scanResults.length > 0) {
      // Results already available -> jump directly to Review
      onNavigateToScan();
      return;
    }

    if (detectionState === 'unsupported-page' || detectionState === 'connection-error') {
      checkActiveTab();
      return;
    }

    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      onNavigateToScan();
    }, 400);
  };

  const handleOpenFixture = (fixtureFile: string) => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const url = chrome.runtime.getURL(`fixtures/${fixtureFile}`);
      chrome.tabs.create({ url });
    } else {
      window.open(`/fixtures/${fixtureFile}`, '_blank');
    }
  };

  const approvedCount = scanResults.filter((r) => r.isApproved).length;

  // Determine dynamic primary button text and state
  const getPrimaryButtonConfig = () => {
    if (isScanning) {
      return {
        label: 'Scanning assignment…',
        disabled: true,
        icon: <RefreshCw size={14} className="animate-spin" />,
      };
    }

    if (scanResults.length > 0) {
      if (approvedCount > 0) {
        return {
          label: `Fill ${approvedCount} Reviewed Answers →`,
          disabled: false,
          icon: <CheckCircle2 size={14} />,
        };
      }
      return {
        label: `Review ${scanResults.length} Results →`,
        disabled: false,
        icon: <ArrowRight size={14} />,
      };
    }

    if (detectionState === 'assignment-detected') {
      return {
        label: detectedQuestionCount
          ? `Scan Assignment (${detectedQuestionCount} Qs) →`
          : 'Scan Assignment →',
        disabled: false,
        icon: <ArrowRight size={14} />,
      };
    }

    if (detectionState === 'ready-to-scan') {
      return {
        label: 'Scan Current Tab →',
        disabled: false,
        icon: <ArrowRight size={14} />,
      };
    }

    if (detectionState === 'detecting') {
      return {
        label: 'Checking active tab…',
        disabled: true,
        icon: <RefreshCw size={14} className="animate-spin" />,
      };
    }

    return {
      label: 'Retry Page Detection',
      disabled: false,
      icon: <RefreshCw size={14} />,
    };
  };

  const primaryBtn = getPrimaryButtonConfig();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* ONE Compact Current-Assignment Panel */}
      <section
        className="card"
        style={{
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Header Strip: Course Name + Status Tag */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '6px' }}>
          <div>
            <div style={{ fontSize: '10px', fontFamily: 'var(--font-headline)', fontWeight: 800, textTransform: 'uppercase', color: '#71717a', letterSpacing: '0.04em' }}>
              Current Course
            </div>
            <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '15px', textTransform: 'uppercase', color: 'var(--text-main, #1a1a1a)', letterSpacing: '-0.01em', marginTop: '1px' }}>
              {selectedCourse?.name || 'Economics (ECON-101)'}
            </div>
          </div>

          {/* Single concise status badge */}
          <div
            style={{
              padding: '2px 8px',
              border: '1.5px solid var(--border-medium, #1a1a1a)',
              background:
                detectionState === 'assignment-detected'
                  ? '#ffcc00'
                  : detectionState === 'ready-to-scan'
                  ? 'var(--bg-surface-elevated, #ffffff)'
                  : '#ffdad6',
              color: detectionState === 'connection-error' ? '#cc0000' : '#1a1a1a',
              fontFamily: 'var(--font-headline)',
              fontWeight: 800,
              fontSize: '10px',
              textTransform: 'uppercase',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {detectionState === 'assignment-detected' && <span style={{ width: '6px', height: '6px', background: '#1a1a1a', display: 'inline-block' }}></span>}
            {detectionState === 'ready-to-scan' && <span style={{ width: '6px', height: '6px', background: '#10b981', display: 'inline-block' }}></span>}
            {detectionState === 'connection-error' && <AlertTriangle size={11} />}
            {detectionState === 'assignment-detected'
              ? `Assignment Detected${detectedQuestionCount ? ` · ${detectedQuestionCount} Qs` : ''}`
              : detectionState === 'ready-to-scan'
              ? 'Ready to Scan'
              : detectionState === 'detecting'
              ? 'Detecting…'
              : 'No Assignment Detected'}
          </div>
        </div>

        {/* Detected Assignment Info */}
        <div
          style={{
            background: 'var(--bg-surface-container, #f2ede5)',
            border: '1.5px solid var(--border-medium, #1a1a1a)',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-dim, #71717a)', textTransform: 'uppercase' }}>
            Target Page
          </div>
          <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '14px', color: 'var(--text-main, #1a1a1a)' }}>
            {detectedTitle || 'No assignment detected'}
          </div>
          {statusMessage && (
            <div style={{ fontSize: '11px', fontFamily: 'var(--font-body)', color: 'var(--text-muted, #4a4a4a)', marginTop: '2px' }}>
              {statusMessage}
            </div>
          )}
        </div>

        {/* ONE Dominant Action Button */}
        <button
          className="btn btn-primary"
          onClick={handlePrimaryAction}
          disabled={primaryBtn.disabled}
          style={{
            width: '100%',
            padding: '12px 16px',
            fontSize: '13px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {primaryBtn.icon}
          <span>{primaryBtn.label}</span>
        </button>

        {/* Quiet Safety Assurance */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '10px',
            fontFamily: 'var(--font-headline)',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'var(--text-dim, #71717a)',
            paddingTop: '2px',
          }}
        >
          <ShieldCheck size={13} style={{ color: 'var(--text-main, #1a1a1a)' }} />
          <span>Manual final submit on portal is strictly mandatory</span>
        </div>
      </section>

      {/* Relevant Secondary Actions & Shortcuts */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {onNavigateToCompletion && (
          <button
            className="btn btn-secondary"
            onClick={onNavigateToCompletion}
            style={{
              padding: '10px 12px',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'var(--font-headline)',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Zap size={13} />
            <span>Course Progress</span>
          </button>
        )}

        <button
          className="btn btn-secondary"
          onClick={onNavigateToCourses}
          style={{
            padding: '10px 12px',
            fontSize: '11px',
            fontWeight: 700,
            fontFamily: 'var(--font-headline)',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <BookOpen size={13} />
          <span>Answer Bank ({questionCount})</span>
        </button>
      </section>

      {/* Quiet Test Fixtures Drawer (Offline Demo Helper) */}
      <details className="brutal-details" style={{ marginTop: '2px' }}>
        <summary style={{ fontSize: '11px', color: '#71717a' }}>
          ▸ Offline Test Fixtures
        </summary>
        <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => handleOpenFixture('economics-assignment.html')}
            style={{ fontSize: '10px', padding: '5px 8px' }}
          >
            <ExternalLink size={10} /> Economics Quiz
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleOpenFixture('economics-course-outline.html')}
            style={{ fontSize: '10px', padding: '5px 8px' }}
          >
            <ExternalLink size={10} /> Course Outline
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleOpenFixture('submitted-feedback-assignment.html')}
            style={{ fontSize: '10px', padding: '5px 8px' }}
          >
            <ExternalLink size={10} /> Graded Feedback
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleOpenFixture('entrepreneurship-assignment.html')}
            style={{ fontSize: '10px', padding: '5px 8px' }}
          >
            <ExternalLink size={10} /> Entrepreneurship
          </button>
        </div>
      </details>
    </div>
  );
};
