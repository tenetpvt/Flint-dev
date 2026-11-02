/**
 * Unified Severity Scale and Semantic Derivation
 * Quiet Enterprise: Single scale, strictly grounded in confidence and defect dimensions.
 */

export type SeverityTier = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NEEDS_REVIEW';

export interface SeverityMeta {
  tier: SeverityTier;
  label: string;
  color: string;
  dotColor: string;
  isUrgent: boolean;
}

export const SEVERITY_TOKENS: Record<SeverityTier, SeverityMeta> = {
  CRITICAL: {
    tier: 'CRITICAL',
    label: 'Critical',
    color: '#F0524F',
    dotColor: 'bg-[#F0524F]',
    isUrgent: true,
  },
  HIGH: {
    tier: 'HIGH',
    label: 'High',
    color: '#F59E0B',
    dotColor: 'bg-[#F59E0B]',
    isUrgent: false,
  },
  MEDIUM: {
    tier: 'MEDIUM',
    label: 'Medium',
    color: '#EAB308',
    dotColor: 'bg-[#EAB308]',
    isUrgent: false,
  },
  LOW: {
    tier: 'LOW',
    label: 'Low',
    color: '#6B7280',
    dotColor: 'bg-[#6B7280]',
    isUrgent: false,
  },
  NEEDS_REVIEW: {
    tier: 'NEEDS_REVIEW',
    label: 'Needs review',
    color: '#9BA3AF',
    dotColor: 'bg-[#9BA3AF]',
    isUrgent: false,
  },
};

/**
 * Normalizes severity based on defect type, estimated dimensions/depth, and model confidence.
 * Crucial rule: Detections with confidence < 0.50 (50%) are never labeled Critical.
 */
export function getNormalizedSeverity(params: {
  severity?: string | null;
  confidence?: number | null;
  type?: string | null;
  areaSqM?: number | null;
}): SeverityMeta {
  const conf = typeof params.confidence === 'number' ? params.confidence : 0.8;
  const rawSev = (params.severity || 'MEDIUM').toUpperCase();

  // If confidence is low (< 50%), degrade immediately to "Needs review" to avoid false panic
  if (conf < 0.5) {
    return SEVERITY_TOKENS.NEEDS_REVIEW;
  }

  // If flagged as CRITICAL, verify physical attributes or high confidence
  if (rawSev === 'CRITICAL') {
    if (conf >= 0.75 || (params.areaSqM && params.areaSqM >= 1.5)) {
      return SEVERITY_TOKENS.CRITICAL;
    }
    // Demote medium-confidence "critical" to high
    return SEVERITY_TOKENS.HIGH;
  }

  if (rawSev === 'HIGH') {
    return SEVERITY_TOKENS.HIGH;
  }

  if (rawSev === 'LOW') {
    return SEVERITY_TOKENS.LOW;
  }

  return SEVERITY_TOKENS.MEDIUM;
}
