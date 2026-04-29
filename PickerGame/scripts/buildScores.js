/**
 * Build-time scoring orchestration script
 * Loads tournament data, calculates scores, and generates output JSON files
 *
 * Usage: node buildScores.js
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { loadAllInputs, writeJSON } from '../src/scoring/io.js';
import { calculateTeamPoints } from '../src/scoring/calculateTeamPoints.js';
import { calculateEntrantTotals } from '../src/scoring/calculateEntrantTotals.js';
import { calculateCountryScores, calculateMatchPoints } from '../src/scoring/calculateCountryScores.js';

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
    
    // Calculate team points
    console.log('\n🔢 Computing team points...');
    let teamPoints = calculateTeamPoints(settings, teams, matches, results);
    console.log(`✓ Calculated points for ${formatNumber(teams.length)} teams`);

    // Calculate country score display data
    console.log('\n🌍 Computing country score breakdowns...');
    const countryScores = calculateCountryScores(settings, teams, matches, results);
    const countryStatus = new Map(countryScores.map((country) => [
      country.countryName,
      country.inCompetition,
    ]));
    teamPoints = teamPoints.map((team) => ({
      ...team,
      inCompetition: countryStatus.get(team.countryName) ?? true,
    }));
    console.log(`✓ Calculated country scores for ${formatNumber(countryScores.length)} teams`);

    // Calculate match score display data
    console.log('\n🧾 Computing match point breakdowns...');
    const matchPoints = calculateMatchPoints(settings, teams, matches, results);
    console.log(`✓ Calculated match points for ${formatNumber(matchPoints.length)} matches`);
    
    // Calculate entrant totals
    console.log('\n🏆 Computing entrant totals...');
    const entrantTotals = calculateEntrantTotals(
      entries,
      teamPoints,
      teams,
      matches,
      results,
    );
    console.log(`✓ Calculated totals for ${formatNumber(entries.length)} entrants`);
    
    // Write output files
    console.log('\n💾 Writing output files...');
    
    const outputDirs = [
      dataDir,
      path.resolve(projectRoot, 'Data'),
    ];

    for (const outputDir of outputDirs) {
      const outputs = [
        ['teamPoints.json', teamPoints],
        ['entrantTotals.json', entrantTotals],
        ['countryScores.json', countryScores],
        ['matchPoints.json', matchPoints],
      ];

      for (const [fileName, data] of outputs) {
        const filePath = path.join(outputDir, fileName);
        await writeJSON(filePath, data);
        console.log(`✓ Written: ${filePath}`);
      }
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
