#!/usr/bin/env bun
/**
 * Export ALL claude-mem data directly from SQLite database (bypasses broken FTS search)
 *
 * REQUIRES: Bun runtime (uses bun:sqlite)
 *
 * Usage: bun scripts/export-memories-direct.ts <output-file> [--project=name]
 * Example: bun scripts/export-memories-direct.ts backup.json
 *          bun scripts/export-memories-direct.ts backup.json --project=ai-agents
 * 
 * CRITICAL: The FTS-based export only returns ~2% of data (71 out of 3500+ observations).
 * This script exports EVERYTHING by querying SQLite directly.
 * 
 * DUPLICATE DETECTION FIXES:
 * - Adds sdk_session_id field via JOIN with sdk_sessions table
 * - Replaces NULL/empty titles with "(untitled)" placeholder
 * - Without these fixes, import creates massive duplicates (1000s of rows)
 */

import { Database } from 'bun:sqlite';
import { writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type {
  ObservationRecord,
  SdkSessionRecord,
  SessionSummaryRecord,
  UserPromptRecord,
  ExportData
} from './types/export';

async function exportDirect(outputFile: string, project?: string) {
  try {
    const dbPath = join(homedir(), '.claude-mem', 'claude-mem.db');
    console.log('🔍 Exporting from SQLite database...');
    console.log(`   Scope: ${project ? `Project '${project}'` : 'ALL projects'}`);
    console.log(`   Database: ${dbPath}`);
    console.log(`   Output: ${outputFile}`);
    console.log('');

    const db = new Database(dbPath, { readonly: true });

    // Build project filters
    const obsFilter = project ? `WHERE o.project = ?` : '';
    const summaryFilter = project ? `WHERE ss.project = ?` : '';
    const sessionFilter = project ? `WHERE project = ?` : '';
    const promptFilter = project 
      ? `WHERE content_session_id IN (SELECT content_session_id FROM sdk_sessions WHERE project = ?)`
      : '';

    // Get counts
    const countFilter = project ? 'WHERE project = ?' : '';
    const obsCount = db.query(`SELECT COUNT(*) as count FROM observations ${countFilter}`);
    const summaryCount = db.query(`SELECT COUNT(*) as count FROM session_summaries ${countFilter}`);
    const promptCount = db.query(`SELECT COUNT(*) as count FROM user_prompts ${promptFilter}`);
    const sessionCount = db.query(`SELECT COUNT(*) as count FROM sdk_sessions ${sessionFilter}`);

    const counts = {
      observations: project ? obsCount.get(project) : obsCount.get(),
      summaries: project ? summaryCount.get(project) : summaryCount.get(),
      prompts: project ? promptCount.get(project) : promptCount.get(),
      sessions: project ? sessionCount.get(project) : sessionCount.get()
    };

    console.log('📊 Database contains:');
    console.log(`   Observations: ${counts.observations.count}`);
    console.log(`   Session summaries: ${counts.summaries.count}`);
    console.log(`   User prompts: ${counts.prompts.count}`);
    console.log(`   SDK sessions: ${counts.sessions.count}`);
    console.log('');

    // Export observations with sdk_session_id for duplicate detection
    console.log('📦 Exporting observations...');
    const obsQuery = `
      SELECT
        o.*,
        s.content_session_id as sdk_session_id
      FROM observations o
      LEFT JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id
      ${obsFilter}
      ORDER BY o.created_at_epoch DESC
    `;
    const observations: ObservationRecord[] = project 
      ? db.query(obsQuery).all(project)
      : db.query(obsQuery).all();

    // Fix NULL titles for duplicate detection
    let nullTitleCount = 0;
    observations.forEach((obs) => {
      if (!obs.title || obs.title.trim() === '') {
        obs.title = '(untitled)';
        nullTitleCount++;
      }
    });
    if (nullTitleCount > 0) {
      console.log(`   Fixed ${nullTitleCount} NULL titles for duplicate detection`);
    }

    // Export session summaries with sdk_session_id
    console.log('📦 Exporting session summaries...');
    const summaryQuery = `
      SELECT
        ss.*,
        s.content_session_id as sdk_session_id
      FROM session_summaries ss
      LEFT JOIN sdk_sessions s ON ss.memory_session_id = s.memory_session_id
      ${summaryFilter}
      ORDER BY ss.created_at_epoch DESC
    `;
    const summaries: SessionSummaryRecord[] = project
      ? db.query(summaryQuery).all(project)
      : db.query(summaryQuery).all();

    // Export user prompts
    console.log('📦 Exporting user prompts...');
    const promptQuery = `SELECT * FROM user_prompts ${promptFilter} ORDER BY prompt_number DESC`;
    const prompts: UserPromptRecord[] = project
      ? db.query(promptQuery).all(project)
      : db.query(promptQuery).all();

    // Export SDK sessions
    console.log('📦 Exporting SDK sessions...');
    const sessionQuery = `SELECT * FROM sdk_sessions ${sessionFilter} ORDER BY started_at_epoch DESC`;
    const sessions: SdkSessionRecord[] = project
      ? db.query(sessionQuery).all(project)
      : db.query(sessionQuery).all();

    db.close();

    // Create export data
    const queryDescription = project ? `direct-sqlite (project: ${project})` : 'direct-sqlite (all projects)';
    const exportData: ExportData = {
      exportedAt: new Date().toISOString(),
      exportedAtEpoch: Date.now(),
      query: queryDescription,
      method: 'direct-sqlite',
      project,
      totalObservations: observations.length,
      totalSessions: sessions.length,
      totalSummaries: summaries.length,
      totalPrompts: prompts.length,
      observations,
      sessions,
      summaries,
      prompts
    };

    // Write to file
    writeFileSync(outputFile, JSON.stringify(exportData, null, 2));

    const fileStats = require('fs').statSync(outputFile);
    const fileSizeKB = (fileStats.size / 1024).toFixed(2);

    console.log('');
    console.log(`✅ Direct export created: ${outputFile}`);
    console.log(`   File size: ${fileSizeKB} KB`);
    console.log('');
    console.log('📊 Exported:');
    console.log(`   Observations: ${exportData.totalObservations}`);
    console.log(`   Session summaries: ${exportData.totalSummaries}`);
    console.log(`   User prompts: ${exportData.totalPrompts}`);
    console.log(`   SDK sessions: ${exportData.totalSessions}`);
    console.log('');
    console.log('Next Steps:');
    console.log('  Import: npx tsx scripts/import-memories.ts <output-file>');

  } catch (error) {
    console.error('❌ Export failed:', error);
    process.exit(1);
  }
}

// CLI interface
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: bun scripts/export-memories-direct.ts <output-file> [--project=name]');
  console.error('Example: bun scripts/export-memories-direct.ts backup.json');
  console.error('         bun scripts/export-memories-direct.ts backup.json --project=ai-agents');
  console.error('');
  console.error('REQUIRES: Bun runtime (install: https://bun.sh)');
  process.exit(1);
}

// Parse arguments
const [outputFile, ...flags] = args;
const project = flags.find(f => f.startsWith('--project='))?.split('=')[1];

exportDirect(outputFile, project);
