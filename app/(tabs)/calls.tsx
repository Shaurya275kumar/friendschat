import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { useCall } from '@/lib/call';
import { fetchCallHistory } from '@/lib/callHistory';
import { CallHistoryEntry, CallHistoryStatus } from '@/lib/types';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneCall } from 'lucide-react-native';

type Filter = 'all' | 'missed';

const STATUS_LABEL: Record<CallHistoryStatus, string> = {
  completed: 'Completed',
  missed: 'Missed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

function formatCallTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function CallsScreen() {
  const { colors: c, isDark } = useTheme();
  const { startCall } = useCall();
  const [entries, setEntries] = useState<CallHistoryEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const data = await fetchCallHistory();
    if (data) {
      setEntries(data);
    } else {
      setError('Failed to load call history. Pull down to retry.');
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const visible = filter === 'missed' ? entries.filter((e) => e.status === 'missed') : entries;

  const renderItem = ({ item }: { item: CallHistoryEntry }) => {
    const isMissed = item.status === 'missed' || item.status === 'declined';
    const isCompleted = item.status === 'completed';
    const StatusIcon = item.direction === 'outgoing' ? PhoneOutgoing : isCompleted ? PhoneIncoming : PhoneMissed;
    const statusColor = isCompleted
      ? c.success[600]
      : isMissed
        ? c.error[600]
        : c.textSecondary;
    const name = item.peer?.name ?? 'Unknown';
    const kind = item.call_type === 'video' ? 'Video' : 'Audio';
    const detail = isCompleted
      ? `${item.direction === 'outgoing' ? 'Outgoing' : 'Incoming'} ${kind.toLowerCase()} call, ${formatDuration(item.duration_seconds)}`
      : `${STATUS_LABEL[item.status]} ${kind.toLowerCase()} call`;

    return (
      <View style={[styles.item, { borderBottomColor: c.border }]}>
        <View style={styles.avatarWrap}>
          {item.peer?.avatar_url ? (
            <Image source={{ uri: item.peer.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: c.primary[200], justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={[styles.avatarText, { color: c.primary[isDark ? 400 : 800] }]}>
                {name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.content}>
          <Text style={[styles.name, { color: isMissed ? c.error[600] : c.text }]} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.detailRow}>
            <StatusIcon size={14} color={statusColor} strokeWidth={2} />
            <Text style={[styles.detail, { color: c.textSecondary }]} numberOfLines={1}>
              {detail}
            </Text>
          </View>
        </View>

        <Text style={[styles.time, { color: c.textMuted }]}>{formatCallTime(item.created_at)}</Text>

        <TouchableOpacity
          style={[styles.callBtn, { backgroundColor: c.primary[isDark ? 100 : 50] }]}
          onPress={() => item.peer && startCall(item.peer, item.call_type === 'video')}
          disabled={!item.peer}
          activeOpacity={0.7}
          accessibilityLabel={`Call ${name} back`}
        >
          <Phone size={18} color={c.primary[isDark ? 400 : 700]} strokeWidth={2} />
        </TouchableOpacity>
      </View>
    );
  };

  const filterChip = (key: Filter, label: string) => {
    const active = filter === key;
    return (
      <TouchableOpacity
        key={key}
        onPress={() => setFilter(key)}
        style={[
          styles.chip,
          { backgroundColor: active ? c.primary[500] : c.surfaceAlt },
        ]}
        activeOpacity={0.7}
      >
        <Text style={[styles.chipText, { color: active ? '#fff' : c.textSecondary }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>Calls</Text>
        <View style={styles.chips}>
          {filterChip('all', 'All')}
          {filterChip('missed', 'Missed')}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={c.primary[500]} />
        </View>
      ) : error ? (
        <View style={styles.centerContent}>
          <PhoneCall size={56} color={c.textMuted} strokeWidth={1.5} />
          <Text style={[styles.emptyTitle, { color: c.text }]}>{error}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: c.primary[500] }]} onPress={load}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.centerContent}>
          <PhoneCall size={56} color={c.textMuted} strokeWidth={1.5} />
          <Text style={[styles.emptyTitle, { color: c.text }]}>
            {filter === 'missed' ? 'No missed calls' : 'No calls yet'}
          </Text>
          <Text style={[styles.emptySubtitle, { color: c.textSecondary }]}>
            {filter === 'missed' ? 'Calls you miss will show up here' : 'Your completed and missed calls will appear here'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary[500]} />}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  avatarWrap: {
    marginRight: 4,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detail: {
    fontSize: 13,
    flexShrink: 1,
  },
  time: {
    fontSize: 12,
  },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
