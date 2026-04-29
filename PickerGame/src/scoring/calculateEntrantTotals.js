/**
 * Entrant totals calculation engine
 * Aggregates team points into individual entrant scores
 */

import { isKnockoutRound, getEmptyRoundScores } from './roundMapping.js';

/**
 * Determine if a team is eliminated from the competition
 * @private
 * @param {string} teamName - Team name to check
 * @param {any} matches - Matches array
 * @param {any} results - Results array
 * @returns {boolean} True if team is eliminated
 */
function isTeamEliminated(teamName, teams, matches, results) {
  const team = teams.find((candidate) => candidate.countryName === teamName);
  if (!team) {
    return false;
  }

  // Build result lookup by matchId for quick access
  const resultsByMatchId = new Map();
  results.forEach((result) => {
    resultsByMatchId.set(result.matchId, result);
  });
  
  // Check each knockout match result
  for (const match of matches) {
    const result = resultsByMatchId.get(match.matchId);
    
    if (!result) {
      // No result yet for this match, so team still alive
      continue;
    }
    
    const isHomeTeam = match.homeTeam === team.groupId || match.homeTeam === team.countryName;
    const isAwayTeam = match.awayTeam === team.groupId || match.awayTeam === team.countryName;
    
    if (!isHomeTeam && !isAwayTeam) {
      continue;
    }
    
    if (result.homeScore === null || result.awayScore === null) {
      continue;
    }

    const qualified = isHomeTeam ? result.homeQualified : result.awayQualified;
    const roundKey = match.roundCode || match.round;
    
    // If this is a knockout match and team didn't qualify, team is eliminated
    if (isKnockoutRound(roundKey) && !qualified) {
      return true;
    }
  }

  const groupMatches = matches.filter((match) => {
    const isHomeTeam = match.homeTeam === team.groupId || match.homeTeam === team.countryName;
    const isAwayTeam = match.awayTeam === team.groupId || match.awayTeam === team.countryName;
    const roundKey = match.roundCode || match.round;
    return roundKey?.startsWith('GS') && (isHomeTeam || isAwayTeam);
  });

  const playedGroupMatches = groupMatches.filter((match) => {
    const result = resultsByMatchId.get(match.matchId);
    return result && result.homeScore !== null && result.awayScore !== null;
  });

  if (groupMatches.length && playedGroupMatches.length === groupMatches.length) {
    const qualifiedFromAnyGroupMatch = playedGroupMatches.some((match) => {
      const result = resultsByMatchId.get(match.matchId);
      const isHomeTeam = match.homeTeam === team.groupId || match.homeTeam === team.countryName;
      return isHomeTeam ? result.homeQualified : result.awayQualified;
    });

    return !qualifiedFromAnyGroupMatch;
  }
  
  return false;
}

/**
 * Validate entrant input data
 * @private
 * @param {any} entries - Entries array
 * @param {Map} teamsByName - Map of team names (lowercase key)
 * @throws {Error} If validation fails
 */
function validateEntries(entries, teamsByName) {
  if (!Array.isArray(entries)) {
    throw new Error('Entries must be an array');
  }
  
  entries.forEach((entry, idx) => {
    if (!entry.entrantName) {
      throw new Error(`Entry ${idx} missing entrantName`);
    }
    
    if (!Array.isArray(entry.selectedTeams)) {
      throw new Error(`Entry ${entry.entrantName} selectedTeams must be an array`);
    }
    
    entry.selectedTeams.forEach((teamName) => {
      const key = teamName.toLowerCase();
      if (!teamsByName.has(key)) {
        throw new Error(
          `Entry ${entry.entrantName} selected unknown team: ${teamName}`,
        );
      }
    });
  });
}

/**
 * Calculate totals for all entrants
 * @param {any} entries - Entries array
 * @param {Array} teamPoints - Array of team point objects (from calculateTeamPoints)
 * @param {any} teams - Teams array (for validation)
 * @param {any} matches - Matches array (for elimination check)
 * @param {any} results - Results array (for elimination check)
 * @returns {Array} Array of entrant total objects
 * @throws {Error} If validation or calculation fails
 */
export function calculateEntrantTotals(entries, teamPoints, teams, matches, results) {
  // Build team name lookup (case-insensitive)
  const teamsByName = new Map();
  teams.forEach((team) => {
    teamsByName.set(team.countryName.toLowerCase(), team);
  });
  
  validateEntries(entries, teamsByName);
  
  // Build team points lookup
  const pointsByTeam = new Map();
  teamPoints.forEach((tp) => {
    pointsByTeam.set(tp.countryName, tp);
  });
  
  // Calculate totals for each entrant
  const entrantTotals = entries.map((entry) => {
    const teamBreakdown = [];
    let totalPoints = 0;
    const byRound = getEmptyRoundScores();
    let teamsRemaining = 0;
    
    // Sum up points from selected teams
    entry.selectedTeams.forEach((teamName) => {
      const tp = pointsByTeam.get(teamName);
      
      if (tp) {
        // Add to breakdown
        teamBreakdown.push({
          countryName: teamName,
          points: tp.totalPoints,
        });
        
        // Accumulate totals
        totalPoints += tp.totalPoints;
        
        // Accumulate by round
        Object.keys(byRound).forEach((round) => {
          byRound[round] += tp.byRound[round];
        });
      }
    });
    
    // Determine teams still in competition
    entry.selectedTeams.forEach((teamName) => {
      if (!isTeamEliminated(teamName, teams, matches, results)) {
        teamsRemaining += 1;
      }
    });
    
    return {
      entrantTeamName: entry.teamName || '',
      entrantName: entry.entrantName,
      entrantEmail: entry.email || '',
      totalPoints,
      teamsRemaining,
      byRound,
      selectedTeams: entry.selectedTeams,
      teamBreakdown: teamBreakdown.sort((a, b) => b.points - a.points),
      tieBreakers: entry.tieBreakerAnswers || [],
    };
  });
  
  // Sort by total points (descending), then by teams remaining (descending)
  return entrantTotals.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return b.teamsRemaining - a.teamsRemaining;
  });
}
