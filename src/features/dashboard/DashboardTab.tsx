import React from 'react';
import { Course } from '@/types';
import {
  ScanLine,
  Database,
  FileCheck2,
  ShieldCheck,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

interface DashboardTabProps {
  courses: Course[];
  selectedCourse: Course | undefined;
  questionCount: number;
  onNavigateToScan: () => void;
  onNavigateToCourses: () => void;
  onNavigateToImport: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  courses,
  selectedCourse,
  questionCount,
  onNavigateToScan,
  onNavigateToCourses,
  onNavigateToImport,
}) => {
  const handleOpenFixture = (fixtureFile: string) => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const url = chrome.runtime.getURL(`fixtures/${fixtureFile}`);
      chrome.tabs.create({ url });
    } else {
      window.open(`/fixtures/${fixtureFile}`, '_blank');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Active Course Card */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.15) 0%, rgba(30, 41, 59, 0.6) 100%)',
          borderColor: 'rgba(99, 102, 241, 0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#a5b4fc', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Active Course Context
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginTop: '2px' }}>
              {selectedCourse?.name || 'No Course Selected'}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              {selectedCourse?.description || 'Course profile active for matching and persistence.'}
            </div>
          </div>
          <button
            className="btn btn-secondary"
            onClick={onNavigateToCourses}
            style={{ fontSize: '11px', padding: '4px 8px' }}
          >
            Switch
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '14px',
            paddingTop: '12px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Database size={13} style={{ color: '#818cf8' }} />
            <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
              <strong>{questionCount}</strong> saved answers
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileCheck2 size={13} style={{ color: '#38bdf8' }} />
            <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
              <strong>{courses.length}</strong> total courses
            </span>
          </div>
        </div>
      </div>

      {/* Primary Action Button */}
      <button
        className="btn btn-primary"
        onClick={onNavigateToScan}
        style={{
          padding: '12px 16px',
          fontSize: '13px',
          justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
        }}
      >
        <ScanLine size={16} />
        Scan Current Assignment Tab
      </button>

      {/* Quick Launch & Test Fixtures */}
      <div className="card">
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
          Test on Local Assignment Fixtures
        </div>
        <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>
          Test assignment recognition, matching, and non-submitting form filling without touching live assessments:
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={() => handleOpenFixture('economics-assignment.html')}
            style={{ fontSize: '11px', flex: 1 }}
          >
            <ExternalLink size={12} />
            Economics Mock Page
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleOpenFixture('entrepreneurship-assignment.html')}
            style={{ fontSize: '11px', flex: 1 }}
          >
            <ExternalLink size={12} />
            Entrepreneurship Mock Page
          </button>
        </div>
      </div>

      {/* Quick Bank Setup */}
      {questionCount === 0 && (
        <div
          className="card"
          style={{
            borderColor: 'rgba(245, 158, 11, 0.3)',
            background: 'rgba(245, 158, 11, 0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fbbf24', fontWeight: 600, fontSize: '12px' }}>
            <Sparkles size={14} />
            No answers in bank yet
          </div>
          <p style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '4px', marginBottom: '10px' }}>
            Import your reviewed JSON answer bank or load sample questions to enable automatic matching.
          </p>
          <button
            className="btn btn-secondary"
            onClick={onNavigateToImport}
            style={{ fontSize: '11px', width: '100%' }}
          >
            Open Import / Export
          </button>
        </div>
      )}

      {/* Security & Privacy Commitment */}
      <div
        className="card"
        style={{
          background: 'rgba(15, 23, 42, 0.4)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
        }}
      >
        <ShieldCheck size={18} style={{ color: '#34d399', flexShrink: 0, marginTop: '2px' }} />
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#6ee7b7' }}>
            Safe & Private Extension Guarantee
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', lineHeight: 1.4 }}>
            Zero credential harvesting. Zero auto-submit. All answer banks stay in your local browser storage. You review and click submit in the platform yourself.
          </div>
        </div>
      </div>
    </div>
  );
};
