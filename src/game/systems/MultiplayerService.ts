import type { UserProfile } from './AuthService';
import {
  initRealtimeDatabase,
  ref,
  set,
  remove,
  onValue,
  off,
  onDisconnect,
  serverTimestamp
} from './firebase';

export interface PlayerPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  mode: string;
}

export interface RemotePlayerState extends PlayerPose {
  uid: string;
  username: string;
  avatar: string;
  gender: string;
  occupation: string;
  updatedAt: number;
}

interface PresenceState {
  uid: string;
  username: string;
  avatar: string;
  gender: string;
  occupation: string;
  online: boolean;
  lastSeen: number;
}

type Listener = (players: RemotePlayerState[]) => void;

const WRITE_INTERVAL_MS = 100;
const STALE_AFTER_MS = 20000;
const PRESENCE_STALE_AFTER_MS = 15 * 60 * 1000;
const HEARTBEAT_MS = 5000;
const MAX_WRITE_FAILURES = 5;

export class MultiplayerService {
  private static instance: MultiplayerService;

  private db: any = null;
  private uid: string | null = null;
  private profile: UserProfile | null = null;
  private playersRef: any = null;
  private playersCallback: any = null;
  private presenceRef: any = null;
  private presenceCallback: any = null;
  private heartbeatTimer: number | null = null;
  private listeners = new Set<Listener>();
  private players = new Map<string, RemotePlayerState>();
  private onlinePlayers = new Map<string, PresenceState>();
  private lastWrite = 0;
  private failures = 0;
  private connected = false;

