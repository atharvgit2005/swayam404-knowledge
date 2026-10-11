/**
 * Network Diagnostics & Internet Issue Identifier
 * Proactively monitors internet connectivity, network latency, and diagnoses failure points.
 */

export type NetworkState = 'online' | 'offline' | 'unstable' | 'probing';

export type NetworkFailureType =
  | 'OFFLINE_NO_CONNECTION'
  | 'TIMEOUT_LATENCY'
  | 'PORTAL_UNREACHABLE'
  | 'API_UNREACHABLE'
  | 'DNS_LOOKUP_FAILED'
  | 'NONE';

export interface NetworkDiagnosis {
  isOnline: boolean;
  state: NetworkState;
  latencyMs?: number;
  failureType: NetworkFailureType;
  message: string;
  suggestedAction: string;
  lastChecked: number;
}

type NetworkListener = (diagnosis: NetworkDiagnosis) => void;

export class NetworkDiagnosticsService {
  private static instance: NetworkDiagnosticsService;
  private listeners: Set<NetworkListener> = new Set();
  private currentDiagnosis: NetworkDiagnosis;
  private isProbing = false;

  private constructor() {
    const isBrowserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.currentDiagnosis = {
      isOnline: isBrowserOnline,
      state: isBrowserOnline ? 'online' : 'offline',
      failureType: isBrowserOnline ? 'NONE' : 'OFFLINE_NO_CONNECTION',
      message: isBrowserOnline
        ? 'Internet connection is active.'
        : 'Browser is completely offline. Check Wi-Fi or Ethernet connection.',
      suggestedAction: isBrowserOnline
        ? 'All network features are operational.'
        : 'Connect to Wi-Fi. Local answer bank & cached notes remain operational offline.',
      lastChecked: Date.now(),
    };

    this.initEventListeners();
  }

  static getInstance(): NetworkDiagnosticsService {
    if (!NetworkDiagnosticsService.instance) {
      NetworkDiagnosticsService.instance = new NetworkDiagnosticsService();
    }
    return NetworkDiagnosticsService.instance;
  }

