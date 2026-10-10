import React, { useState } from 'react';
import { Course } from '@/types';
import { StorageService } from '@/lib/storage';
import { ImportExportService, ImportValidationResult } from '@/lib/storage/importExport';
import {
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  FileJson,
} from 'lucide-react';

interface ImportExportTabProps {
  courses: Course[];
  selectedCourseId: string;
  onRefreshData: () => Promise<void>;
}

export const ImportExportTab: React.FC<ImportExportTabProps> = ({
  courses,
  selectedCourseId,
  onRefreshData,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [targetCourse, setTargetCourse] = useState<string>(selectedCourseId);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // File selection and schema validation
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setStatusMessage(null);
    setValidationResult(null);

    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    try {
      const text = await file.text();
      const validated = await ImportExportService.validateImportPayload(text, targetCourse);
      setValidationResult(validated);
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to read file content.' });
    }
  };

  // Perform import
  const handleExecuteImport = async () => {
    if (!validationResult || !validationResult.isValid) return;

    setIsProcessing(true);
    setStatusMessage(null);

    try {
      const res = await ImportExportService.executeImport(validationResult, importMode, targetCourse);
      await onRefreshData();

      setStatusMessage({
        type: 'success',
        text: `Successfully imported! Added: ${res.addedQuestions}, Updated: ${res.updatedQuestions} questions to "${res.targetCourseName || 'target course'}".`,
      });

      setValidationResult(null);
      setSelectedFile(null);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: (err as Error).message || 'Failed to complete import.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Export helper
  const downloadJson = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSelectedCourse = async () => {
    const course = courses.find((c) => c.id === selectedCourseId);
    const data = await StorageService.exportCourse(selectedCourseId);
    downloadJson(data, `${course?.name.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'course'}_backup.json`);
  };

  const handleExportAll = async () => {
    const data = await StorageService.exportAll();
    downloadJson(data, `swayam404_full_backup_${new Date().toISOString().slice(0, 10)}.json`);
  };

  // Quick load sample data
  const handleQuickLoadSample = async (sampleType: 'economics' | 'entrepreneurship') => {
    setIsProcessing(true);
    setStatusMessage(null);

    try {
      const path = `/sample-data/${sampleType}-sample.json`;
      const res = await fetch(path);
      if (!res.ok) throw new Error('Could not fetch sample JSON file.');

      const json = await res.json();
      const targetCId = sampleType === 'economics' ? 'course-econ-101' : 'course-ent-201';
      const validated = await ImportExportService.validateImportPayload(json, targetCId);

      await ImportExportService.executeImport(validated, 'merge', targetCId);
      await onRefreshData();

      setStatusMessage({
        type: 'success',
        text: `Loaded official sample data for ${sampleType === 'economics' ? 'Economics' : 'Entrepreneurship'}!`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Failed to load sample: ${(err as Error).message}`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
          Import & Export Answer Banks
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
          Backup or restore versioned JSON answer banks with duplicate detection
        </div>
      </div>

      {statusMessage && (
        <div
          className="card"
          style={{
            fontSize: '11px',
            background: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            borderColor: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
            color: statusMessage.type === 'success' ? '#6ee7b7' : '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Import Section */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Upload size={14} style={{ color: '#818cf8' }} />
          Import Answer Bank (.json)
        </div>

        <div>
          <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
            Target Course for Import:
          </label>
          <select value={targetCourse} onChange={(e) => setTargetCourse(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            style={{
              border: '2px dashed var(--border-medium)',
              borderRadius: '8px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              background: 'rgba(0, 0, 0, 0.2)',
            }}
          >
            <FileJson size={24} style={{ color: '#818cf8' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
              {selectedFile ? selectedFile.name : 'Select or drop JSON file'}
            </span>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
              Supports version 1.0.0 answer bank files
            </span>
            <input type="file" accept=".json" onChange={handleFileChange} style={{ display: 'none' }} />
          </label>
        </div>

        {/* Validation Preview Card */}
        {validationResult && (
          <div
            style={{
              padding: '10px',
              borderRadius: '8px',
              background: validationResult.isValid ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
              border: validationResult.isValid ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700 }}>
              {validationResult.isValid ? (
                <span style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={13} /> Schema Validated
                </span>
              ) : (
                <span style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={13} /> Schema Validation Failed
                </span>
              )}
            </div>

            <div style={{ fontSize: '11px', color: '#cbd5e1' }}>
              • Found <strong>{validationResult.questionCount}</strong> questions in file.<br />
              • Duplicate questions in file: <strong>{validationResult.duplicateCountInFile}</strong>.<br />
              • Collisions with existing course records: <strong>{validationResult.duplicateCountWithExisting}</strong>.
            </div>

            {validationResult.warnings.length > 0 && (
              <div style={{ fontSize: '10px', color: '#fbbf24' }}>
                {validationResult.warnings.map((w, i) => (
                  <div key={i}>⚠️ {w}</div>
                ))}
              </div>
            )}

            {validationResult.errors.length > 0 && (
              <div style={{ fontSize: '10px', color: '#fca5a5' }}>
                {validationResult.errors.map((e, i) => (
                  <div key={i}>❌ {e}</div>
                ))}
              </div>
            )}

            {validationResult.isValid && (
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="mode"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                    />
                    <span>Merge & Update (Recommended)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="mode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                    />
                    <span>Replace Entire Course Bank</span>
                  </label>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={handleExecuteImport}
                  disabled={isProcessing}
                  style={{ width: '100%', padding: '8px' }}
                >
                  Confirm & Import Questions
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Export Section */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Download size={14} style={{ color: '#38bdf8' }} />
          Export & Backup
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-secondary"
            onClick={handleExportSelectedCourse}
            style={{ flex: 1, fontSize: '11px' }}
          >
            Export Active Course JSON
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleExportAll}
            style={{ flex: 1, fontSize: '11px' }}
          >
            Full Backup (All Courses)
          </button>
        </div>
      </div>

      {/* Quick Load Official Sample Data */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={14} style={{ color: '#fbbf24' }} />
          Quick Load Sample Answer Banks
        </div>
        <p style={{ fontSize: '11px', color: '#94a3b8' }}>
          Instantly seed fictional test questions for Economics or Entrepreneurship to test matching:
        </p>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => handleQuickLoadSample('economics')}
            disabled={isProcessing}
            style={{ flex: 1, fontSize: '11px' }}
          >
            Load Economics Sample
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleQuickLoadSample('entrepreneurship')}
            disabled={isProcessing}
            style={{ flex: 1, fontSize: '11px' }}
          >
            Load Entrepreneurship Sample
          </button>
        </div>
      </div>
    </div>
  );
};
