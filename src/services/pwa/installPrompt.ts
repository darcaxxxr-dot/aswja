interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

type Listener = (event: BeforeInstallPromptEvent) => void;

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
    return this.installed || window.matchMedia('(display-mode: standalone)').matches;
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