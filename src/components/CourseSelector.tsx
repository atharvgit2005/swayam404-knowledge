import React, { useState, useRef, useEffect } from 'react';
import { Course } from '@/types';
import { ChevronDown, Check, BookOpen } from 'lucide-react';

interface CourseSelectorProps {
  courses: Course[];
  selectedCourseId: string;
  onSelectCourse: (id: string) => void;
}

export const CourseSelector: React.FC<CourseSelectorProps> = ({
  courses,
  selectedCourseId,
  onSelectCourse,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];

  // Close on outside click or escape key
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className="course-selector-container"
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        className="course-selector-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={selectedCourse ? `Course: ${selectedCourse.name}` : 'Select Course'}
      >
        <BookOpen size={11} className="course-selector-icon" style={{ flexShrink: 0 }} />
        <span className="course-selector-label">
          {selectedCourse?.name || 'Select Course'}
        </span>
        <ChevronDown
          size={11}
          className="course-selector-chevron"
          style={{
            flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        />
      </button>

      {isOpen && (
        <div
          className="course-selector-dropdown"
          role="listbox"
          aria-label="Select course"
        >
          <div className="course-selector-dropdown-header">
            <span>SWITCH COURSE</span>
          </div>

          <div className="course-selector-options-list">
            {courses.map((course) => {
              const isSelected = course.id === selectedCourseId;
              return (
                <button
                  key={course.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`course-selector-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    onSelectCourse(course.id);
                    setIsOpen(false);
                  }}
                  title={course.name}
                >
                  <span className="course-selector-option-name">{course.name}</span>
                  {isSelected && (
                    <Check
                      size={12}
                      className="course-selector-check"
                      style={{ flexShrink: 0, strokeWidth: 3 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
