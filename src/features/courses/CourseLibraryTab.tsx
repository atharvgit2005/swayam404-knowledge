import React, { useState } from 'react';
import { Course, QuestionRecord } from '@/types';
import { StorageService } from '@/lib/storage';
import {
  Plus,
  Trash2,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
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
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

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
      alert('Cannot delete the only remaining course.');
      return;
    }
    const confirmDelete = window.confirm(
      `Are you sure you want to delete course "${courseName}" and its saved answers?`
    );
    if (confirmDelete) {
      await StorageService.deleteCourse(courseId);
      await onRefreshCourses();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header and Add Course Action */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
            Course Library
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
            Manage common & minor courses with strict answer isolation
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => setShowAddModal(true)}
          style={{ padding: '6px 10px', fontSize: '11px' }}
        >
          <Plus size={13} /> Add Course
        </button>
      </div>

      {/* Courses List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {courses.map((course) => {
          const isSelected = course.id === selectedCourseId;
          const courseQuestions = questions.filter((q) => q.courseId === course.id);
          const isExpanded = expandedCourseId === course.id;

          return (
            <div
              key={course.id}
              className="card"
              style={{
                borderColor: isSelected ? '#6366f1' : undefined,
                background: isSelected ? 'rgba(99, 102, 241, 0.08)' : undefined,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                      {course.name}
                    </span>
                    {isSelected && (
                      <span className="badge badge-exact" style={{ fontSize: '10px' }}>
                        Active
                      </span>
                    )}
                    {course.isDefault && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#a5b4fc',
                          background: 'rgba(99, 102, 241, 0.15)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                        }}
                      >
                        Core
                      </span>
                    )}
                  </div>

                  {course.externalCourseId && (
                    <div style={{ fontSize: '11px', color: '#818cf8', marginTop: '2px' }}>
                      ID: {course.externalCourseId}
                    </div>
                  )}

                  {course.description && (
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                      {course.description}
                    </div>
                  )}

                  <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '6px' }}>
                    📚 <strong>{courseQuestions.length}</strong> saved answer(s)
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {!isSelected ? (
                    <button
                      className="btn btn-secondary"
                      onClick={() => onSelectCourse(course.id)}
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                    >
                      Select
                    </button>
                  ) : (
                    <span style={{ color: '#38bdf8', padding: '4px' }}>
                      <Check size={16} />
                    </span>
                  )}

                  <button
                    className="btn btn-danger"
                    onClick={() => handleDeleteCourse(course.id, course.name)}
                    title="Delete Course"
                    style={{ padding: '5px' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* View Questions Toggle */}
              {courseQuestions.length > 0 && (
                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '6px' }}>
                  <button
                    onClick={() => setExpandedCourseId(isExpanded ? null : course.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#818cf8',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 0',
                    }}
                  >
                    <FileText size={12} />
                    {isExpanded ? 'Hide Questions' : `Inspect Questions (${courseQuestions.length})`}
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>

                  {isExpanded && (
                    <div
                      style={{
                        marginTop: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        maxHeight: '220px',
                        overflowY: 'auto',
                      }}
                    >
                      {courseQuestions.map((q, idx) => (
                        <div
                          key={q.id}
                          style={{
                            fontSize: '11px',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            background: 'rgba(0, 0, 0, 0.25)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <div style={{ fontWeight: 600, color: '#f1f5f9' }}>
                            {idx + 1}. {q.questionText}
                          </div>
                          <div style={{ color: '#38bdf8', marginTop: '2px' }}>
                            ✓ {q.correctOptions?.join(', ') || q.answerText || 'None'}
                          </div>
                          {q.explanation && (
                            <div style={{ color: '#94a3b8', marginTop: '2px', fontStyle: 'italic' }}>
                              "{q.explanation}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Course Modal */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '380px',
              width: '100%',
              background: '#111726',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
              Add New Course Profile
            </div>

            <form onSubmit={handleCreateCourse} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>
                  Course Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Data Structures & Algorithms"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>
                  Course Code / External ID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. NPTEL-CS-102"
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>
                  Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Minor elective for semester 4"
                  value={newCourseDesc}
                  onChange={(e) => setNewCourseDesc(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
