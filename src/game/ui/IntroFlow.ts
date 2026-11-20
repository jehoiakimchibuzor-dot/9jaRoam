import { AuthService, UserProfile } from '../systems/AuthService';
import { CharacterPreview } from './CharacterPreview';

export class IntroFlow {
  private authService = AuthService.getInstance();
  private splashEl: HTMLElement | null = null;
  private onboardEl: HTMLElement | null = null;
  private authEl: HTMLElement | null = null;
  private charEl: HTMLElement | null = null;
  private selectedAvatar = 'street-rebel';
  private selectedGender: 'male' | 'female' = 'male';
  private selectedOccupation = 'Hustler';
  private characterPreview: CharacterPreview | null = null;
  private currentSlideIndex = 0;

  constructor(private onComplete: (user: UserProfile) => void) {}

  start(): void {
    this.splashEl = document.getElementById('splash-screen');
    this.onboardEl = document.getElementById('onboarding-screen');
    this.authEl = document.getElementById('auth-screen');
    this.charEl = document.getElementById('character-screen');

    this.runSplashSequence();
  }

  private runSplashSequence(): void {
    if (!this.splashEl) {
      document.body.classList.remove('splash-active');
      this.checkOnboarding();
      return;
    }

    this.splashEl.classList.add('is-active');
    document.body.classList.add('splash-active');

    const barFill = document.getElementById('splash-progress-fill');
    if (barFill) {
      barFill.style.width = '0%';
      requestAnimationFrame(() => {
        barFill.style.transition = 'width 2s cubic-bezier(0.2, 0.8, 0.2, 1)';
        barFill.style.width = '100%';
      });
    }

    setTimeout(() => {
      this.splashEl?.classList.remove('is-active');
      this.splashEl?.classList.add('is-hidden');
      document.body.classList.remove('splash-active');
      this.checkOnboarding();
    }, 2400);
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

    this.onboardEl.classList.remove('is-hidden');
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
    const slides = document.querySelectorAll('.onboard-slide');
    const dots = document.querySelectorAll('.onboard-dot');
    const nextBtn = document.getElementById('onboard-next-btn');
    const progressFill = document.getElementById('onboard-progress-fill');
    const stepEl = document.getElementById('onboard-step');
    const total = slides.length || 3;

    if (track) {
      track.style.transform = `translateX(-${this.currentSlideIndex * 100}%)`;
    }

    slides.forEach((slide, idx) => {
      slide.classList.toggle('is-active', idx === this.currentSlideIndex);
    });

    dots.forEach((dot, idx) => {
      dot.classList.toggle('is-active', idx === this.currentSlideIndex);
    });

    if (progressFill) {
      progressFill.style.width = `${((this.currentSlideIndex + 1) / total) * 100}%`;
    }

    if (stepEl) {
      stepEl.innerHTML = `${String(this.currentSlideIndex + 1).padStart(2, '0')} <span>/ ${String(total).padStart(2, '0')}</span>`;
    }

    if (nextBtn) {
      const label = nextBtn.querySelector('span');
      const text = this.currentSlideIndex === total - 1 ? 'ENTER KANO' : 'CONTINUE';
      if (label) label.textContent = text;
      else nextBtn.textContent = text;
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

    this.authEl.classList.remove('is-hidden');
    this.authEl.classList.add('is-active');
    this.setupAuthTabs();
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

  private setupAuthForms(): void {
    const btnGuest = document.getElementById('btn-start-guest');
    const btnLogin = document.getElementById('btn-submit-login');
    const btnRegister = document.getElementById('btn-submit-register');
    const btnGoogleLogin = document.getElementById('btn-google-login');
    const btnGoogleRegister = document.getElementById('btn-google-register');
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
      const user = this.authService.loginAsGuest(name, this.selectedAvatar, this.selectedGender, this.selectedOccupation);
      this.showCharacterScreen(user);
    });

    btnLogin?.addEventListener('click', async () => {
      clearError();
      const emailInput = document.getElementById('login-email-input') as HTMLInputElement;
      const passInput = document.getElementById('login-pass-input') as HTMLInputElement;

      const email = emailInput?.value.trim() || '';
      const pass = passInput?.value || '';

      if (!email || !pass) {
        showError('Please enter both email and password.');
        return;
      }

      const res = await this.authService.loginWithFirebase(email, pass);
      if (res.success && res.user) {
        this.showCharacterScreen(res.user);
      } else {
        showError(res.error || 'Login failed.');
      }
    });

    btnRegister?.addEventListener('click', async () => {
      clearError();
      const emailInput = document.getElementById('reg-email-input') as HTMLInputElement;
      const userInput = document.getElementById('reg-user-input') as HTMLInputElement;
      const passInput = document.getElementById('reg-pass-input') as HTMLInputElement;

      const email = emailInput?.value.trim() || '';
      const username = userInput?.value.trim() || '';
      const pass = passInput?.value || '';

      if (!email || !username || !pass) {
        showError('Please fill in email, username, and password.');
        return;
      }

      const res = await this.authService.registerWithFirebase(email, pass, username, this.selectedAvatar, this.selectedGender, this.selectedOccupation);
      if (res.success && res.user) {
        this.showCharacterScreen(res.user);
      } else {
        showError(res.error || 'Registration failed.');
      }
    });

    const handleGoogle = async () => {
      clearError();
      const res = await this.authService.signInWithGoogle();
      if (res.success && res.user) {
        this.showCharacterScreen(res.user);
      } else {
        showError(res.error || 'Google sign-in failed.');
      }
    };

    btnGoogleLogin?.addEventListener('click', handleGoogle);
    btnGoogleRegister?.addEventListener('click', handleGoogle);
  }

