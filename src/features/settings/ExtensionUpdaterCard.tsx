import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Download,
  AlertTriangle,
  CheckCircle2,
  Server,
  FileCode,
  ShieldAlert,
  ArrowRight,
  Info,
  Terminal,
  RotateCcw,
  Zap,
} from 'lucide-react';
import {
  ExtensionUpdateState,
  ExtensionUpdateStatus,
  localUpdaterService,
  DEFAULT_LOCAL_UPDATER_CONFIG,
} from '@/lib/updater';

interface ExtensionUpdaterCardProps {
  onRefresh?: () => void;
}

export const ExtensionUpdaterCard: React.FC<ExtensionUpdaterCardProps> = () => {
  const [state, setState] = useState<ExtensionUpdateState | null>(null);
  const [serverUrl, setServerUrl] = useState<string>(DEFAULT_LOCAL_UPDATER_CONFIG.serverUrl);
  const [isEditingServer, setIsEditingServer] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [manualReloadAcknowledged, setManualReloadAcknowledged] = useState<boolean>(false);
  const [isApplyingCompanion, setIsApplyingCompanion] = useState<boolean>(false);
  const [companionStatusMsg, setCompanionStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    loadInitialState();
  }, []);

  const loadInitialState = async () => {
    try {
      const config = await localUpdaterService.getConfig();
      if (config.serverUrl) {
        setServerUrl(config.serverUrl);
      }
      const currentState = await localUpdaterService.getState();
      setState(currentState);
    } catch (err) {
      console.warn('Failed to load updater state:', err);
    }
  };

  const handleSaveServerUrl = async (url: string) => {
    setServerUrl(url);
    await localUpdaterService.saveConfig({ serverUrl: url });
  };

  const handleCheckForUpdates = async () => {
    if (isChecking || isDownloading) return;
    setIsChecking(true);
    setManualReloadAcknowledged(false);
    try {
      const result = await localUpdaterService.checkForUpdates(serverUrl);
      setState(result);
    } catch (err: any) {
      console.error('Check for updates failed:', err);
    } finally {
      setIsChecking(false);
    }
  };

  const handleDownloadAndVerify = async () => {
    if (!state?.metadata || isDownloading || isChecking) return;
    setIsDownloading(true);
    try {
      const result = await localUpdaterService.downloadAndVerifyPackage(state.metadata, serverUrl);
      setState(result.state);
      if (result.success && result.blob) {
        // Trigger browser file download
        localUpdaterService.triggerBrowserDownload(result.blob, state.metadata.packageFilename);
        setManualReloadAcknowledged(true);
      }
    } catch (err: any) {
      console.error('Download and verify failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleApplyViaCompanion = async () => {
    if (isApplyingCompanion) return;
    setIsApplyingCompanion(true);
    setCompanionStatusMsg('Connecting to Desktop Companion...');
    try {
      const res = await fetch('http://127.0.0.1:52410/api/update/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: state?.latestVersion }),
      });
      const data = await res.json();
      if (data.success) {
        setCompanionStatusMsg('Update applied by Desktop Installer! Ready to reload.');
        if (state) {
          setState({
            ...state,
            status: 'reload-required',
          });
        }
        setManualReloadAcknowledged(true);
      } else {
        setCompanionStatusMsg(data.error || 'Desktop installer returned an error');
      }
    } catch {
      setCompanionStatusMsg('Desktop Installer is offline. Launch Swayam404-Installer or run "npm run update:apply".');
    } finally {
      setIsApplyingCompanion(false);
    }
  };

  const handleTriggerBrowserReload = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.reload) {
      chrome.runtime.reload();
    } else {
      window.location.reload();
    }
  };

  const handleConfirmRunningVersion = async () => {
    if (isConfirming) return;
    setIsConfirming(true);
    try {
      const confirmed = await localUpdaterService.confirmRunningVersion();
      setState(confirmed);
    } catch (err: any) {
      console.error('Confirmation check failed:', err);
    } finally {
      setIsConfirming(false);
    }
  };

  const getStatusBadge = (status: ExtensionUpdateStatus) => {
    switch (status) {
      case 'confirmed':
        return {
          label: `CONFIRMED (v${state?.installedVersion || '1.0.0'})`,
          bg: '#15803d',
          color: '#ffffff',
          icon: <CheckCircle2 size={12} />,
        };
      case 'up-to-date':
        return {
          label: 'UP TO DATE',
          bg: '#15803d',
          color: '#ffffff',
          icon: <CheckCircle2 size={12} />,
        };
      case 'checking':
        return {
          label: 'STAGE 1: CHECKING FOR UPDATES...',
          bg: '#0284c7',
          color: '#ffffff',
          icon: <RefreshCw size={12} className="animate-spin" />,
        };
      case 'update-available':
        return {
          label: `UPDATE AVAILABLE (v${state?.latestVersion || 'New'})`,
          bg: '#d97706',
          color: '#ffffff',
          icon: <ArrowRight size={12} />,
        };
      case 'downloading':
        return {
          label: 'STAGE 3: DOWNLOADING PACKAGE...',
          bg: '#7c3aed',
          color: '#ffffff',
          icon: <Download size={12} className="animate-spin" />,
        };
      case 'verified':
      case 'download-verified':
        return {
          label: 'STAGE 4: VERIFIED & READY TO STAGE',
          bg: '#15803d',
          color: '#ffffff',
          icon: <CheckCircle2 size={12} />,
        };
      case 'staged':
      case 'awaiting-application':
        return {
          label: 'STAGE 5: STAGED • AWAITING APPLY',
          bg: '#0284c7',
          color: '#ffffff',
          icon: <Terminal size={12} />,
        };
      case 'reload-required':
      case 'manual-install-required':
        return {
          label: 'STAGE 7: RELOAD EXTENSION REQUIRED',
          bg: '#ca8a04',
          color: '#ffffff',
          icon: <RotateCcw size={12} />,
        };
      case 'recovery-required':
        return {
          label: 'STAGE 9: RECOVERY REQUIRED',
          bg: '#b91c1c',
          color: '#ffffff',
          icon: <AlertTriangle size={12} />,
        };
      case 'check-failed':
        return {
          label: 'UPDATE CHECK FAILED',
          bg: '#b91c1c',
          color: '#ffffff',
          icon: <AlertTriangle size={12} />,
        };
      case 'invalid-metadata':
        return {
          label: 'INVALID RELEASE METADATA',
          bg: '#b91c1c',
          color: '#ffffff',
          icon: <AlertTriangle size={12} />,
        };
      case 'checksum-mismatch':
        return {
          label: 'CHECKSUM MISMATCH (REJECTED)',
          bg: '#b91c1c',
          color: '#ffffff',
          icon: <ShieldAlert size={12} />,
        };
      case 'server-unavailable':
        return {
          label: 'LOCAL SERVER UNAVAILABLE',
          bg: '#475569',
          color: '#ffffff',
          icon: <Server size={12} />,
        };
      case 'failed':
        return {
          label: 'OPERATION FAILED',
          bg: '#b91c1c',
          color: '#ffffff',
          icon: <AlertTriangle size={12} />,
        };
      default:
        return {
          label: 'IDLE',
          bg: '#334155',
          color: '#ffffff',
          icon: <Info size={12} />,
        };
    }
  };

  const badge = state ? getStatusBadge(state.status) : getStatusBadge('up-to-date');

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileCode size={16} style={{ color: '#ffcc00' }} />
          <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-headline)', textTransform: 'uppercase' }}>
            Local Extension Code Updater (9-Stage Lifecycle)
          </span>
        </div>

        <span
          style={{
            fontSize: '10px',
            fontWeight: 800,
            padding: '3px 8px',
            borderRadius: '4px',
            border: '1.5px solid #1a1a1a',
            background: badge.bg,
            color: badge.color,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          {badge.icon}
          <span>{badge.label}</span>
        </span>
      </div>

      <p style={{ fontSize: '11px', color: 'var(--text-main)', margin: 0, lineHeight: 1.45 }}>
        Fully local loopback release testing (<code>127.0.0.1:52404</code>) with strict Manifest V3 sandboxing.
        Each release undergoes SHA-256 integrity validation and safe pre-apply staging with automatic backup.
      </p>

      {/* 9-Stage Progress Indicator */}
      <div
        style={{
          background: '#f8fafc',
          border: '1.5px solid #1a1a1a',
          padding: '6px 8px',
          borderRadius: '4px',
          fontSize: '9px',
          fontFamily: 'monospace',
          color: '#475569',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '4px',
        }}
      >
        <span style={{ fontWeight: 700, color: '#1a1a1a' }}>LIFECYCLE STAGES:</span>
        <span>1. Check</span> →
        <span>2. Compare</span> →
        <span>3. Download</span> →
        <span>4. Verify</span> →
        <span>5. Stage</span> →
        <span>6. Apply</span> →
        <span>7. Reload</span> →
        <span>8. Confirm</span> →
        <span>9. Recover</span>
      </div>

      {/* Version & Telemetry Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '6px',
          background: '#0f172a',
          padding: '8px 10px',
          border: '1.5px solid #1e293b',
          borderRadius: '4px',
        }}
      >
        <div>
          <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>INSTALLED VERSION</div>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#ffcc00' }}>
            v{state?.installedVersion || localUpdaterService.getInstalledVersion()}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>LATEST LOCAL RELEASE</div>
          <div style={{ fontSize: '11px', fontWeight: 800, color: state?.latestVersion ? '#38bdf8' : '#94a3b8' }}>
            {state?.latestVersion ? `v${state.latestVersion}` : '--'}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>CHANNEL / MODE</div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#ffffff' }}>
            Unpacked (Developer)
          </div>
        </div>

        <div>
          <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>LAST CHECKED</div>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#cbd5e1' }}>
            {state?.lastChecked ? new Date(state.lastChecked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never'}
          </div>
        </div>
      </div>

      {/* Local Server URL Config Bar */}
      <div style={{ background: '#f8fafc', border: '1.5px solid #1a1a1a', padding: '8px 10px', borderRadius: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Server size={11} />
            <span>Local Update Server Endpoint (Loopback Only)</span>
          </div>
          <button
            type="button"
            onClick={() => setIsEditingServer(!isEditingServer)}
            style={{ fontSize: '9px', color: '#0055ff', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
          >
            {isEditingServer ? 'Done' : 'Configure Endpoint'}
          </button>
        </div>

        {isEditingServer ? (
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => handleSaveServerUrl(e.target.value)}
              placeholder="http://127.0.0.1:52404"
              style={{
                flex: 1,
                fontSize: '11px',
                padding: '4px 6px',
                border: '1.5px solid #1a1a1a',
                fontFamily: 'monospace',
                background: '#ffffff',
                color: '#1a1a1a',
              }}
            />
            <button
              type="button"
              onClick={() => handleSaveServerUrl(DEFAULT_LOCAL_UPDATER_CONFIG.serverUrl)}
              style={{
                fontSize: '10px',
                padding: '4px 8px',
                background: '#e2e8f0',
                border: '1.5px solid #1a1a1a',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Reset
            </button>
          </div>
        ) : (
          <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#334155' }}>
            {serverUrl} <span style={{ color: '#15803d', fontWeight: 700 }}>(127.0.0.1 bound)</span>
          </div>
        )}
      </div>

      {/* Release Notes Card */}
      {state?.metadata && state.status !== 'up-to-date' && state.status !== 'confirmed' && (
        <div style={{ background: '#fefce8', border: '1.5px solid #1a1a1a', padding: '10px', borderRadius: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#1a1a1a' }}>
              Release v{state.metadata.version} Details
            </span>
            <span style={{ fontSize: '10px', color: '#64748b' }}>
              {(state.metadata.fileSize / 1024).toFixed(1)} KB
            </span>
          </div>
          <p style={{ fontSize: '10px', color: '#334155', margin: '4px 0 0 0', lineHeight: 1.4 }}>
            {state.metadata.releaseNotes || 'No release notes provided.'}
          </p>
          <div style={{ fontSize: '9px', fontFamily: 'monospace', color: '#64748b', marginTop: '6px', wordBreak: 'break-all' }}>
            <strong>Expected SHA-256:</strong> {state.metadata.sha256}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleCheckForUpdates}
          disabled={isChecking || isDownloading || isConfirming}
          style={{
            fontSize: '11px',
            padding: '7px 12px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: isChecking || isDownloading || isConfirming ? 'not-allowed' : 'pointer',
          }}
        >
          <RefreshCw size={13} className={isChecking ? 'animate-spin' : ''} />
          <span>{isChecking ? 'Checking Server...' : 'Check for Updates (Stage 1)'}</span>
        </button>

        {state?.status === 'update-available' && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDownloadAndVerify}
            disabled={isDownloading || isChecking || isConfirming}
            style={{
              fontSize: '11px',
              padding: '7px 12px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#ffcc00',
              color: '#1a1a1a',
              cursor: isDownloading || isChecking || isConfirming ? 'not-allowed' : 'pointer',
            }}
          >
            <Download size={13} className={isDownloading ? 'animate-spin' : ''} />
            <span>{isDownloading ? 'Downloading...' : 'Download & Verify (Stage 3 & 4)'}</span>
          </button>
        )}

        {(state?.status === 'update-available' || state?.status === 'download-verified') && (
          <button
            type="button"
            className="btn"
            onClick={handleApplyViaCompanion}
            disabled={isApplyingCompanion || isChecking}
            style={{
              fontSize: '11px',
              padding: '7px 12px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#ffcc00',
              color: '#1a1a1a',
              border: '1.5px solid #1a1a1a',
              cursor: isApplyingCompanion ? 'not-allowed' : 'pointer',
            }}
          >
            <Zap size={13} className={isApplyingCompanion ? 'animate-spin' : ''} />
            <span>{isApplyingCompanion ? 'Applying via Desktop App...' : '⚡ 1-Click Apply via Desktop App'}</span>
          </button>
        )}

        {(state?.status === 'reload-required' || manualReloadAcknowledged) && (
          <button
            type="button"
            className="btn"
            onClick={handleTriggerBrowserReload}
            style={{
              fontSize: '11px',
              padding: '7px 12px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#22c55e',
              color: '#ffffff',
              border: '1.5px solid #1a1a1a',
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={13} />
            <span>🔄 Reload Extension Now (Stage 7)</span>
          </button>
        )}

        {(state?.status === 'download-verified' || state?.status === 'reload-required' || manualReloadAcknowledged) && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleConfirmRunningVersion}
            disabled={isConfirming || isChecking}
            style={{
              fontSize: '11px',
              padding: '7px 12px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#e0f2fe',
              color: '#0369a1',
              border: '1.5px solid #0369a1',
              cursor: isConfirming ? 'not-allowed' : 'pointer',
            }}
          >
            <CheckCircle2 size={13} className={isConfirming ? 'animate-spin' : ''} />
            <span>{isConfirming ? 'Verifying Running Version...' : 'Confirm Running Version (Stage 8)'}</span>
          </button>
        )}
      </div>

      {companionStatusMsg && (
        <div style={{ fontSize: '10px', color: '#1a1a1a', background: '#fef08a', padding: '6px 10px', border: '1.5px solid #1a1a1a', borderRadius: '4px' }}>
          {companionStatusMsg}
        </div>
      )}

      {/* Stage 6 & 7: Apply & Reload Instructions */}
      {(state?.status === 'download-verified' || manualReloadAcknowledged) && (
        <div
          style={{
            background: '#f0fdf4',
            border: '2px solid #15803d',
            padding: '10px 12px',
            borderRadius: '4px',
            boxShadow: '3px 3px 0px #1a1a1a',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#15803d', fontWeight: 800, fontSize: '11px' }}>
            <CheckCircle2 size={14} />
            <span>Package Verified! Safe Local Apply Workflow (Stages 6 & 7):</span>
          </div>

          <div style={{ fontSize: '10px', color: '#1a1a1a', marginTop: '6px', lineHeight: 1.5 }}>
            <p style={{ margin: '0 0 6px 0' }}>
              To replace the extension files in <code>dist/</code> with automatic backup and rollback protection, run in your terminal:
            </p>
            <div style={{ background: '#1e293b', color: '#f8fafc', padding: '6px 10px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '10px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>npm run update:apply</span>
              <span style={{ color: '#94a3b8', fontSize: '9px' }}># Stages, backs up, and replaces dist/</span>
            </div>

            <ol style={{ paddingLeft: '16px', margin: 0 }}>
              <li>
                <strong>Stage 6 (Apply):</strong> The script extracts release into isolated staging, verifies manifest version, backs up current <code>dist/</code> to <code>local-backups/</code>, and atomically updates <code>dist/</code>.
              </li>
              <li>
                <strong>Stage 7 (Reload):</strong> Open <code>chrome://extensions</code> and click the <strong>Reload (↻)</strong> icon.
              </li>
              <li>
                <strong>Stage 8 (Confirm):</strong> Click <strong>Confirm Running Version</strong> button above to verify Chrome loaded the updated version.
              </li>
              <li>
                <strong>Stage 9 (Recover):</strong> If you ever need to restore previous version, run: <code>npm run update:rollback</code>.
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Confirmed Success Banner */}
      {state?.status === 'confirmed' && (
        <div
          style={{
            background: '#ecfdf5',
            border: '2px solid #059669',
            padding: '10px 12px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} style={{ color: '#059669', flexShrink: 0 }} />
          <div style={{ fontSize: '11px', color: '#065f46', fontWeight: 700 }}>
            🎉 Update Confirmed! Running extension is verified at version v{state.installedVersion}. All 9 lifecycle stages completed cleanly.
          </div>
        </div>
      )}

      {/* Error & Diagnostic Banner */}
      {state?.errorMessage && (
        <div
          style={{
            background: '#fef2f2',
            border: '1.5px solid #b91c1c',
            padding: '8px 10px',
            borderRadius: '4px',
            fontSize: '11px',
            color: '#b91c1c',
            lineHeight: 1.4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, marginBottom: '2px' }}>
            <AlertTriangle size={13} />
            <span>Diagnostics & Recovery:</span>
          </div>
          <div>{state.errorMessage}</div>
          {state.status === 'server-unavailable' && (
            <div style={{ marginTop: '4px', fontSize: '10px', color: '#1a1a1a' }}>
              <strong>To start local update server:</strong> Run <code>npm run server:local</code> in your terminal.
            </div>
          )}
          {state.status === 'reload-required' && (
            <div style={{ marginTop: '4px', fontSize: '10px', color: '#1a1a1a' }}>
              <strong>Manual Reload:</strong> Go to <code>chrome://extensions</code> and click the Reload (↻) icon, then click "Confirm Running Version".
            </div>
          )}
        </div>
      )}

      {/* Trust Model & Architecture Note */}
      <div style={{ fontSize: '10px', color: '#64748b', lineHeight: 1.4, borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
        <strong>Trust Model & Security Boundary:</strong> SHA-256 verifies package integrity and transmission accuracy. Chrome Manifest V3 prohibits extensions from self-modifying code on disk or injecting remote JavaScript. In production, authenticity is guaranteed by Google Chrome Web Store digital code signing.
      </div>
    </div>
  );
};