  static getInstance(): MultiplayerService {
    if (!MultiplayerService.instance) MultiplayerService.instance = new MultiplayerService();
    return MultiplayerService.instance;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get selfUid(): string | null {
    return this.uid;
  }

  /** Counted from /presence, so a phone that pauses rendering still counts. */
  get onlineCount(): number {
    return this.onlinePlayers.size;
  }

  async start(user: UserProfile): Promise<boolean> {
    this.stop();
    if (user.isGuest) return false;

    try {
      this.db = await initRealtimeDatabase();
      this.uid = user.id;
      this.profile = user;

      const presenceRef = ref(this.db, `presence/${this.uid}`);
      const selfRef = ref(this.db, `players/${this.uid}`);

      await set(presenceRef, {
        username: user.username,
        avatar: user.avatar,
        gender: user.gender,
        occupation: user.occupation,
        online: true,
        lastSeen: serverTimestamp()
      });
      await onDisconnect(presenceRef).remove();
      await onDisconnect(selfRef).remove();

      this.playersRef = ref(this.db, 'players');
      this.playersCallback = (snapshot: any) => this.onPlayersSnapshot(snapshot);
      onValue(this.playersRef, this.playersCallback);

      // Presence is the source of truth for "ONLINE · N". A backgrounded phone
      // stops requestAnimationFrame, but its heartbeat keeps this node alive.
      this.presenceRef = ref(this.db, 'presence');
      this.presenceCallback = (snapshot: any) => this.onPresenceSnapshot(snapshot);
      onValue(this.presenceRef, this.presenceCallback);

      this.heartbeatTimer = window.setInterval(() => this.heartbeat(), HEARTBEAT_MS);
      window.addEventListener('beforeunload', this.handleUnload);
      this.connected = true;
      return true;
    } catch (error) {
      console.warn('9ja Roam · multiplayer unavailable:', error);
      this.clearSession();
      return false;
    }
  }

  /** Keep presence (and the pose timestamp) fresh even while the tab is hidden. */
  private heartbeat(): void {
    if (!this.connected || !this.db || !this.uid) return;
    set(ref(this.db, `presence/${this.uid}/lastSeen`), serverTimestamp()).catch(() => undefined);
    set(ref(this.db, `players/${this.uid}/updatedAt`), serverTimestamp()).catch(() => undefined);
  }

  private emit(): void {
    const list = [...this.players.values()];
    this.listeners.forEach((listener) => listener(list));
  }

  updatePose(pose: PlayerPose): void {
    if (!this.connected || !this.db || !this.uid || !this.profile) return;
    const now = performance.now();
    if (now - this.lastWrite < WRITE_INTERVAL_MS) return;
    this.lastWrite = now;

    set(ref(this.db, `players/${this.uid}`), {
      uid: this.uid,
      username: this.profile.username,
      avatar: this.profile.avatar,
      gender: this.profile.gender,
      occupation: this.profile.occupation,
      ...pose,
      updatedAt: serverTimestamp()
    }).then(() => {
      this.failures = 0;
    }).catch(() => {
      // A dropped write is retried on the next frame. If the account was
      // signed out/deleted while the tab stayed open, stop retrying instead
      // of spamming the database with denied writes forever.
      if (!this.connected) return;
      this.failures += 1;
      if (this.failures >= MAX_WRITE_FAILURES) {
        console.warn('9ja Roam · multiplayer stopped after repeated write failures');
        this.clearSession();
      }
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener([...this.players.values()]);
    return () => this.listeners.delete(listener);
  }

  stop(): void {
    if (this.db && this.uid) {
      const presenceRef = ref(this.db, `presence/${this.uid}`);
      const selfRef = ref(this.db, `players/${this.uid}`);
      set(presenceRef, {
        username: this.profile?.username ?? 'Player',
        avatar: this.profile?.avatar ?? 'street-rebel',
        gender: this.profile?.gender ?? 'male',
        occupation: this.profile?.occupation ?? 'Hustler',
        online: false,
        lastSeen: serverTimestamp()
      }).catch(() => undefined);
      remove(selfRef).catch(() => undefined);
    }

    this.clearSession();
  }

  private clearSession(): void {
    if (this.playersRef && this.playersCallback) {
      off(this.playersRef, this.playersCallback);
    }
    if (this.presenceRef && this.presenceCallback) {
      off(this.presenceRef, this.presenceCallback);
    }
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    window.removeEventListener('beforeunload', this.handleUnload);

    this.playersRef = null;
    this.playersCallback = null;
    this.presenceRef = null;
    this.presenceCallback = null;
    this.db = null;
    this.uid = null;
    this.profile = null;
    this.players.clear();
    this.onlinePlayers.clear();
    this.connected = false;
    this.failures = 0;
    this.emit();
  }

  private onPlayersSnapshot(snapshot: any): void {
    const value = snapshot?.val?.() ?? {};
    const now = Date.now();
    const next = new Map<string, RemotePlayerState>();

    Object.entries(value).forEach(([uid, raw]) => {
      if (!raw || typeof raw !== 'object') return;
      const p = raw as Partial<RemotePlayerState>;
      if (typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.z !== 'number') return;
      if (typeof p.updatedAt === 'number' && now - p.updatedAt > STALE_AFTER_MS) return;
      next.set(uid, {
        uid,
        username: typeof p.username === 'string' ? p.username : 'Player',
        avatar: typeof p.avatar === 'string' ? p.avatar : 'street-rebel',
        gender: typeof p.gender === 'string' ? p.gender : 'male',
        occupation: typeof p.occupation === 'string' ? p.occupation : 'Hustler',
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: typeof p.yaw === 'number' ? p.yaw : 0,
        mode: typeof p.mode === 'string' ? p.mode : 'foot',
        updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : now
      });
    });

    this.players = next;
    this.emit();
  }

  private onPresenceSnapshot(snapshot: any): void {
    const value = snapshot?.val?.() ?? {};
    const now = Date.now();
    const next = new Map<string, PresenceState>();

    Object.entries(value).forEach(([uid, raw]) => {
      if (!raw || typeof raw !== 'object') return;
      const p = raw as Partial<PresenceState>;
      if (p.online !== true) return;
      if (typeof p.lastSeen === 'number' && now - p.lastSeen > PRESENCE_STALE_AFTER_MS) return;

      next.set(uid, {
        uid,
        username: typeof p.username === 'string' ? p.username : 'Player',
        avatar: typeof p.avatar === 'string' ? p.avatar : 'street-rebel',
        gender: typeof p.gender === 'string' ? p.gender : 'male',
        occupation: typeof p.occupation === 'string' ? p.occupation : 'Hustler',
        online: true,
        lastSeen: typeof p.lastSeen === 'number' ? p.lastSeen : now
      });
    });

    this.onlinePlayers = next;
    this.emit();
  }

  private handleUnload = (): void => {
    if (this.db && this.uid) {
      const selfRef = ref(this.db, `players/${this.uid}`);
      remove(selfRef).catch(() => undefined);
    }
  };
}
