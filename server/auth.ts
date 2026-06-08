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
  await execute(
    `INSERT INTO staff (id, name)
     VALUES (3, 'Kumar'), (4, 'Admin'), (5, 'Aljulanda'), (6, 'Ghassan')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`
  );

  await execute(
    `DELETE FROM staff
     WHERE (lower(username) = 'staff1' OR lower(name) = 'staff 1')
       AND NOT EXISTS (SELECT 1 FROM shifts WHERE shifts.staff_id = staff.id)`
  );
  await execute(
    `UPDATE staff
     SET username = NULL, password_hash = NULL
     WHERE lower(username) = 'staff1' OR lower(name) = 'staff 1'`
  );

  const allStaff = await query<StaffAuth>("SELECT id, name, username, password_hash FROM staff");

  const defaults: Record<number, { username: string; password: string }> = {
    3: { username: "kumar", password: "123" },
    4: { username: "admin", password: "1234" },
    5: { username: "aljulanda", password: "123" },
    6: { username: "ghassan", password: "123" },
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
