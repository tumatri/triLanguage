export interface OutboxEntry {
  id: string;
  notebook_id: string;
  operation: 'review_log' | 'card_progress' | 'exercise_session';
  payload_json: string;
  created_at: string;
  synced_at: string | null;
  attempt_count: number;
}