  private showCharacterScreen(user: UserProfile): void {
    this.authEl?.classList.remove('is-active');
    this.authEl?.classList.add('is-hidden');

    if (!this.charEl) {
      this.complete(user);
      return;
    }

    this.charEl.classList.remove('is-hidden');
    this.charEl.classList.add('is-active');
    this.setupCharacterSelection(user);

    const previewCanvas = document.getElementById('character-preview-canvas');
    if (previewCanvas instanceof HTMLCanvasElement) {
      if (!this.characterPreview) this.characterPreview = new CharacterPreview(previewCanvas);
      this.characterPreview.start();
      this.refreshCharacterPreview();
    }
  }

  private refreshCharacterPreview(): void {
    this.characterPreview?.setProfile(
      this.selectedAvatar,
      this.selectedGender,
      this.selectedOccupation
    );
  }

  private setupCharacterSelection(user: UserProfile): void {
    this.selectedAvatar = user.avatar || 'street-rebel';
    this.selectedGender = user.gender;
    this.selectedOccupation = user.occupation;

    const avatarOptions = document.querySelectorAll('.avatar-option[data-avatar]');
    avatarOptions.forEach((opt) => {
      const avatar = (opt as HTMLElement).dataset.avatar;
      const isSelected = avatar === this.selectedAvatar;
      opt.classList.toggle('is-selected', isSelected);
      opt.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

      opt.addEventListener('click', () => {
        avatarOptions.forEach((o) => {
          o.classList.remove('is-selected');
          o.setAttribute('aria-pressed', 'false');
        });
        opt.classList.add('is-selected');
        opt.setAttribute('aria-pressed', 'true');
        this.selectedAvatar = avatar ?? 'street-rebel';
        this.refreshCharacterPreview();
      });
    });

    const genderOptions = document.querySelectorAll('.char-option[data-gender]');
    genderOptions.forEach((opt) => {
      const gender = (opt as HTMLElement).dataset.gender;
      if (gender === this.selectedGender) {
        opt.classList.add('is-selected');
      } else {
        opt.classList.remove('is-selected');
      }
      opt.addEventListener('click', () => {
        genderOptions.forEach((o) => o.classList.remove('is-selected'));
        opt.classList.add('is-selected');
        this.selectedGender = (gender as 'male' | 'female');
        this.refreshCharacterPreview();
      });
    });

    const occOptions = document.querySelectorAll('.char-option[data-occupation]');
    occOptions.forEach((opt) => {
      const occ = (opt as HTMLElement).dataset.occupation;
      if (occ === this.selectedOccupation) {
        opt.classList.add('is-selected');
      } else {
        opt.classList.remove('is-selected');
      }
      opt.addEventListener('click', () => {
        occOptions.forEach((o) => o.classList.remove('is-selected'));
        opt.classList.add('is-selected');
        this.selectedOccupation = occ ?? 'Hustler';
        this.refreshCharacterPreview();
      });
    });

    const btnCreate = document.getElementById('btn-create-character');
    const charErrorEl = document.getElementById('char-error-msg');

    const clearError = () => {
      if (charErrorEl) charErrorEl.style.display = 'none';
    };

    btnCreate?.addEventListener('click', () => {
      clearError();

      const updatedUser = this.authService.updateCharacter({
        avatar: this.selectedAvatar,
        gender: this.selectedGender,
        occupation: this.selectedOccupation,
      });

      this.complete(updatedUser);
    });
  }

  private complete(user: UserProfile): void {
    this.characterPreview?.stop();
    this.characterPreview = null;
    this.charEl?.classList.remove('is-active');
    this.charEl?.classList.add('is-hidden');
    this.onComplete(user);
  }
}
