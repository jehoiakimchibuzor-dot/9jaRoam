import { AuthService, UserProfile } from '../systems/AuthService';

export class IntroFlow {
  private authService = AuthService.getInstance();
  private splashEl: HTMLElement | null = null;
  private onboardEl: HTMLElement | null = null;
  private authEl: HTMLElement | null = null;
  private selectedAvatar = 'street-rebel';
  private currentSlideIndex = 0;

  constructor(private onComplete: (user: UserProfile) => void) {}

  start(): void {
    this.splashEl = document.getElementById('splash-screen');
    this.onboardEl = document.getElementById('onboarding-screen');
    this.authEl = document.getElementById('auth-screen');

    this.runSplashSequence();
  }

  private runSplashSequence(): void {
    if (!this.splashEl) {
      this.checkOnboarding();
      return;
    }

    this.splashEl.classList.add('is-active');
    const barFill = document.getElementById('splash-progress-fill');
    if (barFill) {
      barFill.style.width = '0%';
      requestAnimationFrame(() => {
        barFill.style.transition = 'width 1.6s cubic-bezier(0.2, 0.8, 0.2, 1)';
        barFill.style.width = '100%';
      });
    }

    setTimeout(() => {
      this.splashEl?.classList.remove('is-active');
      this.splashEl?.classList.add('is-hidden');
      this.checkOnboarding();
    }, 1800);
  }

  private checkOnboarding(): void {
    const hasSeenOnboard = localStorage.getItem('9ja_roam_onboard_seen');
    if (!hasSeenOnboard) {
      this.showOnboarding();
    } else {
      this.showAuthScreen();
    }
  }

  private showOnboarding(): void {
    if (!this.onboardEl) {
      this.showAuthScreen();
      return;
    }

    this.onboardEl.classList.add('is-active');
    this.currentSlideIndex = 0;
    this.updateSlidePosition();

    const nextBtn = document.getElementById('onboard-next-btn');
    const skipBtn = document.getElementById('onboard-skip-btn');

    if (nextBtn) {
      nextBtn.onclick = () => {
        if (this.currentSlideIndex < 2) {
          this.currentSlideIndex++;
          this.updateSlidePosition();
        } else {
          this.finishOnboarding();
        }
      };
    }

    if (skipBtn) {
      skipBtn.onclick = () => {
        this.finishOnboarding();
      };
    }
  }

  private updateSlidePosition(): void {
    const track = document.getElementById('onboard-track');
    const dots = document.querySelectorAll('.onboard-dot');
    const nextBtn = document.getElementById('onboard-next-btn');

    if (track) {
      track.style.transform = `translateX(-${this.currentSlideIndex * 100}%)`;
    }

    dots.forEach((dot, idx) => {
      dot.classList.toggle('is-active', idx === this.currentSlideIndex);
    });

    if (nextBtn) {
      nextBtn.textContent = this.currentSlideIndex === 2 ? 'GET STARTED' : 'NEXT';
    }
  }

  private finishOnboarding(): void {
    localStorage.setItem('9ja_roam_onboard_seen', 'true');
    this.onboardEl?.classList.remove('is-active');
    this.onboardEl?.classList.add('is-hidden');
    this.showAuthScreen();
  }

  private showAuthScreen(): void {
    if (!this.authEl) {
      this.complete(this.authService.getCurrentUser());
      return;
    }

    this.authEl.classList.add('is-active');
    this.setupAuthTabs();
    this.setupAvatarPicker();
    this.setupAuthForms();
  }

  private setupAuthTabs(): void {
    const tabGuest = document.getElementById('tab-guest');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');

    const formGuest = document.getElementById('form-guest');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');

    const activateTab = (activeTab: HTMLElement | null, activeForm: HTMLElement | null) => {
      [tabGuest, tabLogin, tabRegister].forEach((t) => t?.classList.remove('is-active'));
      [formGuest, formLogin, formRegister].forEach((f) => f?.classList.remove('is-active'));

      activeTab?.classList.add('is-active');
      activeForm?.classList.add('is-active');
    };

    tabGuest?.addEventListener('click', () => activateTab(tabGuest, formGuest));
    tabLogin?.addEventListener('click', () => activateTab(tabLogin, formLogin));
    tabRegister?.addEventListener('click', () => activateTab(tabRegister, formRegister));
  }

  private setupAvatarPicker(): void {
    const avatars = document.querySelectorAll('.avatar-option');
    avatars.forEach((opt) => {
      opt.addEventListener('click', () => {
        avatars.forEach((a) => a.classList.remove('is-selected'));
        opt.classList.add('is-selected');
        this.selectedAvatar = (opt as HTMLElement).dataset.avatar ?? 'street-rebel';
      });
    });
  }

  private setupAuthForms(): void {
    const btnGuest = document.getElementById('btn-start-guest');
    const btnLogin = document.getElementById('btn-submit-login');
    const btnRegister = document.getElementById('btn-submit-register');
    const errorEl = document.getElementById('auth-error-msg');

    const showError = (msg: string) => {
      if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
      }
    };

    const clearError = () => {
      if (errorEl) errorEl.style.display = 'none';
    };

    btnGuest?.addEventListener('click', () => {
      clearError();
      const guestNameInput = document.getElementById('guest-name-input') as HTMLInputElement;
      const name = guestNameInput?.value.trim() || 'Kano Roamer';
      const user = this.authService.loginAsGuest(name, this.selectedAvatar);
      this.complete(user);
    });

    btnLogin?.addEventListener('click', () => {
      clearError();
      const userInput = document.getElementById('login-user-input') as HTMLInputElement;
      const passInput = document.getElementById('login-pass-input') as HTMLInputElement;

      const res = this.authService.login(userInput?.value || '', passInput?.value || '');
      if (res.success && res.user) {
        this.complete(res.user);
      } else {
        showError(res.error || 'Login failed.');
      }
    });

    btnRegister?.addEventListener('click', () => {
      clearError();
      const userInput = document.getElementById('reg-user-input') as HTMLInputElement;
      const passInput = document.getElementById('reg-pass-input') as HTMLInputElement;

      const res = this.authService.register(userInput?.value || '', passInput?.value || '', this.selectedAvatar);
      if (res.success && res.user) {
        this.complete(res.user);
      } else {
        showError(res.error || 'Registration failed.');
      }
    });
  }

  private complete(user: UserProfile): void {
    this.authEl?.classList.remove('is-active');
    this.authEl?.classList.add('is-hidden');
    this.onComplete(user);
  }
}
