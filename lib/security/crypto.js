import crypto from "crypto";
// jjj
// Secure 256-bit encryption key derived from environment secret or system key
const SECRET = process.env.ENCRYPTION_SECRET || process.env.NEXTAUTH_SECRET || "hrms-secure-aes-256-encryption-key-32b";
const KEY = crypto.createHash("sha256").update(String(SECRET)).digest();

/**
 * Encrypt plaintext string into secure hex ciphertext format (AES-256-GCM).
 * Payload format: enc:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 */
export function encryptPassword(plaintext) {
  if (!plaintext) return "";
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `enc:${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error("Password Encryption Error:", err);
    throw new Error("Failed to encrypt password for secure storage.");
  }
}

/**
 * Decrypt ciphertext string (AES-256-GCM) back into original plaintext password.
 * Gracefully handles unencrypted legacy strings if present.
 */
export function decryptPassword(cipherText) {
  if (!cipherText) return "";
  if (!cipherText.startsWith("enc:")) {
    // Legacy unencrypted string fallback for backward compatibility
    return cipherText;
  }

  try {
    const parts = cipherText.split(":");
    if (parts.length !== 4) return cipherText;

    const iv = Buffer.from(parts[1], "hex");
    const authTag = Buffer.from(parts[2], "hex");
    const encryptedText = parts[3];

    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Password Decryption Error:", err);
    throw new Error("Failed to decrypt stored password.");
  }
}
