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

function getEmptyRoundBreakdown(roundCode) {
  return {
    roundCode,
    result: 0,
    goalsScored: 0,
    goalsConceded: 0,
    penalties: 0,
    disciplinary: 0,
    roundQualification: 0,
    qualification: 0,
    total: 0,
    matches: [],
  };
}

function createRoundBreakdowns() {
  return ROUND_ORDER.map((roundCode) => getEmptyRoundBreakdown(roundCode));
}

function getEmptyCategoryTotals() {
  return {
    result: 0,
    goalsScored: 0,
    goalsConceded: 0,
    penalties: 0,
    disciplinary: 0,
    roundQualification: 0,
    qualification: 0,
    total: 0,
  };
}

function getRoundBreakdown(roundBreakdowns, roundCode) {
  let round = roundBreakdowns.find((item) => item.roundCode === roundCode);
  if (!round) {
    round = getEmptyRoundBreakdown(roundCode);
    roundBreakdowns.push(round);
  }
  return round;
}

function addItem(items, label, value, category) {
  if (!value) return;
  items.push({ label, value, category });
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
  const categories = {
    result: 0,
    goalsScored: 0,
    goalsConceded: 0,
    penalties: 0,
    disciplinary: 0,
    qualification: 0,
  };

  const resultType = getResultType(goalsFor, goalsAgainst, penaltiesFor, penaltiesAgainst, match.roundCode);
  if (resultType === 'win') {
    categories.result += pointRules.win || 0;
    addItem(items, 'Win', pointRules.win || 0, 'result');
  }
  if (resultType === 'draw') {
    categories.result += pointRules.draw || 0;
    addItem(items, 'Draw', pointRules.draw || 0, 'result');
  }

  categories.goalsScored += goalsFor * (pointRules.goalScored || 0);
  categories.goalsConceded += goalsAgainst * (pointRules.goalConceded || 0);
  categories.disciplinary +=
    ((yellowCards || 0) * (pointRules.yellowCard || 0)) +
    ((redCards || 0) * (pointRules.redCard || 0));
  addItem(items, 'GF', categories.goalsScored, 'goalsScored');
  addItem(items, 'GA', categories.goalsConceded, 'goalsConceded');
  addItem(items, 'YC', (yellowCards || 0) * (pointRules.yellowCard || 0), 'disciplinary');
  addItem(items, 'RC', (redCards || 0) * (pointRules.redCard || 0), 'disciplinary');

  if (qualified) {
    if (match.roundCode === 'GS1' || match.roundCode === 'GS2' || match.roundCode === 'GS3') {
      categories.qualification += pointRules.qualifyKnockout || 0;
      addItem(items, 'Qual', pointRules.qualifyKnockout || 0, 'qualification');
    } else if (match.roundCode !== 'F') {
      categories.qualification += pointRules.qualifyNextRound || 0;
      addItem(items, 'Advance', pointRules.qualifyNextRound || 0, 'qualification');
    }
  }

  if (match.roundCode === 'F' && resultType === 'win') {
    categories.qualification += pointRules.winFinal || 0;
    addItem(items, 'Final', pointRules.winFinal || 0, 'qualification');
  }

  const total = items.reduce((sum, item) => sum + item.value, 0);
  return {
    resultType,
    goalsFor,
    goalsAgainst,
    penaltiesFor,
    penaltiesAgainst,
    yellowCards: yellowCards || 0,
    redCards: redCards || 0,
    qualified: Boolean(qualified),
    categories,
    items,
    total,
  };
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
    const scoresByRound = createRoundBreakdowns();
    const pointsTotals = getEmptyCategoryTotals();
    ROUND_ORDER.forEach((round) => {
      if (!(round in byRound)) byRound[round] = 0;
      detailsByRound[round] = [];
    });

    matches.forEach((match) => {
      const isTeamMatch = match.homeTeam === team.countryName || match.awayTeam === team.countryName;
      if (!isTeamMatch) return;

      const result = getResultById(results, match.matchId);
      if (!isPlayed(result)) return;

      const points = calculateTeamMatchPoints(team, match, result, settings);
      if (!(match.roundCode in byRound)) {
        byRound[match.roundCode] = 0;
        detailsByRound[match.roundCode] = [];
      }

      byRound[match.roundCode] += points.total;
      const roundBreakdown = getRoundBreakdown(scoresByRound, match.roundCode);
      roundBreakdown.result += points.categories.result;
      roundBreakdown.goalsScored += points.categories.goalsScored;
      roundBreakdown.goalsConceded += points.categories.goalsConceded;
      roundBreakdown.penalties += points.categories.penalties;
      roundBreakdown.disciplinary += points.categories.disciplinary;
      roundBreakdown.roundQualification += points.categories.qualification;
      roundBreakdown.qualification += points.categories.qualification;
      roundBreakdown.total += points.total;
      pointsTotals.result += points.categories.result;
      pointsTotals.goalsScored += points.categories.goalsScored;
      pointsTotals.goalsConceded += points.categories.goalsConceded;
      pointsTotals.penalties += points.categories.penalties;
      pointsTotals.disciplinary += points.categories.disciplinary;
      pointsTotals.roundQualification += points.categories.qualification;
      pointsTotals.qualification += points.categories.qualification;
      pointsTotals.total += points.total;
      roundBreakdown.matches.push({
        matchId: match.matchId,
        date: match.date,
        fixture: getFixtureLabel(teams, match),
        result: points.resultType,
        goalsFor: points.goalsFor,
        goalsAgainst: points.goalsAgainst,
        penaltiesFor: points.penaltiesFor,
        penaltiesAgainst: points.penaltiesAgainst,
        yellowCards: points.yellowCards,
        redCards: points.redCards,
        qualified: points.qualified,
        points: points.items,
        total: points.total,
      });
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
      pointsTotals,
      scoresByRound,
      byRound,
      detailsByRound,
    };
  });
}

