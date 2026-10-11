import React, { useState } from 'react';
import { CourseTask } from '@/types';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  BookOpen,
  HelpCircle,
  FileSpreadsheet,
  MessageSquare,
  Sparkles,
} from 'lucide-react';


interface TaskQueueViewProps {
  tasks: CourseTask[];
  activeTaskId?: string;
  onPrepareTask: (task: CourseTask) => Promise<unknown>;
  onApproveTask?: (task: CourseTask) => Promise<unknown> | void;
  onNavigateToReview?: () => void;
  isProcessing: boolean;
}


export const TaskQueueView: React.FC<TaskQueueViewProps> = ({
  tasks,
  activeTaskId,
  onPrepareTask,
  onApproveTask,
  onNavigateToReview,
  isProcessing,
}) => {

  const [filter, setFilter] = useState<'all' | 'ready' | 'attention' | 'completed'>('all');

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'ready') return task.status === 'ready-to-prepare' || task.status === 'prepared';
    if (filter === 'attention') return task.status === 'needs-attention';
    if (filter === 'completed') return task.status === 'completed';
    return true;
  });

  const getStatusBadge = (task: CourseTask) => {
    switch (task.status) {
      case 'completed':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: '#d6e3ff',
              color: '#1a1a1a',
              border: '1.5px solid #1a1a1a',
              padding: '2px 6px',
              fontSize: '10px',
              fontWeight: 800,
              fontFamily: 'var(--font-headline)',
              textTransform: 'uppercase',
            }}
          >
            <CheckCircle2 size={11} />
            {task.portalStatusText || 'Completed'}
          </span>
        );
      case 'ready-to-prepare':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: '#ffcc00',
              color: '#1a1a1a',
              border: '1.5px solid #1a1a1a',
              padding: '2px 6px',
              fontSize: '10px',
              fontWeight: 800,
              fontFamily: 'var(--font-headline)',
              textTransform: 'uppercase',
            }}
          >
            <Clock size={11} />
            Ready
          </span>
        );
      case 'prepared':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: '#ffffff',
              color: '#1a1a1a',
              border: '1.5px solid #1a1a1a',
              padding: '2px 6px',
              fontSize: '10px',
              fontWeight: 800,
              fontFamily: 'var(--font-headline)',
              textTransform: 'uppercase',
            }}
          >
            <Sparkles size={11} />
            Prepared
          </span>
        );
      case 'needs-attention':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: '#ffdad6',
              color: '#cc0000',
              border: '1.5px solid #cc0000',
              padding: '2px 6px',
              fontSize: '10px',
              fontWeight: 800,
              fontFamily: 'var(--font-headline)',
              textTransform: 'uppercase',
            }}
          >
            <AlertTriangle size={11} />
            Needs Review
          </span>
        );
      case 'awaiting-submission':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: '#ffffff',
              color: '#1a1a1a',
              border: '1.5px solid #1a1a1a',
              padding: '2px 6px',
              fontSize: '10px',
              fontWeight: 800,
              fontFamily: 'var(--font-headline)',
              textTransform: 'uppercase',
            }}
          >
            <Clock size={11} />
            Awaiting Submit
          </span>
        );
      case 'unsupported':
        return (
          <span
            style={{
              background: '#eee9e0',
              color: '#4a4a4a',
              border: '1px solid #1a1a1a',
              padding: '2px 6px',
              fontSize: '10px',
              fontFamily: 'var(--font-headline)',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            Resource
          </span>
        );
      default:
        return (
          <span
            style={{
              background: '#eee9e0',
              color: '#4a4a4a',
              border: '1px solid #1a1a1a',
              padding: '2px 6px',
              fontSize: '10px',
              fontFamily: 'var(--font-headline)',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            Not Scanned
          </span>
        );
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'quiz':
        return <HelpCircle size={14} style={{ color: '#1a1a1a' }} />;
      case 'assignment':
        return <FileSpreadsheet size={14} style={{ color: '#1a1a1a' }} />;
      case 'practice':
        return <BookOpen size={14} style={{ color: '#1a1a1a' }} />;
      case 'feedback':
        return <MessageSquare size={14} style={{ color: '#1a1a1a' }} />;
      default:
        return <BookOpen size={14} style={{ color: '#1a1a1a' }} />;
    }
  };

  const handleOpenLink = (url?: string) => {
    if (!url) return;
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  if (tasks.length === 0) {
    return (
      <div
        className="card"
        style={{
          textAlign: 'center',
          padding: '28px 16px',
          color: '#4a4a4a',
        }}
      >
        <BookOpen size={24} style={{ margin: '0 auto 8px auto', color: '#1a1a1a' }} />
        <div style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--font-headline)', textTransform: 'uppercase', color: '#1a1a1a' }}>
          No Course Tasks Discovered
        </div>
        <p style={{ fontSize: '11px', fontFamily: 'var(--font-body)', marginTop: '4px', maxWidth: '320px', margin: '4px auto 0 auto' }}>
          Navigate to your course outline or syllabus page on SWAYAM/NPTEL and click <strong>"Scan Outline"</strong> above.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
        <button
          className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('all')}
          style={{ fontSize: '10px', padding: '4px 10px' }}
        >
          All ({tasks.length})
        </button>
        <button
          className={`btn ${filter === 'ready' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('ready')}
          style={{ fontSize: '10px', padding: '4px 10px' }}
        >
          Ready ({tasks.filter((t) => t.status === 'ready-to-prepare' || t.status === 'prepared').length})
        </button>
        <button
          className={`btn ${filter === 'attention' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('attention')}
          style={{ fontSize: '10px', padding: '4px 10px' }}
        >
          Needs Review ({tasks.filter((t) => t.status === 'needs-attention').length})
        </button>
        <button
          className={`btn ${filter === 'completed' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('completed')}
          style={{ fontSize: '10px', padding: '4px 10px' }}
        >
          Completed ({tasks.filter((t) => t.status === 'completed').length})
        </button>
      </div>

      {/* Task List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredTasks.map((task) => {
          const isActive = task.id === activeTaskId;
          return (
            <div
              key={task.id}
              className="card"
              style={{
                padding: '12px 14px',
                border: isActive ? '2px solid #1a1a1a' : '2px solid #1a1a1a',
                background: isActive ? '#ffcc00' : '#ffffff',
                boxShadow: isActive ? '4px 4px 0px #1a1a1a' : '2px 2px 0px #1a1a1a',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  {task.unitTitle && (
                    <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#4a4a4a', fontWeight: 600 }}>
                      {task.unitTitle}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 800,
                      fontFamily: 'var(--font-headline)',
                      textTransform: 'uppercase',
                      color: '#1a1a1a',
                      marginTop: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {getTypeIcon(task.type)}
                    <span>{task.title}</span>
                  </div>
                </div>

                <div style={{ flexShrink: 0 }}>
                  {getStatusBadge(task)}
                </div>
              </div>

              {/* Task Metrics & Notes if present */}
              {task.matchSummary && (
                <div
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: '#1a1a1a',
                    background: '#f2ede5',
                    border: '1px solid #1a1a1a',
                    padding: '4px 8px',
                    display: 'flex',
                    gap: '12px',
                  }}
                >
                  <span>Scanned: {task.matchSummary.scanned}</span>
                  <span style={{ fontWeight: 700 }}>Exact: {task.matchSummary.exactMatches}</span>
                  {task.matchSummary.reviewRequired > 0 && (
                    <span style={{ color: '#cc0000', fontWeight: 700 }}>Review: {task.matchSummary.reviewRequired}</span>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '8px',
                  borderTop: '1.5px solid #1a1a1a',
                }}
              >
                <div style={{ display: 'flex', gap: '6px' }}>
                  {task.url && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleOpenLink(task.url)}
                      style={{ fontSize: '10px', padding: '4px 8px' }}
                      title="Open assignment link in browser"
                    >
                      <ExternalLink size={11} />
                      Open
                    </button>
                  )}
                  {task.status === 'needs-attention' && onNavigateToReview && (
                    <button
                      className="btn btn-secondary"
                      onClick={onNavigateToReview}
                      style={{ fontSize: '10px', padding: '4px 8px', color: '#cc0000', fontWeight: 700 }}
                    >
                      Inspect in Review
                    </button>
                  )}
                </div>

                {task.status !== 'completed' && task.type !== 'resource' && task.type !== 'feedback' && (
                  <button
                    className="btn btn-primary"
                    disabled={isProcessing}
                    onClick={() => (onApproveTask ? onApproveTask(task) : onPrepareTask(task))}
                    style={{
                      fontSize: '10px',
                      padding: '5px 10px',
                      background: task.status === 'awaiting-submission' ? '#2563eb' : '#16a34a',
                      color: '#ffffff',
                    }}
                    title="Approves this unit and ticks verified answers into quiz form options on SWAYAM"
                  >
                    <CheckCircle2 size={11} />
                    {task.status === 'awaiting-submission'
                      ? 'Re-solve Options'
                      : task.status === 'needs-attention'
                      ? 'Review & Solve'
                      : 'Approve & Solve'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
