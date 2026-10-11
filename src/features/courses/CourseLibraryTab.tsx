import React, { useState, useMemo } from 'react';
import { Course, QuestionRecord } from '@/types';
import { StorageService } from '@/lib/storage';
import {
  Plus,
  Trash2,
  Search,
  Download,
  Database,
  ChevronDown,
} from 'lucide-react';

interface CourseLibraryTabProps {
  courses: Course[];
  selectedCourseId: string;
  onSelectCourse: (id: string) => void;
  onRefreshCourses: () => Promise<void>;
  questions: QuestionRecord[];
}

export const CourseLibraryTab: React.FC<CourseLibraryTabProps> = ({
  courses,
  selectedCourseId,
  onSelectCourse,
  onRefreshCourses,
  questions,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseDesc, setNewCourseDesc] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'verified' | 'ai'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activeCourse = useMemo(
    () => courses.find((c) => c.id === selectedCourseId) || courses[0],
    [courses, selectedCourseId]
  );

  // Strictly isolate questions by active courseId
  const courseQuestions = useMemo(
    () => questions.filter((q) => q.courseId === activeCourse?.id),
    [questions, activeCourse?.id]
  );

  const verifiedCount = useMemo(
    () =>
      courseQuestions.filter(
        (q) =>
          q.reviewStatus === 'portal-confirmed' ||
          q.reviewStatus === 'student-reviewed' ||
          q.reviewStatus === 'verified'
      ).length,
    [courseQuestions]
  );

  const aiCount = courseQuestions.length - verifiedCount;

  // Filter and search
  const filteredQuestions = useMemo(() => {
    return courseQuestions.filter((q) => {
      const isVerified =
        q.reviewStatus === 'portal-confirmed' ||
        q.reviewStatus === 'student-reviewed' ||
        q.reviewStatus === 'verified';

      if (filterType === 'verified' && !isVerified) return false;
      if (filterType === 'ai' && isVerified) return false;

      if (!searchQuery.trim()) return true;
      const qLower = searchQuery.toLowerCase();
      const textMatch = q.questionText.toLowerCase().includes(qLower);
      const answerMatch =
        q.answerText?.toLowerCase().includes(qLower) ||
        q.correctOptions?.some((opt) => opt.toLowerCase().includes(qLower));
      const expMatch = q.explanation?.toLowerCase().includes(qLower);

      return textMatch || answerMatch || expMatch;
    });
  }, [courseQuestions, filterType, searchQuery]);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim()) return;

    const newCourse: Course = {
      id: `course-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: newCourseName.trim(),
      externalCourseId: newCourseCode.trim() || undefined,
      description: newCourseDesc.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await StorageService.saveCourse(newCourse);
    await onRefreshCourses();
    onSelectCourse(newCourse.id);

    setNewCourseName('');
    setNewCourseCode('');
    setNewCourseDesc('');
    setShowAddModal(false);
  };

  const handleDeleteCourse = async (courseId: string, courseName: string) => {
    if (courses.length <= 1) {
      alert('Cannot delete the only remaining course profile.');
      return;
    }
    const confirmDelete = window.confirm(
      `Delete course profile "${courseName}" and its isolated answer records? This cannot be undone.`
    );
    if (confirmDelete) {
      await StorageService.deleteCourse(courseId);
      await onRefreshCourses();
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    const confirm = window.confirm('Delete this answer record from the active course bank?');
    if (confirm) {
      await StorageService.deleteQuestion(questionId);
      await onRefreshCourses();
    }
  };

  const handleClearCourseBank = async () => {
    if (courseQuestions.length === 0) return;
    const confirm = window.confirm(
      `Clear all ${courseQuestions.length} stored answer records for "${activeCourse?.name}"?`
    );
    if (confirm && activeCourse) {
      await StorageService.replaceQuestionsForCourse(activeCourse.id, []);
      await onRefreshCourses();
    }
  };

  const handleExportCourseBank = () => {
    if (courseQuestions.length === 0 || !activeCourse) return;
    const data = {
      app: 'swayam404',
      course: activeCourse,
      records: courseQuestions,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `swayam404_${activeCourse.id}_answers.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* 1. Header & Course Selector */}
      <div
        className="card"
        style={{
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', background: '#1a1a1a', display: 'inline-block' }} />
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-headline)',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color: '#4a4a4a',
                  letterSpacing: '0.04em',
                }}
              >
                Course & Answer Bank
              </span>
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-headline)',
                fontSize: '16px',
                fontWeight: 800,
                textTransform: 'uppercase',
                color: 'var(--text-main, #1a1a1a)',
                marginTop: '2px',
                letterSpacing: '-0.02em',
              }}
            >
              {activeCourse?.name}
            </h2>
          </div>

          <button
            className="btn btn-secondary"
            onClick={() => setShowAddModal(true)}
            style={{ fontSize: '10px', padding: '5px 10px', whiteSpace: 'nowrap' }}
          >
            <Plus size={12} />
            <span>New Course</span>
          </button>
        </div>

        {/* Course Switcher Row */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <select
              value={selectedCourseId}
              onChange={(e) => onSelectCourse(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 28px 7px 10px',
                border: '1.5px solid var(--border-medium, #1a1a1a)',
                background: 'var(--bg-surface-elevated, #ffffff)',
                fontFamily: 'var(--font-headline)',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-main, #1a1a1a)',
                appearance: 'none',
                cursor: 'pointer',
              }}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.externalCourseId ? `(${c.externalCourseId})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: 'var(--text-main, #1a1a1a)',
              }}
            />
          </div>

          {courses.length > 1 && (
            <button
              onClick={() => activeCourse && handleDeleteCourse(activeCourse.id, activeCourse.name)}
              title="Delete Active Course Profile"
              style={{
                background: 'transparent',
                border: '1.5px solid var(--border-medium, #1a1a1a)',
                padding: '6px 8px',
                cursor: 'pointer',
                color: '#cc0000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {/* Metrics Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '6px',
            marginTop: '2px',
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface-container, #f2ede5)',
              border: '1.5px solid var(--border-medium, #1a1a1a)',
              padding: '6px 8px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '15px', fontWeight: 800, fontFamily: 'var(--font-headline)', color: 'var(--text-main, #1a1a1a)' }}>
              {courseQuestions.length}
            </div>
            <div style={{ fontSize: '9px', fontFamily: 'var(--font-headline)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim, #71717a)' }}>
              Stored Answers
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-surface-container, #f2ede5)',
              border: '1.5px solid var(--border-medium, #1a1a1a)',
              padding: '6px 8px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '15px', fontWeight: 800, fontFamily: 'var(--font-headline)', color: '#3b82f6' }}>
              {verifiedCount}
            </div>
            <div style={{ fontSize: '9px', fontFamily: 'var(--font-headline)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim, #71717a)' }}>
              Verified Keys
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-surface-container, #f2ede5)',
              border: '1.5px solid var(--border-medium, #1a1a1a)',
              padding: '6px 8px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '15px', fontWeight: 800, fontFamily: 'var(--font-headline)', color: '#f59e0b' }}>
              {aiCount}
            </div>
            <div style={{ fontSize: '9px', fontFamily: 'var(--font-headline)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim, #71717a)' }}>
              AI / Pending
            </div>
          </div>
        </div>

        {/* Isolation Note */}
        <div
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            color: '#666666',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span style={{ width: '5px', height: '5px', background: '#48c774', borderRadius: '50%' }} />
          <span>Strict Course Isolation Active · Key: {activeCourse?.id}</span>
        </div>
      </div>

      {/* 2. Search & Filters Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ position: 'relative' }}>
          <Search
            size={13}
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#666666',
            }}
          />
          <input
            type="text"
            placeholder="Search questions or answers in active bank..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 10px 7px 30px',
              fontSize: '11px',
              border: '1.5px solid #1a1a1a',
              background: '#ffffff',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className={`btn ${filterType === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterType('all')}
              style={{ fontSize: '9px', padding: '3px 8px' }}
            >
              All ({courseQuestions.length})
            </button>
            <button
              className={`btn ${filterType === 'verified' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterType('verified')}
              style={{ fontSize: '9px', padding: '3px 8px' }}
            >
              Verified ({verifiedCount})
            </button>
            <button
              className={`btn ${filterType === 'ai' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterType('ai')}
              style={{ fontSize: '9px', padding: '3px 8px' }}
            >
              AI / Pending ({aiCount})
            </button>
          </div>

          <div style={{ display: 'flex', gap: '4px' }}>
            {courseQuestions.length > 0 && (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={handleExportCourseBank}
                  title="Export course answer bank as JSON"
                  style={{ fontSize: '9px', padding: '3px 7px' }}
                >
                  <Download size={11} />
                  <span>Export</span>
                </button>
                <button
                  onClick={handleClearCourseBank}
                  title="Clear all stored answers for this course"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#cc0000',
                    fontSize: '9px',
                    fontFamily: 'var(--font-headline)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: '2px 4px',
                  }}
                >
                  Clear Bank
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 3. Compact Question List */}
      {filteredQuestions.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filteredQuestions.map((q, idx) => {
            const isVerified =
              q.reviewStatus === 'portal-confirmed' ||
              q.reviewStatus === 'student-reviewed' ||
              q.reviewStatus === 'verified';
            const isExpanded = expandedId === q.id;

            return (
              <div
                key={q.id}
                style={{
                  background: '#ffffff',
                  border: '1.5px solid #1a1a1a',
                  padding: '9px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: 'var(--font-headline)',
                        color: '#1a1a1a',
                        lineHeight: 1.35,
                      }}
                    >
                      <span style={{ fontFamily: 'var(--font-mono)', color: '#666666', marginRight: '4px' }}>
                        #{idx + 1}
                      </span>
                      {q.questionText}
                    </div>

                    {/* Answer row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginTop: '4px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          background: isVerified ? '#eef4ff' : '#fff8e6',
                          color: isVerified ? '#0033aa' : '#885500',
                          border: `1px solid ${isVerified ? '#0033aa' : '#885500'}`,
                          padding: '1px 6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        ✓ {q.correctOptions?.join(', ') || q.answerText || 'None'}
                      </span>

                      {/* Status Tag */}
                      <span
                        style={{
                          fontSize: '9px',
                          fontFamily: 'var(--font-headline)',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          background: isVerified ? '#48c774' : '#ffcc00',
                          color: '#1a1a1a',
                          padding: '1px 4px',
                          border: '1px solid #1a1a1a',
                        }}
                      >
                        {isVerified ? 'Verified' : 'AI Stored'}
                      </span>
                    </div>

                    {/* Optional Explanation Toggle */}
                    {q.explanation && (
                      <div style={{ marginTop: '4px' }}>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : q.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            padding: 0,
                            fontSize: '9px',
                            fontFamily: 'var(--font-headline)',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            color: '#666666',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          {isExpanded ? 'Hide explanation' : 'Show explanation'}
                        </button>
                        {isExpanded && (
                          <div
                            style={{
                              marginTop: '3px',
                              fontSize: '10px',
                              fontFamily: 'var(--font-body)',
                              color: '#444444',
                              fontStyle: 'italic',
                              lineHeight: 1.3,
                              background: '#f8f6f2',
                              padding: '5px 8px',
                              borderLeft: '2px solid #1a1a1a',
                            }}
                          >
                            {q.explanation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Delete record */}
                  <button
                    onClick={() => handleDeleteQuestion(q.id)}
                    title="Delete record"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#cc0000',
                      cursor: 'pointer',
                      padding: '2px',
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 4. Honest Empty State */
        <div
          className="card"
          style={{
            padding: '28px 16px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Database size={24} style={{ color: '#1a1a1a' }} />
          <div
            style={{
              fontSize: '12px',
              fontWeight: 800,
              fontFamily: 'var(--font-headline)',
              textTransform: 'uppercase',
              color: '#1a1a1a',
            }}
          >
            {searchQuery ? 'No Matching Records' : 'No Stored Answers for This Course'}
          </div>
          <p
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-body)',
              color: '#666666',
              maxWidth: '300px',
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            {searchQuery
              ? `No records match "${searchQuery}". Clear your search query.`
              : 'The answer bank is empty. Live scanning and AI-assisted retrieval still function normally. Verified records will appear here when you capture submitted quizzes.'}
          </p>
        </div>
      )}

      {/* Add Course Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content-brutal" style={{ maxWidth: '380px' }}>
            <div
              style={{
                padding: '10px 14px',
                background: '#1a1a1a',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '2px solid #1a1a1a',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', background: '#ffcc00', display: 'inline-block' }} />
                <span
                  style={{
                    fontFamily: 'var(--font-headline)',
                    fontWeight: 800,
                    fontSize: '11px',
                    textTransform: 'uppercase',
                  }}
                >
                  Create Course Profile
                </span>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleCreateCourse}
              style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}
            >
              <div>
                <label
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-headline)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: '#1a1a1a',
                    display: 'block',
                    marginBottom: '3px',
                  }}
                >
                  Course Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Principles of Microeconomics"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  style={{ width: '100%', fontSize: '11px', padding: '6px 8px' }}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-headline)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: '#1a1a1a',
                    display: 'block',
                    marginBottom: '3px',
                  }}
                >
                  Portal Code / External ID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. ECON-101 / noc24-mg32"
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value)}
                  style={{ width: '100%', fontSize: '11px', padding: '6px 8px' }}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-headline)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: '#1a1a1a',
                    display: 'block',
                    marginBottom: '3px',
                  }}
                >
                  Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 8-week NPTEL Elective"
                  value={newCourseDesc}
                  onChange={(e) => setNewCourseDesc(e.target.value)}
                  style={{ width: '100%', fontSize: '11px', padding: '6px 8px' }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  justifyContent: 'flex-end',
                  marginTop: '4px',
                  paddingTop: '10px',
                  borderTop: '1.5px solid #1a1a1a',
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                  style={{ fontSize: '10px', padding: '5px 10px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ fontSize: '10px', padding: '5px 12px' }}
                >
                  Save Course Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
