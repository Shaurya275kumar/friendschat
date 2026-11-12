import { supabase } from './supabase';
import { CallDirection, CallHistoryEntry, CallHistoryStatus } from './types';

type RecordCallInput = {
  userId: string;
  peerId: string;
  callId: string;
  direction: CallDirection;
  callType: 'audio' | 'video';
  status: CallHistoryStatus;
  durationSeconds: number;
};

export async function recordCallHistory(input: RecordCallInput): Promise<void> {
  const { error } = await supabase.from('call_history').insert({
    user_id: input.userId,
    peer_id: input.peerId,
    call_id: input.callId,
    direction: input.direction,
    call_type: input.callType,
    status: input.status,
    duration_seconds: input.durationSeconds,
  });
  if (error) console.warn('Failed to record call history:', error.message);
}

export async function fetchCallHistory(): Promise<CallHistoryEntry[] | null> {
  const { data, error } = await supabase
    .from('call_history')
    .select('id, peer_id, direction, call_type, status, duration_seconds, created_at, peer:profiles!peer_id(*)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error || !Array.isArray(data)) return null;
  return data as unknown as CallHistoryEntry[];
}
