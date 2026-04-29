/**
 * Round normalization and classification utilities
 * Standardizes various round naming conventions into canonical keys
 */

/** @type {Object<string, string>} Mapping of common variant names to canonical round keys */
const ROUND_VARIANTS = {
  // Group stage
  'group stage': 'GS1',
  'group stage - matchday 1': 'GS1',
  'matchday 1': 'GS1',
  'gs1': 'GS1',
  'group 1': 'GS1',
  
  'group stage - matchday 2': 'GS2',
  'matchday 2': 'GS2',
  'gs2': 'GS2',
  'group 2': 'GS2',
  
  'group stage - matchday 3': 'GS3',
  'matchday 3': 'GS3',
  'gs3': 'GS3',
  'group 3': 'GS3',
  
  // Knockout rounds
  'round of 32': 'R32',
  'r32': 'R32',
  
  'round of 16': 'R16',
  'r16': 'R16',
  
  'quarter-final': 'QF',
  'quarterfinal': 'QF',
  'qf': 'QF',
  
  'semi-final': 'SF',
  'semifinal': 'SF',
  'sf': 'SF',

  'third place': 'TPP',
  'third-place': 'TPP',
  'third place play-off': 'TPP',
  'third-place play-off': 'TPP',
  'third place playoff': 'TPP',
  'third-place playoff': 'TPP',
  'tpp': 'TPP',
  
  'final': 'F',
  'f': 'F',
};

/** @type {string[]} Canonical round keys in order */
const CANONICAL_ROUNDS = ['GS1', 'GS2', 'GS3', 'R32', 'R16', 'QF', 'SF', 'TPP', 'F'];

/** @type {string[]} Knockout stage rounds */
const KNOCKOUT_ROUNDS = ['R32', 'R16', 'QF', 'SF', 'TPP', 'F'];

/**
 * Normalise a round string to canonical form
 * @param {string} round - Raw round string from matches.json
 * @returns {string} Canonical round key
 * @throws {Error} If round cannot be normalized
 */
export function normalizeRound(round) {
  if (!round || typeof round !== 'string') {
    throw new Error(`Invalid round value: ${round}`);
  }
  
  const normalized = ROUND_VARIANTS[round.toLowerCase().trim()];
  if (!normalized) {
    throw new Error(
      `Unknown round: "${round}". Supported: ${Object.keys(ROUND_VARIANTS).join(', ')}`
    );
  }
  
  return normalized;
}

/**
 * Check if a round is a knockout stage
 * @param {string} canonicalRound - Canonical round key (e.g., 'QF')
 * @returns {boolean}
 */
export function isKnockoutRound(canonicalRound) {
  return KNOCKOUT_ROUNDS.includes(canonicalRound);
}

/**
 * Check if a round is a group stage match
 * @param {string} canonicalRound - Canonical round key
 * @returns {boolean}
 */
export function isGroupStage(canonicalRound) {
  return canonicalRound.startsWith('GS');
}

/**
 * Determine if a team qualifies to knockout after a group stage result
 * Transition: GS3 (final group match) → R32 (first knockout round)
 * @param {string} canonicalRound - Current match's canonical round
 * @returns {boolean} True if this round marks transition to knockout
 */
export function isTransitionToKnockout(canonicalRound) {
  return canonicalRound === 'GS3';
}

/**
 * Get initial empty scores object for all rounds
 * @returns {Object<string, number>}
 */
export function getEmptyRoundScores() {
  const scores = {};
  CANONICAL_ROUNDS.forEach((round) => {
    scores[round] = 0;
  });
  return scores;
}

/**
 * Get initial empty scores object for all categories
 * @returns {Object<string, number>}
 */
export function getEmptyCategoryScores() {
  return {
    win: 0,
    draw: 0,
    scoring: 0,
    conceding: 0,
    yellowCard: 0,
    redCard: 0,
    qualifyKnockout: 0,
    qualifyNextRound: 0,
    winFinal: 0,
  };
}
