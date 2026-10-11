import React, { useState } from 'react';
import { ScannedQuestion } from '@/types';
import { ChatGptBridgeService, ChatGptImportResult } from '@/lib/ai/chatgptBridge';
import {
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  FileText,
} from 'lucide-react';

interface ChatGptImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  scannedQuestions: ScannedQuestion[];
  courseName?: string;
  assignmentTitle?: string;
  initialPromptText?: string;
  onImportSuccess: (result: ChatGptImportResult) => void;
}

export const ChatGptImportModal: React.FC<ChatGptImportModalProps> = ({
  isOpen,
  onClose,
  scannedQuestions,
  courseName,
  assignmentTitle,
  initialPromptText,
  onImportSuccess,
}) => {
  const [activeView, setActiveView] = useState<'import' | 'prompt'>(
    initialPromptText ? 'prompt' : 'import'
  );
  const [pastedText, setPastedText] = useState('');
  const [validationResult, setValidationResult] = useState<ChatGptImportResult | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentPrompt =
    initialPromptText ||
    ChatGptBridgeService.buildPrompt({
      questions: scannedQuestions,
      courseName,
      assignmentTitle,
    });

  const handleCopyPrompt = async () => {
    const ok = await ChatGptBridgeService.copyToClipboard(currentPrompt);
    if (ok) {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 3000);
    } else {
      alert('Could not copy automatically. Please select the prompt text and press Ctrl+C / Cmd+C.');
    }
  };

  const handleOpenChatGpt = async () => {
    await ChatGptBridgeService.openChatGptTab();
  };

  const handlePreviewParse = () => {
    setParseError(null);
    if (!pastedText.trim()) {
      setParseError('Please paste your ChatGPT response text first.');
      setValidationResult(null);
      return;
    }

    try {
      const result = ChatGptBridgeService.parseResponse(pastedText, scannedQuestions);
      setValidationResult(result);
      if (!result.success && result.errors.length > 0) {
        setParseError(result.errors.join(' '));
      }
    } catch (err) {
      setParseError((err as Error).message);
      setValidationResult(null);
    }
  };

  const handleApplyImport = () => {
    if (!validationResult) {
      const result = ChatGptBridgeService.parseResponse(pastedText, scannedQuestions);
      if (!result.success || result.matchedItems.length === 0) {
        setParseError(result.errors[0] || 'No matching answers found in response.');
        return;
      }
      onImportSuccess(result);
      onClose();
    } else {
      if (validationResult.matchedItems.length === 0) {
        setParseError('Cannot import: 0 valid question options matched.');
        return;
      }
      onImportSuccess(validationResult);
      onClose();
    }
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal-content-brutal"
        style={{
          maxWidth: '540px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header Bar */}
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
            <span style={{ width: '8px', height: '8px', background: '#ffcc00', display: 'inline-block' }} />
            <span
              style={{
                fontFamily: 'var(--font-headline)',
                fontWeight: 800,
                fontSize: '13px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              ChatGPT Manual AI Bridge
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

        {/* View Switcher Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '2px solid #1a1a1a',
            background: '#f2ede5',
          }}
        >
          <button
            onClick={() => setActiveView('import')}
            style={{
              flex: 1,
              padding: '9px 12px',
              fontFamily: 'var(--font-headline)',
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              border: 'none',
              borderRight: '1.5px solid #1a1a1a',
              background: activeView === 'import' ? '#ffffff' : 'transparent',
              color: '#1a1a1a',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Sparkles size={13} />
            <span>1. Paste & Import Response</span>
          </button>

          <button
            onClick={() => setActiveView('prompt')}
            style={{
              flex: 1,
              padding: '9px 12px',
              fontFamily: 'var(--font-headline)',
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              border: 'none',
              background: activeView === 'prompt' ? '#ffffff' : 'transparent',
              color: '#1a1a1a',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <FileText size={13} />
            <span>2. View / Copy Prompt</span>
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            flex: 1,
          }}
        >
          {activeView === 'import' ? (
            <>
              {/* Instructions */}
              <div
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-body)',
                  color: '#4a4a4a',
                  lineHeight: 1.45,
                }}
              >
                Paste the JSON or numbered list answer output received from your ChatGPT session below. Swayam404 will match questions and map selected options to the live assignment.
              </div>

              {/* Textarea */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-headline)',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    color: '#1a1a1a',
                  }}
                >
                  Paste ChatGPT Response (JSON or Markdown) *
                </label>
                <textarea
                  rows={7}
                  placeholder={`Example JSON format:\n{\n  "answers": [\n    {\n      "question": "What is ...?",\n      "selectedOption": "Option Text"\n    }\n  ]\n}\n\nOr numbered list:\n1. B - Option Text\n2. A, C - Option Texts`}
                  value={pastedText}
                  onChange={(e) => {
                    setPastedText(e.target.value);
                    setValidationResult(null);
                    setParseError(null);
                  }}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    padding: '8px 10px',
                    border: '1.5px solid #1a1a1a',
                    background: '#ffffff',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Action row before import */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handlePreviewParse}
                  style={{ fontSize: '10px', padding: '6px 12px' }}
                >
                  Validate & Preview
                </button>

                <button
                  type="button"
                  onClick={() => setActiveView('prompt')}
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-headline)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    background: 'transparent',
                    border: 'none',
                    color: '#666666',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Need the prompt again?
                </button>
              </div>

              {/* Error Alert */}
              {parseError && (
                <div
                  style={{
                    background: '#ffdad6',
                    border: '1.5px solid #cc0000',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '6px',
                    fontSize: '11px',
                    color: '#cc0000',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <div>
                    <strong>Validation Error:</strong> {parseError}
                  </div>
                </div>
              )}

              {/* Validation Summary Preview */}
              {validationResult && (
                <div
                  style={{
                    background: '#f2ede5',
                    border: '1.5px solid #1a1a1a',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11px',
                      fontFamily: 'var(--font-headline)',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                    }}
                  >
                    <span>Import Verification Summary</span>
                    <span
                      style={{
                        padding: '2px 6px',
                        background: validationResult.matchedCount > 0 ? '#ffcc00' : '#ffdad6',
                        border: '1px solid #1a1a1a',
                        color: '#1a1a1a',
                      }}
                    >
                      {validationResult.matchedCount} of {scannedQuestions.length} Matched
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                    <span>✓ Valid: {validationResult.matchedCount}</span>
                    <span>⚠ Skipped: {validationResult.skippedCount}</span>
                    {validationResult.invalidCount > 0 && (
                      <span style={{ color: '#cc0000' }}>✕ Invalid: {validationResult.invalidCount}</span>
                    )}
                  </div>

                  {/* Matched questions preview */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
                    {validationResult.matchedItems.map((item, idx) => (
                      <div
                        key={item.questionId}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #1a1a1a',
                          padding: '5px 8px',
                          fontSize: '10px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          #{idx + 1}. {item.scannedQuestion.questionText}
                        </span>
                        <span
                          style={{
                            background: '#eef4ff',
                            color: '#0033aa',
                            border: '1px solid #0033aa',
                            padding: '1px 5px',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          ✓ {item.matchedOptionTexts.join(', ')}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Invalid warnings list */}
                  {validationResult.invalidItems.length > 0 && (
                    <div style={{ fontSize: '10px', color: '#cc0000', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {validationResult.invalidItems.map((inv, idx) => (
                        <div key={idx}>• {inv.reason}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Prompt View Mode */}
              <div
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-body)',
                  color: '#4a4a4a',
                  lineHeight: 1.45,
                }}
              >
                Copy this formatted prompt and paste it into your ChatGPT tab. The prompt requests strict JSON with exact question and option identifiers.
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCopyPrompt}
                  style={{ flex: 1, fontSize: '11px', padding: '8px 12px' }}
                >
                  {copiedPrompt ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedPrompt ? 'Copied to Clipboard!' : 'Copy Formatted Prompt'}</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleOpenChatGpt}
                  style={{ fontSize: '11px', padding: '8px 12px' }}
                  title="Open chatgpt.com in a new tab"
                >
                  <ExternalLink size={13} />
                  <span>Open ChatGPT ↗</span>
                </button>
              </div>

              <textarea
                readOnly
                rows={10}
                value={currentPrompt}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  padding: '8px 10px',
                  border: '1.5px solid #1a1a1a',
                  background: '#f8f6f2',
                  resize: 'vertical',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveView('import')}
                  style={{ fontSize: '10px', padding: '6px 12px' }}
                >
                  Proceed to Paste Response →
                </button>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer Bar */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '2px solid #1a1a1a',
            background: '#f2ede5',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ fontSize: '10px', padding: '6px 12px' }}
          >
            Cancel
          </button>

          {activeView === 'import' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleApplyImport}
              disabled={!pastedText.trim()}
              style={{ fontSize: '11px', padding: '8px 16px' }}
            >
              <CheckCircle2 size={13} />
              <span>
                {validationResult && validationResult.matchedCount > 0
                  ? `Import ${validationResult.matchedCount} Matched Answers`
                  : 'Import & Match Answers'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
