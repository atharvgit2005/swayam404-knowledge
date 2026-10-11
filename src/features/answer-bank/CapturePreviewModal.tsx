import React, { useState } from 'react';
import { CapturedQuestionRecord, Course } from '@/types';
import { StorageService } from '@/lib/storage';
import {
  AlertTriangle,
  Save,
  AlertCircle,
  Sparkles,
  Check,
  X,
} from 'lucide-react';
import { ContributionBuilder } from '@/lib/knowledge/contributionBuilder';
import { ContributionProposal } from '@/types/knowledge';
import { ContributionPreviewModal } from '@/features/knowledge/ContributionPreviewModal';

interface CapturePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  capturedRecords: CapturedQuestionRecord[];
  portalCourseTitle?: string;
  externalCourseId?: string;
  assignmentTitle?: string;
  unitTitle?: string;
  courses: Course[];
  selectedCourseId: string;
  onSaveSuccess: (stats: { saved: number; conflicts: number; duplicates: number }) => void;
}

export const CapturePreviewModal: React.FC<CapturePreviewModalProps> = ({
  isOpen,
  onClose,
  capturedRecords: initialRecords,
  portalCourseTitle,
  externalCourseId,
  assignmentTitle,
  unitTitle,
  courses,
  selectedCourseId,
  onSaveSuccess,
}) => {
  const [records, setRecords] = useState<CapturedQuestionRecord[]>(initialRecords);
  const [targetCourseId, setTargetCourseId] = useState<string>(selectedCourseId);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contributionProposal, setContributionProposal] = useState<ContributionProposal | null>(null);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isSelectedForSave: !r.isSelectedForSave } : r))
    );
  };

  const selectAll = (select: boolean) => {
    setRecords((prev) => prev.map((r) => ({ ...r, isSelectedForSave: select })));
  };

  const selectedCount = records.filter((r) => r.isSelectedForSave).length;
  const confirmedCount = records.filter((r) => r.verificationStatus === 'portal-confirmed').length;
  const unverifiedCount = records.filter((r) => r.verificationStatus === 'unverified').length;
  const warningsCount = records.filter((r) => !!r.ambiguityWarning).length;

  const handleSave = async () => {
    if (selectedCount === 0) {
      setError('Please select at least one question record to save.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const stats = await StorageService.saveCapturedQuestions(records, targetCourseId);
      onSaveSuccess(stats);
      onClose();
    } catch (err) {
      setError(`Failed to save captured questions: ${(err as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content-brutal" style={{ maxWidth: '680px', maxHeight: '88vh' }}>
        
        {/* Header */}
        <div style={{ padding: '12px 16px', background: '#1a1a1a', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1a1a1a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', background: '#ffcc00', display: 'inline-block' }}></span>
            <div>
              <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Capture Graded Answers Preview
                <span style={{ background: '#ffcc00', color: '#1a1a1a', fontSize: '10px', padding: '1px 5px', border: '1px solid #1a1a1a' }}>
                  {records.length} Qs
                </span>
              </div>
              <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#d6d1c9', marginTop: '2px' }}>
                {assignmentTitle || 'Assignment Feedback'} {unitTitle ? `• ${unitTitle}` : ''}{' '}
                {portalCourseTitle ? `• Portal: ${portalCourseTitle}` : ''}{' '}
                {externalCourseId ? `(${externalCourseId})` : ''}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#ffffff', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Target Course & Stats Bar */}
        <div style={{ padding: '10px 16px', background: '#f2ede5', borderBottom: '2px solid #1a1a1a', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '11px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, textTransform: 'uppercase', color: '#1a1a1a' }}>
              Target Course Bank:
            </span>
            <select
              value={targetCourseId}
              onChange={(e) => setTargetCourseId(e.target.value)}
              style={{ padding: '2px 6px', fontSize: '11px', fontFamily: 'var(--font-headline)' }}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.externalCourseId ? `(${c.externalCourseId})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ padding: '2px 6px', background: '#1a1a1a', color: '#ffffff', fontFamily: 'var(--font-headline)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              <Check size={10} />
              <span>{confirmedCount} Confirmed</span>
            </span>
            {unverifiedCount > 0 && (
              <span style={{ padding: '2px 6px', background: '#ffdad6', color: '#cc0000', border: '1px solid #cc0000', fontFamily: 'var(--font-headline)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <AlertCircle size={10} />
                <span>{unverifiedCount} Unverified</span>
              </span>
            )}
            {warningsCount > 0 && (
              <span style={{ padding: '2px 6px', background: '#ffcc00', color: '#1a1a1a', border: '1px solid #1a1a1a', fontFamily: 'var(--font-headline)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <AlertTriangle size={10} />
                <span>{warningsCount} Warnings</span>
              </span>
            )}
          </div>
        </div>

        {/* Selection Toolbar */}
        <div style={{ padding: '8px 16px', background: '#ffffff', borderBottom: '1.5px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-headline)', fontWeight: 700, textTransform: 'uppercase' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => selectAll(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: '#1a1a1a', fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '11px' }}
            >
              Select All
            </button>
            <span>•</span>
            <button
              onClick={() => selectAll(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: '#1a1a1a', fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '11px' }}
            >
              Deselect All
            </button>
          </div>
          <div>
            Selected: <span style={{ color: '#1a1a1a' }}>{selectedCount}</span> of {records.length}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div style={{ margin: '12px 16px 0 16px', padding: '10px', background: '#ffdad6', border: '2px solid #cc0000', color: '#cc0000', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* Scrollable Questions List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {records.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#4a4a4a', fontSize: '12px' }}>
              No questions with graded feedback found on current page.
            </div>
          ) : (
            records.map((rec) => {
              const isSelected = rec.isSelectedForSave;
              const isConfirmed = rec.verificationStatus === 'portal-confirmed';

              return (
                <div
                  key={rec.id}
                  style={{
                    border: '1.5px solid #1a1a1a',
                    padding: '12px',
                    background: isSelected ? (isConfirmed ? '#ffffff' : '#f2ede5') : '#f2ede5',
                    opacity: isSelected ? 1 : 0.6,
                    boxShadow: isSelected ? '3px 3px 0px #1a1a1a' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  {/* Top row: Checkbox, index, type, status badges */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(rec.id)}
                        style={{ accentColor: '#1a1a1a', width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '11px', background: '#1a1a1a', color: '#ffffff', padding: '1px 6px' }}>
                        Q{rec.questionIndex}
                      </span>
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-headline)', fontWeight: 700, textTransform: 'uppercase', color: '#4a4a4a' }}>
                        {rec.questionType}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isConfirmed ? (
                        <span style={{ padding: '2px 6px', background: '#ffcc00', border: '1px solid #1a1a1a', fontFamily: 'var(--font-headline)', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Check size={9} />
                          <span>Portal Confirmed</span>
                        </span>
                      ) : (
                        <span style={{ padding: '2px 6px', background: '#ffdad6', color: '#cc0000', border: '1px solid #cc0000', fontFamily: 'var(--font-headline)', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <AlertCircle size={9} />
                          <span>Unverified</span>
                        </span>
                      )}
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: '#4a4a4a' }}>
                        {rec.verificationSource}
                      </span>
                    </div>
                  </div>

                  {/* Question Text */}
                  <div style={{ fontSize: '12px', fontFamily: 'var(--font-headline)', fontWeight: 700, color: '#1a1a1a', marginLeft: '24px' }}>
                    {rec.questionText}
                  </div>

                  {/* Options & Accepted Answer */}
                  <div style={{ marginLeft: '24px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
                    {rec.options.map((opt, i) => {
                      const isAccepted = rec.acceptedAnswers.includes(opt);
                      const isStudentSelected = rec.selectedOptions.includes(opt);

                      return (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            border: isAccepted ? '1.5px solid #1a1a1a' : '1px solid #eee9e0',
                            background: isAccepted ? '#ffcc00' : isStudentSelected ? '#d6e3ff' : '#ffffff',
                            fontWeight: isAccepted ? 700 : 400,
                          }}
                        >
                          <span>{opt}</span>
                          <div>
                            {isAccepted && (
                              <span style={{ fontSize: '9px', padding: '1px 5px', background: '#1a1a1a', color: '#ffffff', fontFamily: 'var(--font-headline)', fontWeight: 700, textTransform: 'uppercase' }}>
                                Correct Answer
                              </span>
                            )}
                            {isStudentSelected && !isAccepted && (
                              <span style={{ fontSize: '9px', padding: '1px 5px', background: '#ffffff', border: '1px solid #1a1a1a', fontFamily: 'var(--font-headline)', fontWeight: 600, textTransform: 'uppercase' }}>
                                Your Pick
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Short text or open answer */}
                    {rec.options.length === 0 && rec.acceptedAnswers.length > 0 && (
                      <div style={{ padding: '8px', border: '1.5px solid #1a1a1a', background: '#ffcc00', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        <span>Accepted Key: </span>
                        <span>{rec.acceptedAnswers.join(', ')}</span>
                      </div>
                    )}
                  </div>

                  {/* Explanation */}
                  {rec.explanation && (
                    <div style={{ marginLeft: '24px', padding: '8px', background: '#ffffff', border: '1px solid #1a1a1a', fontSize: '11px', fontFamily: 'var(--font-body)', color: '#4a4a4a' }}>
                      <strong style={{ color: '#1a1a1a' }}>Portal Explanation: </strong>
                      {rec.explanation}
                    </div>
                  )}

                  {/* Ambiguity Warning */}
                  {rec.ambiguityWarning && (
                    <div style={{ marginLeft: '24px', padding: '8px', background: '#ffdad6', border: '1.5px solid #cc0000', fontSize: '11px', color: '#cc0000', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertTriangle size={13} />
                      <span>{rec.ambiguityWarning}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', background: '#f2ede5', borderTop: '2px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="btn btn-secondary"
              style={{ fontSize: '11px' }}
            >
              Cancel
            </button>

            {confirmedCount > 0 && (
              <button
                type="button"
                onClick={async () => {
                  const eligible = records.filter(
                    (r) => r.isSelectedForSave && r.verificationStatus === 'portal-confirmed'
                  );
                  const prop = await ContributionBuilder.buildReleasedFeedbackProposal({
                    courseId: targetCourseId,
                    assignmentId:
                      assignmentTitle?.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'released-feedback',
                    title: `${portalCourseTitle || 'Course'} - ${assignmentTitle || 'Released Assessment'}`,
                    capturedRecords: eligible,
                  });
                  setContributionProposal(prop);
                }}
                className="btn btn-secondary"
                style={{ fontSize: '11px', background: '#ffeb99' }}
              >
                <Sparkles size={13} />
                Propose Community Knowledge ({confirmedCount})
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || selectedCount === 0}
            className="btn btn-primary"
            style={{ fontSize: '11px', padding: '8px 16px' }}
          >
            <Save size={13} />
            {isSaving
              ? 'Saving to Local Bank...'
              : `Save ${selectedCount} Accepted Answers to Local Bank`}
          </button>
        </div>
      </div>

      {contributionProposal && (
        <ContributionPreviewModal
          isOpen={!!contributionProposal}
          onClose={() => setContributionProposal(null)}
          initialProposal={contributionProposal}
          courseTitle={portalCourseTitle || 'Course'}
        />
      )}
    </div>
  );
};
