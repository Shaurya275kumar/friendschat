import { useEffect, useRef } from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet, Image, Modal, ActivityIndicator, Animated, Easing } from 'react-native';
import { useCall } from '@/lib/call';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Video, VideoOff } from 'lucide-react-native';
import { Profile } from '@/lib/types';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function Avatar({ profile, size }: { profile: Profile | null; size: number }) {
  if (!profile) return <View style={[styles.avatarPlaceholder, { width: size, height: size, borderRadius: size / 2 }]} />;
  if (profile.avatar_url) {
    return <Image source={{ uri: profile.avatar_url }} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]} />;
  }
  return (
    <View style={[styles.avatarPlaceholder, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{profile.name.charAt(0).toUpperCase()}</Text>
    </View>
  );
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
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
    videoRef.current = video;

    const tryPlay = () => {
      video.srcObject = stream;
      video.play().catch(() => {});
    };
    tryPlay();

    const onAddTrack = (event: MediaStreamTrackEvent) => {
      const track = event.track;
      if (track) {
        track.onunmute = () => {
          tryPlay();
        };
      }
      tryPlay();
    };
    const onRemoveTrack = () => {
      tryPlay();
    };
    stream.addEventListener('addtrack', onAddTrack);
    stream.addEventListener('removetrack', onRemoveTrack);

    stream.getTracks().forEach((track) => {
      track.onunmute = () => {
        tryPlay();
      };
    });

    return () => {
      stream.removeEventListener('addtrack', onAddTrack);
      stream.removeEventListener('removetrack', onRemoveTrack);
      try {
        container.removeChild(video);
      } catch (e) {
        // ignore
      }
      videoRef.current = null;
    };
  }, [stream, muted, mirror]);

  return <View ref={containerRef} style={[{ overflow: 'hidden' }, style]} />;
}

