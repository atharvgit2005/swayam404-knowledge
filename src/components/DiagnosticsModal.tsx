import React, { useState } from 'react';
import { pipelineTracer, PipelineStepTrace } from '@/lib/orchestration/pipelineDiagnostics';
import {
  diagnosticExporter,
  PrivacyPreservingDiagnosticReport,
} from '@/lib/orchestration/diagnosticExporter';
import {
  Activity,
  Download,
  Copy,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Eye,
  CheckCircle2,
} from 'lucide-react';

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'trace' | 'export'>('trace');
  const [filterStage, setFilterStage] = useState<'all' | 'failed' | 'succeeded'>('all');
  const [sanitizedReport, setSanitizedReport] = useState<PrivacyPreservingDiagnosticReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);

  if (!isOpen) return null;

  const currentReport = pipelineTracer.generateReport();
  const filteredSteps = currentReport.steps.filter((s: PipelineStepTrace) => {
    if (filterStage === 'failed') return s.status === 'failed';
    if (filterStage === 'succeeded') return s.status === 'succeeded';
    return true;
  });

  const categoryPreview = diagnosticExporter.getExportCategoryPreview();

  const handleOpenExportTab = async () => {
    setActiveTab('export');
    setIsGenerating(true);
    try {
      const rep = await diagnosticExporter.generatePrivacyPreservingReport();
      setSanitizedReport(rep);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRotateRunId = async () => {
    diagnosticExporter.rotateRunId();
    setIsGenerating(true);
    try {
      const rep = await diagnosticExporter.generatePrivacyPreservingReport();
      setSanitizedReport(rep);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopySanitized = async () => {
    const jsonStr = await diagnosticExporter.exportToJsonString();
    await navigator.clipboard.writeText(jsonStr);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 2500);
  };

  const handleDownloadSanitized = async () => {
    await diagnosticExporter.downloadReportFile();
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal-content-brutal"
        style={{
          maxWidth: '680px',
          width: '92vw',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          background: '#f5f0e8',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '12px 16px',
            background: '#1a1a1a',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '2px solid #1a1a1a',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} style={{ color: '#ffcc00' }} />
            <span
              style={{
                fontFamily: 'var(--font-headline)',
                fontWeight: 800,
                fontSize: '13px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Pipeline Diagnostics & Privacy-Preserved Export
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Selector */}
        <div
          style={{
            display: 'flex',
            borderBottom: '2px solid #1a1a1a',
            background: '#e8e2d5',
          }}
        >
          <button
            onClick={() => setActiveTab('trace')}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: 'none',
              borderRight: '2px solid #1a1a1a',
              background: activeTab === 'trace' ? '#f5f0e8' : 'transparent',
              fontFamily: 'var(--font-headline)',
              fontWeight: 800,
              fontSize: '11px',
              textTransform: 'uppercase',
              cursor: 'pointer',
              color: activeTab === 'trace' ? '#1a1a1a' : '#71717a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Activity size={13} />
            16-Stage Pipeline Trace ({currentReport.steps.length})
          </button>
          <button
            onClick={handleOpenExportTab}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: 'none',
              background: activeTab === 'export' ? '#f5f0e8' : 'transparent',
              fontFamily: 'var(--font-headline)',
              fontWeight: 800,
              fontSize: '11px',
              textTransform: 'uppercase',
              cursor: 'pointer',
              color: activeTab === 'export' ? '#1a1a1a' : '#71717a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <ShieldCheck size={13} style={{ color: activeTab === 'export' ? '#15803d' : undefined }} />
            Export Diagnostic Report (Privacy-Preserved)
          </button>
        </div>

        {/* Tab Content: Trace */}
        {activeTab === 'trace' && (
          <>
            {/* Toolbar & Filter */}
            <div
              style={{
                padding: '8px 16px',
                background: '#f2ede5',
                borderBottom: '1.5px solid #1a1a1a',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={handleOpenExportTab}
                  style={{ fontSize: '10px', padding: '4px 8px' }}
                >
                  <Download size={11} /> Export Privacy-Preserved Report
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-headline)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  Filter:
                </span>
                <select
                  value={filterStage}
                  onChange={(e) => setFilterStage(e.target.value as 'all' | 'failed' | 'succeeded')}
                  style={{ fontSize: '10px', padding: '2px 6px', fontFamily: 'var(--font-headline)' }}
                >
                  <option value="all">All Stages ({currentReport.steps.length})</option>
                  <option value="failed">Failed Only</option>
                  <option value="succeeded">Succeeded Only</option>
                </select>
              </div>
            </div>

            {/* Steps List */}
            <div
              style={{
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                flex: 1,
                overflowY: 'auto',
              }}
            >
              {filteredSteps.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '24px',
                    color: '#71717a',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  No recorded steps match filter. Run a scan or auto-match operation to record telemetry.
                </div>
              ) : (
                filteredSteps.map((step: PipelineStepTrace, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      border: '1.5px solid #1a1a1a',
                      padding: '8px 10px',
                      background: step.status === 'failed' ? '#ffdad6' : '#ffffff',
                      fontSize: '11px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                      <span>
                        Stage {step.stageNumber}: {step.stageName}
                      </span>
                      <span
                        style={{
                          color: step.status === 'failed' ? '#cc0000' : '#1a1a1a',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                        }}
                      >
                        {step.status.toUpperCase()} ({step.durationMs}ms)
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: '2px',
                        color: '#4a4a4a',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                      }}
                    >
                      {step.details}
                    </div>
                    {step.failureReason && (
                      <div
                        style={{
                          color: '#cc0000',
                          fontWeight: 600,
                          marginTop: '2px',
                          fontSize: '10px',
                        }}
                      >
                        Failure: {step.failureReason}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Tab Content: Export */}
        {activeTab === 'export' && (
          <div
            style={{
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              flex: 1,
              overflowY: 'auto',
            }}
          >
            {/* Header / Notice */}
            <div
              style={{
                border: '1.5px solid #1a1a1a',
                padding: '10px 12px',
                background: '#ffffff',
                boxShadow: '2px 2px 0px #1a1a1a',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={16} style={{ color: '#15803d' }} />
                  <span
                    style={{
                      fontFamily: 'var(--font-headline)',
                      fontWeight: 800,
                      fontSize: '12px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Zero-Knowledge Diagnostic Export
                  </span>
                  {isGenerating && (
                    <span style={{ fontSize: '10px', color: '#b45309', fontFamily: 'var(--font-mono)' }}>
                      (Compiling...)
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      background: '#e8e2d5',
                      padding: '2px 6px',
                      border: '1px solid #1a1a1a',
                    }}
                  >
                    Run ID: {diagnosticExporter.getCurrentRunId()}
                  </span>
                  <button
                    onClick={handleRotateRunId}
                    title="Generate new random run ID"
                    style={{
                      border: '1px solid #1a1a1a',
                      background: '#ffffff',
                      cursor: 'pointer',
                      padding: '2px 4px',
                    }}
                  >
                    <RefreshCw size={10} />
                  </button>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: '#4a4a4a', lineHeight: 1.4 }}>
                Generate an unauthenticated diagnostic file to share with course maintainers when reporting issues.
                This report is compiled strictly on your device and is never uploaded automatically.
              </p>
            </div>

            {/* Category Breakdown (Preview) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
              }}
            >
              {/* Included Data */}
              <div
                style={{
                  border: '1.5px solid #1a1a1a',
                  padding: '10px',
                  background: '#f0fdf4',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-headline)',
                    fontWeight: 800,
                    fontSize: '11px',
                    color: '#166534',
                    textTransform: 'uppercase',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <CheckCircle2 size={13} />
                  Data Included in Report
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: '16px',
                    fontSize: '10px',
                    color: '#14532d',
                    lineHeight: 1.5,
                  }}
                >
                  {categoryPreview.included.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>

              {/* Excluded Data */}
              <div
                style={{
                  border: '1.5px solid #1a1a1a',
                  padding: '10px',
                  background: '#fef2f2',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-headline)',
                    fontWeight: 800,
                    fontSize: '11px',
                    color: '#991b1b',
                    textTransform: 'uppercase',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <ShieldAlert size={13} />
                  Strictly Excluded & Redacted
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: '16px',
                    fontSize: '10px',
                    color: '#7f1d1d',
                    lineHeight: 1.5,
                  }}
                >
                  {categoryPreview.excluded.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Status / Quick Metrics Card */}
            {sanitizedReport && (
              <div
                style={{
                  border: '1.5px solid #1a1a1a',
                  padding: '8px 12px',
                  background: '#ffffff',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '8px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <div>
                  <div style={{ color: '#71717a' }}>DATASET VER</div>
                  <div style={{ fontWeight: 700 }}>{sanitizedReport.knowledgeBase.datasetVersion}</div>
                </div>
                <div>
                  <div style={{ color: '#71717a' }}>CACHED PACKS</div>
                  <div style={{ fontWeight: 700 }}>
                    {sanitizedReport.knowledgeBase.totalCachedCourses} courses
                  </div>
                </div>
                <div>
                  <div style={{ color: '#71717a' }}>ERROR CODES</div>
                  <div style={{ fontWeight: 700 }}>
                    {sanitizedReport.pipelineTelemetry.sanitizedErrorCodes.length} recorded
                  </div>
                </div>
                <div>
                  <div style={{ color: '#71717a' }}>NETWORK</div>
                  <div
                    style={{
                      fontWeight: 700,
                      color: sanitizedReport.networkHealth.isOnline ? '#15803d' : '#b91c1c',
                    }}
                  >
                    {sanitizedReport.networkHealth.state.toUpperCase()}
                  </div>
                </div>
              </div>
            )}

            {/* Actions Bar */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                className="btn btn-primary"
                onClick={handleDownloadSanitized}
                style={{
                  fontSize: '11px',
                  padding: '6px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#ffcc00',
                  color: '#1a1a1a',
                  fontWeight: 800,
                  border: '2px solid #1a1a1a',
                }}
              >
                <Download size={13} />
                Download Report (.json)
              </button>

              <button
                className="btn btn-secondary"
                onClick={handleCopySanitized}
                style={{
                  fontSize: '11px',
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Copy size={12} />
                {copiedNotice ? 'Copied to Clipboard!' : 'Copy Sanitized JSON'}
              </button>

              <button
                className="btn btn-secondary"
                onClick={() => setShowJsonPreview(!showJsonPreview)}
                style={{
                  fontSize: '11px',
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginLeft: 'auto',
                }}
              >
                <Eye size={12} />
                {showJsonPreview ? 'Hide JSON Preview' : 'Preview Sanitized JSON'}
              </button>
            </div>

            {/* Optional Raw JSON Preview */}
            {showJsonPreview && sanitizedReport && (
              <div
                style={{
                  border: '1.5px solid #1a1a1a',
                  background: '#1a1a1a',
                  color: '#4ade80',
                  padding: '10px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                }}
              >
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(sanitizedReport, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: '10px 16px',
            background: '#f2ede5',
            borderTop: '2px solid #1a1a1a',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#71717a' }}>
            {activeTab === 'trace'
              ? `Session: #${currentReport.sessionId.slice(0, 12)}`
              : 'Local Export Only · Zero Automated Analytics'}
          </div>
          <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: '11px', padding: '4px 12px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
