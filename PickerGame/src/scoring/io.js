/**
 * File IO utilities for scoring engine
 * Handles reading and writing JSON files with error handling
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Load JSON file from disk
 * @param {string} filePath - Absolute or relative path to JSON file
 * @returns {Promise<any>} Parsed JSON data
 * @throws {Error} If file cannot be read or parsed
 */
export async function loadJSON(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Write JSON file to disk
 * @param {string} filePath - Absolute or relative path to JSON file
 * @param {any} data - Data to serialize and write
 * @param {Object} options - Write options
 * @param {boolean} [options.pretty=true] - Format JSON with indentation
 * @returns {Promise<void>}
 * @throws {Error} If file cannot be written
 */
export async function writeJSON(filePath, data, options = {}) {
  const { pretty = true } = options;
  
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    await fs.writeFile(filePath, content + '\n', 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write ${filePath}: ${error.message}`);
  }
}

/**
 * Load all required input files for scoring
 * @param {string} dataDir - Path to Data directory containing JSON files
 * @returns {Promise<{settings, teams, matches, results, entries}>}
 * @throws {Error} If any required file is missing or invalid
 */
export async function loadAllInputs(dataDir) {
  const files = {
    settings: path.join(dataDir, 'settings.json'),
    teams: path.join(dataDir, 'teams.json'),
    matches: path.join(dataDir, 'matches.json'),
    results: path.join(dataDir, 'results.json'),
    entries: path.join(dataDir, 'entries.json'),
  };
  
  const data = {};
  
  for (const [key, filePath] of Object.entries(files)) {
    try {
      data[key] = await loadJSON(filePath);
    } catch (error) {
      throw new Error(`Error loading ${key}: ${error.message}`);
    }
  }
  
  return data;
}
