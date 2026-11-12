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
  TextInput,
} from 'react-native';
import { useAuth } from '@/lib/auth';
import { fetchAllUsers, getOrCreateChat } from '@/lib/chat';
import { Profile } from '@/lib/types';
import { useTheme, formatLastSeen } from '@/lib/theme';
import { Search, MessageCircle, Users } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import Animated, { FadeInRight } from 'react-native-reanimated';

type PeopleScreenProps = {
  onOpenChat?: (chatId: string) => void;
};

export default function PeopleScreen({ onOpenChat }: PeopleScreenProps) {
  const { user } = useAuth();
  const { colors: c, isDark } = useTheme();
  const [people, setPeople] = useState<Profile[]>([]);
  const [filtered, setFiltered] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const data = await fetchAllUsers(user.id);
      if (data) {
        setPeople(data);
        setFiltered(data);
      } else {
        setError('Failed to load people. Check your connection.');
      }
    } catch {
      setError('Something went wrong. Pull down to retry.');
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`people-presence-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(people);
    } else {
      const q = search.toLowerCase();
      setFiltered(
        people.filter(
          (p) => p.name.toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q),
        ),
      );
    }
  }, [search, people]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const openChat = async (otherId: string) => {
    if (!user || !onOpenChat) return;
    const chatId = await getOrCreateChat(otherId, user.id);
    if (chatId) onOpenChat(chatId);
  };

  const renderItem = ({ item, index }: { item: Profile; index: number }) => (
    <Animated.View entering={FadeInRight.delay(index * 30).duration(300).springify().damping(80)}>
      <TouchableOpacity
        style={[styles.personItem, { borderBottomColor: c.border }]}
        onPress={() => openChat(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarWrap}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: c.primary[200], justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={[styles.avatarText, { color: c.primary[isDark ? 400 : 800] }]}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          {item.is_online && <View style={[styles.onlineDot, { borderColor: c.surface }]} />}
        </View>
        <View style={styles.personContent}>
          <Text style={[styles.personName, { color: c.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.personStatus, { color: c.textSecondary }]} numberOfLines={1}>
            {item.status ? item.status : formatLastSeen(item.last_seen, item.is_online)}
          </Text>
        </View>
        <MessageCircle size={18} color={c.primary[isDark ? 400 : 500]} strokeWidth={2} />
      </TouchableOpacity>
    </Animated.View>
  );

  const renderSkeleton = () => (
    <View style={styles.skeletonItem}>
      <View style={[styles.skeletonAvatar, { backgroundColor: c.surfaceAlt }]} />
      <View style={styles.skeletonContent}>
        <View style={[styles.skeletonLine, { backgroundColor: c.surfaceAlt }]} />
        <View style={[styles.skeletonLine, { width: '60%', backgroundColor: c.surfaceAlt }]} />
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, { color: c.text }]}>People</Text>
      </View>

      <View style={[styles.searchBar, { backgroundColor: c.inputBg }]}>
        <Search size={16} color={c.textMuted} strokeWidth={2} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="Search by name or email..."
          placeholderTextColor={c.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={[styles.clearBtn, { color: c.primary[isDark ? 400 : 600] }]}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1 }}>
          {renderSkeleton()}
          {renderSkeleton()}
          {renderSkeleton()}
          {renderSkeleton()}
          {renderSkeleton()}
        </View>
      ) : error ? (
        <View style={styles.centerContent}>
          <Users size={56} color={c.textMuted} strokeWidth={1.5} />
          <Text style={[styles.emptyTitle, { color: c.text }]}>{error}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: c.primary[500] }]} onPress={load}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centerContent}>
          <Users size={56} color={c.textMuted} strokeWidth={1.5} />
          <Text style={[styles.emptyTitle, { color: c.text }]}>No people found</Text>
          <Text style={[styles.emptySubtitle, { color: c.textSecondary }]}>
            {search ? 'Try a different search term' : 'No other users have joined yet'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary[500]} />}
          contentContainerStyle={{ paddingBottom: 20 }}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews={true}
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
  listHeader: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
  },
  listTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 21,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
  },
  clearBtn: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 8,
  },
  personItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 14,
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
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#16a34a',
    borderWidth: 2,
  },
  personContent: {
    flex: 1,
  },
  personName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  personStatus: {
    fontSize: 13,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
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
  skeletonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  skeletonAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 14,
  },
  skeletonContent: {
    flex: 1,
    gap: 8,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
  },
});
