/**
 * lib/executiveEvaluationUtils.js
 * Core Calculation Engine for Business Owner Monthly Executive Appraisal
 *
 * Tri-Pillar Performance Calibration Architecture (100 pts total):
 * 1. HR Review (30 pts / 30% weight):
 *    - Attendance, Working Hours compliance, Leave discipline
 * 2. Team Lead / Manager Review (40 pts / 40% weight):
 *    - Task Deliverables & Deadlines, Learning, Innovation, Teamwork
 * 3. Business Owner Review (30 pts / 30% weight):
 *    - Culture Adaptation (1.0 to 10.0 scale -> max 15.0 pts)
 *    - Alignment with Vision & Values (1.0 to 10.0 scale -> max 15.0 pts)
 *
 * Total Composite Score = HR (30%) + Manager (40%) + Owner (30%) = 100 pts max
 */

/**
 * Calculates Owner Culture and Vision scores (Max 30 pts total)
 * @param {number} cultureRating - 1.0 to 10.0 scale
 * @param {number} visionRating - 1.0 to 10.0 scale
 * @returns {Object} { cultureRating, visionRating, cultureScore, visionScore, ownerScore }
 */
export function calculateOwnerCultureVisionScores(cultureRating = 8.0, visionRating = 8.0) {
  const safeCulture = Math.max(1.0, Math.min(10.0, Number(cultureRating) || 8.0));
  const safeVision = Math.max(1.0, Math.min(10.0, Number(visionRating) || 8.0));

  // Scaled: 1-10 rating to 15 pts max each
  const cultureScore = Math.round((safeCulture / 10.0) * 15.0 * 10) / 10;
  const visionScore = Math.round((safeVision / 10.0) * 15.0 * 10) / 10;
  const ownerScore = Math.round((cultureScore + visionScore) * 10) / 10;

  return {
    cultureRating: safeCulture,
    visionRating: safeVision,
    cultureScore,
    visionScore,
    ownerScore,
  };
}

/**
 * Computes the Final Tri-Pillar Composite Performance Score (0 - 100 pts) and Badge
 * @param {number|null} hrScore - HR evaluation score (0 - 100)
 * @param {number|null} tlScore - Manager evaluation score (0 - 100)
 * @param {number|null} ownerScore - Business owner score (0 - 30)
 * @returns {Object} { hrWeighted, tlWeighted, ownerWeighted, finalCompositeScore, performanceBadge }
 */
export function computeTriPillarFinalScore(hrScore = null, tlScore = null, ownerScore = null) {
  const hasHR = hrScore !== null && Number.isFinite(Number(hrScore));
  const hasTL = tlScore !== null && Number.isFinite(Number(tlScore));
  const hasOwner = ownerScore !== null && Number.isFinite(Number(ownerScore));

  const validHR = hasHR ? Math.max(0, Math.min(100, Number(hrScore))) : 0;
  const validTL = hasTL ? Math.max(0, Math.min(100, Number(tlScore))) : 0;
  const validOwner = hasOwner ? Math.max(0, Math.min(30, Number(ownerScore))) : 0;

  let hrWeighted = 0;
  let tlWeighted = 0;
  let ownerWeighted = 0;
  let finalCompositeScore = 0;

  if (hasHR && hasTL && hasOwner) {
    // Standard Tri-Pillar: HR 30% + TL 40% + Owner 30 pts
    hrWeighted = Math.round(validHR * 0.30 * 10) / 10;
    tlWeighted = Math.round(validTL * 0.40 * 10) / 10;
    ownerWeighted = validOwner;
    finalCompositeScore = Math.min(100, Math.round((hrWeighted + tlWeighted + ownerWeighted) * 10) / 10);
  } else if (hasHR && hasTL && !hasOwner) {
    // 50/50 balance when Owner hasn't reviewed yet
    hrWeighted = Math.round(validHR * 0.50 * 10) / 10;
    tlWeighted = Math.round(validTL * 0.50 * 10) / 10;
    finalCompositeScore = Math.min(100, Math.round((hrWeighted + tlWeighted) * 10) / 10);
  } else if (hasHR && !hasTL && hasOwner) {
    // HR 50% + Owner 50%
    hrWeighted = Math.round(validHR * 0.50 * 10) / 10;
    ownerWeighted = Math.round((validOwner / 30.0) * 50.0 * 10) / 10;
    finalCompositeScore = Math.min(100, Math.round((hrWeighted + ownerWeighted) * 10) / 10);
  } else if (!hasHR && hasTL && hasOwner) {
    // TL 55% + Owner 45%
    tlWeighted = Math.round(validTL * 0.55 * 10) / 10;
    ownerWeighted = Math.round((validOwner / 30.0) * 45.0 * 10) / 10;
    finalCompositeScore = Math.min(100, Math.round((tlWeighted + ownerWeighted) * 10) / 10);
  } else if (hasHR) {
    finalCompositeScore = validHR;
  } else if (hasTL) {
    finalCompositeScore = validTL;
  } else if (hasOwner) {
    finalCompositeScore = Math.round((validOwner / 30.0) * 100.0 * 10) / 10;
  }

  let performanceBadge = "Needs Attention";
  if (finalCompositeScore >= 90) {
    performanceBadge = "Exceptional";
  } else if (finalCompositeScore >= 75) {
    performanceBadge = "High Performer";
  } else if (finalCompositeScore >= 60) {
    performanceBadge = "On Track";
  }

  return {
    hrWeighted,
    tlWeighted,
    ownerWeighted,
    finalCompositeScore,
    performanceBadge,
    hasHR,
    hasTL,
    hasOwner,
  };
}
