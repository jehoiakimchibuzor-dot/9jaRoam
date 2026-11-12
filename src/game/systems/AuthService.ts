export interface UserStats {
  cash: number;
  bank: number;
  missionsCompleted: number;
  playTimeMinutes: number;
}

export interface UserProfile {
  id: string;
  username: string;
  isGuest: boolean;
  avatar: string;
  joinedAt: string;
  stats: UserStats;
}

export interface StoredAccount {
  user: UserProfile;
  passwordHash: string;
}

const SESSION_KEY = '9ja_roam_session_v1';
const ACCOUNTS_KEY = '9ja_roam_accounts_v1';

export class AuthService {
  private static instance: AuthService;
  private currentUser: UserProfile | null = null;

  private constructor() {
    this.loadSession();
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private loadSession(): void {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        this.currentUser = JSON.parse(raw);
      }
    } catch {
      this.currentUser = null;
    }
  }

  private saveSession(): void {
    if (this.currentUser) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(this.currentUser));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  private getAccounts(): Record<string, StoredAccount> {
    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private saveAccounts(accounts: Record<string, StoredAccount>): void {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  getCurrentUser(): UserProfile {
    if (!this.currentUser) {
      this.currentUser = this.createDefaultGuest('Guest Roamer', 'street-rebel');
      this.saveSession();
    }
    return this.currentUser;
  }

  loginAsGuest(username = 'Kano Roamer', avatar = 'street-rebel'): UserProfile {
    const user: UserProfile = {
      id: 'guest_' + Date.now(),
      username: username.trim() || 'Kano Roamer',
      isGuest: true,
      avatar,
      joinedAt: new Date().toISOString(),
      stats: {
        cash: 150,
        bank: 2000,
        missionsCompleted: 0,
        playTimeMinutes: 0
      }
    };
    this.currentUser = user;
    this.saveSession();
    return user;
  }

  register(
    username: string,
    password: string,
    avatar = 'street-rebel'
  ): { success: boolean; error?: string; user?: UserProfile } {
    const cleanName = username.trim();
    if (!cleanName || cleanName.length < 3) {
      return { success: false, error: 'Username must be at least 3 characters long.' };
    }
    if (!password || password.length < 4) {
      return { success: false, error: 'Password must be at least 4 characters long.' };
    }

    const accounts = this.getAccounts();
    const key = cleanName.toLowerCase();
    if (accounts[key]) {
      return { success: false, error: 'An account with this username already exists.' };
    }

    const newUser: UserProfile = {
      id: 'usr_' + Date.now(),
      username: cleanName,
      isGuest: false,
      avatar,
      joinedAt: new Date().toISOString(),
      stats: {
        cash: 250,
        bank: 3500,
        missionsCompleted: 0,
        playTimeMinutes: 0
      }
    };

    accounts[key] = {
      user: newUser,
      passwordHash: btoa(password)
    };
    this.saveAccounts(accounts);

    this.currentUser = newUser;
    this.saveSession();

    return { success: true, user: newUser };
  }

  login(
    username: string,
    password: string
  ): { success: boolean; error?: string; user?: UserProfile } {
    const cleanName = username.trim();
    if (!cleanName || !password) {
      return { success: false, error: 'Please enter both username and password.' };
    }

    const accounts = this.getAccounts();
    const key = cleanName.toLowerCase();
    const account = accounts[key];

    if (!account) {
      return { success: false, error: 'Account not found. Please register first.' };
    }

    if (account.passwordHash !== btoa(password)) {
      return { success: false, error: 'Incorrect password.' };
    }

    this.currentUser = account.user;
    this.saveSession();

    return { success: true, user: account.user };
  }

  logout(): void {
    this.currentUser = null;
    localStorage.removeItem(SESSION_KEY);
  }

  updateUserStats(stats: Partial<UserStats>): void {
    if (!this.currentUser) return;
    this.currentUser.stats = {
      ...this.currentUser.stats,
      ...stats
    };
    this.saveSession();

    if (!this.currentUser.isGuest) {
      const accounts = this.getAccounts();
      const key = this.currentUser.username.toLowerCase();
      if (accounts[key]) {
        accounts[key].user = this.currentUser;
        this.saveAccounts(accounts);
      }
    }
  }

  private createDefaultGuest(name: string, avatar: string): UserProfile {
    return {
      id: 'guest_' + Math.floor(Math.random() * 10000),
      username: name,
      isGuest: true,
      avatar,
      joinedAt: new Date().toISOString(),
      stats: {
        cash: 150,
        bank: 2000,
        missionsCompleted: 0,
        playTimeMinutes: 0
      }
    };
  }
}