export function CallScreen() {
  const {
    callState,
    callType,
    callerProfile,
    calleeProfile,
    isCaller,
    callDuration,
    isMuted,
    isSpeakerOn,
    isCameraOff,
    localStream,
    remoteStream,
    remoteStreamVersion,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    toggleCamera,
  } = useCall();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
  }, [fadeAnim]);

  useEffect(() => {
    if (callState === 'calling' || callState === 'incoming') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1000,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [callState, pulseAnim]);

  if (callState === 'idle') return null;

  const otherUser = isCaller ? calleeProfile : callerProfile;
  const isVideo = callType === 'video';
  const hasRemoteVideo = isVideo && !!remoteStream && remoteStream.getVideoTracks().length > 0;
  const showRemoteVideo = isVideo && !!remoteStream && (callState === 'calling' || callState === 'connected');
  const showLocalVideo = isVideo && !!localStream;

  let statusText = '';
  if (callState === 'calling') statusText = isCaller ? 'Ringing...' : 'Connecting...';
  else if (callState === 'incoming') statusText = `Incoming ${isVideo ? 'video' : 'audio'} call`;
  else if (callState === 'connected') statusText = formatDuration(callDuration);
  else if (callState === 'ended') statusText = 'Call ended';

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={endCall}>
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        {showRemoteVideo ? (
          <StreamView stream={remoteStream} style={styles.remoteVideo} />
        ) : (
          <View style={styles.remoteVideoFallback} />
        )}

        {showLocalVideo && (
          <View style={styles.localVideoContainer}>
            <StreamView
              stream={localStream}
              muted
              mirror
              style={styles.localVideo}
            />
          </View>
        )}

        {!showRemoteVideo && (
          <View style={styles.avatarOverlay}>
            <View style={styles.header}>
              <Text style={styles.statusText}>{statusText}</Text>
            </View>

            <View style={styles.avatarSection}>
              <Animated.View
                style={{
                  transform: [{ scale: callState === 'calling' || callState === 'incoming' ? pulseAnim : 1 }],
                }}
              >
                <Avatar profile={otherUser} size={140} />
              </Animated.View>
              <Text style={styles.nameText}>{otherUser?.name ?? 'Unknown'}</Text>
              {callState === 'connected' ? (
                <View style={styles.connectedBadge}>
                  <View style={styles.connectedDot} />
                  <Text style={styles.connectedText}>{formatDuration(callDuration)}</Text>
                </View>
              ) : callState === 'calling' ? (
                <Text style={styles.subStatusText}>{isCaller ? 'Calling...' : 'Connecting...'}</Text>
              ) : callState === 'incoming' ? (
                <Text style={styles.subStatusText}>{isVideo ? 'Video call' : 'Audio call'}</Text>
              ) : null}
            </View>
          </View>
        )}

        {showRemoteVideo && (
          <View style={styles.videoHeader}>
            <View style={styles.videoHeaderContent}>
              <Text style={styles.videoNameText} numberOfLines={1}>{otherUser?.name ?? 'Unknown'}</Text>
              {callState === 'connected' && (
                <View style={styles.connectedBadge}>
                  <View style={styles.connectedDot} />
                  <Text style={styles.connectedText}>{formatDuration(callDuration)}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={styles.controls}>
          {callState === 'incoming' && (
            <View style={styles.incomingControls}>
              <TouchableOpacity style={styles.acceptBtn} onPress={acceptCall} activeOpacity={0.8}>
                <View style={styles.acceptCircle}>
                  {isVideo ? <Video size={28} color="#fff" strokeWidth={2.5} /> : <Phone size={28} color="#fff" strokeWidth={2.5} />}
                </View>
                <Text style={styles.controlLabel}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rejectBtn} onPress={rejectCall} activeOpacity={0.8}>
                <View style={styles.rejectCircle}>
                  <PhoneOff size={28} color="#fff" strokeWidth={2.5} />
                </View>
                <Text style={styles.controlLabel}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}

          {(callState === 'calling' || callState === 'connected') && !hasRemoteVideo && (
            <View style={styles.connectingContainer}>
              <ActivityIndicator size="large" color="#fff" />
              <TouchableOpacity style={styles.rejectBtn} onPress={endCall} activeOpacity={0.8}>
                <View style={styles.rejectCircle}>
                  <PhoneOff size={28} color="#fff" strokeWidth={2.5} />
                </View>
                <Text style={styles.controlLabel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {(callState === 'connected' || (callState === 'calling' && hasRemoteVideo)) && (
            <View style={styles.inCallControls}>
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

              <TouchableOpacity style={styles.controlBtn} onPress={toggleSpeaker} activeOpacity={0.8}>
                <View style={[styles.controlCircle, isSpeakerOn && styles.controlCircleActive]}>
                  {isSpeakerOn ? <Volume2 size={22} color="#fff" strokeWidth={2.5} /> : <VolumeX size={22} color="#fff" strokeWidth={2.5} />}
                </View>
                <Text style={styles.controlLabel}>Speaker</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.controlBtn} onPress={endCall} activeOpacity={0.8}>
                <View style={styles.rejectCircle}>
                  <PhoneOff size={22} color="#fff" strokeWidth={2.5} />
                </View>
                <Text style={styles.controlLabel}>End</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  remoteVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  remoteVideoFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0f172a',
  },
  localVideoContainer: {
    position: 'absolute',
    top: 50,
    right: 16,
    width: 120,
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    zIndex: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  localVideo: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1e293b',
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 60,
  },
  header: {
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  avatarSection: {
    alignItems: 'center',
    gap: 16,
    flex: 1,
    justifyContent: 'center',
  },
  avatar: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarText: {
    fontWeight: '700',
    color: '#fff',
  },
  nameText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  subStatusText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(22,163,74,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16a34a',
  },
  connectedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  videoHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 16,
    alignItems: 'center',
    zIndex: 5,
  },
  videoHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  videoNameText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    maxWidth: 200,
  },
  controls: {
    alignItems: 'center',
    width: '100%',
    paddingBottom: 40,
    zIndex: 10,
  },
  incomingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 60,
  },
  connectingContainer: {
    alignItems: 'center',
    gap: 32,
  },
  inCallControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    flexWrap: 'wrap',
  },
  acceptBtn: {
    alignItems: 'center',
    gap: 8,
  },
  rejectBtn: {
    alignItems: 'center',
    gap: 8,
  },
  controlBtn: {
    alignItems: 'center',
    gap: 8,
  },
  acceptCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
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
  controlLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    marginTop: 4,
  },
});
