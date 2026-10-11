import React, { useState } from 'react';
import {
  ContributionProposal,
  ContributionState,
  KnowledgeResource,
  KnowledgeReviewRecord,
  ContributionConflictItem,
  KnowledgeValidationError,
} from '@/types/knowledge';
import { ContributionExporter } from '@/lib/knowledge/contributionExporter';
import { StorageService } from '@/lib/storage';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  Copy,
  Save,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';

interface ContributionPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProposal: ContributionProposal;
  courseTitle?: string;
  repoUrl?: string;
  onProposalUpdated?: (updated: ContributionProposal) => void;
}

export const ContributionPreviewModal: React.FC<ContributionPreviewModalProps> = ({
  isOpen,
  onClose,
  initialProposal,
  courseTitle = 'Course',
  repoUrl,
  onProposalUpdated,
}) => {
  const [proposal, setProposal] = useState<ContributionProposal>(initialProposal);
  const [notes, setNotes] = useState<string>(initialProposal.contributorNotes || '');
  const [license, setLicense] = useState<string>(initialProposal.provenanceSummary.license || 'CC-BY-4.0');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedPr, setCopiedPr] = useState(false);

  if (!isOpen) return null;

  const isValid = proposal.validationResult.isValid && proposal.validationResult.errors.length === 0;
  const isExportable = isValid && proposal.provenanceSummary.isPermissionConfirmed && proposal.provenanceSummary.permission !== 'unverified';

  const handleSaveLocally = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const updated: ContributionProposal = {
        ...proposal,
        contributorNotes: notes,
        provenanceSummary: {
          ...proposal.provenanceSummary,
          license,
        },
        state: 'draft',
        updatedAt: new Date().toISOString(),
      };
      await StorageService.saveContributionProposal(updated);
      setProposal(updated);
      if (onProposalUpdated) onProposalUpdated(updated);
      setStatusMessage({ type: 'success', text: 'Saved locally as draft proposal.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to save locally: ${(err as Error).message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportPackage = async () => {
    setStatusMessage(null);
    const updated: ContributionProposal = {
      ...proposal,
      contributorNotes: notes,
      provenanceSummary: {
        ...proposal.provenanceSummary,
        license,
      },
    };

    const result = ContributionExporter.buildExportPackage({
      proposal: updated,
      courseTitle,
      contributorNotes: notes,
    });

    if (!result.success || !result.package) {
      setStatusMessage({ type: 'error', text: result.error || 'Export validation failed.' });
      return;
    }

    // Trigger JSON download
    const filename = `contribution_${proposal.courseId}_${proposal.proposalId}.json`;
    const blob = new Blob([JSON.stringify(result.package, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    // Mark as exported
    const exportedProp: ContributionProposal = {
      ...updated,
      state: 'exported',
      exportedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await StorageService.saveContributionProposal(exportedProp);
    setProposal(exportedProp);
    if (onProposalUpdated) onProposalUpdated(exportedProp);

    setStatusMessage({
      type: 'success',
      text: `Exported package "${filename}". Follow PR instructions below to submit to GitHub.`,
    });
  };

  const handleCopyPrSummary = () => {
    const prMd = ContributionExporter.generatePullRequestMarkdown({
      proposal,
      courseTitle,
      repoUrl,
    });
    navigator.clipboard.writeText(prMd);
    setCopiedPr(true);
    setTimeout(() => setCopiedPr(false), 2500);
  };

  const stateColors: Record<ContributionState, { bg: string; text: string; border: string }> = {
    draft: { bg: '#eee9e0', text: '#1a1a1a', border: '#1a1a1a' },
    'pending-validation': { bg: '#ffeb99', text: '#1a1a1a', border: '#1a1a1a' },
    'validation-failed': { bg: '#ffdad6', text: '#ba1a1a', border: '#ba1a1a' },
    'ready-for-review': { bg: '#ffcc00', text: '#1a1a1a', border: '#1a1a1a' },
    approved: { bg: '#c8e6c9', text: '#1b5e20', border: '#2e7d32' },
    rejected: { bg: '#ffdad6', text: '#ba1a1a', border: '#ba1a1a' },
    exported: { bg: '#dbeafe', text: '#1e40af', border: '#1e40af' },
    published: { bg: '#bbf7d0', text: '#166534', border: '#166534' },
  };

  const currentState = (proposal.state || 'draft') as ContributionState;
  const currentColor = stateColors[currentState] || stateColors.draft;

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-content-brutal" style={{ maxWidth: '640px', maxHeight: '90vh' }}>
        
        {/* Header */}
        <div style={{ padding: '12px 16px', background: '#1a1a1a', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1a1a1a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', background: '#ffcc00', display: 'inline-block' }}></span>
            <div>
              <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Community Knowledge Contribution
                <span
                  style={{
                    background: currentColor.bg,
                    color: currentColor.text,
                    border: `1px solid ${currentColor.border}`,
                    fontSize: '9px',
                    padding: '1px 5px',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  {proposal.state}
                </span>
              </div>
              <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#d6d1c9', marginTop: '2px' }}>
                {courseTitle} ({proposal.courseId}) • ID: {proposal.proposalId}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#ffffff', fontWeight: 800, cursor: 'pointer', fontSize: '14px' }}
          >
            ✕
          </button>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            style={{
              padding: '8px 16px',
              background: statusMessage.type === 'success' ? '#c8e6c9' : '#ffdad6',
              color: statusMessage.type === 'success' ? '#1b5e20' : '#ba1a1a',
              borderBottom: '1.5px solid #1a1a1a',
              fontSize: '11px',
              fontFamily: 'var(--font-headline)',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {statusMessage.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* Metadata & Provenance Card */}
          <div style={{ border: '1.5px solid #1a1a1a', padding: '12px', background: '#ffffff', boxShadow: '2px 2px 0px #1a1a1a', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-headline)', fontWeight: 800, textTransform: 'uppercase', color: '#1a1a1a' }}>
                Provenance & License Metadata
              </span>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 6px', background: '#eee9e0', border: '1px solid #1a1a1a' }}>
                {proposal.resources.length} resources • {proposal.reviewRecords.length} reviews
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: '#666' }}>Source Summary</label>
                <div style={{ fontWeight: 600, color: '#1a1a1a' }}>{proposal.provenanceSummary.sourceSummary || 'Local Course Material'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: '#666' }}>Redistribution Permission</label>
                <div style={{ fontWeight: 700, color: proposal.provenanceSummary.isPermissionConfirmed ? '#1b5e20' : '#ba1a1a' }}>
                  {proposal.provenanceSummary.permission}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: '#666' }}>Declared License</label>
                <input
                  type="text"
                  value={license}
                  onChange={(e) => setLicense(e.target.value)}
                  style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1.5px solid #1a1a1a', fontFamily: 'var(--font-mono)' }}
                  placeholder="e.g. CC-BY-4.0"
                />
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ display: 'block', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: '#666' }}>Contributor Notes for Maintainer</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1.5px solid #1a1a1a' }}
                  placeholder="e.g. Verified from Lecture 3 slides and textbook"
                />
              </div>
            </div>
          </div>

          {/* Validation & Conflict Diagnostics */}
          <div style={{ border: '1.5px solid #1a1a1a', padding: '10px 12px', background: isValid ? '#f7fdf9' : '#fff5f5', boxShadow: '2px 2px 0px #1a1a1a' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-headline)' }}>
                {isValid ? <ShieldCheck size={14} color="#1b5e20" /> : <AlertTriangle size={14} color="#ba1a1a" />}
                <span>Validation Status: {isValid ? 'Passed' : 'Failed'}</span>
              </div>
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                {proposal.validationResult.errors.length} errors, {proposal.validationResult.warnings.length} warnings
              </span>
            </div>

            {proposal.validationResult.errors.map((err: KnowledgeValidationError, i: number) => (
              <div key={i} style={{ fontSize: '10px', color: '#ba1a1a', padding: '2px 0', display: 'flex', gap: '4px' }}>
                <strong>• [{err.code}]:</strong> {err.message}
              </div>
            ))}

            {proposal.validationResult.warnings.map((warn: string, i: number) => (
              <div key={i} style={{ fontSize: '10px', color: '#854d0e', padding: '2px 0', display: 'flex', gap: '4px' }}>
                <span>• [Warning]:</span> {warn}
              </div>
            ))}

            {proposal.conflicts.map((conf: ContributionConflictItem, i: number) => (
              <div key={i} style={{ fontSize: '10px', color: '#c2410c', padding: '2px 0', display: 'flex', gap: '4px' }}>
                <strong>• [Conflict - {conf.type}]:</strong> {conf.message}
              </div>
            ))}
          </div>

          {/* Items Preview List */}
          <div style={{ border: '1.5px solid #1a1a1a', padding: '12px', background: '#fdfbf7' }}>
            <div style={{ fontSize: '10px', fontFamily: 'var(--font-headline)', fontWeight: 800, textTransform: 'uppercase', color: '#1a1a1a', marginBottom: '8px' }}>
              Items Proposed for Export ({proposal.resources.length + proposal.reviewRecords.length})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
              {proposal.resources.map((r: KnowledgeResource) => (
                <div
                  key={r.resourceId}
                  style={{
                    padding: '6px 8px',
                    background: '#ffffff',
                    border: '1px solid #1a1a1a',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: '#1a1a1a' }}>{r.title}</strong>
                    <span style={{ fontSize: '9px', padding: '1px 4px', background: '#ffcc00', border: '1px solid #1a1a1a', textTransform: 'uppercase', fontWeight: 700 }}>
                      {r.resourceType}
                    </span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.content.slice(0, 100)}...
                  </div>
                  {r.topics.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                      {r.topics.map((t: string, idx: number) => (
                        <span key={idx} style={{ fontSize: '8px', padding: '1px 4px', background: '#eee9e0', border: '1px solid #999' }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {proposal.reviewRecords.map((rr: KnowledgeReviewRecord) => (
                <div
                  key={rr.recordId}
                  style={{
                    padding: '6px 8px',
                    background: '#ffffff',
                    border: '1px solid #1a1a1a',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: '#1a1a1a' }}>{rr.normalizedQuestionText.slice(0, 60)}...</strong>
                    <span style={{ fontSize: '9px', padding: '1px 4px', background: '#c8e6c9', border: '1px solid #2e7d32', textTransform: 'uppercase', fontWeight: 700 }}>
                      {rr.verificationStatus}
                    </span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#1b5e20', fontWeight: 600 }}>
                    Accepted: {rr.options?.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ padding: '12px 16px', background: '#f2ede5', borderTop: '2px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={handleSaveLocally}
              disabled={isSaving}
              className="btn btn-secondary"
              style={{ fontSize: '11px', padding: '6px 12px' }}
            >
              <Save size={13} />
              Save Draft
            </button>
            <button
              type="button"
              onClick={handleCopyPrSummary}
              className="btn btn-secondary"
              style={{ fontSize: '11px', padding: '6px 12px' }}
            >
              <Copy size={13} />
              {copiedPr ? 'Copied PR Summary!' : 'Copy PR Summary'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ fontSize: '11px', padding: '6px 12px' }}
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleExportPackage}
              disabled={!isExportable}
              className="btn btn-primary"
              style={{
                fontSize: '11px',
                padding: '6px 14px',
                opacity: isExportable ? 1 : 0.5,
                cursor: isExportable ? 'pointer' : 'not-allowed',
              }}
            >
              <Download size={13} />
              Export Contribution Package (.json)
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
