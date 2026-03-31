/**
 * Team points calculation engine
 * Computes points for each team based on match results
 */

import {
  normalizeRound,
  isKnockoutRound,
  isTransitionToKnockout,
  getEmptyRoundScores,
  getEmptyCategoryScores,
} from './roundMapping.js';

/**
 * Validate and normalize all input data
 * @param {any} settings - Settings object
 * @param {any} teams - Teams array
 * @param {any} matches - Matches array
 * @param {any} results - Results array
 * @returns {Object} Validated/normalized inputs
 * @throws {Error} If validation fails
 */
function validateInputs(settings, teams, matches, results) {
  if (!settings || typeof settings !== 'object') {
    throw new Error('Settings must be a valid object');
  }
  
  if (!Array.isArray(teams)) {
    throw new Error('Teams must be an array');
  }
  
  if (!Array.isArray(matches)) {
    throw new Error('Matches must be an array');
  }
  
  if (!Array.isArray(results)) {
    throw new Error('Results must be an array');
  }
  
  // Build team lookup: maps team code/name to full team object
  const teamsById = new Map();
  const teamsByName = new Map();
  
  teams.forEach((team) => {
    if (!team.countryName) {
      throw new Error('Each team must have countryName');
    }
    teamsById.set(team.groupId, team);
    teamsByName.set(team.countryName.toLowerCase(), team);
  });
  
  // Build match lookup by matchId
  const matchesById = new Map();
  const resultIds = new Set();
  
  // First pass: identify which matches have results
  const matchesWithResults = new Set();
  results.forEach((result) => {
    if (!result.matchId) {
      throw new Error('Each result must have matchId');
    }
    if (resultIds.has(result.matchId)) {
      throw new Error(`Duplicate result matchId: ${result.matchId}`);
    }
    resultIds.add(result.matchId);
    // Only consider matches with actual scores as "having results"
    if (result.homeScore !== null && result.awayScore !== null) {
      matchesWithResults.add(result.matchId);
    }
  });
  
  // Second pass: validate teams only for matches with results
  matches.forEach((match) => {
    if (!match.matchId) {
      throw new Error('Each match must have matchId');
    }
    if (matchesById.has(match.matchId)) {
      throw new Error(`Duplicate matchId: ${match.matchId}`);
    }
    
    matchesById.set(match.matchId, match);
    
    // Only validate team references for matches that have results
    if (matchesWithResults.has(match.matchId)) {
      if (!teamsById.has(match.homeTeam) && !teamsByName.has(match.homeTeam.toLowerCase())) {
        throw new Error(`Unknown team in match ${match.matchId}: ${match.homeTeam}`);
      }
      if (!teamsById.has(match.awayTeam) && !teamsByName.has(match.awayTeam.toLowerCase())) {
        throw new Error(`Unknown team in match ${match.matchId}: ${match.awayTeam}`);
      }
    }
  });
  
  return { settings, teams, matches, results, teamsById, teamsByName, matchesById };
}

/**
 * Resolve team identifier to team object
 * @private
 * @param {string} teamIdentifier - Team code or country name
 * @param {Map} teamsById - Map of team codes to teams
 * @param {Map} teamsByName - Map of team names to teams
 * @returns {Object} Team object
 * @throws {Error} If team not found
 */
function resolveTeam(teamIdentifier, teamsById, teamsByName) {
  let team = teamsById.get(teamIdentifier);
  if (!team) {
    team = teamsByName.get(teamIdentifier.toLowerCase());
  }
  if (!team) {
    throw new Error(`Unknown team: ${teamIdentifier}`);
  }
  return team;
}

/**
 * Calculate points for a single team in a match result
 * @private
 * @param {string} teamName - Team name
 * @param {number} goalsScored - Goals this team scored
 * @param {number} goalsConceded - Goals this team conceded
 * @param {number} yellowCards - Yellow cards received
 * @param {number} redCards - Red cards received
 * @param {boolean} didQualify - Did this team qualify/progress
 * @param {string} result - Match result for this team ('win', 'draw', 'loss')
 * @param {Object} pointsConfig - Points configuration from settings
 * @param {string} canonicalRound - Normalized round key
 * @returns {Object} Points breakdown by category
 */
function calculateTeamPointsForMatch(
  teamName,
  goalsScored,
  goalsConceded,
  yellowCards,
  redCards,
  didQualify,
  result,
  pointsConfig,
  canonicalRound,
) {
  const points = getEmptyCategoryScores();
  
  // Result points - use field names from actual settings.json
  if (result === 'win') {
    points.win = pointsConfig.win || 0;
  } else if (result === 'draw') {
    points.draw = pointsConfig.draw || 0;
  }
  
  // Goal-based points - use actual field names
  points.scoring = (goalsScored || 0) * (pointsConfig.goalScored || pointsConfig.scoring || 0);
  points.conceding = (goalsConceded || 0) * (pointsConfig.goalConceded || pointsConfig.conceding || 0);
  
  // Card points
  points.yellowCard = (yellowCards || 0) * (pointsConfig.yellowCard || 0);
  points.redCard = (redCards || 0) * (pointsConfig.redCard || 0);
  
  // Qualification points
  if (didQualify) {
    points.qualifyNextRound = pointsConfig.qualifyNextRound || 0;
    
    // Bonus for first-time knockout qualification (transition from group stage)
    if (isTransitionToKnockout(canonicalRound)) {
      points.qualifyKnockout = pointsConfig.qualifyKnockout || 0;
    }
  }
  
  // Final winner bonus
  if (canonicalRound === 'F' && result === 'win') {
    points.winFinal = pointsConfig.winFinal || 0;
  }
  
  return points;
}

