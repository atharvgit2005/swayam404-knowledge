import React, { useState, useEffect } from 'react';
import { ExtensionSettings } from '@/types';
import { StorageService } from '@/lib/storage';
import {
  ShieldCheck,
  Cpu,
  Trash2,
  CheckCircle2,
} from 'lucide-react';

interface SettingsTabProps {
  onRefreshData: () => Promise<void>;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ onRefreshData }) => {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    StorageService.getSettings().then((s) => {
      setSettings(s);
      setApiKey(s.aiApiKey || '');
      setApiEndpoint(s.aiEndpoint || '');
    });
  }, []);

  const handleToggleAi = async (enabled: boolean) => {
    if (!settings) return;
    const updated = { ...settings, aiAssistedReviewEnabled: enabled };
    setSettings(updated);
    await StorageService.saveSettings({ aiAssistedReviewEnabled: enabled });
    triggerNotice();
  };

  const handleSaveAiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    await StorageService.saveSettings({
      aiApiKey: apiKey.trim() || undefined,
      aiEndpoint: apiEndpoint.trim() || undefined,
    });
    triggerNotice();
  };

  const triggerNotice = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleClearAllData = async () => {
    const confirm = window.confirm(
      'WARNING: This will delete all saved courses, questions, and settings from local extension storage. Proceed?'
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
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
          Settings & Privacy
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
          Security guarantees, local storage controls, and optional integrations
        </div>
      </div>

      {savedNotice && (
        <div
          className="card"
          style={{
            fontSize: '11px',
            color: '#34d399',
            background: 'rgba(16, 185, 129, 0.1)',
            borderColor: 'rgba(16, 185, 129, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 10px',
          }}
        >
          <CheckCircle2 size={13} />
          Settings updated successfully!
        </div>
      )}

      {/* Privacy Architecture Statement */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#6ee7b7', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldCheck size={15} style={{ color: '#34d399' }} />
          Privacy & Zero-Credential Statement
        </div>

        <ul style={{ fontSize: '11px', color: '#cbd5e1', paddingLeft: '16px', lineHeight: 1.6 }}>
          <li>
            <strong>Zero Authentication Harvesting:</strong> The extension never accesses, reads, or transmits your SWAYAM session cookies, passwords, or tokens.
          </li>
          <li>
            <strong>100% Local Processing:</strong> Answer banks and assignment scans reside strictly within your own browser's local storage.
          </li>
          <li>
            <strong>Strict Review Boundary:</strong> No assignment is ever submitted in the background. The extension only fills form fields you explicitly check.
          </li>
          <li>
            <strong>No Third-Party Analytics:</strong> No tracking beacons, analytics scripts, or telemetry are included.
          </li>
        </ul>
      </div>

      {/* Optional AI Assistant Config (Section 12) */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cpu size={14} style={{ color: '#818cf8' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>
              Optional AI-Assisted Explanations
            </span>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              className="custom-checkbox"
              checked={!!settings?.aiAssistedReviewEnabled}
              onChange={(e) => handleToggleAi(e.target.checked)}
            />
            <span style={{ fontSize: '11px', color: settings?.aiAssistedReviewEnabled ? '#818cf8' : '#94a3b8' }}>
              {settings?.aiAssistedReviewEnabled ? 'Enabled' : 'Disabled (Default)'}
            </span>
          </label>
        </div>

        <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
          Optional conceptual assistance for unmatched questions. Generates explanations and candidate answers for student review. Disabled by default. All candidate suggestions are marked as unverified and never populated without explicit approval.
        </p>

        {settings?.aiAssistedReviewEnabled && (
          <form onSubmit={handleSaveAiConfig} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>
                Local Proxy / API Endpoint (Optional)
              </label>
              <input
                type="text"
                placeholder="http://localhost:11434/v1 (e.g. Local Ollama) or custom proxy"
                value={apiEndpoint}
                onChange={(e) => setApiEndpoint(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>
                API Key (Stored locally in extension storage)
              </label>
              <input
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-secondary" style={{ alignSelf: 'flex-end', fontSize: '11px' }}>
              Save AI Settings
            </button>
          </form>
        )}
      </div>

      {/* Storage Reset */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Trash2 size={14} />
          Reset Extension Storage
        </div>
        <p style={{ fontSize: '11px', color: '#94a3b8' }}>
          Permanently clear all stored course configurations, answer bank records, and preferences.
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
