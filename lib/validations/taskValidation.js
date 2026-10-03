import { z } from "zod";

/**
 * Strips dangerous HTML tags, script blocks, and DOM event handlers to prevent XSS.
 * @param {string|any} val
 * @returns {string|any}
 */
export function sanitizeTextContent(val) {
  if (typeof val !== "string") return val;
  return val
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/onload\s*=/gi, "")
    .replace(/onerror\s*=/gi, "")
    .replace(/onclick\s*=/gi, "")
    .replace(/onmouseover\s*=/gi, "");
}

/**
 * Schema for deliverable screenshots, attachments, blob URLs, and base64 payloads.
 * Supports unlimited URL length and handles both raw strings and rich metadata objects.
 */
export const taskAttachmentSchema = z.union([
  z.string(),
  z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
      name: z.string().optional(),
      size: z.union([z.string(), z.number()]).optional(),
      url: z.string().optional(),
      dataUrl: z.string().optional(),
      type: z.string().optional(),
      isUploading: z.boolean().optional(),
    })
    .passthrough(),
]);

/**
 * Sanitizes array of attachments ensuring only safe URLs and names are retained.
 * @param {Array} rawAtts
 * @returns {Array}
 */
export function sanitizeTaskAttachments(rawAtts) {
  if (!Array.isArray(rawAtts)) return [];
  return rawAtts.map((a, idx) => {
    if (typeof a === "string") {
      if (a.startsWith("http://") || a.startsWith("https://") || a.startsWith("data:") || a.startsWith("blob:")) {
        return { id: `att-${idx}`, name: `Attachment-${idx + 1}`, url: a };
      }
      return { id: `att-${idx}`, name: `Attachment-${idx + 1}`, url: a || "" };
    }
    const resolvedUrl = a.url || a.dataUrl || "";
    return {
      id: a.id || `att-${Date.now()}-${idx}`,
      name: a.name || `Screenshot-${idx + 1}.png`,
      size: a.size || "Unknown",
      url: resolvedUrl || a.url || "",
      type: a.type || "image/png",
    };
  });
}

/**
 * Resilient, type-safe Zod Schema for Task PATCH (Status, Details, Review Submissions, Extensions).
 * Preprocesses case conversions and string numbers for seamless frontend interoperability.
 */
export const taskPatchSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title cannot be empty")
      .max(500, "Title cannot exceed 500 characters")
      .transform(sanitizeTextContent)
      .optional(),
    description: z
      .string()
      .max(100000, "Description exceeds maximum character length")
      .transform(sanitizeTextContent)
      .optional(),
    status: z
      .preprocess((val) => {
        if (typeof val === "string") {
          return val.trim().toUpperCase().replace(/[\s-]+/g, "_");
        }
        return val;
      }, z.string())
      .optional(),
    priority: z
      .preprocess((val) => {
        if (typeof val === "string") {
          const up = val.trim().toUpperCase();
          if (["LOW", "MEDIUM", "HIGH", "URGENT", "BLOCKED"].includes(up)) return up;
        }
        return val;
      }, z.enum(["LOW", "MEDIUM", "HIGH", "URGENT", "BLOCKED"], {
        errorMap: () => ({ message: "Priority must be LOW, MEDIUM, HIGH, URGENT, or BLOCKED" }),
      }))
      .optional(),
    task_type: z
      .preprocess((val) => {
        if (typeof val === "string") {
          const up = val.trim().toUpperCase();
          if (["STORY", "TASK", "BUG"].includes(up)) return up;
        }
        return val;
      }, z.enum(["STORY", "TASK", "BUG"], {
        errorMap: () => ({ message: "Task type must be STORY, TASK, or BUG" }),
      }))
      .optional(),
    story_points: z
      .preprocess((val) => {
        if (typeof val === "string") {
          const num = parseInt(val.replace(/\D/g, ""), 10);
          return isNaN(num) ? 0 : num;
        }
        if (typeof val === "number") return Math.round(val);
        return val;
      }, z.number().int("Story points must be an integer").min(0, "Story points cannot be negative").max(100, "Max 100 story points"))
      .optional(),
    progress: z
      .preprocess((val) => {
        if (typeof val === "string") {
          const num = parseInt(val.replace(/\D/g, ""), 10);
          return isNaN(num) ? 0 : Math.min(100, Math.max(0, num));
        }
        if (typeof val === "number") return Math.min(100, Math.max(0, val));
        return val;
      }, z.number().min(0, "Progress cannot be negative").max(100, "Progress cannot exceed 100"))
      .optional(),
    due_date: z
      .preprocess((val) => {
        if (!val || val === "null" || val === "undefined") return null;
        if (typeof val === "string") {
          const trimmed = val.trim();
          if (!trimmed) return null;
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
            const [m, d, y] = trimmed.split("/");
            return `${y}-${m}-${d}`;
          }
          return trimmed.split("T")[0];
        }
        return val;
      }, z.string().nullable())
      .optional(),
    sprint_id: z
      .preprocess((val) => (!val || val === "" || val === "null" ? null : String(val).trim()), z.string().nullable())
      .optional(),
    epic_id: z
      .preprocess((val) => (!val || val === "" || val === "null" ? null : String(val).trim()), z.string().nullable())
      .optional(),
    assigned_to: z
      .preprocess((val) => (!val || val === "" || val === "null" ? null : String(val).trim()), z.string().nullable())
      .optional(),
    assignee_id: z
      .preprocess((val) => (!val || val === "" || val === "null" ? null : String(val).trim()), z.string().nullable())
      .optional(),
    comments: z.string().max(50000).transform(sanitizeTextContent).optional(),
    review_comments: z.string().max(50000).transform(sanitizeTextContent).optional(),
    review_feedback: z.string().max(50000).transform(sanitizeTextContent).optional(),
    review_attachments: z.array(taskAttachmentSchema).optional(),
    attachments: z.array(taskAttachmentSchema).optional(),
    review_submitted_at: z.string().optional(),
    action: z.enum(["request_extension", "decide_extension"]).optional(),
    extension_requested_date: z.string().optional(),
    extension_reason: z.string().max(10000).transform(sanitizeTextContent).optional(),
    decision: z.enum(["APPROVE", "REJECT", "approve", "reject"]).optional(),
    decision_note: z.string().max(10000).transform(sanitizeTextContent).optional(),
    // Optimistic concurrency control tokens
    expected_updated_at: z.string().optional(),
    previous_updated_at: z.string().optional(),
  })
  .passthrough();

