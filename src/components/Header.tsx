import { Course, PortalTabInfo } from '@/types';
import { Sidebar, Settings, Wifi, WifiOff, Calendar, Flag } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { networkDiagnostics, NetworkDiagnosis } from '@/lib/connection/networkDiagnostics';
import { CourseSelector } from './CourseSelector';

interface HeaderProps {
  courses: Course[];
  selectedCourseId: string;
  portalInfo?: PortalTabInfo | null;
  onSelectCourse: (id: string) => void;
  onOpenSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  courses,
  selectedCourseId,
  portalInfo,
  onSelectCourse,
  onOpenSettings,
}) => {
  const [netDiagnosis, setNetDiagnosis] = useState<NetworkDiagnosis>(
    networkDiagnostics.getCurrentDiagnosis()
  );

  const [isSidePanel, setIsSidePanel] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.location.pathname.includes('sidepanel') ||
      document.body.classList.contains('sidepanel-mode')
    );
  });

  useEffect(() => {
    return networkDiagnostics.subscribe(setNetDiagnosis);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isSide =
        window.location.pathname.includes('sidepanel') ||
        document.body.classList.contains('sidepanel-mode');
      setIsSidePanel(isSide);
    }
  }, []);

  const handleToggleSidePanel = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      if (isSidePanel) {
        // Inside side panel: close / turn off the sidebar
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tabId = tabs[0]?.id;
          try {
            if (tabId && (chrome.sidePanel as any)?.close) {
              (chrome.sidePanel as any).close({ tabId }).catch(() => {});
            }
          } catch {}
          window.close();
        });
      } else if (chrome.sidePanel) {
        // Inside popup: open side panel AND close popup so both do not co-exist
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          const tabId = tabs[0]?.id;
          if (tabId) {
            try {
              await chrome.sidePanel.open({ tabId });
            } catch (e) {
              console.warn('Side panel open error:', e);
            }
            // Dismiss popup window so it converts cleanly to sidebar
            window.close();
          }
        });
      }
    } else {
      // Standalone web / preview fallback
      window.close();
    }
  };

  return (
    <header className="header-bar">
      {/* Brand & Connection State */}
      <div className="header-brand-section">
        <div className="brand-title-wrap">
          <span className="brand-title-text">
            SWAYAM
          </span>
          <span className="brand-tag-404">
            404
          </span>
        </div>

        {/* Dynamic Portal Connection Badge Container */}
        <div className="header-badges-container">
          {(() => {
            const isWebAiActive = portalInfo?.isChatGpt || portalInfo?.isWebAi;
            const webAiLabel = portalInfo?.webAiProvider === 'claude'
              ? 'CLAUDE'
              : portalInfo?.webAiProvider === 'gemini'
              ? 'GEMINI'
              : 'CHATGPT';

            return (
              <div
                className="portal-badge"
                style={{
                  background: portalInfo?.isSwayam
                    ? '#dcfce7'
                    : isWebAiActive
                    ? '#fef08a'
                    : 'var(--bg-surface-elevated, #f3f4f6)',
                  border: '1.5px solid var(--border-medium, #1a1a1a)',
                  boxShadow: '1px 1px 0px var(--border-medium, #1a1a1a)',
                }}
                title={
                  portalInfo?.isSwayam
                    ? `Connected to SWAYAM Portal: ${portalInfo.detectedAssignmentTitle || portalInfo.tabTitle || ''}`
                    : isWebAiActive
                    ? `${webAiLabel} Web Bridge Tab Active`
                    : 'Portal Standby (navigate to a SWAYAM tab)'
                }
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    background: portalInfo?.isSwayam
                      ? '#10b981'
                      : isWebAiActive
                      ? '#f59e0b'
                      : '#9ca3af',
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                ></span>
                <span
                  style={{
                    color: portalInfo?.isSwayam || isWebAiActive ? '#1a1a1a' : 'var(--text-main)',
                  }}
                >
                  {portalInfo?.isSwayam
                    ? 'SWAYAM'
                    : isWebAiActive
                    ? webAiLabel
                    : 'STANDBY'}
                </span>
              </div>
            );
          })()}

          {/* Identified Week Badge */}
          {portalInfo?.detectedWeek && (
            <div
              className="portal-badge week-badge"
              style={{
                background: '#dbeafe',
                border: '1.5px solid var(--border-medium, #1a1a1a)',
                boxShadow: '1px 1px 0px var(--border-medium, #1a1a1a)',
                color: '#1e40af',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title={`Active Week on Portal: ${portalInfo.detectedWeek}${portalInfo.detectedAssignmentTitle ? ` (${portalInfo.detectedAssignmentTitle})` : ''}`}
            >
              <Calendar size={10} />
              <span>{portalInfo.detectedWeek.toUpperCase()}</span>
            </div>
          )}

          {/* Already Submitted Badge */}
          {portalInfo?.isAlreadySubmitted && (
            <div
              className="portal-badge submitted-badge"
              style={{
                background: '#bbf7d0',
                border: '1.5px solid var(--border-medium, #1a1a1a)',
                boxShadow: '1px 1px 0px var(--border-medium, #1a1a1a)',
                color: '#15803d',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title={portalInfo.submissionStatus?.statusText || 'Assignment already submitted on portal.'}
            >
              <Flag size={10} />
              <span>SUBMITTED</span>
            </div>
          )}

          {/* Internet Connection Alert Badge */}
          {!netDiagnosis.isOnline ? (
            <div
              onClick={() => networkDiagnostics.checkConnectivity(true)}
              className="portal-badge error-badge"
              style={{
                background: '#fee2e2',
                border: '1.5px solid #b91c1c',
                boxShadow: '1px 1px 0px #b91c1c',
                color: '#b91c1c',
                cursor: 'pointer',
              }}
              title={`${netDiagnosis.message} Click to test reconnect.`}
            >
              <WifiOff size={10} />
              <span>OFFLINE</span>
            </div>
          ) : netDiagnosis.state === 'unstable' ? (
            <div
              onClick={() => networkDiagnostics.checkConnectivity(true)}
              className="portal-badge warn-badge"
              style={{
                background: '#fef3c7',
                border: '1.5px solid #d97706',
                boxShadow: '1px 1px 0px #d97706',
                color: '#b45309',
                cursor: 'pointer',
              }}
              title={`${netDiagnosis.message} Click to test latency.`}
            >
              <Wifi size={10} />
              <span>SLOW</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Course Context & Controls */}
      <div className="header-controls-section">
        <CourseSelector
          courses={courses}
          selectedCourseId={selectedCourseId}
          onSelectCourse={onSelectCourse}
        />

        {/* Side Panel Toggle Button */}
        {((typeof chrome !== 'undefined' && chrome.sidePanel) ||
          (typeof window !== 'undefined' && !window.chrome)) && (
          <button
            className={`btn ${isSidePanel ? 'btn-sidepanel-active' : 'btn-secondary'}`}
            onClick={handleToggleSidePanel}
            title={isSidePanel ? 'Close Side Panel' : 'Open in Chrome Side Panel'}
            style={{
              padding: '4px 6px',
              height: '28px',
              fontSize: '10px',
              background: isSidePanel ? '#ffcc00' : undefined,
              color: isSidePanel ? '#1a1a1a' : undefined,
              borderColor: isSidePanel ? '#1a1a1a' : undefined,
            }}
          >
            <Sidebar size={12} />
          </button>
        )}

        {onOpenSettings && (
          <button
            className="btn btn-secondary"
            onClick={onOpenSettings}
            title="Open Settings"
            style={{ padding: '4px 6px', height: '28px' }}
          >
            <Settings size={13} />
          </button>
        )}
      </div>
    </header>
  );
};
