export type Role = "leader" | "stationary" | "ambulatory" | "administrator";

export interface DemoUser {
  login: string;
  password: string;
  role: Role;
  id: string;
  name: string;
}

export interface SessionUser {
  login: string;
  role: Role;
  id: string;
  name: string;
}

export type AssignableRole = "stationary" | "ambulatory" | "leader";

export interface AccountRecord {
  id: string;
  name: string;
  login: string;
  email: string;
  center: string;
  role: Role | "";
  roles: AssignableRole[];
  blocked: boolean;
}

export interface AccountProfileInput {
  name: string;
  login: string;
  email: string;
  center?: string;
}

export interface AccountPasswordInput {
  password: string;
  passwordRepeat: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  leader: "Руководитель исследования",
  stationary: "Врач стационара",
  ambulatory: "Врач амбулатории",
  administrator: "Системный администратор",
};
