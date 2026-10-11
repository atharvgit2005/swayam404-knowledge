import React from 'react';
import {
  LayoutDashboard,
  GraduationCap,
  ScanLine,
  Layers,
  ArrowDownUp,
  Settings,
  Activity,
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
  return (
    <nav className="nav-tabs" style={{ position: 'relative' }}>
      <button
        className={`nav-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
        onClick={() => onTabChange('dashboard')}
      >
        <LayoutDashboard size={12} />
        <span>Dashboard</span>
      </button>

      <button
        className={`nav-tab-btn ${activeTab === 'scanner' ? 'active' : ''}`}
        onClick={() => onTabChange('scanner')}
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
        onClick={() => onTabChange('course-completion')}
      >
        <GraduationCap size={12} />
        <span>Progress</span>
      </button>

      <button
        className={`nav-tab-btn ${activeTab === 'courses' ? 'active' : ''}`}
        onClick={() => onTabChange('courses')}
      >
        <Layers size={12} />
        <span>Banks</span>
      </button>

      <button
        className={`nav-tab-btn ${activeTab === 'import-export' ? 'active' : ''}`}
        onClick={() => onTabChange('import-export')}
      >
        <ArrowDownUp size={12} />
        <span>Import/Export</span>
      </button>

      <button
        className={`nav-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => onTabChange('settings')}
        title="Settings"
      >
        <Settings size={12} />
        <span>Settings</span>
      </button>

      {onOpenDiagnostics && (
        <button
          className="nav-tab-btn"
          onClick={onOpenDiagnostics}
          title="Open Diagnostics Trace"
          style={{ padding: '4px 6px' }}
        >
          <Activity size={12} />
        </button>
      )}
    </nav>
  );
};
