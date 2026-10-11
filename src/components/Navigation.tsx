import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  GraduationCap,
  ScanLine,
  Layers,
  ArrowDownUp,
  Settings,
  Activity,
  ChevronDown,
} from 'lucide-react';

export type ActiveTab =
  | 'dashboard'
  | 'course-completion'
  | 'scanner'
  | 'courses'
  | 'import-export'
  | 'settings';

interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  reviewCount?: number;
  onOpenDiagnostics?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  reviewCount = 0,
  onOpenDiagnostics,
}) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    if (isMoreOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isMoreOpen]);

  const isMoreActive =
    activeTab === 'courses' || activeTab === 'import-export' || activeTab === 'settings';

  const getMoreLabel = () => {
    if (activeTab === 'courses') return 'More: Banks';
    if (activeTab === 'import-export') return 'More: Import';
    if (activeTab === 'settings') return 'More: Settings';
    return 'More';
  };

  return (
    <nav className="nav-tabs" style={{ position: 'relative' }}>
      <button
        className={`nav-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
        onClick={() => {
          setIsMoreOpen(false);
          onTabChange('dashboard');
        }}
      >
        <LayoutDashboard size={12} />
        <span>Dashboard</span>
      </button>

      <button
        className={`nav-tab-btn ${activeTab === 'scanner' ? 'active' : ''}`}
        onClick={() => {
          setIsMoreOpen(false);
          onTabChange('scanner');
        }}
      >
        <ScanLine size={12} />
        <span>Scan & Review</span>
        {reviewCount > 0 && (
          <span
            style={{
              background: '#e63b2e',
              color: '#ffffff',
              fontSize: '9px',
              fontWeight: 800,
              padding: '1px 4px',
              border: '1px solid #1a1a1a',
              marginLeft: '2px',
            }}
          >
            {reviewCount}
          </span>
        )}
      </button>

      <button
        className={`nav-tab-btn ${activeTab === 'course-completion' ? 'active' : ''}`}
        onClick={() => {
          setIsMoreOpen(false);
          onTabChange('course-completion');
        }}
      >
        <GraduationCap size={12} />
        <span>Course Progress</span>
      </button>

      {/* "More" Secondary Navigation Menu */}
      <div ref={moreRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          className={`nav-tab-btn ${isMoreActive ? 'active' : ''}`}
          onClick={() => setIsMoreOpen((prev) => !prev)}
          style={{ display: 'flex', alignItems: 'center', gap: '3px' }}
        >
          <span>{getMoreLabel()}</span>
          <ChevronDown size={11} style={{ transform: isMoreOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>

        {isMoreOpen && (
          <div
            className="nav-more-dropdown"
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              background: 'var(--bg-surface-elevated, #ffffff)',
              border: '2px solid var(--border-medium, #1a1a1a)',
              boxShadow: '4px 4px 0px var(--shadow-brutal, #1a1a1a)',
              zIndex: 50,
              minWidth: '170px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <button
              onClick={() => {
                setIsMoreOpen(false);
                onTabChange('courses');
              }}
              className="nav-more-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                border: 'none',
                borderBottom: '1px solid var(--border-subtle, #eee9e0)',
                background: activeTab === 'courses' ? '#ffcc00' : 'transparent',
                fontFamily: 'var(--font-headline)',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: activeTab === 'courses' ? '#1a1a1a' : 'var(--text-main, #1a1a1a)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Layers size={13} />
              <span>Courses & Banks</span>
            </button>

            <button
              onClick={() => {
                setIsMoreOpen(false);
                onTabChange('import-export');
              }}
              className="nav-more-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                border: 'none',
                borderBottom: '1px solid var(--border-subtle, #eee9e0)',
                background: activeTab === 'import-export' ? '#ffcc00' : 'transparent',
                fontFamily: 'var(--font-headline)',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: activeTab === 'import-export' ? '#1a1a1a' : 'var(--text-main, #1a1a1a)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <ArrowDownUp size={13} />
              <span>Import / Export</span>
            </button>

            <button
              onClick={() => {
                setIsMoreOpen(false);
                onTabChange('settings');
              }}
              className="nav-more-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                border: 'none',
                borderBottom: onOpenDiagnostics ? '1px solid var(--border-subtle, #eee9e0)' : 'none',
                background: activeTab === 'settings' ? '#ffcc00' : 'transparent',
                fontFamily: 'var(--font-headline)',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: activeTab === 'settings' ? '#1a1a1a' : 'var(--text-main, #1a1a1a)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Settings size={13} />
              <span>Settings</span>
            </button>

            {onOpenDiagnostics && (
              <button
                onClick={() => {
                  setIsMoreOpen(false);
                  onOpenDiagnostics();
                }}
                className="nav-more-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  border: 'none',
                  background: 'var(--bg-surface, #f2ede5)',
                  fontFamily: 'var(--font-headline)',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: 'var(--text-main, #1a1a1a)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Activity size={13} />
                <span>Diagnostics Trace</span>
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};
