import { useEffect, useRef } from 'react';
import {
  Platform,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Modal,
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useGroupCall } from '@/lib/groupCall';
import { useTheme } from '@/lib/theme';
import { GroupCallParticipantState } from '@/lib/types';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Users,
  X,
  Wifi,
  WifiOff,
} from 'lucide-react-native';

const { width: screenWidth } = Dimensions.get('window');

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function StreamView({
  stream,
  muted,
  mirror,
  style,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  style?: any;
}) {
  const containerRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const container = containerRef.current;
    if (!container || !stream) return;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = muted ?? false;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    if (mirror) {
      video.style.transform = 'scaleX(-1)';
    }
    container.appendChild(video);

    const tryPlay = () => {
      video.srcObject = stream;
      video.play().catch(() => {});
    };
    tryPlay();

    const onAddTrack = () => tryPlay();
    stream.addEventListener('addtrack', onAddTrack);
    stream.getTracks().forEach((track) => {
      track.onunmute = () => tryPlay();
    });

    return () => {
      stream.removeEventListener('addtrack', onAddTrack);
      try {
        container.removeChild(video);
      } catch {}
    };
  }, [stream, muted, mirror]);

  return <View ref={containerRef} style={[{ overflow: 'hidden' }, style]} />;
}

function ParticipantTile({
  participant,
  isVideo,
  colors,
}: {
  participant: GroupCallParticipantState;
  isVideo: boolean;
  colors: any;
}) {
  const hasVideo = isVideo && !participant.isCameraOff && participant.stream &&
    participant.stream.getVideoTracks().length > 0 &&
    participant.stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');

  return (
    <View style={[tileStyles.tile, { backgroundColor: colors.neutral[900] }]}>
      {hasVideo ? (
        <StreamView
          stream={participant.stream}
          muted={participant.isLocal}
          mirror={participant.isLocal}
          style={tileStyles.stream}
        />
      ) : (
        <View style={tileStyles.avatarContainer}>
          {participant.avatarUrl ? (
            <Image source={{ uri: participant.avatarUrl }} style={tileStyles.avatar} />
          ) : (
            <View style={[tileStyles.avatarFallback, { backgroundColor: colors.primary[700] }]}>
              <Text style={tileStyles.avatarText}>
                {participant.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={tileStyles.tileFooter}>
        <View style={tileStyles.nameRow}>
          {participant.isMuted && <MicOff size={12} color="#fff" strokeWidth={2.5} />}
          {!participant.isMuted && <Mic size={12} color="rgba(255,255,255,0.6)" strokeWidth={2} />}
          <Text style={tileStyles.nameText} numberOfLines={1}>
            {participant.isLocal ? 'You' : participant.name.split(' ')[0]}
          </Text>
        </View>
        {participant.connectionState === 'reconnecting' && (
          <WifiOff size={12} color="#f59e0b" strokeWidth={2} />
        )}
        {participant.connectionState === 'disconnected' && (
          <WifiOff size={12} color="#dc2626" strokeWidth={2} />
        )}
      </View>
    </View>
  );
}

function getGridConfig(count: number) {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count <= 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: Math.ceil(count / 3) };
}

export function GroupCallScreen() {
  const {
    callState,
    callType,
    groupName,
    groupAvatar,
    participants,
    callDuration,
    isMuted,
    isCameraOff,
    error,
    incomingCall,
    startGroupCall,
    joinGroupCall,
    acceptIncomingCall,
    declineIncomingCall,
    leaveCall,
    toggleMute,
    toggleCamera,
    dismissError,
  } = useGroupCall();
  const { colors: c, isDark } = useTheme();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (callState !== 'idle') {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }).start();
    }
  }, [callState, fadeAnim]);

  useEffect(() => {
    if (incomingCall) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [incomingCall, pulseAnim]);

  // Incoming call screen
  if (incomingCall && callState === 'idle') {
    const isVideo = incomingCall.callType === 'video';
    return (
      <Modal visible transparent={false} animationType="slide">
        <View style={incomingStyles.container}>
          <View style={incomingStyles.header}>
            <Text style={incomingStyles.headerText}>Incoming group call</Text>
          </View>

          <View style={incomingStyles.body}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              {incomingCall.groupAvatar ? (
                <Image source={{ uri: incomingCall.groupAvatar }} style={incomingStyles.groupAvatar} />
              ) : (
                <View style={[incomingStyles.groupAvatarFallback, { backgroundColor: c.primary[500] }]}>
                  <Users size={48} color="#fff" strokeWidth={2} />
                </View>
              )}
            </Animated.View>

            <Text style={incomingStyles.groupName}>{incomingCall.groupName}</Text>

            <View style={incomingStyles.callInfoRow}>
              {isVideo ? <Video size={18} color="rgba(255,255,255,0.6)" strokeWidth={2} /> : <Phone size={18} color="rgba(255,255,255,0.6)" strokeWidth={2} />}
              <Text style={incomingStyles.callInfoText}>
                {isVideo ? 'Video call' : 'Voice call'} · {incomingCall.participantCount} {incomingCall.participantCount === 1 ? 'participant' : 'participants'}
              </Text>
            </View>

            <View style={incomingStyles.actions}>
              <TouchableOpacity style={incomingStyles.actionBtn} onPress={declineIncomingCall} activeOpacity={0.8}>
                <View style={incomingStyles.declineCircle}>
                  <PhoneOff size={28} color="#fff" strokeWidth={2.5} />
                </View>
                <Text style={incomingStyles.actionLabel}>Decline</Text>
              </TouchableOpacity>

              <TouchableOpacity style={incomingStyles.actionBtn} onPress={acceptIncomingCall} activeOpacity={0.8}>
                <View style={incomingStyles.acceptCircle}>
                  {isVideo ? <Video size={28} color="#fff" strokeWidth={2.5} /> : <Phone size={28} color="#fff" strokeWidth={2.5} />}
                </View>
                <Text style={incomingStyles.actionLabel}>Join</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  if (callState === 'idle') return null;

  const isVideo = callType === 'video';
  const grid = getGridConfig(participants.length);
  const tileSize = Math.min(
    (screenWidth - 24 - (grid.cols - 1) * 8) / grid.cols,
    220,
  );

  let statusText = '';
  if (callState === 'connecting') statusText = 'Connecting...';
  else if (callState === 'connected') statusText = formatDuration(callDuration);
  else if (callState === 'reconnecting') statusText = 'Reconnecting...';
  else if (callState === 'ended') statusText = 'Call ended';

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={leaveCall}>
      <Animated.View style={[styles.container, { opacity: fadeAnim, backgroundColor: c.neutral[isDark ? 950 : 900] }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {groupAvatar ? (
              <Image source={{ uri: groupAvatar }} style={styles.headerAvatar} />
            ) : (
              <View style={[styles.headerAvatarFallback, { backgroundColor: c.primary[700] }]}>
                <Users size={16} color="#fff" strokeWidth={2} />
              </View>
            )}
            <View style={styles.headerInfo}>
              <Text style={styles.headerName} numberOfLines={1}>{groupName ?? 'Group Call'}</Text>
              <View style={styles.headerStatusRow}>
                <View style={styles.participantDot} />
                <Text style={styles.headerStatus}>{participants.length} participants · {statusText}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Error banner */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={dismissError}>
              <X size={18} color="#fff" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}

        {/* Video grid */}
        <ScrollView
          style={styles.gridScroll}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.grid, { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }]}>
            {participants.map((p) => (
              <View
                key={p.userId}
                style={{
                  width: tileSize,
                  height: tileSize,
                  margin: 4,
                }}
              >
                <ParticipantTile participant={p} isVideo={isVideo} colors={c} />
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlBtn} onPress={toggleMute} activeOpacity={0.8}>
            <View style={[styles.controlCircle, isMuted && styles.controlCircleActive]}>
              {isMuted ? <MicOff size={22} color="#fff" strokeWidth={2.5} /> : <Mic size={22} color="#fff" strokeWidth={2.5} />}
            </View>
            <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>

          {isVideo && (
            <TouchableOpacity style={styles.controlBtn} onPress={toggleCamera} activeOpacity={0.8}>
              <View style={[styles.controlCircle, isCameraOff && styles.controlCircleActive]}>
                {isCameraOff ? <VideoOff size={22} color="#fff" strokeWidth={2.5} /> : <Video size={22} color="#fff" strokeWidth={2.5} />}
              </View>
              <Text style={styles.controlLabel}>{isCameraOff ? 'Camera On' : 'Camera Off'}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.controlBtn} onPress={leaveCall} activeOpacity={0.8}>
            <View style={styles.endCircle}>
              <PhoneOff size={22} color="#fff" strokeWidth={2.5} />
            </View>
            <Text style={styles.controlLabel}>Leave</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
  paddingBottom: 30,
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  },
  header: {
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  headerAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flexShrink: 1,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  participantDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#16a34a',
  },
  headerStatus: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(220,38,38,0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  gridScroll: {
    flex: 1,
    width: '100%',
  },
  gridContent: {
    padding: 12,
    alignItems: 'center',
  },
  grid: {},
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingVertical: 20,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  controlBtn: {
    alignItems: 'center',
    gap: 8,
  },
  controlCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlCircleActive: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  endCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    marginTop: 4,
  },
});

const tileStyles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  stream: {
    width: '100%',
    height: '100%',
  },
  avatarContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
  },
  tileFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nameText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});

const incomingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 60,
  },
  header: {
    alignItems: 'center',
  },
  headerText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  groupAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  groupAvatarFallback: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  groupName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  callInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callInfoText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 60,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 10,
  },
  acceptCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
});
