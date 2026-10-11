import React, { useState, useEffect } from 'react';
import { Course, CourseMapping } from '@/types';
import { ShieldAlert, Check, X } from 'lucide-react';

interface CourseMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  portalCourseTitle: string;
  externalCourseId?: string;
  courses: Course[];
  currentMapping?: CourseMapping | null;
  onSaveMapping: (localCourseId: string) => Promise<void>;
}

export const CourseMappingModal: React.FC<CourseMappingModalProps> = ({
  isOpen,
  onClose,
  portalCourseTitle,
  externalCourseId,
  courses,
  currentMapping,
  onSaveMapping,
}) => {
  const [selectedLocalId, setSelectedLocalId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (currentMapping) {
      setSelectedLocalId(currentMapping.localCourseId);
    } else if (courses.length > 0) {
      // Try to auto-match by similar name
      const lowerPortal = portalCourseTitle.toLowerCase();
      const matched = courses.find((c) =>
        lowerPortal.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(lowerPortal)
      );
      setSelectedLocalId(matched ? matched.id : courses[0].id);
    }
  }, [currentMapping, portalCourseTitle, courses]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!selectedLocalId) return;
    setIsSaving(true);
    try {
      await onSaveMapping(selectedLocalId);
      onClose();
    } catch (e) {
      console.error('Failed to save mapping:', e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content-brutal" style={{ maxWidth: '420px' }}>
        <div style={{ padding: '12px 16px', background: '#1a1a1a', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1a1a1a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', background: '#ffcc00', display: 'inline-block' }}></span>
            <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase' }}>
              Map Portal Course
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#ffffff', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '11px', fontFamily: 'var(--font-body)', color: '#4a4a4a', lineHeight: 1.4 }}>
            To enforce strict course isolation, map the active portal course title to a dedicated local key repository:
          </div>

          {/* Portal Detected Info */}
          <div
            style={{
              background: '#f2ede5',
              border: '1.5px solid #1a1a1a',
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: '10px', fontFamily: 'var(--font-headline)', textTransform: 'uppercase', fontWeight: 800, color: '#4a4a4a' }}>
              Detected Portal Context
            </div>
            <div style={{ fontSize: '13px', fontFamily: 'var(--font-headline)', fontWeight: 800, color: '#1a1a1a', marginTop: '2px' }}>
              {portalCourseTitle || 'Unknown Portal Course'}
            </div>
            {externalCourseId && (
              <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#4a4a4a', marginTop: '2px' }}>
                Portal Code: <code>{externalCourseId}</code>
              </div>
            )}
          </div>

          {/* Local Course Selection */}
          <div>
            <label style={{ fontSize: '11px', fontFamily: 'var(--font-headline)', fontWeight: 700, textTransform: 'uppercase', color: '#1a1a1a', display: 'block', marginBottom: '4px' }}>
              Link to Local Answer Bank:
            </label>
            <select
              value={selectedLocalId}
              onChange={(e) => setSelectedLocalId(e.target.value)}
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name} ({course.code || course.id})
                </option>
              ))}
            </select>
          </div>

          {/* Isolation notice */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              background: '#ffcc00',
              border: '2px solid #1a1a1a',
              padding: '8px 10px',
            }}
          >
            <ShieldAlert size={15} style={{ color: '#1a1a1a', flexShrink: 0, marginTop: '1px' }} />
            <div style={{ fontSize: '10px', fontFamily: 'var(--font-body)', fontWeight: 600, color: '#1a1a1a', lineHeight: 1.4 }}>
              <strong>Zero Leakage Guarantee:</strong> Swayam404 strictly prevents cross-course answer contamination. Only keys from the mapped repository will ever be matched.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px', paddingTop: '10px', borderTop: '2px solid #1a1a1a' }}>
            <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: '11px' }}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={isSaving || !selectedLocalId}
              style={{ fontSize: '11px' }}
            >
              <Check size={13} />
              {currentMapping ? 'Update Mapping' : 'Confirm Mapping'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
