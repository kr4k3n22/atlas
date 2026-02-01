import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const email = process.argv[2];
const password = process.argv[3];
const displayName = process.argv[4] || "Approver";

if (!email || !password) {
  console.error("Usage: node scripts/create-approver.mjs <email> <password> [displayName]");
  process.exit(2);
}

if (password.length < 12) {
  console.error("Refusing: password must be at least 12 chars.");
  process.exit(2);
}

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "users.json");

async function readUsers() {
  try {
    const raw = await fs.readFile(USERS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeUsers(users) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = USERS_PATH + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(users, null, 2), "utf-8");
  await fs.rename(tmp, USERS_PATH);
}

const users = await readUsers();
const emailNorm = email.toLowerCase().trim();

if (users.some((u) => String(u.email).toLowerCase() === emailNorm)) {
  console.error("Email already exists.");
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 12);

users.push({
  id: nanoid(),
  email: emailNorm,
  displayName,
  role: "approver",
  passwordHash,
  createdAt: new Date().toISOString(),
});

await writeUsers(users);
console.log("Created approver:", emailNorm);
