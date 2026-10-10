import React, { useState } from 'react';
import {
  QuestionMatchResult,
  PopulationTarget,
  PopulationSummary,
  Course,
  QuestionRecord,
  ScanResultMessage,
  PopulateResultMessage,
} from '@/types';
import { matchAssignment } from '@/lib/matching/matcher';
import {
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  Send,
  RefreshCw,
  Info,
  Check,
  X,
} from 'lucide-react';

interface ScannerTabProps {
  selectedCourse: Course | undefined;
  answerBank: QuestionRecord[];
  results: QuestionMatchResult[];
  setResults: React.Dispatch<React.SetStateAction<QuestionMatchResult[]>>;
}

export const ScannerTab: React.FC<ScannerTabProps> = ({
  selectedCourse,
  answerBank,
  results,
  setResults,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [pageInfo, setPageInfo] = useState<{ title?: string; url?: string } | null>(null);

  // Filter state
  const [filter, setFilter] = useState<'all' | 'exact' | 'review' | 'unmatched'>('all');

  // Expanded explanations state
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  // Population execution state
  const [isPopulating, setIsPopulating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [popSummary, setPopSummary] = useState<PopulationSummary | null>(null);

  // Scan current tab
  const handleScan = async () => {
    setIsScanning(true);
    setScanError(null);

    // If running in Chrome Extension environment
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
          throw new Error('No active browser tab found. Please open an assignment page.');
        }

        // Check URL
        if (
          tab.url?.startsWith('chrome://') ||
          tab.url?.startsWith('chrome-extension://') ||
          tab.url?.startsWith('edge://')
        ) {
          throw new Error('Cannot scan internal browser pages. Please navigate to a SWAYAM or mock assignment tab.');
        }

        // Send message to content script
        const sendScanMessage = (): Promise<ScanResultMessage> => {
          return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tab.id!, { type: 'SCAN_ASSIGNMENT' }, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            });
          });
        };

        let response: ScanResultMessage;
        try {
          response = await sendScanMessage();
        } catch {
          // If content script was not injected, inject it now
          if (chrome.scripting) {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js'],
            });
            // Try sending message again
            response = await sendScanMessage();
          } else {
            throw new Error('Please refresh the assignment page to enable swayam404 scanning.');
          }
        }

        if (!response.success || !response.questions) {
          throw new Error(response.error || 'No questions detected on this page.');
        }

        if (response.questions.length === 0) {
          throw new Error('Assignment page detected, but no recognizable question containers were found.');
        }

        setPageInfo({ title: response.pageTitle || tab.title, url: response.url || tab.url });

        // Match questions against active course answer bank
        const matched = matchAssignment(response.questions, answerBank);
        setResults(matched);
      } catch (err) {
        setScanError((err as Error).message || 'Failed to scan active tab.');
      } finally {
        setIsScanning(false);
      }
    } else {
      // Local dev simulation fallback
      setScanError(
        'Chrome extension APIs not detected in this standalone preview. To test scanning, load unpacked in Chrome or use the test fixtures below.'
      );
      setIsScanning(false);
    }
  };

  // Toggle approval checkbox
  const handleToggleApproval = (idx: number) => {
    setResults((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], isApproved: !copy[idx].isApproved };
      return copy;
    });
  };

  // Manual choice override
  const handleOptionSelect = (qIdx: number, optionText: string) => {
    setResults((prev) => {
      const copy = [...prev];
      const current = copy[qIdx];
      const isMulti = current.scannedQuestion.questionType === 'multiple-choice';

      let newAnswers: string[];
      if (isMulti) {
        const existing = current.proposedAnswers || [];
        if (existing.includes(optionText)) {
          newAnswers = existing.filter((a) => a !== optionText);
        } else {
          newAnswers = [...existing, optionText];
        }
      } else {
        newAnswers = [optionText];
      }

      copy[qIdx] = {
        ...current,
        proposedAnswers: newAnswers,
        isApproved: newAnswers.length > 0,
      };
      return copy;
    });
  };

  // Manual text answer override
  const handleTextAnswerChange = (qIdx: number, text: string) => {
    setResults((prev) => {
      const copy = [...prev];
      copy[qIdx] = {
        ...copy[qIdx],
        proposedAnswers: text ? [text] : [],
        isApproved: !!text.trim(),
      };
      return copy;
    });
  };

  // Select all exact matches
  const handleSelectAllExact = () => {
    setResults((prev) =>
      prev.map((r) => (r.status === 'exact-match' ? { ...r, isApproved: true } : r))
    );
  };

  // Deselect all
  const handleDeselectAll = () => {
    setResults((prev) => prev.map((r) => ({ ...r, isApproved: false })));
  };

  // Populate approved answers
  const handleExecutePopulate = async () => {
    setShowConfirmModal(false);
    setIsPopulating(true);

    try {
      if (typeof chrome === 'undefined' || !chrome.tabs) {
        throw new Error('Chrome extension tabs API unavailable.');
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        throw new Error('Active tab disconnected. Please re-open the assignment tab.');
      }

      const approvedItems = results.filter((r) => r.isApproved && r.proposedAnswers.length > 0);
      if (approvedItems.length === 0) {
        throw new Error('No questions selected for population.');
      }

      const targets: PopulationTarget[] = approvedItems.map((r) => ({
        questionId: r.scannedQuestion.id,
        questionText: r.scannedQuestion.questionText,
        questionType: r.scannedQuestion.questionType,
        selectedAnswers: r.proposedAnswers,
        options: r.scannedQuestion.options,
      }));

      const response: PopulateResultMessage = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
          tab.id!,
          { type: 'POPULATE_ANSWERS', targets },
          (res) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(res);
            }
          }
        );
      });

      if (response && response.summary) {
        setPopSummary(response.summary);
      }
    } catch (err) {
      setScanError(`Population error: ${(err as Error).message}`);
    } finally {
      setIsPopulating(false);
    }
  };

  // Metrics
  const totalScanned = results.length;
  const exactCount = results.filter((r) => r.status === 'exact-match').length;
  const reviewCount = results.filter(
    (r) => r.status === 'probable-match' || r.status === 'ambiguous-match'
  ).length;
  const unmatchedCount = results.filter((r) => r.status === 'no-match').length;
  const approvedCount = results.filter((r) => r.isApproved).length;

  // Filtered results
  const filteredResults = results.map((r, idx) => ({ ...r, originalIndex: idx })).filter((item) => {
    if (filter === 'exact') return item.status === 'exact-match';
    if (filter === 'review') return item.status === 'probable-match' || item.status === 'ambiguous-match';
    if (filter === 'unmatched') return item.status === 'no-match';
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Scan Control Header */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
              Assignment Scanner
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              Course Context: <strong style={{ color: '#818cf8' }}>{selectedCourse?.name}</strong>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleScan}
            disabled={isScanning}
            style={{ padding: '7px 12px', fontSize: '12px' }}
          >
            <RefreshCw size={13} className={isScanning ? 'animate-spin' : ''} />
            {isScanning ? 'Scanning...' : 'Scan Active Page'}
          </button>
        </div>

        {pageInfo && (
          <div
            style={{
              fontSize: '11px',
              color: '#38bdf8',
              background: 'rgba(56, 189, 248, 0.08)',
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Scanned: <strong>{pageInfo.title || pageInfo.url}</strong>
          </div>
        )}

        {scanError && (
          <div
            style={{
              fontSize: '11px',
              color: '#f87171',
              background: 'rgba(239, 68, 68, 0.1)',
              padding: '8px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              display: 'flex',
              gap: '6px',
              alignItems: 'flex-start',
            }}
          >
            <AlertOctagon size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{scanError}</span>
          </div>
        )}
      </div>

      {/* Metrics Bar */}
      {totalScanned > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '6px',
          }}
        >
          <div
            className="card"
            style={{ padding: '8px', textAlign: 'center', cursor: 'pointer' }}
            onClick={() => setFilter('all')}
          >
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{totalScanned}</div>
            <div style={{ fontSize: '10px', color: '#94a3b8' }}>Total</div>
          </div>
          <div
            className="card"
            style={{
              padding: '8px',
              textAlign: 'center',
              cursor: 'pointer',
              borderColor: filter === 'exact' ? '#38bdf8' : undefined,
            }}
            onClick={() => setFilter('exact')}
          >
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#38bdf8' }}>{exactCount}</div>
            <div style={{ fontSize: '10px', color: '#94a3b8' }}>Exact</div>
          </div>
          <div
            className="card"
            style={{
              padding: '8px',
              textAlign: 'center',
              cursor: 'pointer',
              borderColor: filter === 'review' ? '#f59e0b' : undefined,
            }}
            onClick={() => setFilter('review')}
          >
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#f59e0b' }}>{reviewCount}</div>
            <div style={{ fontSize: '10px', color: '#94a3b8' }}>Review Req.</div>
          </div>
          <div
            className="card"
            style={{
              padding: '8px',
              textAlign: 'center',
              cursor: 'pointer',
              borderColor: filter === 'unmatched' ? '#64748b' : undefined,
            }}
            onClick={() => setFilter('unmatched')}
          >
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#94a3b8' }}>{unmatchedCount}</div>
            <div style={{ fontSize: '10px', color: '#94a3b8' }}>Unmatched</div>
          </div>
        </div>
      )}

      {/* Action Controls & Batch Selection */}
      {totalScanned > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="btn btn-secondary"
              onClick={handleSelectAllExact}
              style={{ fontSize: '11px', padding: '4px 8px' }}
            >
              Select Exact Matches
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleDeselectAll}
              style={{ fontSize: '11px', padding: '4px 8px' }}
            >
              Clear All
            </button>
          </div>

          <button
            className="btn btn-success"
            onClick={() => setShowConfirmModal(true)}
            disabled={approvedCount === 0 || isPopulating}
            style={{ fontSize: '11px', padding: '6px 12px' }}
          >
            <Send size={12} />
            Populate Selected ({approvedCount})
          </button>
        </div>
      )}

      {/* Review List */}
      {filteredResults.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredResults.map((item) => {
            const originalIdx = item.originalIndex;
            const q = item.scannedQuestion;
            const isExpanded = !!expandedCards[q.id];

            return (
              <div
                key={q.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  borderLeft:
                    item.status === 'exact-match'
                      ? '3px solid #38bdf8'
                      : item.status === 'probable-match'
                      ? '3px solid #f59e0b'
                      : item.status === 'ambiguous-match'
                      ? '3px solid #f43f5e'
                      : '3px solid #475569',
                }}
              >
                {/* Top Row: Checkbox, Question Text, Status Badge */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <input
                    type="checkbox"
                    className="custom-checkbox"
                    checked={item.isApproved}
                    onChange={() => handleToggleApproval(originalIdx)}
                    style={{ marginTop: '2px' }}
                    title="Approve for form population"
                  />

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#818cf8' }}>
                        Q{q.index}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#94a3b8',
                          background: 'rgba(255, 255, 255, 0.05)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                        }}
                      >
                        {q.questionType}
                      </span>

                      {/* Status Badges */}
                      {item.status === 'exact-match' && (
                        <span className="badge badge-exact">
                          <CheckCircle2 size={11} /> Exact Match
                        </span>
                      )}
                      {item.status === 'probable-match' && (
                        <span className="badge badge-probable">
                          <AlertTriangle size={11} /> Probable Match (Review Req.)
                        </span>
                      )}
                      {item.status === 'ambiguous-match' && (
                        <span className="badge badge-ambiguous">
                          <AlertOctagon size={11} /> Ambiguous Match
                        </span>
                      )}
                      {item.status === 'no-match' && (
                        <span className="badge badge-unmatched">
                          <HelpCircle size={11} /> Unmatched
                        </span>
                      )}
                      {item.status === 'unsupported-type' && (
                        <span className="badge badge-unmatched">
                          Unsupported Control
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginTop: '4px' }}>
                      {q.questionText}
                    </div>
                  </div>
                </div>

                {/* Match Reasons / Warnings */}
                {item.reasons.length > 0 && (
                  <div
                    style={{
                      fontSize: '11px',
                      color:
                        item.status === 'ambiguous-match'
                          ? '#fda4af'
                          : item.status === 'probable-match'
                          ? '#fde68a'
                          : '#bae6fd',
                      background:
                        item.status === 'ambiguous-match'
                          ? 'rgba(244, 63, 94, 0.08)'
                          : item.status === 'probable-match'
                          ? 'rgba(245, 158, 11, 0.08)'
                          : 'rgba(56, 189, 248, 0.08)',
                      padding: '6px 10px',
                      borderRadius: '6px',
                    }}
                  >
                    {item.reasons.join(' ')}
                  </div>
                )}

                {/* Visible Options / Answer Controls on page */}
                {q.questionType !== 'short-text' && q.options.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
                      Rendered Options (Click to override):
                    </div>
                    {q.options.map((opt) => {
                      const isSelected = item.proposedAnswers.includes(opt.text);
                      return (
                        <div
                          key={opt.id}
                          onClick={() => handleOptionSelect(originalIdx, opt.text)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            background: isSelected
                              ? 'rgba(99, 102, 241, 0.15)'
                              : 'rgba(255, 255, 255, 0.02)',
                            border: isSelected
                              ? '1px solid rgba(99, 102, 241, 0.4)'
                              : '1px solid rgba(255, 255, 255, 0.05)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: isSelected ? '#c7d2fe' : '#cbd5e1',
                          }}
                        >
                          <span>{opt.text}</span>
                          {isSelected && <Check size={14} style={{ color: '#818cf8' }} />}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Short text manual input */}
                {q.questionType === 'short-text' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
                      Proposed text to populate:
                    </div>
                    <input
                      type="text"
                      value={item.proposedAnswers[0] || ''}
                      onChange={(e) => handleTextAnswerChange(originalIdx, e.target.value)}
                      placeholder="Type answer to populate..."
                    />
                  </div>
                )}

                {/* Explanation & Source Accordion */}
                {item.matchedRecord && (
                  <div>
                    <button
                      className="btn btn-secondary"
                      onClick={() =>
                        setExpandedCards((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                      }
                      style={{
                        padding: '3px 8px',
                        fontSize: '10px',
                        background: 'transparent',
                        border: 'none',
                        color: '#818cf8',
                      }}
                    >
                      <Info size={11} />
                      {isExpanded ? 'Hide saved rationale' : 'View saved explanation & source'}
                      {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>

                    {isExpanded && (
                      <div
                        style={{
                          marginTop: '6px',
                          padding: '8px 10px',
                          background: 'rgba(0, 0, 0, 0.25)',
                          borderRadius: '6px',
                          fontSize: '11px',
                          color: '#cbd5e1',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        {item.matchedRecord.explanation && (
                          <div>
                            <strong style={{ color: '#94a3b8' }}>Explanation: </strong>
                            {item.matchedRecord.explanation}
                          </div>
                        )}
                        <div>
                          <strong style={{ color: '#94a3b8' }}>Source: </strong>
                          {item.matchedRecord.source || 'Saved Answer Bank'}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : totalScanned > 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
          No questions matched current filter ({filter}).
        </div>
      ) : (
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: '32px 16px',
            color: '#94a3b8',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <ScanLine size={32} style={{ color: '#6366f1', opacity: 0.6 }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
              No Assignment Scanned Yet
            </div>
            <div style={{ fontSize: '11px', marginTop: '4px' }}>
              Open your course assignment in a browser tab and click "Scan Active Page".
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal Before Population */}
      {showConfirmModal && (
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
              borderColor: '#2a3854',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                Confirm Answer Population
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
              You are about to populate <strong>{approvedCount}</strong> approved question(s) into the currently active assignment tab.
            </div>

            <div
              style={{
                fontSize: '11px',
                color: '#34d399',
                background: 'rgba(16, 185, 129, 0.08)',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid rgba(16, 185, 129, 0.2)',
              }}
            >
              🔒 <strong>Safety Guarantee:</strong> The extension will only check/fill form inputs. It will NEVER submit your assignment.
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button className="btn btn-secondary" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </button>
              <button className="btn btn-success" onClick={handleExecutePopulate}>
                Apply Approved Answers
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Population Results Modal */}
      {popSummary && (
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
              maxWidth: '400px',
              width: '100%',
              background: '#111726',
              maxHeight: '90vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                Population Report
              </div>
              <button
                onClick={() => setPopSummary(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <div
                style={{
                  flex: 1,
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  padding: '8px',
                  borderRadius: '6px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#34d399' }}>
                  {popSummary.succeeded}
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>Succeeded</div>
              </div>

              <div
                style={{
                  flex: 1,
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  padding: '8px',
                  borderRadius: '6px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#f87171' }}>
                  {popSummary.failed}
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>Failed</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
              {popSummary.results.map((res, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: '11px',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    background: res.success ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
                    color: res.success ? '#a7f3d0' : '#fca5a5',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {res.success ? <Check size={12} /> : <X size={12} />}
                  <span>{res.message}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', marginTop: '6px' }}>
              Please review all choices on your assignment page and click Submit using the normal SWAYAM interface.
            </div>

            <button className="btn btn-primary" onClick={() => setPopSummary(null)} style={{ width: '100%' }}>
              Close Report
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