export function calculateScoredTeams(settings, teams, matches, results) {
  const scoresByCountry = new Map(
    calculateCountryScores(settings, teams, matches, results).map((country) => [
      country.countryName,
      country,
    ]),
  );

  return teams.map((team) => {
    const score = scoresByCountry.get(team.countryName);
    return {
      ...team,
      inCompetition: score?.inCompetition ?? true,
      totalPoints: score?.totalPoints ?? 0,
      pointsTotals: score?.pointsTotals ?? getEmptyCategoryTotals(),
      scoresByRound: score?.scoresByRound ?? createRoundBreakdowns(),
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

export function calculateScoredMatches(settings, teams, matches, results) {
  return matches.map((match) => {
    const result = getResultById(results, match.matchId);
    if (!isPlayed(result)) {
      return {
        ...match,
        played: false,
        result: null,
        pickerGamePoints: null,
      };
    }

    const homeTeam = getTeam(teams, match.homeTeam);
    const awayTeam = getTeam(teams, match.awayTeam);
    const homePoints = homeTeam ? calculateTeamMatchPoints(homeTeam, match, result, settings) : null;
    const awayPoints = awayTeam ? calculateTeamMatchPoints(awayTeam, match, result, settings) : null;
    const hasPenalties = result.homePenalties !== null && result.awayPenalties !== null;

    return {
      ...match,
      played: true,
      result: {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        homePenalties: result.homePenalties,
        awayPenalties: result.awayPenalties,
        wentToPenalties: hasPenalties,
        homeYellow: result.homeYellow || 0,
        awayYellow: result.awayYellow || 0,
        homeRed: result.homeRed || 0,
        awayRed: result.awayRed || 0,
        homeQualified: Boolean(result.homeQualified),
        awayQualified: Boolean(result.awayQualified),
      },
      pickerGamePoints: {
        home: homePoints,
        away: awayPoints,
        total: (homePoints?.total || 0) + (awayPoints?.total || 0),
      },
    };
  });
}
