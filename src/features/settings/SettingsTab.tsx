import React, { useState, useEffect } from 'react';
import { ExtensionSettings, Course, CourseMaterial, WebAiProviderType } from '@/types';
import { StorageService } from '@/lib/storage';
import {
  ShieldCheck,
  Trash2,
  CheckCircle2,
  Sparkles,
  BookOpen,
  FileText,
  Plus,
  Zap,
  ExternalLink,
  RefreshCw,
  Database,
  AlertTriangle,
  Bot,
  Cpu,
  Info,
} from 'lucide-react';
import { KnowledgeBaseService } from '@/lib/knowledge';
import { KnowledgeSyncStatus } from '@/types/knowledge';
import { ExtensionUpdaterCard } from './ExtensionUpdaterCard';

interface SettingsTabProps {
  onRefreshData: () => Promise<void>;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ onRefreshData }) => {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [savedNotice, setSavedNotice] = useState(false);

  // Material adding form
  const [selectedCourseForMaterial, setSelectedCourseForMaterial] = useState('');
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialUnit, setMaterialUnit] = useState('');
  const [materialContent, setMaterialContent] = useState('');
  const [showAddMaterial, setShowAddMaterial] = useState(false);

  // Knowledge base state
  const [kbStatus, setKbStatus] = useState<KnowledgeSyncStatus | null>(null);
  const [isSyncingKb, setIsSyncingKb] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [kbRepoUrl, setKbRepoUrl] = useState('');
  const [kbSyncMessage, setKbSyncMessage] = useState<string | null>(null);
  const [kbSyncError, setKbSyncError] = useState<string | null>(null);

  useEffect(() => {
    StorageService.getSettings().then((s) => {
      setSettings(s);
    });

    StorageService.getCourses().then((cList) => {
      setCourses(cList);
      if (cList.length > 0) {
        setSelectedCourseForMaterial(cList[0].id);
      }
    });

    StorageService.getCourseMaterials().then((mList) => {
      setMaterials(mList);
    });

    KnowledgeBaseService.getStatus().then((status) => {
      setKbStatus(status);
      setKbRepoUrl(status.repoUrl || '');
    });
  }, []);

  const triggerNotice = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleToggleAutoPopulate = async (enabled: boolean) => {
    if (!settings) return;
    const updated = { ...settings, autoPopulateExactVerified: enabled };
    setSettings(updated);
    await StorageService.saveSettings({ autoPopulateExactVerified: enabled });
    triggerNotice();
  };

  const handleToggleAutoApplyHighConfidence = async (enabled: boolean) => {
    if (!settings) return;
    const updated = { ...settings, autoApplyHighConfidence: enabled };
    setSettings(updated);
    await StorageService.saveSettings({ autoApplyHighConfidence: enabled });
    triggerNotice();
  };

  const [isImportingFromGitHub, setIsImportingFromGitHub] = useState(false);

  const handleSelectWebAiProvider = async (provider: WebAiProviderType) => {
    if (!settings) return;
    const updated = { ...settings, webAiProvider: provider };
    setSettings(updated);
    await StorageService.saveSettings({ webAiProvider: provider });
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ webAiProvider: provider });
    }
    triggerNotice();
  };

  const handleTakeAnswersFromGitHubBank = async () => {
    setIsImportingFromGitHub(true);
    setKbSyncMessage(null);
    setKbSyncError(null);
    try {
      const activeCourseId = settings?.selectedCourseId || courses[0]?.id || 'course-ent-201';
      const res = await KnowledgeBaseService.importAnswersForCourse(activeCourseId);
      if (res.success) {
        setKbSyncMessage(res.message);
        await onRefreshData();
      } else {
        setKbSyncError(res.message);
      }
    } catch (e: unknown) {
      setKbSyncError((e as Error)?.message || 'Failed to take answers from GitHub bank');
    } finally {
      setIsImportingFromGitHub(false);
    }
  };

  const handleToggleKb = async (enabled: boolean) => {
    if (!settings) return;
    const updated = { ...settings, knowledgeBaseEnabled: enabled };
    setSettings(updated);
    await StorageService.saveSettings({ knowledgeBaseEnabled: enabled });
    const status = await KnowledgeBaseService.getStatus();
    setKbStatus(status);
    triggerNotice();
  };

  const handleSaveKbRepoUrl = async (url: string) => {
    setKbRepoUrl(url);
    await StorageService.saveSettings({ knowledgeBaseRepoUrl: url });
    const status = await KnowledgeBaseService.getStatus();
    setKbStatus(status);
  };

  const handleSyncKnowledgeBase = async () => {
    setIsSyncingKb(true);
    setKbSyncMessage(null);
    setKbSyncError(null);
    if (!kbRepoUrl.trim() || kbRepoUrl.includes('<owner>')) {
      setKbSyncError('Please replace "<owner>" with your GitHub username or click "Use Official GitHub Repo" below.');
      setIsSyncingKb(false);
      return;
    }
    try {
      const res = await KnowledgeBaseService.syncNow(kbRepoUrl);
      if (res.success) {
        setKbSyncMessage(res.message);
        const status = await KnowledgeBaseService.getStatus();
        setKbStatus(status);
        await onRefreshData();
      } else {
        setKbSyncError(res.message || 'Synchronization failed.');
      }
    } catch (e: unknown) {
      setKbSyncError((e as Error)?.message || 'Unexpected synchronization error');
    } finally {
      setIsSyncingKb(false);
    }
  };

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdates(true);
    setKbSyncMessage(null);
    setKbSyncError(null);
    if (!kbRepoUrl.trim() || kbRepoUrl.includes('<owner>')) {
      setKbSyncError('Please replace "<owner>" with your GitHub username or click "Use Official GitHub Repo" below.');
      setIsCheckingUpdates(false);
      return;
    }
    try {
      const checkRes = await KnowledgeBaseService.checkForUpdates(kbRepoUrl);
      if (checkRes.state === 'offline') {
        setKbSyncError('Device or repository appears offline. Cached knowledge remains available.');
      } else if (checkRes.state === 'update-failed') {
        setKbSyncError(`Update check failed: ${checkRes.error || 'Invalid manifest'}`);
      } else if (checkRes.updateAvailable) {
        setKbSyncMessage(
          `Update available! Latest dataset: v${checkRes.latestVersion}. Click 'Sync Knowledge Base' to update.`
        );
      } else {
        setKbSyncMessage(`Knowledge base is up to date (v${checkRes.currentVersion || '1.0.0'}).`);
      }
      const status = await KnowledgeBaseService.getStatus();
      setKbStatus(status);
    } catch (e: unknown) {
      setKbSyncError((e as Error)?.message || 'Check failed');
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialTitle.trim() || !materialContent.trim()) {
      alert('Please provide a title and text content for the course material.');
      return;
    }

    const newMat: CourseMaterial = {
      id: `mat-${Date.now()}`,
      courseId: selectedCourseForMaterial || courses[0]?.id || 'course-econ-101',
      title: materialTitle.trim(),
      unitTitle: materialUnit.trim() || undefined,
      type: 'notes',
      content: materialContent.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await StorageService.saveCourseMaterial(newMat);
    const updated = await StorageService.getCourseMaterials();
    setMaterials(updated);

    setMaterialTitle('');
    setMaterialUnit('');
    setMaterialContent('');
    setShowAddMaterial(false);
    triggerNotice();
  };

  const handleDeleteMaterial = async (id: string) => {
    await StorageService.deleteCourseMaterial(id);
    const updated = await StorageService.getCourseMaterials();
    setMaterials(updated);
  };

  const handleClearAllData = async () => {
    const confirm = window.confirm(
      'WARNING: This will delete all saved courses, questions, materials, and settings from local extension storage. Proceed?'
    );
    if (confirm) {
      await StorageService.clearAll();
      await StorageService.initDefaults();
      await onRefreshData();
      alert('Local storage reset to defaults.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
          Settings & Knowledge Configuration
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Web AI assistance, course context materials, and student privacy controls
        </div>
      </div>

      {savedNotice && (
        <div
          className="card"
          style={{
            fontSize: '11px',
            color: 'var(--color-primary-container)',
            background: 'var(--color-primary)',
            borderColor: 'var(--border-medium)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 10px',
          }}
        >
          <CheckCircle2 size={13} />
          Settings saved successfully!
        </div>
      )}

      {/* Privacy Architecture Statement */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--text-main)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <ShieldCheck size={15} style={{ color: 'var(--color-secondary)' }} />
          Zero-Credential & Submission Safety Boundary
        </div>

        <ul style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '16px', lineHeight: 1.6 }}>
          <li>
            <strong>Zero Authentication Harvesting:</strong> The extension never reads, stores, or transmits your SWAYAM session cookies, passwords, or tokens.
          </li>
          <li>
            <strong>100% Client-Side Knowledge Base:</strong> Question banks and notes reside exclusively in your browser's local storage.
          </li>
          <li>
            <strong>Strict Submission Immunity:</strong> The extension NEVER activates Submit or Final Submit buttons. You retain full grading review.
          </li>
          <li>
            <strong>Free Web AI First:</strong> Uses free Web AI sessions (ChatGPT & Claude Web) with zero API quotas and zero key requirements.
          </li>
        </ul>
      </div>

      {/* Automation Controls */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Zap size={14} style={{ color: 'var(--accent-primary)' }} />
          Form Population Automation
        </div>

        {/* Toggle 1: Auto-Populate Exact Verified */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-main)' }}>
              Auto-Populate Exact Verified Answers
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              Fills questions with 100% exact matches in confirmed answer bank.
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              className="custom-checkbox"
              checked={!!settings?.autoPopulateExactVerified}
              onChange={(e) => handleToggleAutoPopulate(e.target.checked)}
            />
            <span style={{ fontSize: '11px', color: settings?.autoPopulateExactVerified ? 'var(--color-primary)' : 'var(--text-muted)' }}>
              {settings?.autoPopulateExactVerified ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>

        {/* Toggle 2: Auto-Apply High-Confidence Suggestions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-main)' }}>
              Auto-Apply High-Confidence Suggestions
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              Prepare Quiz fills verified answers and high-evidence recommendations with zero ambiguity.
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              className="custom-checkbox"
              checked={!!settings?.autoApplyHighConfidence}
              onChange={(e) => handleToggleAutoApplyHighConfidence(e.target.checked)}
            />
            <span style={{ fontSize: '11px', color: settings?.autoApplyHighConfidence ? 'var(--color-primary)' : 'var(--text-muted)' }}>
              {settings?.autoApplyHighConfidence ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>
      </div>

      {/* Web AI (ChatGPT Web, Claude Web & Gemini Web) Connection Section */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={16} style={{ color: 'var(--text-main)' }} />
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-headline)', textTransform: 'uppercase' }}>
              Web AI Connection (ChatGPT, Claude & Gemini Web)
            </span>
          </div>
          <span style={{ fontSize: '10px', fontWeight: 800, background: 'var(--accent-hover)', padding: '2px 8px', border: '1.5px solid var(--border-medium)', color: '#1a1a1a' }}>
            100% FREE • NO API KEY REQUIRED
          </span>
        </div>

        <p style={{ fontSize: '11px', color: 'var(--text-main)', lineHeight: 1.5, margin: 0 }}>
          Swayam404 connects directly to your signed-in browser sessions of <strong>ChatGPT</strong>, <strong>Claude</strong>, or <strong>Gemini Web</strong>.
          This completely bypasses API quota limits and requires zero paid API credits.
        </p>

        {/* Web AI Provider Toggler */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#ffffff', border: '2px solid #1a1a1a', padding: '10px 12px', boxShadow: '3px 3px 0px #1a1a1a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#1a1a1a', fontFamily: 'var(--font-headline)', textTransform: 'uppercase' }}>
              Active Web AI Window Toggler
            </span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#0055ff' }}>
              Active: {settings?.webAiProvider === 'claude' ? 'Claude Web' : settings?.webAiProvider === 'gemini' ? 'Gemini Web' : 'ChatGPT Web'}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '6px',
              marginTop: '4px',
            }}
          >
            {[
              { id: 'chatgpt', label: 'ChatGPT Web', icon: <Bot size={13} /> },
              { id: 'claude', label: 'Claude Web', icon: <Cpu size={13} /> },
              { id: 'gemini', label: 'Gemini Web', icon: <Sparkles size={13} /> },
            ].map((p) => {
              const isSelected = (settings?.webAiProvider || 'chatgpt') === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectWebAiProvider(p.id as WebAiProviderType)}
                  style={{
                    padding: '8px 6px',
                    fontSize: '11px',
                    fontWeight: 800,
                    fontFamily: 'var(--font-headline)',
                    border: '1.5px solid #1a1a1a',
                    cursor: 'pointer',
                    background: isSelected ? '#ffcc00' : '#f5f0e8',
                    color: '#1a1a1a',
                    boxShadow: isSelected ? '2px 2px 0px #1a1a1a' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>{p.icon}</span>
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: '10px', color: '#666666', marginTop: '2px', lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Info size={11} style={{ flexShrink: 0 }} />
            <span>Prevents conflicts when multiple AI tabs are open: only the active selected AI window executes auto-pilot and sync.</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '4px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.open('https://chatgpt.com/', '_blank')}
            style={{ fontSize: '11px', padding: '6px 12px', fontWeight: 700 }}
          >
            <ExternalLink size={12} />
            <span>Open ChatGPT Web ↗</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.open('https://claude.ai/new', '_blank')}
            style={{ fontSize: '11px', padding: '6px 12px', fontWeight: 700 }}
          >
            <ExternalLink size={12} />
            <span>Open Claude Web ↗</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.open('https://gemini.google.com/app', '_blank')}
            style={{ fontSize: '11px', padding: '6px 12px', fontWeight: 700 }}
          >
            <ExternalLink size={12} />
            <span>Open Gemini Web ↗</span>
          </button>
        </div>

        <div style={{ background: '#ffffff', border: '1.5px solid #1a1a1a', padding: '10px', fontSize: '11px', lineHeight: 1.5, color: '#1a1a1a' }}>
          <strong>How the Web AI Bridge Works:</strong>
          <ol style={{ paddingLeft: '18px', margin: '6px 0 0 0' }}>
            <li>In the <strong>Scan & Review</strong> tab, click <strong>"1. Copy Prompt"</strong>.</li>
            <li>Open ChatGPT or Claude in a new browser tab.</li>
            <li>Click the floating <strong>"SWAYAM 404 BRIDGE"</strong> badge to insert questions, or paste directly.</li>
            <li>Once answers generate, click <strong>"Send Answers to Swayam404"</strong> or copy the text back into Swayam404.</li>
            <li>Answers are auto-matched, approved, and ready to populate with <strong>"Fill Reviewed Answers"</strong>.</li>
          </ol>
        </div>
      </div>

      {/* Course Context Materials Manager */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <BookOpen size={14} style={{ color: '#38bdf8' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>
              Course Context Materials ({materials.length})
            </span>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowAddMaterial(!showAddMaterial)}
            style={{ fontSize: '10px', padding: '4px 8px' }}
          >
            <Plus size={11} />
            <span>{showAddMaterial ? 'Cancel' : 'Add Material'}</span>
          </button>
        </div>

        {/* Add Material Form */}
        {showAddMaterial && (
          <form
            onSubmit={handleAddMaterial}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              background: '#1e293b',
              padding: '10px',
              borderRadius: '6px',
            }}
          >
            <div>
              <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>
                Course
              </label>
              <select
                value={selectedCourseForMaterial}
                onChange={(e) => setSelectedCourseForMaterial(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  padding: '5px',
                  borderRadius: '4px',
                  fontSize: '11px',
                }}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>
                Material Title
              </label>
              <input
                type="text"
                placeholder="e.g., Week 3 Lecture Notes on Consumer Surplus"
                value={materialTitle}
                onChange={(e) => setMaterialTitle(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  padding: '5px',
                  borderRadius: '4px',
                  fontSize: '11px',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>
                Unit / Module (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Unit 3.2"
                value={materialUnit}
                onChange={(e) => setMaterialUnit(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  padding: '5px',
                  borderRadius: '4px',
                  fontSize: '11px',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>
                Context Text / Notes Content
              </label>
              <textarea
                rows={4}
                placeholder="Paste key notes, summary, formulas, or explanations from course slides here..."
                value={materialContent}
                onChange={(e) => setMaterialContent(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  padding: '5px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                }}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end', fontSize: '11px' }}>
              Save Course Material
            </button>
          </form>
        )}

        {/* Existing Materials List */}
        {materials.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
            {materials.map((m) => {
              const courseObj = courses.find((c) => c.id === m.courseId);
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    background: '#1e293b',
                    borderRadius: '4px',
                    fontSize: '11px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                    <FileText size={13} style={{ color: '#38bdf8', flexShrink: 0 }} />
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#fff', fontWeight: 600 }}>{m.title}</span>
                      <span style={{ color: '#64748b', marginLeft: '6px' }}>
                        [{courseObj?.name || m.courseId}{m.unitTitle ? ` • ${m.unitTitle}` : ''}]
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteMaterial(m.id)}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                    title="Delete Material"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Shared Knowledge Base (Repository Sync) */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Database size={14} style={{ color: '#ffcc00' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>
              Shared Knowledge Base (Repository Sync)
            </span>
          </div>

          <span
            style={{
              fontSize: '10px',
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid #1a1a1a',
              background: !settings?.knowledgeBaseEnabled || !kbRepoUrl.trim()
                ? '#334155'
                : isSyncingKb
                ? '#0284c7'
                : isCheckingUpdates
                ? '#0284c7'
                : kbStatus?.status === 'offline'
                ? '#475569'
                : kbStatus?.status === 'update-failed' || kbSyncError
                ? '#b91c1c'
                : kbStatus?.status === 'update-available'
                ? '#d97706'
                : kbStatus?.status === 'updated' || kbStatus?.status === 'up-to-date' || kbStatus?.status === 'synced'
                ? '#15803d'
                : '#ca8a04',
              color: '#ffffff',
            }}
          >
            {!settings?.knowledgeBaseEnabled || !kbRepoUrl.trim()
              ? 'UNCONFIGURED (LOCAL ONLY)'
              : isSyncingKb
              ? 'DOWNLOADING...'
              : isCheckingUpdates
              ? 'CHECKING...'
              : kbStatus?.status === 'offline'
              ? 'OFFLINE'
              : kbStatus?.status === 'update-failed' || kbSyncError
              ? 'UPDATE FAILED'
              : kbStatus?.status === 'update-available'
              ? `UPDATE AVAILABLE (v${kbStatus?.remoteDatasetVersion || 'New'})`
              : kbStatus?.status === 'updated'
              ? `UPDATED (v${kbStatus?.datasetVersion || '1.0.0'})`
              : kbStatus?.status === 'up-to-date' || kbStatus?.status === 'synced'
              ? `UP TO DATE (v${kbStatus?.datasetVersion || '1.0.0'})`
              : 'READY TO SYNC'}
          </span>
        </div>

        <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>
          Connect to a public GitHub repository (e.g. <code>swayam404-knowledge</code>) to cache verified course summaries, lecture notes, and study packs offline with SHA-256 integrity verification.
        </p>

        {/* Enable toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f172a', padding: '8px 10px', borderRadius: '4px', border: '1px solid #334155' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#fff' }}>Enable Remote Repository Sync</div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>Opt-in read-only background knowledge synchronization</div>
          </div>
          <input
            type="checkbox"
            checked={settings?.knowledgeBaseEnabled ?? false}
            onChange={(e) => handleToggleKb(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#ffcc00' }}
          />
        </div>

        {/* URL Input & Controls when enabled */}
        {settings?.knowledgeBaseEnabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>
                Public Knowledge Base URL (Raw Git Root)
              </label>
              <input
                type="text"
                value={kbRepoUrl}
                onChange={(e) => handleSaveKbRepoUrl(e.target.value)}
                placeholder="https://raw.githubusercontent.com/<owner>/swayam404-knowledge/main"
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: '#64748b' }}>
                  Raw GitHub repository URL hosting manifest.json & courses/
                </span>
                <button
                  type="button"
                  onClick={() => handleSaveKbRepoUrl('https://raw.githubusercontent.com/atharvpaharia100/swayam404-knowledge/main')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ffcc00',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  Use Official GitHub Repo
                </button>
              </div>
            </div>

            {/* Telemetry Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', background: '#0f172a', padding: '8px', borderRadius: '4px', border: '1px solid #1e293b' }}>
              <div>
                <div style={{ fontSize: '9px', color: '#64748b' }}>DATASET VERSION</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#ffcc00' }}>
                  {kbStatus?.datasetVersion ? `v${kbStatus.datasetVersion}` : 'None'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '9px', color: '#64748b' }}>CACHED PACKS</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#fff' }}>
                  {kbStatus?.coursesCount ?? 0} courses · {kbStatus?.resourcesCount ?? 0} res
                </div>
              </div>
              <div>
                <div style={{ fontSize: '9px', color: '#64748b' }}>LAST SYNC</div>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                  {kbStatus?.lastSyncTimestamp ? new Date(kbStatus.lastSyncTimestamp).toLocaleDateString() : 'Never'}
                </div>
              </div>
            </div>

            {/* Error or Success Notice */}
            {kbSyncError && (
              <div style={{ background: '#450a0a', border: '1px solid #b91c1c', borderRadius: '4px', padding: '8px', fontSize: '11px', color: '#fca5a5' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                  <AlertTriangle size={12} />
                  <span>Sync Failed</span>
                </div>
                <div style={{ marginTop: '2px', fontSize: '10px' }}>{kbSyncError}</div>
              </div>
            )}

            {kbSyncMessage && (
              <div style={{ background: '#052e16', border: '1px solid #15803d', borderRadius: '4px', padding: '8px', fontSize: '11px', color: '#86efac' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                  <CheckCircle2 size={12} />
                  <span>Sync Successful</span>
                </div>
                <div style={{ marginTop: '2px', fontSize: '10px' }}>{kbSyncMessage}</div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleTakeAnswersFromGitHubBank}
                disabled={isImportingFromGitHub || isSyncingKb || isCheckingUpdates}
                style={{ fontSize: '11px', padding: '6px 12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', background: '#ffcc00', color: '#1a1a1a' }}
                title="Loads verified answers from the GitHub repository directly into your local course answer bank"
              >
                <Database size={12} className={isImportingFromGitHub ? 'animate-spin' : ''} />
                <span>{isImportingFromGitHub ? 'Loading Bank...' : 'Take Answers from GitHub Bank'}</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCheckForUpdates}
                disabled={isCheckingUpdates || isSyncingKb || !kbRepoUrl.trim()}
                style={{ fontSize: '11px', padding: '6px 12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Checks if a newer manifest version exists without downloading packs"
              >
                <RefreshCw size={12} className={isCheckingUpdates ? 'animate-spin' : ''} />
                <span>{isCheckingUpdates ? 'Checking...' : 'Check for Updates'}</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSyncKnowledgeBase}
                disabled={isSyncingKb || isCheckingUpdates || !kbRepoUrl.trim()}
                style={{ fontSize: '11px', padding: '6px 12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={12} className={isSyncingKb ? 'animate-spin' : ''} />
                <span>{isSyncingKb ? 'Syncing...' : 'Sync Knowledge Base'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Local Extension Code Updater Prototype */}
      <ExtensionUpdaterCard />

      {/* Extension Code Versioning & Update Policy Card */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cpu size={14} style={{ color: '#0055ff' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
              Extension Application Versioning & Code Updates
            </span>
          </div>

          <span
            style={{
              fontSize: '10px',
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: '4px',
              background: '#0055ff',
              color: '#ffffff',
              border: '1px solid #1a1a1a',
            }}
          >
            v{typeof chrome !== 'undefined' && chrome.runtime?.getManifest ? chrome.runtime.getManifest().version : '1.0.0'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', background: '#0f172a', padding: '8px', borderRadius: '4px', border: '1px solid #1e293b' }}>
          <div>
            <div style={{ fontSize: '9px', color: '#64748b' }}>INSTALLATION CHANNEL</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#ffcc00' }}>
              Unpacked (Developer Mode)
            </div>
          </div>
          <div>
            <div style={{ fontSize: '9px', color: '#64748b' }}>CODE UPDATE CAPABILITY</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#fff' }}>
              Manual ZIP / Reload Required
            </div>
          </div>
        </div>

        <div style={{ background: '#f8fafc', border: '1.5px solid #1a1a1a', padding: '10px', fontSize: '11px', lineHeight: 1.45, color: '#1a1a1a' }}>
          <strong>Understanding Updates in Swayam404:</strong>
          <ul style={{ paddingLeft: '16px', margin: '4px 0 0 0' }}>
            <li>
              <strong>Knowledge Base Updates:</strong> The remote repository sync above updates course study materials and answer packs dynamically without reinstalling.
            </li>
            <li>
              <strong>Extension Code Updates:</strong> Extensions installed via &quot;Load unpacked&quot; (Developer Mode) or ZIP <em>cannot</em> automatically update executable code in the background due to Chrome Manifest V3 security policies.
            </li>
            <li>
              <strong>How to Update Code (ZIP / Unpacked):</strong> Download the latest release from the official website, extract the ZIP into your existing extension folder, and click the <strong>Reload (↻)</strong> icon in <code>chrome://extensions</code>.
            </li>
            <li>
              <strong>Future Web Store Release:</strong> Once distributed through the Chrome Web Store, code updates will install silently in the background via Google&apos;s native update channel.
            </li>
            <li>
              <strong>Zero Remote Execution:</strong> Swayam404 never injects remote scripts, never executes remote JavaScript, and never stores browser credentials or write tokens.
            </li>
          </ul>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '2px' }}>
          <a
            href="https://swayam404.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ fontSize: '11px', padding: '6px 12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none' }}
          >
            <ExternalLink size={12} />
            <span>Official Website & Downloads ↗</span>
          </a>

          <a
            href="https://github.com/atharvgit2005/swayam404-knowledge/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ fontSize: '11px', padding: '6px 12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none' }}
          >
            <ExternalLink size={12} />
            <span>Release Notes & Changelog ↗</span>
          </a>
        </div>
      </div>

      {/* Appearance & System Dark Mode */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={14} style={{ color: 'var(--accent-hover)' }} />
          Extension Appearance & Dark Mode
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
          Swayam404 automatically detects your system appearance preference. When macOS or your browser switches between Light and Dark mode, the extension instantly syncs high-contrast neo-brutalist styling.
        </p>
      </div>

      {/* Storage Reset */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Trash2 size={14} />
          Reset Extension Storage
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Permanently clear all stored course configurations, answer bank records, materials, and preferences.
        </p>
        <button
          className="btn btn-danger"
          onClick={handleClearAllData}
          style={{ alignSelf: 'flex-start', fontSize: '11px' }}
        >
          Reset All Data
        </button>
      </div>
    </div>
  );
};