/**
 * Calculate total points for all teams based on results
 * @param {any} settings - Settings configuration
 * @param {any} teams - Teams array
 * @param {any} matches - Matches array
 * @param {any} results - Results array (partial, only played matches)
 * @returns {Array} Array of team point objects with breakdown
 * @throws {Error} If validation or calculation fails
 */
export function calculateTeamPoints(settings, teams, matches, results) {
  const { matchesById, teamsById, teamsByName } = validateInputs(settings, teams, matches, results);
  
  // Initialize point trackers for all teams
  const teamPoints = new Map();
  teams.forEach((team) => {
    teamPoints.set(team.countryName, {
      countryName: team.countryName,
      totalPoints: 0,
      byRound: getEmptyRoundScores(),
      byCategory: getEmptyCategoryScores(),
    });
  });
  
  // Process each result - skip null scores (unplayed matches)
  results.forEach((result) => {
    // Skip results with null scores (match not played yet)
    if (result.homeScore === null || result.awayScore === null) {
      return;
    }
    
    const match = matchesById.get(result.matchId);
    if (!match) {
      throw new Error(`Result references unknown matchId: ${result.matchId}`);
    }
    
    // Resolve team identifiers to actual teams
    const homeTeam = resolveTeam(match.homeTeam, teamsById, teamsByName);
    const awayTeam = resolveTeam(match.awayTeam, teamsById, teamsByName);
    
    // Get or create points entry for these teams
    if (!teamPoints.has(homeTeam.countryName)) {
      teamPoints.set(homeTeam.countryName, {
        countryName: homeTeam.countryName,
        totalPoints: 0,
        byRound: getEmptyRoundScores(),
        byCategory: getEmptyCategoryScores(),
      });
    }
    if (!teamPoints.has(awayTeam.countryName)) {
      teamPoints.set(awayTeam.countryName, {
        countryName: awayTeam.countryName,
        totalPoints: 0,
        byRound: getEmptyRoundScores(),
        byCategory: getEmptyCategoryScores(),
      });
    }
    
    const homeTeamData = teamPoints.get(homeTeam.countryName);
    const awayTeamData = teamPoints.get(awayTeam.countryName);
    
    // Normalize round - use roundCode if available, otherwise parse round field
    let canonicalRound;
    try {
      if (match.roundCode) {
        canonicalRound = match.roundCode;
      } else {
        canonicalRound = normalizeRound(match.round);
      }
    } catch (error) {
      throw new Error(`Invalid round in match ${match.matchId}: ${error.message}`);
    }
    
    // Determine match results
    const homeGoals = result.homeScore;
    const awayGoals = result.awayScore;
    let homeResult = 'loss';
    let awayResult = 'loss';
    
    if (homeGoals > awayGoals) {
      homeResult = 'win';
      awayResult = 'loss';
    } else if (homeGoals < awayGoals) {
      homeResult = 'loss';
      awayResult = 'win';
    } else {
      homeResult = 'draw';
      awayResult = 'draw';
    }
    
    // Calculate points for home team
    const homePoints = calculateTeamPointsForMatch(
      homeTeam.countryName,
      homeGoals,
      awayGoals,
      result.homeYellow || 0,
      result.homeRed || 0,
      result.homeQualified || false,
      homeResult,
      settings.points,
      canonicalRound,
    );
    
    // Calculate points for away team
    const awayPoints = calculateTeamPointsForMatch(
      awayTeam.countryName,
      awayGoals,
      homeGoals,
      result.awayYellow || 0,
      result.awayRed || 0,
      result.awayQualified || false,
      awayResult,
      settings.points,
      canonicalRound,
    );
    
    // Accumulate home team points
    Object.entries(homePoints).forEach(([category, value]) => {
      homeTeamData.byCategory[category] += value;
      homeTeamData.totalPoints += value;
    });
    homeTeamData.byRound[canonicalRound] += Object.values(homePoints).reduce((a, b) => a + b, 0);
    
    // Accumulate away team points
    Object.entries(awayPoints).forEach(([category, value]) => {
      awayTeamData.byCategory[category] += value;
      awayTeamData.totalPoints += value;
    });
    awayTeamData.byRound[canonicalRound] += Object.values(awayPoints).reduce((a, b) => a + b, 0);
  });
  
  // Convert to array and sort by total points descending
  return Array.from(teamPoints.values()).sort(
    (a, b) => b.totalPoints - a.totalPoints,
  );
}
