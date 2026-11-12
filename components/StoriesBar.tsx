import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  FlatList,
  Modal,
  Dimensions,
  Pressable,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '@/lib/auth';
import {
  fetchActiveStories,
  fetchMyStories,
  createStory,
  deleteStory,
  markStoryViewed,
  hasViewedStory,
  uploadMedia,
} from '@/lib/chat';
import { StoryWithUser, Story } from '@/lib/types';
import { useTheme } from '@/lib/theme';
import { Plus, X, Trash2 } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { Video as VideoPlayer, ResizeMode } from 'expo-av';

const SCREEN_WIDTH = Dimensions.get('window').width;

type StatusBarProps = {
  onOpenStatus: (statuses: StoryWithUser[], index: number) => void;
};

export function StatusBar({ onOpenStatus }: StatusBarProps) {
  const { user, profile } = useAuth();
  const { colors: c, isDark } = useTheme();
  const [myStatuses, setMyStatuses] = useState<Story[]>([]);
  const [otherStatuses, setOtherStatuses] = useState<StoryWithUser[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const [mine, others] = await Promise.all([
      fetchMyStories(user.id),
      fetchActiveStories(),
    ]);
    setMyStatuses(mine);
    const otherUserStatuses = others.filter((s) => s.user_id !== user.id);
    const seenUsers = new Set<string>();
    const grouped: StoryWithUser[] = [];
    for (const s of otherUserStatuses) {
      if (!seenUsers.has(s.user_id)) {
        seenUsers.add(s.user_id);
        grouped.push(s);
      }
    }
    setOtherStatuses(grouped);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('status-bar')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stories' },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  const handleAddStatus = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0] || !user) return;
    const asset = result.assets[0];
    const isVideo = asset.type === 'video';
    const mime = isVideo ? 'video/mp4' : 'image/jpeg';
    const url = await uploadMedia(asset.uri, mime, user.id);
    if (!url) return;
    await createStory(user.id, url, isVideo ? 'video' : 'image');
    load();
  };

  const handleMyStatusPress = () => {
    if (myStatuses.length === 0) {
      handleAddStatus();
    } else {
      const statusesWithUser: StoryWithUser[] = myStatuses.map((s) => ({
        ...s,
        user: profile!,
      }));
      onOpenStatus(statusesWithUser, 0);
    }
  };

  const handleOtherStatusPress = (status: StoryWithUser, index: number) => {
    fetchActiveStories().then((all) => {
      const userAll = all.filter((s) => s.user_id === status.user_id);
      onOpenStatus(userAll, 0);
    });
  };

  const renderItem = ({ item, index }: { item: StoryWithUser; index: number }) => (
    <TouchableOpacity
      style={styles.statusItem}
      onPress={() => handleOtherStatusPress(item, index)}
      activeOpacity={0.8}
    >
      <AnimatedStatusRing colors={c} isDark={isDark}>
        {item.user.avatar_url ? (
          <Image source={{ uri: item.user.avatar_url }} style={styles.statusAvatar} />
        ) : (
          <View style={[styles.statusAvatar, { backgroundColor: c.primary[200], justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={[styles.avatarText, { color: c.primary[isDark ? 400 : 800] }]}>{item.user.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </AnimatedStatusRing>
      <Text style={[styles.statusName, { color: c.textSecondary }]} numberOfLines={1}>{item.user.name.split(' ')[0]}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
      <FlatList
        horizontal
        data={otherStatuses}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        ListHeaderComponent={
          <TouchableOpacity style={styles.statusItem} onPress={handleMyStatusPress} activeOpacity={0.8}>
            <View style={[styles.myStatusRing, { borderColor: c.neutral[300] }]}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.statusAvatar} />
              ) : (
                <View style={[styles.statusAvatar, { backgroundColor: c.primary[200], justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={[styles.avatarText, { color: c.primary[isDark ? 400 : 800] }]}>{profile?.name?.charAt(0).toUpperCase() ?? '?'}</Text>
                </View>
              )}
              <View style={[styles.addBadge, { backgroundColor: c.primary[isDark ? 400 : 500], borderColor: c.surface }]}>
                <Plus size={14} color="#fff" strokeWidth={3} />
              </View>
            </View>
            <Text style={[styles.statusName, { color: c.textSecondary }]} numberOfLines={1}>
              {myStatuses.length > 0 ? 'My status' : 'Add status'}
            </Text>
          </TouchableOpacity>
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

function AnimatedStatusRing({
  colors,
  isDark,
  children,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
  children: React.ReactNode;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const borderColor = progress.interpolate({
    inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
    outputRange: [
      colors.primary[isDark ? 400 : 500],
      '#00d4ff',
      '#39e58c',
      '#ffd166',
      '#ff5c8a',
      colors.primary[isDark ? 400 : 500],
    ],
  });

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 4200,
        easing: Easing.inOut(Easing.linear),
        useNativeDriver: false,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [progress]);

  return (
    <Animated.View style={[styles.statusRing, { borderColor }]}>
      {children}
    </Animated.View>
  );
}

type StatusViewerProps = {
  visible: boolean;
  statuses: StoryWithUser[];
  startIndex: number;
  onClose: () => void;
  currentUserId: string;
  onDelete?: (storyId: string) => void;
};

export function StatusViewer({ visible, statuses, startIndex, onClose, currentUserId, onDelete }: StatusViewerProps) {
  const [index, setIndex] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const videoRef = useRef<any>(null);

  useEffect(() => {
    setIndex(startIndex);
  }, [startIndex]);

  // Reset loading state when switching to a new status
  useEffect(() => {
    if (!visible) return;
    setMediaLoaded(false);
    setMediaError(false);
    setProgress(0);
  }, [index, visible]);

  // Preload next status media
  useEffect(() => {
    if (!visible || statuses.length === 0) return;
    const nextIndex = index + 1;
    if (nextIndex < statuses.length) {
      const nextStatus = statuses[nextIndex];
      if (nextStatus.media_type === 'image') {
        Image.prefetch(nextStatus.media_url).catch(() => {});
      }
    }
  }, [visible, index, statuses]);

  // Start progress timer only after media has loaded
  useEffect(() => {
    if (!visible || statuses.length === 0 || !mediaLoaded) return;
    const status = statuses[index];
    if (!status) return;

    if (status.user_id !== currentUserId) {
      hasViewedStory(status.id, currentUserId).then((viewed) => {
        if (!viewed) markStoryViewed(status.id, currentUserId);
      });
    }

    const duration = status.media_type === 'video' ? 15000 : 5000;
    const interval = 50;
    const step = interval / duration;

    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 1) {
          clearInterval(timer);
          if (index < statuses.length - 1) {
            setIndex(index + 1);
          } else {
            onClose();
          }
          return 0;
        }
        return p + step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [visible, index, statuses, currentUserId, onClose, mediaLoaded]);

  if (!visible || statuses.length === 0) return null;

  const status = statuses[index];
  if (!status) return null;

  const isOwnStatus = status.user_id === currentUserId;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <View style={styles.viewerContainer}>
        <View style={styles.progressBars}>
          {statuses.map((_, i) => (
            <View key={i} style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` },
                ]}
              />
            </View>
          ))}
        </View>

        <View style={styles.viewerHeader}>
          <View style={styles.viewerUserInfo}>
            {status.user.avatar_url ? (
              <Image source={{ uri: status.user.avatar_url }} style={styles.viewerAvatar} />
            ) : (
              <View style={[styles.viewerAvatar, { backgroundColor: '#1a1f26', justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={styles.avatarTextWhite}>{status.user.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.viewerName}>{status.user.name}</Text>
          </View>
          <View style={styles.headerActions}>
            {isOwnStatus && onDelete && (
              <TouchableOpacity
                onPress={() => setShowDeleteConfirm(true)}
                style={styles.deleteBtn}
                activeOpacity={0.7}
              >
                <Trash2 size={22} color="#ff5c8a" strokeWidth={2} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={26} color="#fff" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.mediaContainer}>
          {!mediaLoaded && !mediaError && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
          {mediaError && (
            <View style={styles.loadingOverlay}>
              <Text style={styles.errorText}>Failed to load media</Text>
            </View>
          )}
          {status.media_type === 'image' ? (
            <Image
              source={{ uri: status.media_url }}
              style={styles.mediaImage}
              resizeMode="contain"
              onLoad={() => setMediaLoaded(true)}
              onError={() => setMediaError(true)}
            />
          ) : (
            <VideoPlayer
              ref={videoRef}
              source={{ uri: status.media_url }}
              style={styles.mediaVideo}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              onLoad={() => setMediaLoaded(true)}
              onError={() => setMediaError(true)}
            />
          )}
          {status.caption && mediaLoaded && (
            <View style={styles.captionContainer}>
              <Text style={styles.captionText}>{status.caption}</Text>
            </View>
          )}
        </View>

        <Pressable
          style={styles.tapLeft}
          onPress={() => index > 0 && setIndex(index - 1)}
        />
        <Pressable
          style={styles.tapRight}
          onPress={() => {
            if (index < statuses.length - 1) setIndex(index + 1);
            else onClose();
          }}
        />

        {showDeleteConfirm && (
          <View style={styles.deleteOverlay}>
            <View style={styles.deleteDialog}>
              <Text style={styles.deleteTitle}>Delete this status?</Text>
              <Text style={styles.deleteSubtitle}>This status will be permanently removed.</Text>
              <View style={styles.deleteActions}>
                <TouchableOpacity
                  style={styles.deleteCancelBtn}
                  onPress={() => setShowDeleteConfirm(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.deleteCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteConfirmBtn}
                  onPress={async () => {
                    if (deleting) return;
                    setDeleting(true);
                    await deleteStory(status.id);
                    setDeleting(false);
                    setShowDeleteConfirm(false);
                    if (onDelete) onDelete(status.id);
                    if (statuses.length <= 1) {
                      onClose();
                    } else if (index < statuses.length - 1) {
                      setIndex(index + 1);
                    } else {
                      onClose();
                    }
                  }}
                  activeOpacity={0.7}
                  disabled={deleting}
                >
                  <Text style={styles.deleteConfirmText}>
                    {deleting ? 'Deleting...' : 'Delete'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listContent: {
    paddingHorizontal: 12,
  },
  statusItem: {
    alignItems: 'center',
    marginRight: 12,
    width: 64,
  },
  statusRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  myStatusRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
    position: 'relative',
  },
  statusAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
  },
  addBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  statusName: {
    fontSize: 12,
    marginTop: 6,
  },
  // Viewer (always on black background)
  viewerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  progressBars: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 50,
    gap: 4,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  viewerUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  viewerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1f26',
  },
  avatarTextWhite: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  viewerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaImage: {
    width: SCREEN_WIDTH,
    height: '80%',
  },
  mediaVideo: {
    width: SCREEN_WIDTH,
    height: '80%',
  },
  captionContainer: {
    position: 'absolute',
    bottom: 60,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  captionText: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
  },
  tapLeft: {
    position: 'absolute',
    left: 0,
    top: 100,
    bottom: 0,
    width: '30%',
  },
  tapRight: {
    position: 'absolute',
    right: 0,
    top: 100,
    bottom: 0,
    width: '70%',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  errorText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deleteBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  deleteDialog: {
    backgroundColor: '#1a1f26',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 20,
    width: '80%',
    maxWidth: 320,
    alignItems: 'center',
  },
  deleteTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  deleteSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  deleteActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  deleteCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  deleteCancelText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  deleteConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#ff5c8a',
    alignItems: 'center',
  },
  deleteConfirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
