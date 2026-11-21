export interface Owner {
  id: string;
  email: string;
  username: string;
  name: string;
  passwordHash: string;
  failedLogins: number;
  lockedUntil: Date | null;
}
export interface SessionRecord {
  id: string;
  ownerId: string;
  expiresAt: Date;
}
export interface Settings {
  timezone: string;
  currency: string;
  theme: string;
  focusMinutes: number;
  shortBreak: number;
  longBreak: number;
  emailReminders: boolean;
  aiEnabled: boolean;
}
export interface AuthStore {
  findOwner(): Promise<Owner | null>;
  recordFailure(ownerId: string): Promise<void>;
  clearFailures(ownerId: string): Promise<void>;
  createSession(ownerId: string, expiresAt: Date): Promise<SessionRecord>;
  findSession(id: string): Promise<SessionRecord | null>;
  deleteSession(id: string): Promise<void>;
  changePassword(ownerId: string, previousHash: string, passwordHash: string): Promise<boolean>;
  getSettings(ownerId: string): Promise<Settings>;
  updateProfile(ownerId: string, data: { name: string }): Promise<void>;
  updateSettings(ownerId: string, data: Partial<Settings>): Promise<Settings>;
}
export interface Claims {
  sub: string;
  sid: string;
  csrf: string;
}
export interface Principal extends Claims {
  owner: Owner;
}
export function publicOwner(owner: Owner) {
  return { id: owner.id, email: owner.email, username: owner.username, name: owner.name };
}
declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }
}
