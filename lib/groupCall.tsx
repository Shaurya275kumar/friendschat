import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { Profile, GroupCallType, GroupCallState, GroupCallParticipantState } from './types';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

type SignalMessage = {
  type: 'offer' | 'answer' | 'ice-candidate' | 'leave' | 'mute-state' | 'camera-state';
  callId: string;
  senderId: string;
  receiverId: string;
  payload: any;
};

type GroupCallContextType = {
  callState: GroupCallState;
  callType: GroupCallType;
  groupId: string | null;
  groupName: string | null;
  groupAvatar: string | null;
  callId: string | null;
  participants: GroupCallParticipantState[];
  callDuration: number;
  isMuted: boolean;
  isCameraOff: boolean;
  localStream: MediaStream | null;
  error: string | null;
  incomingCall: {
    callId: string;
    groupId: string;
    groupName: string;
    groupAvatar: string | null;
    callerId: string;
    callType: GroupCallType;
    participantCount: number;
  } | null;
  startGroupCall: (chatId: string, groupName: string, groupAvatar: string | null, video: boolean) => Promise<void>;
  joinGroupCall: (callId: string) => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  declineIncomingCall: () => Promise<void>;
  leaveCall: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  dismissError: () => void;
};

const GroupCallContext = createContext<GroupCallContextType | undefined>(undefined);

