import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
  Pressable,
  Animated,
} from 'react-native';
import { useAuth } from '@/lib/auth';
import { useCall } from '@/lib/call';
import { fetchMessages, sendMessage, editMessage, deleteMessage, deleteMessageForMe, uploadMedia } from '@/lib/chat';
import { Message, Profile } from '@/lib/types';
import { useTheme, formatTime, formatLastSeen, formatDate } from '@/lib/theme';
import {
  Send,
  Camera,
  Check,
  CheckCheck,
  Pencil,
  Trash2,
  X,
  Image as ImageIcon,
  Video as VideoIcon,
  Phone,
  ChevronLeft,
  Reply,
  EyeOff,
  Users,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { Video as VideoPlayer, ResizeMode } from 'expo-av';

type ConversationViewProps = {
  chatId: string;
  onBack?: () => void;
};

export function ConversationView({ chatId, onBack }: ConversationViewProps) {
  const { user } = useAuth();
  const { startCall } = useCall();
  const { colors: c, isDark } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [otherUser, setOtherUser] = useState<Profile | null>(null);
  const [isGroup, setIsGroup] = useState(false);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Profile[]>([]);
  const [participantMap, setParticipantMap] = useState<Map<string, Profile>>(new Map());
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [menuMsg, setMenuMsg] = useState<Message | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [replyMsg, setReplyMsg] = useState<Message | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const loadMessages = useCallback(async () => {
    if (!chatId) return;
    const data = await fetchMessages(chatId, user?.id);
    if (data) {
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const merged = [...prev];
        for (const msg of data) {
          if (!existingIds.has(msg.id)) merged.push(msg);
          else {
            const idx = merged.findIndex((m) => m.id === msg.id);
            if (idx !== -1) merged[idx] = msg;
          }
        }
        merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
        return merged;
      });
    }
    setLoading(false);
  }, [chatId, user?.id]);

  const loadOtherUser = useCallback(async () => {
    if (!chatId || !user) return;
    setLoadingProfile(true);

    // Fetch chat row to check if it's a group
    const { data: chatRow } = await supabase
      .from('chats')
      .select('is_group, group_name, group_avatar_url')
      .eq('id', chatId)
      .maybeSingle();

    if (chatRow?.is_group) {
      setIsGroup(true);
      setGroupName(chatRow.group_name);
      setGroupAvatar(chatRow.group_avatar_url);

      // Fetch all participants
      const { data: pIds } = await supabase
        .from('chat_participants')
        .select('user_id')
        .eq('chat_id', chatId);

      if (pIds && pIds.length > 0) {
        const ids = pIds.map((p) => p.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', ids);
        if (profiles) {
          const profs = profiles as Profile[];
          setParticipants(profs);
          const map = new Map<string, Profile>();
          for (const p of profs) map.set(p.id, p);
          setParticipantMap(map);
        }
      }
      setLoadingProfile(false);
      return;
    }

    // Direct chat: load the other user
    const { data: participant, error: pErr } = await supabase
      .from('chat_participants')
      .select('user_id')
      .eq('chat_id', chatId)
      .neq('user_id', user.id)
      .maybeSingle();
    if (pErr || !participant) {
      setLoadingProfile(false);
      return;
    }
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', participant.user_id)
      .maybeSingle();
    if (profErr || !profile) {
      setLoadingProfile(false);
      return;
    }
    setOtherUser(profile as Profile);
    setLoadingProfile(false);
  }, [chatId, user]);

  useEffect(() => {
    loadMessages();
    loadOtherUser();
  }, [loadMessages, loadOtherUser]);

  useEffect(() => {
    if (!chatId) return;
    const channel = supabase
      .channel(`chat-${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new as Message];
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.new.id ? (payload.new as Message) : m)),
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`deletions-${chatId}-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_deletions', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const deletedId = payload.new.message_id;
          setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, user]);

  useEffect(() => {
    if (!otherUser) return;
    const channel = supabase
      .channel(`presence-${chatId}-${otherUser.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${otherUser.id}` },
        (payload) => {
          setOtherUser((prev) => (prev ? { ...prev, ...(payload.new as any) } : prev));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [otherUser?.id]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleSend = async () => {
    if (!chatId || !user || !input.trim()) return;
    const body = input.trim();
    setSending(true);
    const { message: msg, error } = await sendMessage(chatId, user.id, body);
    if (error) {
      Alert.alert('Failed to send', error);
    } else if (msg) {
      setInput('');
      setReplyMsg(null);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    }
    setSending(false);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await sendMedia(result.assets[0].uri, 'image');
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera permission is required to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await sendMedia(result.assets[0].uri, 'image');
  };

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await sendMedia(result.assets[0].uri, 'video');
  };

  const sendMedia = async (uri: string, type: 'image' | 'video') => {
    if (!chatId || !user) return;
    setSending(true);
    const mime = type === 'image' ? 'image/jpeg' : 'video/mp4';
    const url = await uploadMedia(uri, mime, user.id);
    if (url) {
      const { error } = await sendMessage(chatId, user.id, null, url, type);
      if (error) Alert.alert('Failed to send media', error);
    } else {
      Alert.alert('Error', 'Failed to upload media. Please try again.');
    }
    setSending(false);
  };

  const handleEdit = async () => {
    if (!editingMsg || !input.trim()) return;
    await editMessage(editingMsg.id, input.trim());
    setEditingMsg(null);
    setInput('');
  };

  const startEdit = (msg: Message) => {
    setEditingMsg(msg);
    setInput(msg.body ?? '');
    setMenuMsg(null);
  };

  const startReply = (msg: Message) => {
    setReplyMsg(msg);
    setMenuMsg(null);
  };

  const handleDeleteForEveryone = (msg: Message) => {
    Alert.alert('Delete for everyone', 'This message will be deleted for everyone in this chat.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMessage(msg.id);
          setMenuMsg(null);
        },
      },
    ]);
  };

  const handleDeleteForMe = (msg: Message) => {
    if (!user) return;
    deleteMessageForMe(msg.id, user.id).then((success) => {
      if (success) {
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      }
      setMenuMsg(null);
    });
  };

  const showActions = (msg: Message) => {
    if (msg.deleted_at) return;
    setMenuMsg(msg);
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMine = item.sender_id === user?.id;
    const isDeleted = !!item.deleted_at;
    const showDateSep = index === 0 || formatDate(messages[index - 1].created_at) !== formatDate(item.created_at);
    const sender = participantMap.get(item.sender_id);
    const showSenderName = isGroup && !isMine && !isDeleted && !!sender;
    return (
      <View>
        {showDateSep && (
          <View style={styles.dateSeparator}>
            <Text style={[styles.dateSeparatorText, { color: c.textSecondary, backgroundColor: c.surfaceAlt }]}>{formatDate(item.created_at)}</Text>
          </View>
        )}
      <Pressable onLongPress={() => showActions(item)} delayLongPress={400}>
        <Animated.View
          style={[
            styles.messageRow,
            isMine ? styles.messageRowMine : styles.messageRowTheirs,
          ]}
        >
          <View
            style={[
              styles.bubble,
              isMine ? { backgroundColor: c.bubbleOut, marginRight: 4, borderBottomRightRadius: 4 } : { backgroundColor: c.bubbleIn, marginLeft: 4, borderBottomLeftRadius: 4 },
              isDeleted && { backgroundColor: c.surfaceAlt },
            ]}
          >
            {isDeleted ? (
              <View style={styles.deletedRow}>
                <Trash2 size={14} color={c.textMuted} strokeWidth={2} />
                <Text style={[styles.deletedText, { color: c.textSecondary }]}>This message was deleted</Text>
              </View>
            ) : (
              <>
                {showSenderName && (
                  <Text style={[styles.senderName, { color: c.primary[isDark ? 400 : 600] }]} numberOfLines={1}>
                    {sender!.name}
                  </Text>
                )}
                {item.media_url && item.media_type === 'image' && (
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setPreviewImage(item.media_url!)}>
                    <Image
                      source={{ uri: item.media_url }}
                      style={styles.messageImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                )}
                {item.media_url && item.media_type === 'video' && (
                  <View style={styles.videoContainer}>
                    <VideoPlayer
                      source={{ uri: item.media_url }}
                      style={styles.messageVideo}
                      useNativeControls
                      resizeMode={ResizeMode.CONTAIN}
                    />
                  </View>
                )}
                {item.body && (
                  <Text style={[styles.messageText, { color: c.text }]}>
                    {item.body}
                  </Text>
                )}
                <View style={styles.messageMeta}>
                  {item.edited_at && !isDeleted && (
                    <Text style={[styles.editedTag, { color: c.textMuted }]}>
                      edited
                    </Text>
                  )}
                  <Text style={[styles.messageTime, { color: c.textMuted }]}>
                    {formatTime(item.created_at)}
                  </Text>
                  {isMine && !isDeleted && (
                    <CheckCheck size={14} color={c.primary[isDark ? 400 : 700]} strokeWidth={2.5} style={{ marginLeft: 2 }} />
                  )}
                </View>
              </>
            )}
          </View>
        </Animated.View>
      </Pressable>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary[500]} />
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim, backgroundColor: c.chatBg }]}>
      <View style={[styles.header, { backgroundColor: c.headerBg, borderBottomColor: c.border }]}>
        {onBack && (
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <ChevronLeft size={24} color={c.text} strokeWidth={2} />
          </TouchableOpacity>
        )}
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatarWrap}>
            {isGroup ? (
              groupAvatar ? (
                <Image source={{ uri: groupAvatar }} style={styles.headerAvatar} />
              ) : (
                <View style={[styles.headerAvatar, { backgroundColor: c.primary[200], justifyContent: 'center', alignItems: 'center' }]}>
                  <Users size={18} color={c.primary[isDark ? 400 : 800]} strokeWidth={2} />
                </View>
              )
            ) : otherUser?.avatar_url ? (
              <Image source={{ uri: otherUser.avatar_url }} style={styles.headerAvatar} />
            ) : (
              <View style={[styles.headerAvatar, { backgroundColor: c.primary[200], justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={[styles.headerAvatarText, { color: c.primary[isDark ? 400 : 800] }]}>
                  {otherUser?.name?.charAt(0).toUpperCase() ?? '?'}
                </Text>
              </View>
            )}
            {!isGroup && otherUser?.is_online && <View style={[styles.headerOnlineDot, { borderColor: c.headerBg }]} />}
          </View>
          <View style={styles.headerTextSection}>
            <Text style={[styles.headerName, { color: c.text }]} numberOfLines={1}>
              {loadingProfile
                ? 'Loading...'
                : isGroup
                  ? (groupName ?? 'Group')
                  : otherUser?.name ?? 'Unknown'}
            </Text>
            <Text style={[styles.headerStatus, { color: c.textSecondary }]}>
              {isGroup
                ? `${participants.length} members`
                : otherUser?.status
                  ? otherUser.status
                  : otherUser
                    ? formatLastSeen(otherUser.last_seen, otherUser.is_online)
                    : ''}
            </Text>
          </View>
        </View>
        {!isGroup && otherUser && (
          <View style={styles.callButtons}>
            <TouchableOpacity
              style={[styles.callBtn, { backgroundColor: c.primary[isDark ? 100 : 50] }]}
              onPress={() => startCall(otherUser)}
              activeOpacity={0.7}
            >
              <Phone size={18} color={otherUser.is_online ? c.primary[isDark ? 400 : 600] : c.textMuted} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.callBtn, { backgroundColor: c.primary[isDark ? 100 : 50] }]}
              onPress={() => startCall(otherUser, true)}
              activeOpacity={0.7}
            >
              <VideoIcon size={18} color={otherUser.is_online ? c.primary[isDark ? 400 : 600] : c.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        showsVerticalScrollIndicator={false}
        style={styles.messagesList}
        maxToRenderPerBatch={15}
        windowSize={10}
        removeClippedSubviews={true}
        initialNumToRender={20}
      />

      {editingMsg && (
        <View style={[styles.editBanner, { backgroundColor: c.primary[isDark ? 100 : 50], borderTopColor: c.primary[200] }]}>
          <View style={styles.editBannerContent}>
            <Pencil size={16} color={c.primary[isDark ? 400 : 600]} strokeWidth={2} />
            <Text style={[styles.editBannerText, { color: c.primary[isDark ? 400 : 700] }]}>Editing message</Text>
          </View>
          <TouchableOpacity onPress={() => { setEditingMsg(null); setInput(''); }}>
            <X size={20} color={c.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      )}

      {replyMsg && (
        <View style={[styles.editBanner, { backgroundColor: c.primary[isDark ? 100 : 50], borderTopColor: c.primary[200] }]}>
          <View style={styles.editBannerContent}>
            <Reply size={16} color={c.primary[isDark ? 400 : 600]} strokeWidth={2} />
            <Text style={[styles.editBannerText, { color: c.primary[isDark ? 400 : 700] }]} numberOfLines={1}>
              Reply: {replyMsg.body ?? 'Media message'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyMsg(null)}>
            <X size={20} color={c.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.inputBar, { backgroundColor: c.headerBg, borderTopColor: c.border }]}>
        <TouchableOpacity style={styles.mediaBtn} onPress={pickImage}>
          <ImageIcon size={22} color={c.primary[isDark ? 400 : 500]} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.mediaBtn} onPress={takePhoto}>
          <Camera size={22} color={c.primary[isDark ? 400 : 500]} strokeWidth={2} />
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { color: c.text, backgroundColor: c.inputBg, borderColor: c.border }]}
          placeholder={editingMsg ? 'Edit message...' : 'Type a message'}
          placeholderTextColor={c.textMuted}
          value={input}
          onChangeText={setInput}
          blurOnSubmit={false}
          onSubmitEditing={editingMsg ? handleEdit : handleSend}
        />
        {input.trim() ? (
          <TouchableOpacity style={[styles.sendBtn, { backgroundColor: c.primary[500] }]} onPress={editingMsg ? handleEdit : handleSend}>
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : editingMsg ? (
              <Check size={22} color="#fff" strokeWidth={2.5} />
            ) : (
              <Send size={20} color="#fff" strokeWidth={2} />
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.mediaBtn} onPress={pickVideo}>
            <VideoIcon size={20} color={c.primary[isDark ? 400 : 500]} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={!!menuMsg}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuMsg(null)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setMenuMsg(null)}>
          <View style={[styles.menuCard, { backgroundColor: c.surface }]}>
            {menuMsg && menuMsg.sender_id === user?.id && (
              <TouchableOpacity style={styles.menuItem} onPress={() => menuMsg && startEdit(menuMsg)}>
                <Pencil size={18} color={c.text} strokeWidth={2} />
                <Text style={[styles.menuItemText, { color: c.text }]}>Edit</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={() => menuMsg && startReply(menuMsg)}>
              <Reply size={18} color={c.text} strokeWidth={2} />
              <Text style={[styles.menuItemText, { color: c.text }]}>Reply</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, { borderTopColor: c.border }]}
              onPress={() => menuMsg && handleDeleteForMe(menuMsg)}
            >
              <EyeOff size={18} color={c.text} strokeWidth={2} />
              <Text style={[styles.menuItemText, { color: c.text }]}>Delete for me</Text>
            </TouchableOpacity>
            {menuMsg && menuMsg.sender_id === user?.id && (
              <TouchableOpacity
                style={[styles.menuItem, { borderTopColor: c.border }]}
                onPress={() => menuMsg && handleDeleteForEveryone(menuMsg)}
              >
                <Trash2 size={18} color={c.error[500]} strokeWidth={2} />
                <Text style={[styles.menuItemText, { color: c.error[500] }]}>Delete for everyone</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={!!previewImage}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
      >
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewImage(null)}>
            <X size={28} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
          {previewImage && (
            <Image
              source={{ uri: previewImage }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  callButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerAvatarWrap: {
    marginRight: 12,
    position: 'relative',
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  headerAvatarText: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#16a34a',
    borderWidth: 2,
  },
  headerTextSection: {
    flex: 1,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerStatus: {
    fontSize: 13,
  },
  messagesList: {
    flex: 1,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 8,
  },
  dateSeparatorText: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageRowTheirs: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '70%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  deletedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deletedText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  messageImage: {
    width: 240,
    height: 240,
    borderRadius: 8,
    marginBottom: 4,
  },
  videoContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 4,
  },
  messageVideo: {
    width: 280,
    height: 200,
  },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  messageTime: {
    fontSize: 11,
  },
  editedTag: {
    fontSize: 10,
    fontStyle: 'italic',
  },
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  editBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  editBannerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mediaBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minHeight: 38,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    borderWidth: 1,
  } as any,
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuCard: {
    borderRadius: 16,
    padding: 8,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewClose: {
    position: 'absolute',
    top: 40,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
});
