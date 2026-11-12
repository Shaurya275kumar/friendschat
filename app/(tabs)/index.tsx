import { useState, useEffect, useCallback, useRef } from 'react';
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
import { fetchChatsList, getOrCreateChat, createGroupChat, fetchAllUsers } from '@/lib/chat';
import { ChatWithDetails, StoryWithUser, Profile } from '@/lib/types';
import { useTheme, formatTime } from '@/lib/theme';
import { MessageCirclePlus, PencilLine, Search, MessageCircle, Users, Check } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { StatusBar, StatusViewer } from '@/components/StoriesBar';
import { ConversationView } from '@/components/ConversationView';
import Animated, { FadeInRight } from 'react-native-reanimated';

type ChatsScreenProps = {
  onOpenChat?: (chatId: string) => void;
  initialChatId?: string;
  onCloseChat?: () => void;
};

export default function ChatsScreen({ onOpenChat }: ChatsScreenProps) {
  const { user } = useAuth();
  const { colors: c, isDark } = useTheme();
  const [chats, setChats] = useState<ChatWithDetails[]>([]);
  const [filtered, setFiltered] = useState<ChatWithDetails[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusViewerVisible, setStatusViewerVisible] = useState(false);
  const [statusViewerData, setStatusViewerData] = useState<StoryWithUser[]>([]);
  const [statusViewerIndex, setStatusViewerIndex] = useState(0);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);

  const openStatusViewer = (statuses: StoryWithUser[], index: number) => {
    setStatusViewerData(statuses);
    setStatusViewerIndex(index);
    setStatusViewerVisible(true);
  };

  const loadChats = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const data = await fetchChatsList(user.id);
      if (data) {
        setChats(data);
        setFiltered(data);
      } else {
        setError('Failed to load chats. Check your connection.');
      }
    } catch {
      setError('Something went wrong. Pull down to retry.');
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  const debouncedLoadChats = useRef(
    (() => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      return () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => loadChats(), 400);
      };
    })(),
  ).current;

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (!user) return;
    const messageChannel = supabase
      .channel(`chats-list-messages-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => debouncedLoadChats(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        () => debouncedLoadChats(),
      )
      .subscribe();
    const presenceChannel = supabase
      .channel(`chats-list-presence-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        () => debouncedLoadChats(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(presenceChannel);
    };
  }, [user, loadChats]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(chats);
    } else {
      const q = search.toLowerCase();
      setFiltered(chats.filter((c) => {
        if (c.is_group) return (c.group_name ?? 'Group').toLowerCase().includes(q);
        return c.other_user.name.toLowerCase().includes(q);
      }));
    }
  }, [search, chats]);

  const onRefresh = () => {
    setRefreshing(true);
    loadChats();
  };

  const handleOpenChat = (chatId: string) => {
    if (onOpenChat) onOpenChat(chatId);
  };

  const renderChat = ({ item, index }: { item: ChatWithDetails; index: number }) => {
    const lastMsg = item.last_message;
    let preview = 'Tap to start chatting';
    if (lastMsg) {
      if (lastMsg.deleted_at) preview = 'This message was deleted';
      else if (lastMsg.media_url) preview = lastMsg.media_type === 'video' ? 'Video' : 'Photo';
      else preview = lastMsg.body ?? '';
    }

    const displayName = item.is_group ? (item.group_name ?? 'Group') : item.other_user.name;
    const memberCount = item.is_group ? item.participants.length : 0;
    const avatarUrl = item.is_group ? item.group_avatar_url : item.other_user.avatar_url;

    return (
      <Animated.View entering={FadeInRight.delay(index * 30).duration(300).springify().damping(80)}>
        <TouchableOpacity
          style={[styles.chatItem, { borderBottomColor: c.border }]}
          onPress={() => handleOpenChat(item.id)}
          activeOpacity={0.7}
        >
          <View style={styles.avatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : item.is_group ? (
              <View style={[styles.avatar, { backgroundColor: c.primary[200], justifyContent: 'center', alignItems: 'center' }]}>
                <Users size={22} color={c.primary[isDark ? 400 : 800]} strokeWidth={2} />
              </View>
            ) : (
              <View style={[styles.avatar, { backgroundColor: c.primary[200], justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={[styles.avatarText, { color: c.primary[isDark ? 400 : 800] }]}>
                  {item.other_user.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            {!item.is_group && item.other_user.is_online && <View style={[styles.onlineDot, { borderColor: c.surface }]} />}
          </View>
          <View style={styles.chatContent}>
            <View style={styles.chatHeader}>
              <Text style={[styles.chatName, { color: c.text }]} numberOfLines={1}>
                {displayName}
              </Text>
              {lastMsg && (
                <Text style={[styles.chatTime, { color: c.textMuted }]}>{formatTime(lastMsg.created_at)}</Text>
              )}
            </View>
            <Text style={[styles.chatPreview, { color: c.textSecondary }]} numberOfLines={1}>
              {item.is_group ? `${memberCount} members · ${preview}` : preview}
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

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
      <View style={[styles.listPanel, { backgroundColor: c.background }]}>
        <View style={styles.listHeader}>
          <Text style={[styles.listTitle, { color: c.text }]}>Chats</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setShowNewGroup(true)}>
              <Users size={20} color={c.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setShowNewChat(true)}>
              <PencilLine size={20} color={c.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.searchBar, { backgroundColor: c.inputBg }]}>
          <Search size={16} color={c.textMuted} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder="Search chats..."
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

        <StatusBar onOpenStatus={openStatusViewer} />

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
            <MessageCircle size={48} color={c.textMuted} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: c.text }]}>{error}</Text>
            <TouchableOpacity style={[styles.retryBtn, { backgroundColor: c.primary[500] }]} onPress={loadChats}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.centerContent}>
            <MessageCirclePlus size={56} color={c.textMuted} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: c.text }]}>
              {search ? 'No chats match your search' : 'No conversations yet'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: c.textSecondary }]}>
              {search ? 'Try a different name' : 'Tap the pencil above to start a new chat'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderChat}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary[500]} />}
            contentContainerStyle={{ paddingBottom: 20 }}
            maxToRenderPerBatch={10}
            windowSize={10}
            removeClippedSubviews={true}
          />
        )}
      </View>

      <StatusViewer
        visible={statusViewerVisible}
        statuses={statusViewerData}
        startIndex={statusViewerIndex}
        onClose={() => setStatusViewerVisible(false)}
        currentUserId={user?.id ?? ''}
        onDelete={() => {
          setStatusViewerData((prev) => prev.filter((_, i) => i !== statusViewerIndex));
        }}
      />

      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onSelect={async (otherId) => {
            if (!user) return;
            const chatId = await getOrCreateChat(otherId, user.id);
            if (chatId) {
              setShowNewChat(false);
              loadChats();
              handleOpenChat(chatId);
            }
          }}
        />
      )}

      {showNewGroup && (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onCreate={async (groupName, memberIds) => {
            if (!user) return;
            const chatId = await createGroupChat(groupName, memberIds);
            if (chatId) {
              setShowNewGroup(false);
              loadChats();
              handleOpenChat(chatId);
            }
          }}
        />
      )}
    </View>
  );
}

function NewChatModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const { user } = useAuth();
  const { colors: c, isDark } = useTheme();
  const [people, setPeople] = useState<Profile[]>([]);
  const [filtered, setFiltered] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchAllUsers(user.id).then((data) => {
      if (data) {
        setPeople(data);
        setFiltered(data);
      } else {
        setError('Failed to load people. Try again.');
      }
      setLoading(false);
    });
  }, [user]);

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

  return (
    <View style={nmStyles.overlay}>
      <View style={[nmStyles.modal, { backgroundColor: c.surface }]}>
        <View style={[nmStyles.header, { borderBottomColor: c.border }]}>
          <Text style={[nmStyles.title, { color: c.text }]}>New Chat</Text>
          <TouchableOpacity onPress={onClose} style={nmStyles.closeBtn}>
            <Text style={[nmStyles.closeText, { color: c.primary[isDark ? 400 : 600] }]}>Done</Text>
          </TouchableOpacity>
        </View>
        <View style={[nmStyles.searchBar, { backgroundColor: c.inputBg }]}>
          <Search size={16} color={c.textMuted} strokeWidth={2} />
          <TextInput
            style={[nmStyles.searchInput, { color: c.text }]}
            placeholder="Search people..."
            placeholderTextColor={c.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        {loading ? (
          <ActivityIndicator size="large" color={c.primary[500]} style={{ marginTop: 40 }} />
        ) : error ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: c.textSecondary, fontSize: 14 }}>{error}</Text>
            <TouchableOpacity
              style={{ marginTop: 12, padding: 8 }}
              onPress={() => {
                setLoading(true);
                setError(null);
                if (user) fetchAllUsers(user.id).then((data) => {
                  if (data) { setPeople(data); setFiltered(data); }
                  else setError('Failed to load people. Try again.');
                  setLoading(false);
                });
              }}
            >
              <Text style={{ color: c.primary[isDark ? 400 : 600], fontWeight: '600' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[nmStyles.personItem, { borderBottomColor: c.border }]}
                onPress={() => onSelect(item.id)}
                activeOpacity={0.7}
              >
                <View style={nmStyles.avatarWrap}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={nmStyles.avatar} />
                  ) : (
                    <View style={[nmStyles.avatar, { backgroundColor: c.primary[200], justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={[nmStyles.avatarText, { color: c.primary[isDark ? 400 : 800] }]}>{item.name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  {item.is_online && <View style={[nmStyles.onlineDot, { borderColor: c.surface }]} />}
                </View>
                <View>
                  <Text style={[nmStyles.personName, { color: c.text }]}>{item.name}</Text>
                  <Text style={[nmStyles.personEmail, { color: c.textSecondary }]}>{item.email}</Text>
                </View>
              </TouchableOpacity>
            )}
            style={{ maxHeight: 400 }}
          />
        )}
      </View>
    </View>
  );
}

function NewGroupModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (groupName: string, memberIds: string[]) => void;
}) {
  const { user } = useAuth();
  const { colors: c, isDark } = useTheme();
  const [people, setPeople] = useState<Profile[]>([]);
  const [filtered, setFiltered] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchAllUsers(user.id).then((data) => {
      if (data) {
        setPeople(data);
        setFiltered(data);
      }
      setLoading(false);
    });
  }, [user]);

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

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = () => {
    if (!groupName.trim() || selected.size < 1) return;
    setCreating(true);
    onCreate(groupName.trim(), Array.from(selected));
  };

  const canCreate = groupName.trim().length >= 2 && selected.size >= 1 && !creating;

  return (
    <View style={ngStyles.overlay}>
      <View style={[ngStyles.modal, { backgroundColor: c.surface }]}>
        <View style={[ngStyles.header, { borderBottomColor: c.border }]}>
          <Text style={[ngStyles.title, { color: c.text }]}>New Group</Text>
          <TouchableOpacity onPress={onClose} style={ngStyles.closeBtn}>
            <Text style={[ngStyles.closeText, { color: c.primary[isDark ? 400 : 600] }]}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={[ngStyles.nameInput, { color: c.text, backgroundColor: c.inputBg, borderColor: c.border }]}
          placeholder="Group name"
          placeholderTextColor={c.textMuted}
          value={groupName}
          onChangeText={setGroupName}
          maxLength={50}
        />

        <Text style={[ngStyles.selectedCount, { color: c.textSecondary }]}>
          {selected.size} selected
        </Text>

        <View style={[ngStyles.searchBar, { backgroundColor: c.inputBg }]}>
          <Search size={16} color={c.textMuted} strokeWidth={2} />
          <TextInput
            style={[ngStyles.searchInput, { color: c.text }]}
            placeholder="Search people to add..."
            placeholderTextColor={c.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={c.primary[500]} style={{ marginTop: 30, marginBottom: 30 }} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isSelected = selected.has(item.id);
              return (
                <TouchableOpacity
                  style={[ngStyles.personItem, { borderBottomColor: c.border }]}
                  onPress={() => toggleSelect(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={ngStyles.avatarWrap}>
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={ngStyles.avatar} />
                    ) : (
                      <View style={[ngStyles.avatarFallback, { backgroundColor: c.primary[200] }]}>
                        <Text style={[ngStyles.avatarText, { color: c.primary[isDark ? 400 : 800] }]}>
                          {item.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={ngStyles.personInfo}>
                    <Text style={[ngStyles.personName, { color: c.text }]}>{item.name}</Text>
                    <Text style={[ngStyles.personEmail, { color: c.textSecondary }]}>{item.email}</Text>
                  </View>
                  <View style={[
                    ngStyles.checkbox,
                    {
                      borderColor: isSelected ? c.primary[500] : c.border,
                      backgroundColor: isSelected ? c.primary[500] : 'transparent',
                    },
                  ]}>
                    {isSelected && <Check size={16} color="#fff" strokeWidth={3} />}
                  </View>
                </TouchableOpacity>
              );
            }}
            style={{ maxHeight: 280 }}
          />
        )}

        <TouchableOpacity
          style={[
            ngStyles.createBtn,
            { backgroundColor: canCreate ? c.primary[500] : c.neutral[300] },
          ]}
          onPress={handleCreate}
          disabled={!canCreate}
          activeOpacity={0.8}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={ngStyles.createBtnText}>Create Group</Text>
          )}
        </TouchableOpacity>
      </View>
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
  listPanel: {
    flex: 1,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
  },
  listTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  chatItem: {
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
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#16a34a',
    borderWidth: 2,
  },
  chatContent: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  chatTime: {
    fontSize: 12,
  },
  chatPreview: {
    fontSize: 14,
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
    marginTop: 16,
    marginBottom: 8,
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
    width: 52,
    height: 52,
    borderRadius: 26,
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

const nmStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  modal: {
    width: 420,
    maxHeight: 560,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  closeText: {
    fontSize: 15,
    fontWeight: '600',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 20,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
  },
  personItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#16a34a',
    borderWidth: 2,
  },
  personName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  personEmail: {
    fontSize: 13,
  },
});

const ngStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  modal: {
    width: 440,
    maxHeight: 600,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  closeText: {
    fontSize: 15,
    fontWeight: '600',
  },
  nameInput: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    fontSize: 15,
    borderWidth: 1.5,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 20,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
  },
  personItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
  },
  personInfo: {
    flex: 1,
  },
  personName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  personEmail: {
    fontSize: 13,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createBtn: {
    marginHorizontal: 16,
    marginBottom: 16,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  selectedCount: {
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
});
