import { NextResponse } from "next/server";

/**
 * Optimistic Concurrency Control Engine
 * Prevents race conditions and accidental overwrites when multiple users edit the same entity simultaneously.
 */

/**
 * Evaluates whether an update request conflicts with a modified server record.
 * @param {Object} currentRecord - The database record currently loaded
 * @param {string|null} expectedUpdatedAt - The updated_at timestamp expected by the client
 * @param {number} [toleranceMs=1000] - Clock skew / formatting tolerance in milliseconds
 * @returns {{ hasConflict: boolean, serverUpdatedAt: string|null, message: string|null }}
 */
export function checkOptimisticLockConflict(currentRecord, expectedUpdatedAt, toleranceMs = 1000) {
  if (!expectedUpdatedAt || !currentRecord?.updated_at) {
    return { hasConflict: false, serverUpdatedAt: currentRecord?.updated_at || null, message: null };
  }

  const serverUpdatedMs = new Date(currentRecord.updated_at).getTime();
  const clientExpectedMs = new Date(expectedUpdatedAt).getTime();

  if (isNaN(serverUpdatedMs) || isNaN(clientExpectedMs)) {
    return { hasConflict: false, serverUpdatedAt: currentRecord.updated_at, message: null };
  }

  // Conflict detected if server timestamp differs beyond tolerance window
  if (Math.abs(serverUpdatedMs - clientExpectedMs) > toleranceMs) {
    return {
      hasConflict: true,
      serverUpdatedAt: currentRecord.updated_at,
      message: "Conflict detected: This task was modified by another team member. Please refresh the board to load the latest state.",
    };
  }

  return { hasConflict: false, serverUpdatedAt: currentRecord.updated_at, message: null };
}

/**
 * Generates standard HTTP 409 Conflict response payload.
 * @param {Object} currentRecord - The latest database record
 * @param {string} [customMessage] - Optional override message
 * @returns {NextResponse}
 */
export function createConflictResponse(currentRecord, customMessage = null) {
  return NextResponse.json(
    {
      message: customMessage || "Conflict detected: This task was modified by another user. Please refresh the page.",
      code: "CONCURRENCY_CONFLICT",
      current_record: currentRecord,
      server_updated_at: currentRecord?.updated_at || null,
    },
    { status: 409 }
  );
}