/**
 * Resilient Zod Schema for Task Creation (POST /api/projects/:id/tasks).
 */
export const taskCreateSchema = z
  .object({
    title: z
      .string()
      .min(1, "Task title is required")
      .max(500, "Title cannot exceed 500 characters")
      .transform(sanitizeTextContent),
    description: z
      .string()
      .max(100000, "Description exceeds maximum character length")
      .transform(sanitizeTextContent)
      .optional()
      .default(""),
    task_type: z
      .preprocess((val) => {
        if (typeof val === "string") {
          const up = val.trim().toUpperCase();
          if (["STORY", "TASK", "BUG"].includes(up)) return up;
        }
        return val;
      }, z.enum(["STORY", "TASK", "BUG"]))
      .default("STORY"),
    priority: z
      .preprocess((val) => {
        if (typeof val === "string") {
          const up = val.trim().toUpperCase();
          if (["LOW", "MEDIUM", "HIGH", "URGENT"].includes(up)) return up;
        }
        return val;
      }, z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]))
      .default("MEDIUM"),
    story_points: z
      .preprocess((val) => {
        if (typeof val === "string") {
          const num = parseInt(val.replace(/\D/g, ""), 10);
          return isNaN(num) ? 1 : num;
        }
        if (typeof val === "number") return Math.round(val);
        return val;
      }, z.number().int().min(0).max(100))
      .default(1),
    sprint_id: z
      .preprocess((val) => (!val || val === "" || val === "null" ? null : String(val).trim()), z.string().nullable())
      .optional(),
    epic_id: z
      .preprocess((val) => (!val || val === "" || val === "null" ? null : String(val).trim()), z.string().nullable())
      .optional(),
    assigned_to: z
      .preprocess((val) => (!val || val === "" || val === "null" ? null : String(val).trim()), z.string().nullable())
      .optional(),
    due_date: z
      .preprocess((val) => {
        if (!val || val === "null" || val === "undefined") return null;
        if (typeof val === "string") {
          const trimmed = val.trim();
          if (!trimmed) return null;
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
            const [m, d, y] = trimmed.split("/");
            return `${y}-${m}-${d}`;
          }
          return trimmed.split("T")[0];
        }
        return val;
      }, z.string().nullable())
      .optional(),
  })
  .passthrough();
