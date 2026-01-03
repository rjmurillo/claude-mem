/**
 * Type definitions for memory export/import operations
 *
 * These types extend the base database types from src/types/database.ts
 * to include all fields needed for complete data export/import and
 * duplicate detection.
 */

import type {
  ObservationRecord as BaseObservationRecord,
  SdkSessionRecord as BaseSdkSessionRecord,
  SessionSummaryRecord as BaseSessionSummaryRecord,
  UserPromptRecord as BaseUserPromptRecord
} from '../../src/types/database';

/**
 * Observation record with all database fields for export
 * Extends base type to include fields missing from database.ts
 */
export interface ObservationRecord extends Omit<BaseObservationRecord, 'title' | 'concept' | 'source_files'> {
  sdk_session_id?: string; // Added for duplicate detection on import
  title: string | null; // Database allows null
  subtitle: string | null;
  facts: string | null;
  narrative: string | null;
  concepts: string | null;
  files_read: string | null;
  files_modified: string | null;
}

/**
 * SDK Session record for export
 * Extends base type to ensure memory_session_id is required
 */
export interface SdkSessionRecord extends Omit<BaseSdkSessionRecord, 'memory_session_id' | 'user_prompt'> {
  memory_session_id: string; // Required for export
  user_prompt: string; // Required for export
}

/**
 * Session Summary record with all fields for export
 * Extends base type to include missing fields
 */
export interface SessionSummaryRecord extends BaseSessionSummaryRecord {
  sdk_session_id?: string; // Added for duplicate detection on import
  files_read: string | null;
  files_edited: string | null;
  notes: string | null;
}

/**
 * User Prompt record for export
 */
export type UserPromptRecord = BaseUserPromptRecord;

/**
 * Complete export data structure
 */
export interface ExportData {
  exportedAt: string;
  exportedAtEpoch: number;
  query: string;
  method?: string;
  project?: string;
  totalObservations: number;
  totalSessions: number;
  totalSummaries: number;
  totalPrompts: number;
  observations: ObservationRecord[];
  sessions: SdkSessionRecord[];
  summaries: SessionSummaryRecord[];
  prompts: UserPromptRecord[];
}
