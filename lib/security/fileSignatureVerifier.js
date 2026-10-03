/**
 * Binary file signature verification (Magic Byte Inspection) and filename sanitization.
 * Prevents disguised executable uploads, polyglot attacks, and path traversal vulnerabilities.
 */

export const ALLOWED_FILE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/**
 * Format bytes into human-readable string (e.g. "2.4 MB")
 */
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Validates raw file buffer byte signatures on the server.
 * @param {Buffer} buffer - File data buffer
 * @param {string} [declaredMimeType] - Client-sent MIME type
 * @returns {{ valid: boolean, detectedMime: string|null, error: string|null }}
 */
export function inspectFileSignature(buffer, declaredMimeType = "") {
  if (!buffer || buffer.length < 4) {
    return { valid: false, detectedMime: null, error: "Empty or invalid file stream." };
  }

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, detectedMime: "image/png", error: null };
  }

  // 2. JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedMime: "image/jpeg", error: null };
  }

  // 3. GIF: GIF87a or GIF89a (47 49 46 38)
  if (buffer.length >= 6 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { valid: true, detectedMime: "image/gif", error: null };
  }

  // 4. WebP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, detectedMime: "image/webp", error: null };
  }

  // 5. PDF: %PDF (25 50 44 46)
  if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { valid: true, detectedMime: "application/pdf", error: null };
  }

  // 6. ZIP / Office formats (docx, xlsx, pptx): PK\x03\x04
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return { valid: true, detectedMime: declaredMimeType || "application/zip", error: null };
  }

  return {
    valid: false,
    detectedMime: null,
    error: "File signature does not match allowed deliverable proof types (PNG, JPEG, WebP, GIF, PDF, ZIP/DOCX). Disguised or executable files are rejected.",
  };
}

/**
 * Sanitizes attachment filenames to prevent path traversal and neutralizes executable extensions.
 * @param {string} name - Raw filename
 * @param {string} [fallbackExt="png"] - Default safe extension
 * @returns {string} Safe sanitized filename
 */
export function sanitizeAttachmentFilename(name, fallbackExt = "png") {
  if (!name || typeof name !== "string") return `proof_${Date.now()}.${fallbackExt}`;
  
  // Remove directory traversal characters (../, ..\), null bytes, and illegal filesystem characters
  let clean = name.replace(/[/\\?%*:|"<>]/g, "").replace(/\0/g, "").replace(/\.\.+/g, "").trim();
  
  // Neutralize dangerous executable extensions
  const dangerousExts = /\.(exe|bat|cmd|sh|php|phtml|cgi|asp|aspx|js|mjs|vbs|jar|svg|html|htm|scr|dll)$/i;
  if (dangerousExts.test(clean)) {
    clean = clean.replace(dangerousExts, `.${fallbackExt}`);
  }
  
  if (!clean || clean.startsWith(".")) {
    clean = `proof_${Date.now()}.${fallbackExt}`;
  }
  
  return clean;
}
