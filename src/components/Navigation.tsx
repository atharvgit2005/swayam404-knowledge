import React from 'react';
import {
  LayoutDashboard,
  ScanLine,
  Layers,
  ArrowDownUp,
  Settings,
} from 'lucide-react';

export type ActiveTab = 'dashboard' | 'scanner' | 'courses' | 'import-export' | 'settings';

interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  reviewCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  reviewCount = 0,
}) => {
  return (
    <nav className="nav-tabs">
      <button
        className={`nav-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
        onClick={() => onTabChange('dashboard')}
      >
        <LayoutDashboard size={14} />
        Dashboard
      </button>

      <button
        className={`nav-tab-btn ${activeTab === 'scanner' ? 'active' : ''}`}
        onClick={() => onTabChange('scanner')}
      >
        <ScanLine size={14} />
        Scan & Review
        {reviewCount > 0 && (
          <span
            style={{
              background: '#4f46e5',
              color: '#fff',
              fontSize: '10px',
              padding: '1px 5px',
              borderRadius: '999px',
              marginLeft: '2px',
            }}
          >
            {reviewCount}
          </span>
        )}
      </button>

      <button
        className={`nav-tab-btn ${activeTab === 'courses' ? 'active' : ''}`}
        onClick={() => onTabChange('courses')}
      >
        <Layers size={14} />
        Courses
      </button>

      <button
        className={`nav-tab-btn ${activeTab === 'import-export' ? 'active' : ''}`}
        onClick={() => onTabChange('import-export')}
      >
        <ArrowDownUp size={14} />
        Import / Export
      </button>

      <button
        className={`nav-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => onTabChange('settings')}
      >
        <Settings size={14} />
        Settings
      </button>
    </nav>
  );
};
