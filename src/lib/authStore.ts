import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";

export type Role = "user" | "approver";

export type StoredUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  passwordHash: string;
  createdAt: string;
  lastLoginAt?: string;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "users.json");

async function readUsers(): Promise<StoredUser[]> {
  try {
    const raw = await fs.readFile(USERS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as StoredUser[];
  } catch {
    return [];
  }
}

async function writeUsers(users: StoredUser[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = USERS_PATH + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(users, null, 2), "utf-8");
  await fs.rename(tmp, USERS_PATH);
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const users = await readUsers();
  const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
  return u ?? null;
}

export async function findUserById(id: string): Promise<StoredUser | null> {
  const users = await readUsers();
  const u = users.find((x) => x.id === id);
  return u ?? null;
}

export async function createUser(input: {
  email: string;
  displayName: string;
  password: string;
  role: Role;
}): Promise<StoredUser> {
  const users = await readUsers();

  const emailNorm = input.email.toLowerCase().trim();
  if (users.some((x) => x.email.toLowerCase() === emailNorm)) {
    throw new Error("Email already exists");
  }

  // bcrypt cost 12 is a reasonable baseline for dev/small deployments.
  const passwordHash = await bcrypt.hash(input.password, 12);

  const u: StoredUser = {
    id: nanoid(),
    email: emailNorm,
    displayName: input.displayName.trim(),
    role: input.role,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  users.push(u);
  await writeUsers(users);
  return u;
}

export async function verifyPassword(user: StoredUser, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

export async function touchLastLogin(userId: string) {
  const users = await readUsers();
  const idx = users.findIndex((x) => x.id === userId);
  if (idx === -1) return;
  users[idx].lastLoginAt = new Date().toISOString();
  await writeUsers(users);
}
