export { getSupabaseClient, getSupabaseConfig, testConnection, SupabaseError, cloudUpsert, cloudSelect } from './supabaseClient';
export type { SupabaseConfig, ConnectionTestResult, CloudRow } from './supabaseClient';
export { syncService, SyncService } from './syncService';
export type { SyncReport, SyncStatusInfo } from './syncService';