  private initEventListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.handleNetworkStatusChange(true);
    });

    window.addEventListener('offline', () => {
      this.handleNetworkStatusChange(false);
    });
  }

  private handleNetworkStatusChange(isOnline: boolean): void {
    if (!isOnline) {
      this.currentDiagnosis = {
        isOnline: false,
        state: 'offline',
        failureType: 'OFFLINE_NO_CONNECTION',
        message: 'No Internet Connection. Your device is disconnected from the network.',
        suggestedAction: 'Check your Wi-Fi or router connection. Offline mode enabled: local answer bank is safe.',
        lastChecked: Date.now(),
      };
      this.notifyListeners();
    } else {
      // Reconnected, verify with active probe
      this.checkConnectivity(true);
    }
  }

  /**
   * Proactively checks connectivity with latency measurement
   */
  async checkConnectivity(forceProbe = false): Promise<NetworkDiagnosis> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.currentDiagnosis = {
        isOnline: false,
        state: 'offline',
        failureType: 'OFFLINE_NO_CONNECTION',
        message: 'No Internet Connection. Your computer is offline.',
        suggestedAction: 'Reconnect to Wi-Fi/Ethernet. Local answer bank and notes remain operational.',
        lastChecked: Date.now(),
      };
      this.notifyListeners();
      return this.currentDiagnosis;
    }

    if (!forceProbe && Date.now() - this.currentDiagnosis.lastChecked < 4000) {
      return this.currentDiagnosis;
    }

    if (this.isProbing) {
      return this.currentDiagnosis;
    }

    this.isProbing = true;
    const startTime = Date.now();

    try {
      // Fast fetch probe to a public highly-available DNS/HTTP endpoint or current origin
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 2800) : null;

      const probeUrl = 'https://dns.google/resolve?name=swayam.gov.in&type=A';

      try {
        const response = await fetch(probeUrl, {
          method: 'GET',
          cache: 'no-store',
          signal: controller?.signal,
        });

        if (timeoutId) clearTimeout(timeoutId);

        const latencyMs = Date.now() - startTime;

        if (response.ok || response.status === 200 || response.status === 404) {
          const isSlow = latencyMs > 2000;
          this.currentDiagnosis = {
            isOnline: true,
            state: isSlow ? 'unstable' : 'online',
            latencyMs,
            failureType: 'NONE',
            message: isSlow
              ? `Internet connected, but high latency detected (${latencyMs}ms).`
              : `Internet connection healthy (${latencyMs}ms).`,
            suggestedAction: isSlow
              ? 'Requests may take longer than usual. AI providers may experience delays.'
              : 'All systems operational.',
            lastChecked: Date.now(),
          };
        } else {
          this.currentDiagnosis = {
            isOnline: true,
            state: 'unstable',
            latencyMs,
            failureType: 'TIMEOUT_LATENCY',
            message: 'Network is responding with unexpected status.',
            suggestedAction: 'Verify internet access or corporate firewall restrictions.',
            lastChecked: Date.now(),
          };
        }
      } catch (fetchErr) {
        if (timeoutId) clearTimeout(timeoutId);
        const errStr = String(fetchErr);

        if (errStr.includes('AbortError') || errStr.includes('timed out')) {
          this.currentDiagnosis = {
            isOnline: false,
            state: 'unstable',
            latencyMs: Date.now() - startTime,
            failureType: 'TIMEOUT_LATENCY',
            message: 'Network request timed out (>2.8s). Internet is extremely slow or dropped.',
            suggestedAction: 'Check network speed or switch Wi-Fi network.',
            lastChecked: Date.now(),
          };
        } else if (errStr.includes('Failed to fetch') || errStr.includes('NetworkError')) {
          // If navigator says online but fetch fails, could be offline or CORS/DNS
          const definitelyOffline = typeof navigator !== 'undefined' && !navigator.onLine;
          this.currentDiagnosis = {
            isOnline: !definitelyOffline,
            state: definitelyOffline ? 'offline' : 'unstable',
            failureType: definitelyOffline ? 'OFFLINE_NO_CONNECTION' : 'DNS_LOOKUP_FAILED',
            message: definitelyOffline
              ? 'No Internet Connection.'
              : 'DNS probe failed. External network might be restricted.',
            suggestedAction: 'Check Wi-Fi connection or DNS settings.',
            lastChecked: Date.now(),
          };
        } else {
          // Fallback to navigator status
          const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
          this.currentDiagnosis = {
            isOnline,
            state: isOnline ? 'online' : 'offline',
            failureType: isOnline ? 'NONE' : 'OFFLINE_NO_CONNECTION',
            message: isOnline ? 'Connection active.' : 'Device offline.',
            suggestedAction: isOnline ? 'Ready to use.' : 'Connect to the internet.',
            lastChecked: Date.now(),
          };
        }
      }
    } finally {
      this.isProbing = false;
      this.notifyListeners();
    }

    return this.currentDiagnosis;
  }

  /**
   * Categorizes any runtime failure into an actionable diagnosis
   */
  diagnoseFailure(err: unknown, context: string = 'general'): NetworkDiagnosis {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const lower = errorMsg.toLowerCase();

    // 1. Definite offline
    if (
      (typeof navigator !== 'undefined' && !navigator.onLine) ||
      lower.includes('net::err_internet_disconnected') ||
      lower.includes('network is offline') ||
      lower.includes('offline')
    ) {
      return {
        isOnline: false,
        state: 'offline',
        failureType: 'OFFLINE_NO_CONNECTION',
        message: 'Action failed: Device is completely offline.',
        suggestedAction: 'Please connect to Wi-Fi. You can still use the local answer bank offline.',
        lastChecked: Date.now(),
      };
    }

    // 2. Network Timeout / Abort
    if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('aborterror')) {
      return {
        isOnline: false,
        state: 'unstable',
        failureType: 'TIMEOUT_LATENCY',
        message: `Network timeout during ${context}: The server did not respond in time.`,
        suggestedAction: 'Check your internet connection speed or retry the request.',
        lastChecked: Date.now(),
      };
    }

    // 3. Portal Tab Unreachable
    if (
      lower.includes('could not connect to page') ||
      lower.includes('content script failed to respond') ||
      lower.includes('receiving end does not exist')
    ) {
      return {
        isOnline: true,
        state: 'unstable',
        failureType: 'PORTAL_UNREACHABLE',
        message: 'Could not communicate with SWAYAM portal tab. The page was refreshed or closed.',
        suggestedAction: 'Refresh the SWAYAM course tab in your browser and reopen the extension.',
        lastChecked: Date.now(),
      };
    }

    // 4. AI Provider Unreachable / 5xx / 429
    if (
      lower.includes('fetch failed') ||
      lower.includes('api.openai.com') ||
      lower.includes('generativelanguage.googleapis.com') ||
      lower.includes('api.x.ai') ||
      lower.includes('econnrefused')
    ) {
      return {
        isOnline: true,
        state: 'unstable',
        failureType: 'API_UNREACHABLE',
        message: 'AI Provider endpoint unreachable. Connection to external AI was refused or blocked.',
        suggestedAction: 'Check your API key in Settings, verify proxy/firewall, or use ChatGPT Web bridge.',
        lastChecked: Date.now(),
      };
    }

    return {
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      state: 'online',
      failureType: 'NONE',
      message: errorMsg,
      suggestedAction: 'Review the error details and retry.',
      lastChecked: Date.now(),
    };
  }

  getCurrentDiagnosis(): NetworkDiagnosis {
    return this.currentDiagnosis;
  }

  isOnline(): boolean {
    return this.currentDiagnosis.isOnline;
  }

  subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    // Immediately notify initial status
    listener(this.currentDiagnosis);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentDiagnosis);
      } catch (e) {
        console.warn('[NetworkDiagnostics] Error notifying listener:', e);
      }
    }
  }
}

export const networkDiagnostics = NetworkDiagnosticsService.getInstance();
