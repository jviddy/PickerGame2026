import { getEmptyRoundScores } from './roundMapping.js';

const ROUND_ORDER = ['GS1', 'GS2', 'GS3', 'R32', 'R16', 'QF', 'SF', 'TPP', 'F'];

function getResultById(results, matchId) {
  return results.find((result) => result.matchId === matchId);
}

function isPlayed(result) {
  return result && result.homeScore !== null && result.awayScore !== null;
}

function getTeam(teams, teamRef) {
  return teams.find((team) => team.groupId === teamRef || team.countryName === teamRef);
}

function getResultType(goalsFor, goalsAgainst, penaltiesFor, penaltiesAgainst, roundCode) {
  if (goalsFor > goalsAgainst) return 'win';
  if (goalsFor < goalsAgainst) return 'loss';
  if (!roundCode.includes('GS') && penaltiesFor !== null && penaltiesAgainst !== null) {
    return penaltiesFor > penaltiesAgainst ? 'win' : 'loss';
  }
  return 'draw';
}

function getFixtureLabel(teams, match) {
  const home = getTeam(teams, match.homeTeam)?.countryName || match.homeTeam;
  const away = getTeam(teams, match.awayTeam)?.countryName || match.awayTeam;
  return `${home} v ${away}`;
}

function calculateTeamMatchPoints(team, match, result, settings) {
  const isHome = match.homeTeam === team.groupId || match.homeTeam === team.countryName;
  const goalsFor = isHome ? result.homeScore : result.awayScore;
  const goalsAgainst = isHome ? result.awayScore : result.homeScore;
  const penaltiesFor = isHome ? result.homePenalties : result.awayPenalties;
  const penaltiesAgainst = isHome ? result.awayPenalties : result.homePenalties;
  const yellowCards = isHome ? result.homeYellow : result.awayYellow;
  const redCards = isHome ? result.homeRed : result.awayRed;
  const qualified = isHome ? result.homeQualified : result.awayQualified;
  const pointRules = settings.points || {};
  const items = [];

  const addItem = (label, value) => {
    if (!value) return;
    items.push({ label, value });
  };

  const resultType = getResultType(goalsFor, goalsAgainst, penaltiesFor, penaltiesAgainst, match.roundCode);
  if (resultType === 'win') addItem('Win', pointRules.win || 0);
  if (resultType === 'draw') addItem('Draw', pointRules.draw || 0);

  addItem('GF', goalsFor * (pointRules.goalScored || 0));
  addItem('GA', goalsAgainst * (pointRules.goalConceded || 0));
  addItem('YC', (yellowCards || 0) * (pointRules.yellowCard || 0));
  addItem('RC', (redCards || 0) * (pointRules.redCard || 0));

  if (qualified) {
    if (match.roundCode === 'GS1' || match.roundCode === 'GS2' || match.roundCode === 'GS3') {
      addItem('Qual', pointRules.qualifyKnockout || 0);
    } else if (match.roundCode !== 'F') {
      addItem('Advance', pointRules.qualifyNextRound || 0);
    }
  }

  if (match.roundCode === 'F' && resultType === 'win') {
    addItem('Final', pointRules.winFinal || 0);
  }

  const total = items.reduce((sum, item) => sum + item.value, 0);
  return { items, total };
}

function isTeamInCompetition(team, matches, results) {
  const teamMatches = matches
    .filter((match) => match.homeTeam === team.groupId || match.awayTeam === team.groupId)
    .map((match) => ({ match, result: getResultById(results, match.matchId) }))
    .filter(({ result }) => isPlayed(result));

  const knockoutLoss = teamMatches.some(({ match, result }) => {
    if (match.roundCode.includes('GS')) return false;

    const isHome = match.homeTeam === team.groupId;
    const goalsFor = isHome ? result.homeScore : result.awayScore;
    const goalsAgainst = isHome ? result.awayScore : result.homeScore;
    const penaltiesFor = isHome ? result.homePenalties : result.awayPenalties;
    const penaltiesAgainst = isHome ? result.awayPenalties : result.homePenalties;

    return getResultType(goalsFor, goalsAgainst, penaltiesFor, penaltiesAgainst, match.roundCode) === 'loss';
  });

  if (knockoutLoss) return false;

  const groupMatches = matches.filter((match) =>
    match.roundCode.includes('GS') && (match.homeTeam === team.groupId || match.awayTeam === team.groupId)
  );
  const playedGroupMatches = groupMatches
    .map((match) => ({ match, result: getResultById(results, match.matchId) }))
    .filter(({ result }) => isPlayed(result));

  if (groupMatches.length && playedGroupMatches.length === groupMatches.length) {
    return playedGroupMatches.some(({ match, result }) => {
      const isHome = match.homeTeam === team.groupId;
      return isHome ? result.homeQualified : result.awayQualified;
    });
  }

  return true;
}

export function calculateCountryScores(settings, teams, matches, results) {
  return teams.map((team) => {
    const byRound = getEmptyRoundScores();
    const detailsByRound = {};
    ROUND_ORDER.forEach((round) => {
      if (!(round in byRound)) byRound[round] = 0;
      detailsByRound[round] = [];
    });

    matches.forEach((match) => {
      const isTeamMatch = match.homeTeam === team.groupId || match.awayTeam === team.groupId;
      if (!isTeamMatch) return;

      const result = getResultById(results, match.matchId);
      if (!isPlayed(result)) return;

      const points = calculateTeamMatchPoints(team, match, result, settings);
      if (!(match.roundCode in byRound)) {
        byRound[match.roundCode] = 0;
        detailsByRound[match.roundCode] = [];
      }

      byRound[match.roundCode] += points.total;
      detailsByRound[match.roundCode].push({
        matchId: match.matchId,
        date: match.date,
        roundCode: match.roundCode,
        fixture: getFixtureLabel(teams, match),
        points,
      });
    });

    const totalPoints = Object.values(byRound).reduce((sum, value) => sum + value, 0);

    return {
      countryName: team.countryName,
      group: team.group,
      groupId: team.groupId,
      fifaRank: team.fifaRank,
      cost: team.cost,
      flagUrl: team.flagUrl,
      active: team.active,
      inCompetition: isTeamInCompetition(team, matches, results),
      totalPoints,
      byRound,
      detailsByRound,
    };
  });
}

export function calculateMatchPoints(settings, teams, matches, results) {
  return matches.map((match) => {
    const result = getResultById(results, match.matchId);
    if (!isPlayed(result)) {
      return {
        matchId: match.matchId,
        played: false,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homePoints: null,
        awayPoints: null,
        totalPoints: 0,
      };
    }

    const homeTeam = getTeam(teams, match.homeTeam);
    const awayTeam = getTeam(teams, match.awayTeam);
    const homePoints = homeTeam ? calculateTeamMatchPoints(homeTeam, match, result, settings) : null;
    const awayPoints = awayTeam ? calculateTeamMatchPoints(awayTeam, match, result, settings) : null;

    return {
      matchId: match.matchId,
      played: true,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homePoints,
      awayPoints,
      totalPoints: (homePoints?.total || 0) + (awayPoints?.total || 0),
    };
  });
}
