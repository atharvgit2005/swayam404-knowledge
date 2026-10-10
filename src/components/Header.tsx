import React from 'react';
import { Course } from '@/types';
import { BookOpen, Sidebar } from 'lucide-react';

interface HeaderProps {
  courses: Course[];
  selectedCourseId: string;
  onSelectCourse: (id: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  courses,
  selectedCourseId,
  onSelectCourse,
}) => {
  const handleOpenSidePanel = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.sidePanel) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.sidePanel.open({ tabId: tabs[0].id }).catch((e) => {
            console.warn('Side panel open error:', e);
          });
        }
      });
    }
  };

  return (
    <header className="header-bar">
      <div className="brand-section">
        <div className="brand-icon">404</div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="brand-title">swayam404</span>
            <span className="brand-badge">Assistant</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div className="course-quick-select" title="Active Course">
          <BookOpen size={13} style={{ color: '#818cf8', flexShrink: 0 }} />
          <select
            value={selectedCourseId}
            onChange={(e) => onSelectCourse(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#f8fafc',
              fontSize: '11px',
              fontWeight: 600,
              padding: 0,
              cursor: 'pointer',
              width: '100%',
              maxWidth: '140px',
              textOverflow: 'ellipsis',
            }}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id} style={{ background: '#111726', color: '#f8fafc' }}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {typeof chrome !== 'undefined' && chrome.sidePanel && (
          <button
            className="btn btn-secondary"
            onClick={handleOpenSidePanel}
            title="Expand to Side Panel"
            style={{ padding: '5px 7px' }}
          >
            <Sidebar size={13} />
          </button>
        )}
      </div>
    </header>
  );
};
