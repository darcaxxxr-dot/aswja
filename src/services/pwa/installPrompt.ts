interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

type Listener = (event: BeforeInstallPromptEvent) => void;

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

export function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS uses navigator.standalone
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return window.matchMedia('(display-mode: standalone)').matches;
}

export function getIosInstallInstructions(): {
  show: boolean;
  message: string;
} {
  return {
    show: isIosDevice() && !isInStandaloneMode(),
    message:
      'Untuk meng-install aplikasi ini di iPhone/iPad:\n' +
      '1. Ketuk tombol Share (⬆) di Safari\n' +
      '2. Gulir ke bawah dan pilih "Add to Home Screen"\n' +
      '3. Ketuk "Add" untuk mengkonfirmasi'
  };
}

class InstallPromptService {
  private deferred: BeforeInstallPromptEvent | null = null;
  private listeners: Listener[] = [];
  private installed = false;

  init(): void {
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferred = e as BeforeInstallPromptEvent;
      for (const l of this.listeners) l(this.deferred);
    });
    window.addEventListener('appinstalled', () => {
      this.installed = true;
      this.deferred = null;
    });
  }

  isInstallable(): boolean {
    return !!this.deferred && !this.installed;
  }

  isInstalled(): boolean {
    return this.installed || isInStandaloneMode();
  }

  onAvailable(listener: Listener): () => void {
    this.listeners.push(listener);
    if (this.deferred) listener(this.deferred);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  async promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!this.deferred) return 'unavailable';
    try {
      await this.deferred.prompt();
      const choice = await this.deferred.userChoice;
      this.deferred = null;
      return choice.outcome;
    } catch {
      return 'dismissed';
    }
  }
}

export const installPromptService = new InstallPromptService();