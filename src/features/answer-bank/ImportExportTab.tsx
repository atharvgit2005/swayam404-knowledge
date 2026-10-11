import React, { useState } from 'react';
import { Course, CourseMaterial } from '@/types';
import { StorageService } from '@/lib/storage';
import { ImportExportService, ImportValidationResult } from '@/lib/storage/importExport';
import {
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  FileJson,
  Share2,
  BookOpen,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { ContributionBuilder } from '@/lib/knowledge/contributionBuilder';
import { ContributionProposal } from '@/types/knowledge';
import { ContributionPreviewModal } from '@/features/knowledge/ContributionPreviewModal';

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
  const [activeProposal, setActiveProposal] = useState<ContributionProposal | null>(null);

  const handleProposeLearningResource = async () => {
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const course = courses.find((c) => c.id === selectedCourseId);
      const materials = await StorageService.getCourseMaterials(selectedCourseId);
      const now = new Date().toISOString();
      const toUse: CourseMaterial[] =
        materials.length > 0
          ? materials
          : [
              {
                id: `notes-${Date.now()}`,
                courseId: selectedCourseId,
                title: `${course?.name || 'Course'} - Core Lecture Notes`,
                type: 'notes',
                content:
                  'Key concept definitions, formula summaries, and worked examples from course lectures.',
                createdAt: now,
                updatedAt: now,
              },
            ];

      const prop = await ContributionBuilder.buildLearningResourceProposal({
        courseId: selectedCourseId,
        title: `${course?.name || 'Course'} Notes & Summaries`,
        materials: toUse,
        resourceType: 'concept-summary',
        provenance: {
          sourceTitle: `${course?.name || 'Course'} Learning Material`,
          license: 'CC-BY-4.0',
          permission: 'public-open-educational',
          isPermissionConfirmed: true,
        },
        topics: [course?.name || 'General'],
      });

      setActiveProposal(prop);
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to prepare proposal: ${(err as Error).message}` });
    } finally {
      setIsProcessing(false);
    }
  };

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div
        className="card"
        style={{
          padding: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', background: '#1a1a1a', display: 'inline-block' }}></span>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', color: '#1a1a1a', letterSpacing: '-0.02em' }}>
              Import & Export Answer Banks
            </h2>
          </div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: '#4a4a4a', marginTop: '2px' }}>
            Backup, migrate, or restore versioned JSON answer banks with collision detection
          </p>
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            fontSize: '11px',
            fontFamily: 'var(--font-body)',
            padding: '10px 14px',
            border: '2px solid #1a1a1a',
            background: statusMessage.type === 'success' ? '#d6e3ff' : '#ffdad6',
            color: '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '4px 4px 0px #1a1a1a',
          }}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 size={15} style={{ flexShrink: 0, color: '#0055ff' }} />
          ) : (
            <AlertCircle size={15} style={{ flexShrink: 0, color: '#e63b2e' }} />
          )}
          <span style={{ fontWeight: 600 }}>{statusMessage.text}</span>
        </div>
      )}

      {/* Import Section */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--font-headline)', textTransform: 'uppercase', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Upload size={15} />
          Import Answer Bank (.json)
        </div>

        <div>
          <label style={{ fontSize: '11px', fontFamily: 'var(--font-headline)', fontWeight: 700, textTransform: 'uppercase', color: '#1a1a1a', display: 'block', marginBottom: '4px' }}>
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
              border: '2px dashed #1a1a1a',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              background: '#f2ede5',
              transition: 'background 0.15s ease',
            }}
          >
            <FileJson size={28} style={{ color: '#1a1a1a' }} />
            <span style={{ fontSize: '12px', fontWeight: 800, fontFamily: 'var(--font-headline)', textTransform: 'uppercase', color: '#1a1a1a' }}>
              {selectedFile ? selectedFile.name : 'Select or Drop JSON Key Bank'}
            </span>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#4a4a4a' }}>
              Strictly validated against Swayam404 Schema v1.0.0
            </span>
            <input type="file" accept=".json" onChange={handleFileChange} style={{ display: 'none' }} />
          </label>
        </div>

        {/* Validation Preview Card */}
        {validationResult && (
          <div
            style={{
              padding: '12px',
              background: validationResult.isValid ? '#ffffff' : '#ffdad6',
              border: '2px solid #1a1a1a',
              boxShadow: '4px 4px 0px #1a1a1a',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, fontFamily: 'var(--font-headline)', textTransform: 'uppercase' }}>
              {validationResult.isValid ? (
                <span style={{ color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={14} style={{ color: '#0055ff' }} /> Schema Validated Successfully
                </span>
              ) : (
                <span style={{ color: '#cc0000', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={14} /> Schema Validation Failed
                </span>
              )}
            </div>

            <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#1a1a1a', lineHeight: 1.5 }}>
              • Total questions found: <strong>{validationResult.questionCount}</strong><br />
              • Duplicates within file: <strong>{validationResult.duplicateCountInFile}</strong><br />
              • Matches with existing course records: <strong>{validationResult.duplicateCountWithExisting}</strong>
            </div>

            {validationResult.warnings.length > 0 && (
              <div style={{ fontSize: '11px', color: '#1a1a1a', background: '#ffcc00', padding: '6px', border: '1px solid #1a1a1a', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {validationResult.warnings.map((w, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {validationResult.errors.length > 0 && (
              <div style={{ fontSize: '11px', color: '#cc0000', fontWeight: 700, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {validationResult.errors.map((e, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <XCircle size={12} style={{ flexShrink: 0 }} />
                    <span>{e}</span>
                  </div>
                ))}
              </div>
            )}

            {validationResult.isValid && (
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '16px', fontSize: '11px', fontFamily: 'var(--font-headline)', fontWeight: 700 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="mode"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                      style={{ accentColor: '#1a1a1a' }}
                    />
                    <span>Merge & Update (Recommended)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="mode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      style={{ accentColor: '#1a1a1a' }}
                    />
                    <span>Replace Entire Bank</span>
                  </label>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={handleExecuteImport}
                  disabled={isProcessing}
                  style={{ width: '100%', padding: '10px', fontSize: '12px' }}
                >
                  Confirm & Import Questions
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Export Section */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--font-headline)', textTransform: 'uppercase', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Download size={15} />
          Export & Backup
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={handleExportSelectedCourse}
            style={{ flex: 1, minWidth: '180px', fontSize: '11px', padding: '8px 12px' }}
          >
            Export Active Course JSON
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleExportAll}
            style={{ flex: 1, minWidth: '180px', fontSize: '11px', padding: '8px 12px' }}
          >
            Full Backup (All Courses)
          </button>
        </div>
      </div>

      {/* Quick Load Official Sample Data */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--font-headline)', textTransform: 'uppercase', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={15} />
          Quick Load Sample Answer Banks
        </div>
        <p style={{ fontSize: '11px', fontFamily: 'var(--font-body)', color: '#4a4a4a' }}>
          Instantly seed verified test keys for Economics or Entrepreneurship to verify local matching & auto-fill:
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={() => handleQuickLoadSample('economics')}
            disabled={isProcessing}
            style={{ flex: 1, minWidth: '180px', fontSize: '11px', padding: '8px 12px' }}
          >
            Load Economics Sample
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleQuickLoadSample('entrepreneurship')}
            disabled={isProcessing}
            style={{ flex: 1, minWidth: '180px', fontSize: '11px', padding: '8px 12px' }}
          >
            Load Entrepreneurship Sample
          </button>
        </div>
      </div>

      {/* Community Knowledge Contributions (Phase 3) */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--font-headline)', textTransform: 'uppercase', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Share2 size={15} />
          Community Knowledge Contributions
        </div>
        <p style={{ fontSize: '11px', fontFamily: 'var(--font-body)', color: '#4a4a4a', margin: 0 }}>
          Contribute authorized course summaries, student lecture notes, or verified released assessment feedback to the shared open knowledge base repository. All contributions undergo strict schema validation, provenance checking, and zero-PII filtering.
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={handleProposeLearningResource}
            disabled={isProcessing}
            style={{ flex: 1, minWidth: '200px', fontSize: '11px', padding: '8px 12px', background: '#ffeb99' }}
          >
            <BookOpen size={13} />
            Propose Course Notes / Summary
          </button>
        </div>
      </div>

      {activeProposal && (
        <ContributionPreviewModal
          isOpen={!!activeProposal}
          onClose={() => setActiveProposal(null)}
          initialProposal={activeProposal}
          courseTitle={courses.find((c) => c.id === selectedCourseId)?.name}
        />
      )}
    </div>
  );
};
