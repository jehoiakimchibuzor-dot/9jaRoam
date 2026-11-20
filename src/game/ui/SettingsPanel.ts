import { AuthService, type UserProfile } from '../systems/AuthService';
import { MultiplayerService } from '../systems/MultiplayerService';

interface SettingsPanelOptions {
  onUserChanged: (user: UserProfile) => void;
  isPaused: () => boolean;
  setPaused: (paused: boolean) => void;
}

export class SettingsPanel {
  private auth = AuthService.getInstance();
  private multiplayer = MultiplayerService.getInstance();

  private panel: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private onlineEl: HTMLElement | null = null;
  private errorEl: HTMLElement | null = null;
  private emailInput: HTMLInputElement | null = null;
  private passwordInput: HTMLInputElement | null = null;
  private usernameInput: HTMLInputElement | null = null;
  private usernameGroup: HTMLElement | null = null;

  private signInBtn: HTMLButtonElement | null = null;
  private registerBtn: HTMLButtonElement | null = null;
  private googleBtn: HTMLButtonElement | null = null;
  private retryBtn: HTMLButtonElement | null = null;
  private signOutBtn: HTMLButtonElement | null = null;

  private wasPaused = false;
  private registerMode = false;

  constructor(private options: SettingsPanelOptions) {}

  attach(): void {
    this.panel = document.getElementById('settings-panel');
    this.statusEl = document.getElementById('settings-status');
    this.onlineEl = document.getElementById('settings-online');
    this.errorEl = document.getElementById('settings-error');
    this.emailInput = document.getElementById('settings-email') as HTMLInputElement | null;
    this.passwordInput = document.getElementById('settings-password') as HTMLInputElement | null;
    this.usernameInput = document.getElementById('settings-username') as HTMLInputElement | null;
    this.usernameGroup = document.getElementById('settings-username-group');
    this.signInBtn = document.getElementById('settings-signin') as HTMLButtonElement | null;
    this.registerBtn = document.getElementById('settings-register') as HTMLButtonElement | null;
    this.googleBtn = document.getElementById('settings-google') as HTMLButtonElement | null;
    this.retryBtn = document.getElementById('settings-retry') as HTMLButtonElement | null;
    this.signOutBtn = document.getElementById('settings-signout') as HTMLButtonElement | null;

    document.getElementById('settings-close')?.addEventListener('click', () => this.close());

    this.signInBtn?.addEventListener('click', () => {
      if (this.registerMode) {
        this.setRegisterMode(false);
        return;
      }
      void this.signIn();
    });

    this.registerBtn?.addEventListener('click', () => {
      if (!this.registerMode) {
        this.setRegisterMode(true);
        return;
      }
      void this.register();
    });

    this.googleBtn?.addEventListener('click', () => void this.google());
    this.retryBtn?.addEventListener('click', () => this.reconnect());
    this.signOutBtn?.addEventListener('click', () => void this.signOut());

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.panel?.classList.contains('is-active')) this.close();
    });

    this.multiplayer.subscribe(() => this.refresh());
    this.refresh();
  }

  open(): void {
    if (!this.panel) return;
    this.wasPaused = this.options.isPaused();
    this.options.setPaused(true);
    this.setRegisterMode(false);
    this.setError('');
    this.panel.classList.remove('is-hidden');
    this.panel.classList.add('is-active');
    document.body.classList.add('settings-active');
    this.refresh();
  }

  isOpen(): boolean {
    return this.panel?.classList.contains('is-active') ?? false;
  }

  private close(): void {
    if (!this.panel) return;
    this.panel.classList.remove('is-active');
    this.panel.classList.add('is-hidden');
    document.body.classList.remove('settings-active');
    this.options.setPaused(this.wasPaused);
  }

  private refresh(): void {
    const user = this.auth.getCurrentUser();
    const signedIn = !user.isGuest;

    if (this.statusEl) {
      this.statusEl.textContent = signedIn
        ? `SIGNED IN AS ${user.username.toUpperCase()} · ${user.id.slice(0, 6)}…`
        : `PLAYING AS GUEST · ${user.username.toUpperCase()}`;
    }

    if (this.onlineEl) {
      if (!signedIn) {
        this.onlineEl.textContent = 'OFFLINE · SIGN IN TO SEE OTHER PLAYERS';
        this.onlineEl.classList.add('is-off');
      } else if (this.multiplayer.isConnected) {
        const count = this.multiplayer.onlineCount;
        this.onlineEl.textContent = `ONLINE · ${count} PLAYER${count === 1 ? '' : 'S'}`;
        this.onlineEl.classList.remove('is-off');
      } else {
        this.onlineEl.textContent = 'ONLINE · CONNECTING…';
        this.onlineEl.classList.add('is-off');
      }
    }

    this.signInBtn?.classList.toggle('is-hidden', signedIn);
    this.registerBtn?.classList.toggle('is-hidden', signedIn);
    this.googleBtn?.classList.toggle('is-hidden', signedIn);
    this.signOutBtn?.classList.toggle('is-hidden', !signedIn);
    this.retryBtn?.classList.toggle('is-hidden', !signedIn || this.multiplayer.isConnected);
    if (this.emailInput) this.emailInput.closest('.input-group')?.classList.toggle('is-hidden', signedIn);
    if (this.passwordInput) this.passwordInput.closest('.input-group')?.classList.toggle('is-hidden', signedIn);
    if (this.usernameGroup) this.usernameGroup.classList.toggle('is-hidden', signedIn || !this.registerMode);
  }

  private setRegisterMode(active: boolean): void {
    this.registerMode = active;
    if (this.signInBtn) this.signInBtn.textContent = active ? 'BACK TO SIGN IN' : 'SIGN IN';
    if (this.registerBtn) this.registerBtn.textContent = active ? 'CREATE & PLAY' : 'CREATE ACCOUNT';
    if (this.usernameGroup) this.usernameGroup.classList.toggle('is-hidden', !active);
    if (this.passwordInput) this.passwordInput.setAttribute('autocomplete', active ? 'new-password' : 'current-password');
    this.setError('');
    this.refresh();
  }

  private setError(message: string): void {
    if (this.errorEl) this.errorEl.textContent = message;
  }

  private credentials(): { email: string; password: string; username: string } | null {
    const email = this.emailInput?.value.trim() ?? '';
    const password = this.passwordInput?.value ?? '';
    const username = this.usernameInput?.value.trim() ?? '';

    if (!email || !password) {
      this.setError('Enter your email and password.');
      return null;
    }
    if (this.registerMode && username.length < 3) {
      this.setError('Username must be at least 3 characters.');
      return null;
    }
    return { email, password, username };
  }

  private preserveCharacter(previous: UserProfile): UserProfile {
    return this.auth.updateCharacter({
      avatar: previous.avatar,
      gender: previous.gender,
      occupation: previous.occupation
    });
  }

  private finish(user: UserProfile): void {
    this.setError('');
    this.options.onUserChanged(user);
    this.close();
  }

  private async signIn(): Promise<void> {
    const values = this.credentials();
    if (!values) return;
    const previous = this.auth.getCurrentUser();
    const result = await this.auth.loginWithFirebase(values.email, values.password);
    if (!result.success || !result.user) {
      this.setError(result.error ?? 'Sign-in failed.');
      return;
    }
    this.finish(this.preserveCharacter(previous));
  }

  private async register(): Promise<void> {
    const values = this.credentials();
    if (!values) return;
    const previous = this.auth.getCurrentUser();
    const result = await this.auth.registerWithFirebase(
      values.email,
      values.password,
      values.username,
      previous.avatar,
      previous.gender,
      previous.occupation
    );
    if (!result.success || !result.user) {
      this.setError(result.error ?? 'Registration failed.');
      return;
    }
    this.finish(result.user);
  }

  private async google(): Promise<void> {
    const previous = this.auth.getCurrentUser();
    const result = await this.auth.signInWithGoogle();
    if (!result.success || !result.user) {
      this.setError(result.error ?? 'Google sign-in failed.');
      return;
    }
    this.finish(this.preserveCharacter(previous));
  }

  private reconnect(): void {
    this.finish(this.auth.getCurrentUser());
  }

  private async signOut(): Promise<void> {
    await this.auth.logoutFirebase();
    // A clean reload sends the player back to the account screen so the
    // signed-out state is obvious and no in-game session is left behind.
    window.location.reload();
  }
}