export function GroupCallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isWeb = Platform.OS === 'web';

  const [callState, setCallState] = useState<GroupCallState>('idle');
  const [callType, setCallType] = useState<GroupCallType>('audio');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<GroupCallParticipantState[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callIdRef = useRef<string | null>(null);
  const groupIdRef = useRef<string | null>(null);
  const callTypeRef = useRef<GroupCallType>('audio');
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const processedSignalsRef = useRef<Set<string>>(new Set());
  const signalChannelRef = useRef<any>(null);
  const incomingChannelRef = useRef<any>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const profileCacheRef = useRef<Map<string, Profile>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const log = (area: string, ...args: any[]) => {
    console.log(`[GROUP CALL][${area}]`, ...args);
  };

  const stopDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const startDurationTimer = useCallback(() => {
    stopDurationTimer();
    setCallDuration(0);
    durationTimerRef.current = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);
  }, [stopDurationTimer]);

  const sendSignal = useCallback(
    async (receiverId: string, type: SignalMessage['type'], payload: any) => {
      if (!user || !callIdRef.current) return;
      const msg = {
        type,
        callId: callIdRef.current,
        senderId: user.id,
        receiverId,
        payload,
      };
      const channel = signalChannelRef.current;
      if (channel) {
        channel.send({
          type: 'broadcast',
          event: `signal-${receiverId}`,
          payload: msg,
        });
      }
    },
    [user],
  );

  const updateParticipant = useCallback((userId: string, updates: Partial<GroupCallParticipantState>) => {
    setParticipants((prev) =>
      prev.map((p) => (p.userId === userId ? { ...p, ...updates } : p)),
    );
  }, []);

  const removeParticipant = useCallback((userId: string) => {
    setParticipants((prev) => prev.filter((p) => p.userId !== userId));
  }, []);

  const closePeerConnection = useCallback((userId: string) => {
    const pc = peerConnectionsRef.current.get(userId);
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.oniceconnectionstatechange = null;
      pc.onconnectionstatechange = null;
      pc.close();
      peerConnectionsRef.current.delete(userId);
    }
    const stream = remoteStreamsRef.current.get(userId);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      remoteStreamsRef.current.delete(userId);
    }
    pendingCandidatesRef.current.delete(userId);
  }, []);

  const cleanupAllConnections = useCallback(() => {
    for (const userId of peerConnectionsRef.current.keys()) {
      closePeerConnection(userId);
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setParticipants([]);
    stopDurationTimer();
  }, [closePeerConnection, stopDurationTimer]);

  const createPeerConnection = useCallback(
    async (remoteUserId: string, isInitiator: boolean): Promise<RTCPeerConnection | null> => {
      if (!isWeb || !user || !callIdRef.current) return null;
      if (peerConnectionsRef.current.has(remoteUserId)) {
        return peerConnectionsRef.current.get(remoteUserId)!;
      }

      log('WEBRTC', `Creating PC with ${remoteUserId}, initiator=${isInitiator}`);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionsRef.current.set(remoteUserId, pc);

      const remoteStream = new MediaStream();
      remoteStreamsRef.current.set(remoteUserId, remoteStream);

      pc.ontrack = (event) => {
        log('WEBRTC', `Track received from ${remoteUserId}`, event.track.kind);
        if (event.track) {
          const existing = remoteStream.getTracks().find((t) => t.id === event.track.id);
          if (!existing) {
            remoteStream.addTrack(event.track);
          }
        }
        updateParticipant(remoteUserId, {
          stream: remoteStream,
          connectionState: 'connected',
        });
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(remoteUserId, 'ice-candidate', event.candidate.toJSON());
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        log('WEBRTC', `ICE state with ${remoteUserId}: ${state}`);
        if (state === 'connected' || state === 'completed') {
          updateParticipant(remoteUserId, { connectionState: 'connected' });
        } else if (state === 'failed') {
          updateParticipant(remoteUserId, { connectionState: 'disconnected' });
        } else if (state === 'disconnected') {
          updateParticipant(remoteUserId, { connectionState: 'reconnecting' });
        }
      };

      pc.onconnectionstatechange = () => {
        log('WEBRTC', `Connection state with ${remoteUserId}: ${pc.connectionState}`);
        if (pc.connectionState === 'failed') {
          updateParticipant(remoteUserId, { connectionState: 'disconnected' });
        }
      };

      const localStream = localStreamRef.current;
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });
      }

      if (isInitiator) {
        try {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: callTypeRef.current === 'video',
          });
          await pc.setLocalDescription(offer);
          await new Promise((r) => setTimeout(r, 100));
          await sendSignal(remoteUserId, 'offer', offer);
          log('SIGNALING', `Sent offer to ${remoteUserId}`);
        } catch (e) {
          log('WEBRTC', `Failed to create offer for ${remoteUserId}:`, e);
        }
      }

      return pc;
    },
    [isWeb, user, sendSignal, updateParticipant],
  );

  const handleSignalMessage = useCallback(
    async (msg: SignalMessage) => {
      if (!user || !callIdRef.current) return;
      if (msg.callId !== callIdRef.current) return;
      if (msg.senderId === user.id) return;

      const signalId = `${msg.senderId}-${msg.type}-${Date.now()}`;
      if (processedSignalsRef.current.has(signalId)) return;
      processedSignalsRef.current.add(signalId);

      log('SIGNALING', `Received ${msg.type} from ${msg.senderId}`);

      if (msg.type === 'offer') {
        let pc = peerConnectionsRef.current.get(msg.senderId);
        if (!pc) {
          pc = await createPeerConnection(msg.senderId, false);
        }
        if (!pc) return;

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
          const pending = pendingCandidatesRef.current.get(msg.senderId) || [];
          for (const candidate of pending) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch {}
          }
          pendingCandidatesRef.current.delete(msg.senderId);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await new Promise((r) => setTimeout(r, 100));
          await sendSignal(msg.senderId, 'answer', answer);
          log('SIGNALING', `Sent answer to ${msg.senderId}`);
        } catch (e) {
          log('WEBRTC', `Failed to handle offer from ${msg.senderId}:`, e);
        }
      } else if (msg.type === 'answer') {
        const pc = peerConnectionsRef.current.get(msg.senderId);
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
          const pending = pendingCandidatesRef.current.get(msg.senderId) || [];
          for (const candidate of pending) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch {}
          }
          pendingCandidatesRef.current.delete(msg.senderId);
        } catch (e) {
          log('WEBRTC', `Failed to handle answer from ${msg.senderId}:`, e);
        }
      } else if (msg.type === 'ice-candidate') {
        const pc = peerConnectionsRef.current.get(msg.senderId);
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.payload));
          } catch {}
        } else {
          const pending = pendingCandidatesRef.current.get(msg.senderId) || [];
          pending.push(msg.payload);
          pendingCandidatesRef.current.set(msg.senderId, pending);
        }
      } else if (msg.type === 'leave') {
        log('PARTICIPANT', `${msg.senderId} left`);
        closePeerConnection(msg.senderId);
        removeParticipant(msg.senderId);
      } else if (msg.type === 'mute-state') {
        updateParticipant(msg.senderId, { isMuted: msg.payload.muted });
      } else if (msg.type === 'camera-state') {
        updateParticipant(msg.senderId, { isCameraOff: msg.payload.cameraOff });
      }
    },
    [user, createPeerConnection, sendSignal, closePeerConnection, removeParticipant, updateParticipant],
  );

  const setupSignalChannel = useCallback(
    (cId: string) => {
      if (!user) return;
      if (signalChannelRef.current) {
        supabase.removeChannel(signalChannelRef.current);
      }

      const channel = supabase.channel(`group-call-${cId}`, {
        config: { broadcast: { self: false } },
      });

      channel.on('broadcast', { event: `signal-${user.id}` }, (msg: any) => {
        handleSignalMessage(msg.payload as SignalMessage);
      });

      channel.subscribe((status: string) => {
        log('SIGNALING', `Channel status: ${status}`);
      });

      signalChannelRef.current = channel;
    },
    [user, handleSignalMessage],
  );

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const cached = profileCacheRef.current.get(userId);
    if (cached) return cached;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      profileCacheRef.current.set(userId, data as Profile);
      return data as Profile;
    }
    return null;
  }, []);

  const fetchParticipants = useCallback(
    async (cId: string): Promise<GroupCallParticipantState[]> => {
      const { data: rawParticipants } = await supabase
        .from('group_call_participants')
        .select('user_id, joined_at, is_muted, is_camera_off')
        .eq('call_id', cId)
        .is('left_at', null);

      if (!rawParticipants) return [];

      const result: GroupCallParticipantState[] = [];
      for (const p of rawParticipants) {
        const profile = await fetchProfile(p.user_id);
        result.push({
          userId: p.user_id,
          name: profile?.name ?? 'Unknown',
          avatarUrl: profile?.avatar_url ?? null,
          isMuted: p.is_muted,
          isCameraOff: p.is_camera_off,
          connectionState: 'connecting',
          stream: remoteStreamsRef.current.get(p.user_id) ?? null,
          isLocal: p.user_id === user?.id,
          joinedAt: p.joined_at,
        });
      }
      return result;
    },
    [fetchProfile, user],
  );

  const setupParticipantSubscription = useCallback(
    (cId: string) => {
      const channel = supabase
        .channel(`group-call-participants-${cId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'group_call_participants', filter: `call_id=eq.${cId}` },
          async (payload) => {
            const newP = payload.new as any;
            if (newP.user_id === user?.id) return;
            log('PARTICIPANT', `${newP.user_id} joined`);

            const profile = await fetchProfile(newP.user_id);
            setParticipants((prev) => {
              if (prev.some((p) => p.userId === newP.user_id)) return prev;
              return [
                ...prev,
                {
                  userId: newP.user_id,
                  name: profile?.name ?? 'Unknown',
                  avatarUrl: profile?.avatar_url ?? null,
                  isMuted: newP.is_muted ?? false,
                  isCameraOff: newP.is_camera_off ?? false,
                  connectionState: 'connecting',
                  stream: remoteStreamsRef.current.get(newP.user_id) ?? null,
                  isLocal: false,
                  joinedAt: newP.joined_at,
                },
              ];
            });

            // Initiate connection to new participant (lower user ID initiates)
            if (user && newP.user_id > user.id) {
              createPeerConnection(newP.user_id, true);
            }
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'group_call_participants', filter: `call_id=eq.${cId}` },
          (payload) => {
            const updated = payload.new as any;
            if (updated.left_at) {
              log('PARTICIPANT', `${updated.user_id} left`);
              closePeerConnection(updated.user_id);
              removeParticipant(updated.user_id);
            } else {
              updateParticipant(updated.user_id, {
                isMuted: updated.is_muted,
                isCameraOff: updated.is_camera_off,
              });
            }
          },
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'group_call_participants', filter: `call_id=eq.${cId}` },
          (payload) => {
            const deleted = payload.old as any;
            if (deleted.user_id === user?.id) return;
            log('PARTICIPANT', `${deleted.user_id} deleted`);
            closePeerConnection(deleted.user_id);
            removeParticipant(deleted.user_id);
          },
        )
        .subscribe();

      return channel;
    },
    [user, fetchProfile, createPeerConnection, closePeerConnection, removeParticipant, updateParticipant],
  );

  const participantChannelRef = useRef<any>(null);

  const getLocalMedia = useCallback(async (video: boolean): Promise<MediaStream | null> => {
    if (!isWeb) return null;
    try {
      const constraints: MediaStreamConstraints = video
        ? { audio: true, video: { facingMode: 'user', width: 640, height: 480 } }
        : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (e) {
      log('MEDIA', 'Failed to get user media:', e);
      setError('Unable to access microphone or camera. Please check your permissions.');
      return null;
    }
  }, [isWeb]);

  const startGroupCall = useCallback(
    async (chatId: string, gName: string, gAvatar: string | null, video: boolean) => {
      if (!user || !isWeb || callState !== 'idle') return;

      log('CALL', `Starting group call in ${chatId}, video=${video}`);
      const type: GroupCallType = video ? 'video' : 'audio';
      callTypeRef.current = type;
      groupIdRef.current = chatId;

      setCallType(type);
      setGroupId(chatId);
      setGroupName(gName);
      setGroupAvatar(gAvatar);
      setCallState('connecting');
      setError(null);

      const stream = await getLocalMedia(video);
      if (!stream) {
        setCallState('idle');
        return;
      }

      // Create call record
      const { data: callRecord, error: insertError } = await supabase
        .from('group_calls')
        .insert({
          chat_id: chatId,
          caller_id: user.id,
          call_type: type,
          status: 'active',
        })
        .select()
        .single();

      if (insertError || !callRecord) {
        log('CALL', 'Failed to create call record:', insertError);
        setError('Failed to start group call. Please try again.');
        cleanupAllConnections();
        setCallState('idle');
        return;
      }

      const cId = callRecord.id;
      callIdRef.current = cId;
      setCallId(cId);

      // Add self as participant
      await supabase.from('group_call_participants').insert({
        call_id: cId,
        user_id: user.id,
        is_muted: false,
        is_camera_off: !video,
      });

      // Set up signaling channel
      setupSignalChannel(cId);

      // Set up participant subscription
      participantChannelRef.current = setupParticipantSubscription(cId);

      // Add local participant to state
      setParticipants([
        {
          userId: user.id,
          name: 'You',
          avatarUrl: null,
          isMuted: false,
          isCameraOff: !video,
          connectionState: 'connected',
          stream: stream,
          isLocal: true,
          joinedAt: new Date().toISOString(),
        },
      ]);

      // Fetch existing group members and send invites
      const { data: members } = await supabase
        .from('chat_participants')
        .select('user_id')
        .eq('chat_id', chatId)
        .neq('user_id', user.id);

      // The call record + realtime will notify other members via the incoming listener
      log('CALL', `Call created: ${cId}, notifying ${members?.length ?? 0} members`);

      setCallState('connected');
      startDurationTimer();
    },
    [user, isWeb, callState, getLocalMedia, setupSignalChannel, setupParticipantSubscription, cleanupAllConnections, startDurationTimer],
  );

  const joinGroupCall = useCallback(
    async (cId: string) => {
      if (!user || !isWeb || callState !== 'idle') return;

      log('CALL', `Joining call ${cId}`);
      setError(null);
      setCallState('connecting');

      // Fetch call record
      const { data: callRecord } = await supabase
        .from('group_calls')
        .select('*')
        .eq('id', cId)
        .maybeSingle();

      if (!callRecord || callRecord.status !== 'active') {
        setError('This call has ended.');
        setCallState('idle');
        return;
      }

      const type: GroupCallType = callRecord.call_type === 'video' ? 'video' : 'audio';
      callTypeRef.current = type;
      callIdRef.current = cId;
      groupIdRef.current = callRecord.chat_id;

      setCallType(type);
      setCallId(cId);
      setGroupId(callRecord.chat_id);

      // Fetch group info
      const { data: chatRow } = await supabase
        .from('chats')
        .select('group_name, group_avatar_url')
        .eq('id', callRecord.chat_id)
        .maybeSingle();
      setGroupName(chatRow?.group_name ?? 'Group');
      setGroupAvatar(chatRow?.group_avatar_url ?? null);

      const stream = await getLocalMedia(type === 'video');
      if (!stream) {
        setCallState('idle');
        return;
      }

      // Add self as participant
      await supabase.from('group_call_participants').insert({
        call_id: cId,
        user_id: user.id,
        is_muted: false,
        is_camera_off: type !== 'video',
      });

      // Set up signaling
      setupSignalChannel(cId);
      participantChannelRef.current = setupParticipantSubscription(cId);

      // Fetch existing participants
      const existingParticipants = await fetchParticipants(cId);
      setParticipants([
        {
          userId: user.id,
          name: 'You',
          avatarUrl: null,
          isMuted: false,
          isCameraOff: type !== 'video',
          connectionState: 'connected',
          stream: stream,
          isLocal: true,
          joinedAt: new Date().toISOString(),
        },
        ...existingParticipants.filter((p) => p.userId !== user.id),
      ]);

      // Initiate connections to existing participants
      for (const p of existingParticipants) {
        if (p.userId !== user.id) {
          if (user.id < p.userId) {
            createPeerConnection(p.userId, true);
          }
        }
      }

      setCallState('connected');
      startDurationTimer();
    },
    [user, isWeb, callState, getLocalMedia, setupSignalChannel, setupParticipantSubscription, fetchParticipants, createPeerConnection, startDurationTimer],
  );

  const leaveCall = useCallback(async () => {
    if (!user || !callIdRef.current) return;

    log('CALL', 'Leaving call');

    // Notify others
    const otherParticipants = participants.filter((p) => !p.isLocal);
    for (const p of otherParticipants) {
      await sendSignal(p.userId, 'leave', {});
    }

    // Mark left in DB
    await supabase
      .from('group_call_participants')
      .update({ left_at: new Date().toISOString() })
      .eq('call_id', callIdRef.current)
      .eq('user_id', user.id);

    // Check if anyone is left; if not, end the call
    const { count } = await supabase
      .from('group_call_participants')
      .select('*', { count: 'exact', head: true })
      .eq('call_id', callIdRef.current)
      .is('left_at', null);

    if (!count || count === 0) {
      await supabase
        .from('group_calls')
        .update({ status: 'ended' })
        .eq('id', callIdRef.current);
    }

    // Cleanup
    cleanupAllConnections();
    if (signalChannelRef.current) {
      supabase.removeChannel(signalChannelRef.current);
      signalChannelRef.current = null;
    }
    if (participantChannelRef.current) {
      supabase.removeChannel(participantChannelRef.current);
      participantChannelRef.current = null;
    }

    setCallState('idle');
    setCallType('audio');
    setGroupId(null);
    setGroupName(null);
    setGroupAvatar(null);
    setCallId(null);
    setIsMuted(false);
    setIsCameraOff(false);
    setCallDuration(0);
    setError(null);
    callIdRef.current = null;
    groupIdRef.current = null;
    processedSignalsRef.current.clear();
    profileCacheRef.current.clear();
  }, [user, participants, sendSignal, cleanupAllConnections]);

  const acceptIncomingCall = useCallback(async () => {
    if (!incomingCallRef.current) return;
    const { callId: cId } = incomingCallRef.current;
    incomingCallRef.current = null;
    await joinGroupCall(cId);
  }, [joinGroupCall]);

  const declineIncomingCall = useCallback(() => {
    incomingCallRef.current = null;
    setIncomingCall(null);
  }, []);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    const newMuted = !isMuted;
    audioTracks.forEach((track) => {
      track.enabled = !newMuted;
    });
    setIsMuted(newMuted);
    updateParticipant(user?.id ?? '', { isMuted: newMuted });

    // Broadcast mute state
    if (callIdRef.current) {
      const otherParticipants = participants.filter((p) => !p.isLocal);
      for (const p of otherParticipants) {
        sendSignal(p.userId, 'mute-state', { muted: newMuted });
      }
    }

    // Update DB
    if (user && callIdRef.current) {
      supabase
        .from('group_call_participants')
        .update({ is_muted: newMuted })
        .eq('call_id', callIdRef.current)
        .eq('user_id', user.id);
    }
  }, [isMuted, user, callIdRef, participants, sendSignal, updateParticipant]);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTracks = localStreamRef.current.getVideoTracks();
    const newOff = !isCameraOff;
    videoTracks.forEach((track) => {
      track.enabled = !newOff;
    });
    setIsCameraOff(newOff);
    updateParticipant(user?.id ?? '', { isCameraOff: newOff });

    // Broadcast camera state
    if (callIdRef.current) {
      const otherParticipants = participants.filter((p) => !p.isLocal);
      for (const p of otherParticipants) {
        sendSignal(p.userId, 'camera-state', { cameraOff: newOff });
      }
    }

    // Update DB
    if (user && callIdRef.current) {
      supabase
        .from('group_call_participants')
        .update({ is_camera_off: newOff })
        .eq('call_id', callIdRef.current)
        .eq('user_id', user.id);
    }
  }, [isCameraOff, user, callIdRef, participants, sendSignal, updateParticipant]);

  const dismissError = useCallback(() => setError(null), []);

  // Incoming call state
  const [incomingCall, setIncomingCall] = useState<{
    callId: string;
    groupId: string;
    groupName: string;
    groupAvatar: string | null;
    callerId: string;
    callType: GroupCallType;
    participantCount: number;
  } | null>(null);
  const incomingCallRef = useRef<typeof incomingCall>(null);
  incomingCallRef.current = incomingCall;

  // Listen for incoming group calls
  useEffect(() => {
    if (!user || !isWeb) return;
    if (callState !== 'idle') return;

    const channel = supabase
      .channel(`incoming-group-calls-${user.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_calls', filter: `caller_id=neq.${user.id}` },
        async (payload) => {
          const call = payload.new as any;
          if (call.status !== 'active') return;

          // Check if user is a member of this group
          const { data: membership } = await supabase
            .from('chat_participants')
            .select('chat_id')
            .eq('chat_id', call.chat_id)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!membership) return;

          // Fetch group info
          const { data: chatRow } = await supabase
            .from('chats')
            .select('group_name, group_avatar_url')
            .eq('id', call.chat_id)
            .maybeSingle();

          // Count current participants
          const { count } = await supabase
            .from('group_call_participants')
            .select('*', { count: 'exact', head: true })
            .eq('call_id', call.id)
            .is('left_at', null);

          setIncomingCall({
            callId: call.id,
            groupId: call.chat_id,
            groupName: chatRow?.group_name ?? 'Group',
            groupAvatar: chatRow?.group_avatar_url ?? null,
            callerId: call.caller_id,
            callType: call.call_type as GroupCallType,
            participantCount: count ?? 1,
          });
        },
      )
      .subscribe();

    incomingChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      incomingChannelRef.current = null;
    };
  }, [user, isWeb, callState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAllConnections();
      if (signalChannelRef.current) {
        supabase.removeChannel(signalChannelRef.current);
      }
      if (participantChannelRef.current) {
        supabase.removeChannel(participantChannelRef.current);
      }
    };
  }, [cleanupAllConnections]);

  return (
    <GroupCallContext.Provider
      value={{
        callState,
        callType,
        groupId,
        groupName,
        groupAvatar,
        callId,
        participants,
        callDuration,
        isMuted,
        isCameraOff,
        localStream,
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
      }}
    >
      {children}
    </GroupCallContext.Provider>
  );
}

export function useGroupCall() {
  const ctx = useContext(GroupCallContext);
  if (!ctx) throw new Error('useGroupCall must be used within GroupCallProvider');
  return ctx;
}
