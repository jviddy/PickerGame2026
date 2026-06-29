/**
 * Build-time scoring orchestration script
 * Loads tournament data, calculates scores, and generates output JSON files
 *
 * Usage: node buildScores.js
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadAllInputs, writeJSON } from '../src/scoring/io.js';
import { calculateTeamPoints } from '../src/scoring/calculateTeamPoints.js';
import { calculateEntrantTotals } from '../src/scoring/calculateEntrantTotals.js';
import {
  calculateCountryScores,
  calculateMatchPoints,
  calculateScoredMatches,
  calculateScoredTeams,
} from '../src/scoring/calculateCountryScores.js';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Format a number as a localized string (for console output)
 * @private
 * @param {number} num
 * @returns {string}
 */
function formatNumber(num) {
  return num.toLocaleString();
}

/**
 * Main build function
 * @returns {Promise<void>}
 */
async function main() {
  try {
    console.log('🎯 World Cup Fantasy Scoring Engine');
    console.log('=' .repeat(50));
    
    // Resolve data directory (parent of project root + /Data)
    const projectRoot = path.resolve(__dirname, '..');
    const workspaceRoot = path.resolve(projectRoot, '..');
    const dataDir = path.resolve(workspaceRoot, 'Data');
    
    console.log(`\n📂 Loading inputs from: ${dataDir}`);
    
    // Load all input files
    const { settings, teams, matches, results, entries } = await loadAllInputs(dataDir);
    
    console.log(`✓ Loaded ${formatNumber(teams.length)} teams`);
    console.log(`✓ Loaded ${formatNumber(matches.length)} matches`);
    console.log(`✓ Loaded ${formatNumber(results.length)} match results`);
    console.log(`✓ Loaded ${formatNumber(entries.length)} entries`);
    
    // Calculate country score display data (canonical scoring engine)
    console.log('\n🌍 Computing country score breakdowns...');
    const countryScores = calculateCountryScores(settings, teams, matches, results);
    console.log(`✓ Calculated country scores for ${formatNumber(countryScores.length)} teams`);

    // Calculate match score display data
    console.log('\n🧾 Computing match point breakdowns...');
    const matchPoints = calculateMatchPoints(settings, teams, matches, results);
    const scoredMatches = calculateScoredMatches(settings, teams, matches, results);
    console.log(`✓ Calculated match points for ${formatNumber(matchPoints.length)} matches`);

    // Store country score breakdowns on teams for the UI and static data
    console.log('\n🗂️ Updating team score records...');
    const scoredTeams = calculateScoredTeams(settings, teams, matches, results);
    console.log(`✓ Added round score records to ${formatNumber(scoredTeams.length)} teams`);

    // Legacy team points (for teamPoints.json export only)
    console.log('\n🔢 Computing legacy team points...');
    const teamPoints = calculateTeamPoints(settings, teams, matches, results);
    console.log(`✓ Calculated points for ${formatNumber(teams.length)} teams`);

    // Calculate entrant totals (paid entries only for leaderboard)
    // Uses countryScores (canonical engine) so leaderboard matches countries page exactly
    console.log('\n🏆 Computing entrant totals...');
    const paidEntries = entries.filter((e) => e.paid && !e.removed);
    const entrantTotals = calculateEntrantTotals(
      paidEntries,
      countryScores,
      teams,
      matches,
      results,
    );
    console.log(`✓ Calculated totals for ${formatNumber(paidEntries.length)} paid entrants (${formatNumber(entries.length)} total)`);

    // Build public entries list (all entries, public fields only)
    const publicEntries = entries
      .filter((e) => !e.removed)
      .map((e) => ({ teamName: e.teamName, entrantName: e.entrantName, paid: Boolean(e.paid) }))
      .sort((a, b) => (b.paid - a.paid) || a.entrantName.localeCompare(b.entrantName));

    // Tournament stats for display on leaderboard
    const playedResults = results.filter(r => r.homeScore != null && r.awayScore != null);
    const tournamentStats = {
      gamesPlayed:      playedResults.length,
      totalGoals:       playedResults.reduce((s, r) => s + r.homeScore + r.awayScore, 0),
      totalYellowCards: playedResults.reduce((s, r) => s + (r.homeYellow || 0) + (r.awayYellow || 0), 0),
      totalRedCards:    playedResults.reduce((s, r) => s + (r.homeRed || 0) + (r.awayRed || 0), 0),
    };

    // Build email hash lookup: SHA-256(normalised email) → [teamName, ...]
    // Hashes are safe to ship publicly — emails cannot be reversed from them
    const emailHashes = {};
    for (const entry of entries) {
      if (!entry.email || entry.removed) continue;
      const hash = crypto.createHash('sha256').update(entry.email.toLowerCase().trim()).digest('hex');
      if (!emailHashes[hash]) emailHashes[hash] = [];
      if (!emailHashes[hash].includes(entry.teamName)) emailHashes[hash].push(entry.teamName);
    }
    
    // Write output files
    console.log('\n💾 Writing output files...');

    const outputDirs = [
      dataDir,
      path.resolve(projectRoot, 'Data'),
    ];

    // Deterministic baseline: scores using only results from matches that kicked
    // off before 6am BST "yesterday" (the start of the previous 6am–6am window).
    // Delta = current scores − baseline = points earned since 6am yesterday.
    // No file snapshotting needed — recalculated correctly on every build.
    const _now = new Date();
    const _bstHour = parseInt(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false }).format(_now)
    );
    // Current BST date (rolls at 6am, not midnight)
    const _todayRef = _bstHour >= 6 ? _now : new Date(_now.getTime() - 24 * 60 * 60 * 1000);
    const _todayBSTStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(_todayRef);
    // Previous day's date string
    const [_ty, _tm, _td] = _todayBSTStr.split('-').map(Number);
    const _yesterdayBSTStr = new Date(Date.UTC(_ty, _tm - 1, _td - 1)).toISOString().slice(0, 10);
    // 6am BST on that previous day = 5am UTC (BST is UTC+1 throughout the tournament)
    const _baselineCutoff = new Date(`${_yesterdayBSTStr}T05:00:00Z`);

    // Build match kickoff time lookup
    const _matchDateMap = new Map(matches.map(m => [m.matchId, new Date(m.date)]));

    // Filter results to only matches that kicked off before the cutoff
    const _baselineResults = results.filter(r => {
      const d = _matchDateMap.get(r.matchId);
      return d && d < _baselineCutoff;
    });

    // Recalculate scores using canonical engine for the baseline
    const _baselineCountryScores = calculateCountryScores(settings, teams, matches, _baselineResults);
    const _baselineTotals        = calculateEntrantTotals(paidEntries, _baselineCountryScores, teams, matches, _baselineResults);

    const baseline = _baselineTotals.map(e => ({
      entrantTeamName: e.entrantTeamName,
      entrantName:     e.entrantName,
      totalPoints:     e.totalPoints,
      baselineDate:    _yesterdayBSTStr,
    }));

    for (const outputDir of outputDirs) {
      await writeJSON(path.join(outputDir, 'pointsBaseline.json'), baseline);
    }
    console.log(`✓ Built points baseline for scores before 6am BST ${_yesterdayBSTStr} (${_baselineResults.length} results)`);

    for (const outputDir of outputDirs) {
      const outputs = [
        ['teams.json', scoredTeams],
        ['matches.json', scoredMatches],
        ['teamPoints.json', teamPoints],
        ['entrantTotals.json', entrantTotals],
        ['countryScores.json', countryScores],
        ['matchPoints.json', matchPoints],
        ['publicEntries.json', publicEntries],
        ['emailHashes.json', emailHashes],
        ['tournamentStats.json', tournamentStats],
      ];

      for (const [fileName, data] of outputs) {
        const filePath = path.join(outputDir, fileName);
        await writeJSON(filePath, data);
        console.log(`✓ Written: ${filePath}`);
      }
    }

    // Copy pass-through files from root Data/ to PickerGame/Data/
    const passThroughFiles = ['posts.json', 'settings.json', 'predictions.json', 'matchReports.json'];
    for (const fileName of passThroughFiles) {
      const src = path.join(dataDir, fileName);
      const dest = path.join(path.resolve(projectRoot, 'Data'), fileName);
      try {
        await fs.copyFile(src, dest);
        console.log(`✓ Copied: ${fileName}`);
      } catch (_) {}
    }
    
    // Summary report
    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary');
    console.log('='.repeat(50));
    console.log(`Processed: ${formatNumber(results.length)} / ${formatNumber(matches.length)} matches`);
    console.log(`Tournament: ${settings.eventName || 'World Cup Fantasy'}`);
    
    console.log('\n🎖️ Top 5 Entrants:');
    entrantTotals.slice(0, 5).forEach((entrant, idx) => {
      const teamCount = entrant.teamBreakdown.length;
      const remaining = entrant.teamsRemaining;
      console.log(
        `  ${idx + 1}. ${entrant.entrantName} (${entrant.entrantTeamName}): ` +
        `${formatNumber(entrant.totalPoints)} pts | ` +
        `${remaining}/${teamCount} teams remaining`,
      );
    });
    
    if (entrantTotals.length > 5) {
      console.log(`  ... and ${formatNumber(entrantTotals.length - 5)} more entrants`);
    }
    
    console.log('\n✅ Build complete!\n');
  } catch (error) {
    console.error('\n❌ Build failed:');
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run main function
main();
