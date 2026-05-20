import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { execute, query, queryOne } from "./db.js";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hash2 = scryptSync(password, salt, 64).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(hash2, "hex"));
  } catch {
    return false;
  }
}

export type StaffAuth = {
  id: number;
  name: string;
  username: string;
  password_hash: string;
};

export async function getStaffByUsername(username: string): Promise<StaffAuth | undefined> {
  return queryOne<StaffAuth>(
    "SELECT id, name, username, password_hash FROM staff WHERE username = $1",
    [username.trim().toLowerCase()]
  );
}

export async function verifyStaffCredentials(
  username: string,
  password: string
): Promise<StaffAuth | null> {
  const staff = await getStaffByUsername(username);
  if (!staff?.password_hash) return null;
  if (!verifyPassword(password, staff.password_hash)) return null;
  return staff;
}

export async function ensureStaffCredentials() {
  const allStaff = await query<StaffAuth>("SELECT id, name, username, password_hash FROM staff");

  const defaults: Record<number, { username: string; password: string }> = {
    1: { username: "staff1", password: "staff1" },
    2: { username: "staff2", password: "staff2" },
    3: { username: "ghassan", password: "ghassan" },
  };
  for (const row of allStaff) {
    const def = defaults[row.id];
    if (!def) continue;
    if (!row.username || !row.password_hash) {
      await execute("UPDATE staff SET username = $1, password_hash = $2 WHERE id = $3", [
        def.username,
        hashPassword(def.password),
        row.id,
      ]);
    }
  }
}
