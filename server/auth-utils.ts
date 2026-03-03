import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import bcrypt from "bcryptjs";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;

  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string) {
  // bcrypt 해시 ($2a$, $2b$, $2y$)
  if (stored.startsWith("$2")) {
    return bcrypt.compare(supplied, stored);
  }

  // scrypt 해시 (hex.salt 형식)
  const [hashed, salt] = stored.split(".");
  if (!salt) return false;
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;

  return timingSafeEqual(hashedBuf, suppliedBuf);
}
