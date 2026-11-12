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
import { CallHistoryStatus, Profile } from './types';
import { recordCallHistory } from './callHistory';

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';
export type CallType = 'audio' | 'video';

type SignalType = 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'reject';

type SignalingMessage = {
  id: string;
  caller_id: string;
  callee_id: string;
  sender_id: string;
  type: SignalType;
  payload: any;
  call_type: CallType | null;
  call_id: string;
  created_at: string;
};

type CallContextType = {
  callState: CallState;
  callType: CallType;
  callerProfile: Profile | null;
  calleeProfile: Profile | null;
  isCaller: boolean;
  callDuration: number;
  isMuted: boolean;
  isSpeakerOn: boolean;
  isCameraOff: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteStreamVersion: number;
  startCall: (callee: Profile, video?: boolean) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleCamera: () => void;
};

const CallContext = createContext<CallContextType | undefined>(undefined);

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
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
  {
    urls: 'turns:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

const CALL_TIMEOUT_MS = 45000;
const SIGNALING_POLL_INTERVAL_MS = 2000;
const SUBSCRIBE_TIMEOUT_MS = 10000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateCallId(): string {
  return crypto.randomUUID();
}

function resolveCallStatus(
  connected: boolean,
  isCaller: boolean,
  endReason: 'declined' | 'unanswered' | null,
): CallHistoryStatus {
  if (connected) return 'completed';
  if (endReason === 'declined') return 'declined';
  if (endReason === 'unanswered' || !isCaller) return 'missed';
  return 'cancelled';
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [callState, setCallState] = useState<CallState>('idle');
  const [callType, setCallType] = useState<CallType>('audio');
  const [callerProfile, setCallerProfile] = useState<Profile | null>(null);
  const [calleeProfile, setCalleeProfile] = useState<Profile | null>(null);
  const [isCaller, setIsCaller] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [remoteStreamVersion, setRemoteStreamVersion] = useState(0);
  const callChannelRef = useRef<any>(null);
  const incomingChannelRef = useRef<any>(null);
  const callPartnerIdRef = useRef<string | null>(null);
  const callCallerIdRef = useRef<string | null>(null);
  const callCalleeIdRef = useRef<string | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callTypeRef = useRef<CallType>('audio');
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const processedMsgIdsRef = useRef<Set<string>>(new Set());
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCallerRef = useRef(false);
  const wasConnectedRef = useRef(false);
  const iceRestartedRef = useRef(false);
  const connectedAtRef = useRef<number>(0);
  const endReasonRef = useRef<'declined' | 'unanswered' | null>(null);
  const incomingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resettingRef = useRef(false);

  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    if (!isWeb) return;
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute('playsinline', 'true');
    remoteAudioRef.current = audio;
    return () => {
      audio.srcObject = null;
      remoteAudioRef.current = null;
    };
  }, [isWeb]);

  const sendSignal = useCallback(
    async (toId: string, type: SignalType, payload: any) => {
      if (!user || !callIdRef.current) return;
      const callerId = callCallerIdRef.current ?? user.id;
      const calleeId = callCalleeIdRef.current ?? toId;
      await supabase.from('call_signaling').insert({
        caller_id: callerId,
        callee_id: calleeId,
        sender_id: user.id,
        type,
        payload,
        call_type: callTypeRef.current,
        call_id: callIdRef.current,
      });
    },
    [user],
  );

  const cleanupSignaling = useCallback(async () => {
    const callId = callIdRef.current;
    if (!callId) return;
    await supabase.from('call_signaling').delete().eq('call_id', callId);
  }, []);

  const stopMedia = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((t) => {
        t.onunmute = null;
        t.stop();
      });
      remoteStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteStreamVersion(0);
    pendingCandidatesRef.current = [];
    processedMsgIdsRef.current.clear();
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const stopTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const stopIncomingTimeout = useCallback(() => {
    if (incomingTimeoutRef.current) {
      clearTimeout(incomingTimeoutRef.current);
      incomingTimeoutRef.current = null;
    }
  }, []);

  const resetCall = useCallback(async () => {
    if (resettingRef.current) return;
    resettingRef.current = true;
    if (user && callIdRef.current && callPartnerIdRef.current) {
      recordCallHistory({
        userId: user.id,
        peerId: callPartnerIdRef.current,
        callId: callIdRef.current,
        direction: isCallerRef.current ? 'outgoing' : 'incoming',
        callType: callTypeRef.current,
        status: resolveCallStatus(wasConnectedRef.current, isCallerRef.current, endReasonRef.current),
        durationSeconds: connectedAtRef.current ? Math.round((Date.now() - connectedAtRef.current) / 1000) : 0,
      });
    }
    await cleanupSignaling();
    stopMedia();
    stopDurationTimer();
    stopTimeout();
    stopPolling();
    stopIncomingTimeout();
    setCallState('idle');
    setCallType('audio');
    setCallerProfile(null);
    setCalleeProfile(null);
    setIsCaller(false);
    setIsMuted(false);
    setIsSpeakerOn(true);
    setIsCameraOff(false);
    setCallDuration(0);
    callPartnerIdRef.current = null;
    callCallerIdRef.current = null;
    callCalleeIdRef.current = null;
    callIdRef.current = null;
    callTypeRef.current = 'audio';
    isCallerRef.current = false;
    wasConnectedRef.current = false;
    iceRestartedRef.current = false;
    connectedAtRef.current = 0;
    endReasonRef.current = null;
    if (callChannelRef.current) {
      supabase.removeChannel(callChannelRef.current);
      callChannelRef.current = null;
    }
    resettingRef.current = false;
  }, [user, stopMedia, stopDurationTimer, stopTimeout, stopPolling, stopIncomingTimeout, cleanupSignaling]);

  const restartIce = useCallback(
    async (pc: RTCPeerConnection, partnerId: string) => {
      iceRestartedRef.current = true;
      try {
        const offer = await pc.createOffer({
          iceRestart: true,
          offerToReceiveAudio: true,
          offerToReceiveVideo: callTypeRef.current === 'video',
        });
        await pc.setLocalDescription(offer);
        await sendSignal(partnerId, 'offer', offer);
      } catch (e) {
        await resetCall();
      }
    },
    [sendSignal, resetCall],
  );

  const startDurationTimer = useCallback(() => {
    stopDurationTimer();
    setCallDuration(0);
    durationTimerRef.current = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);
  }, [stopDurationTimer]);

  const handleSignalingMessage = useCallback(
    async (msg: SignalingMessage) => {
      // Only process messages for the current call
      if (!callIdRef.current || msg.call_id !== callIdRef.current) return;
      if (processedMsgIdsRef.current.has(msg.id)) return;
      processedMsgIdsRef.current.add(msg.id);

      const pc = pcRef.current;
      if (!pc) return;

      if (msg.type === 'offer' && !isCallerRef.current && pc.remoteDescription && pc.signalingState === 'stable') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal(msg.sender_id, 'answer', answer);
        } catch (e) {
          await resetCall();
        }
        return;
      }

      if (msg.type === 'answer' && isCallerRef.current) {
        stopTimeout();
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
        } catch (e) {
          // may already be set
        }
        for (const candidate of pendingCandidatesRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            // ignore
          }
        }
        pendingCandidatesRef.current = [];
      } else if (msg.type === 'ice-candidate') {
        if (pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.payload));
          } catch (e) {
            // ignore
          }
        } else {
          pendingCandidatesRef.current.push(msg.payload);
        }
      } else if (msg.type === 'hangup' || msg.type === 'reject') {
        if (msg.type === 'reject') endReasonRef.current = 'declined';
        await resetCall();
      }
    },
    [sendSignal, resetCall, stopTimeout],
  );

  const pollMissedMessages = useCallback(
    async (partnerId: string) => {
      if (!user || !callIdRef.current) return;
      const { data: missed } = await supabase
        .from('call_signaling')
        .select('*')
        .eq('sender_id', partnerId)
        .eq('call_id', callIdRef.current)
        .order('created_at', { ascending: true });

      if (missed) {
        for (const msg of missed as SignalingMessage[]) {
          await handleSignalingMessage(msg);
        }
      }
    },
    [user, handleSignalingMessage],
  );

  const startPolling = useCallback(
    (partnerId: string) => {
      stopPolling();
      pollTimerRef.current = setInterval(() => {
        pollMissedMessages(partnerId);
      }, SIGNALING_POLL_INTERVAL_MS);
    },
    [stopPolling, pollMissedMessages],
  );

  const waitForSubscription = useCallback(
    (channel: any): Promise<void> => {
      return new Promise((resolve) => {
        let resolved = false;
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        }, SUBSCRIBE_TIMEOUT_MS);

        channel.subscribe((status: string) => {
          if (status === 'SUBSCRIBED' && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve();
          }
        });
      });
    },
    [],
  );

  const setupPeerConnection = useCallback(
    async (partnerId: string, callerIsMe: boolean) => {
      if (!isWeb || !user || !callIdRef.current) return null;
      isCallerRef.current = callerIsMe;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      // Create remote stream upfront so StreamView can mount before tracks arrive
      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
        setRemoteStream(remoteStreamRef.current);
      }
      const remoteStream = remoteStreamRef.current;

      pc.ontrack = (event) => {
        if (event.track) {
          const existing = remoteStream.getTracks().find((t) => t.id === event.track.id);
          if (!existing) {
            remoteStream.addTrack(event.track);
          }
        }

        setRemoteStreamVersion((v) => v + 1);

        if (callTypeRef.current === 'audio' && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(partnerId, 'ice-candidate', event.candidate.toJSON());
        }
      };

      let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let iceFailureTimer: ReturnType<typeof setTimeout> | null = null;

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        if (state === 'connected' || state === 'completed') {
          wasConnectedRef.current = true;
          if (disconnectTimer) {
            clearTimeout(disconnectTimer);
            disconnectTimer = null;
          }
          if (iceFailureTimer) {
            clearTimeout(iceFailureTimer);
            iceFailureTimer = null;
          }
          stopTimeout();
          stopPolling();
          if (!connectedAtRef.current) connectedAtRef.current = Date.now();
          setCallState('connected');
          startDurationTimer();
        } else if (state === 'failed') {
          if (disconnectTimer) {
            clearTimeout(disconnectTimer);
            disconnectTimer = null;
          }
          if (iceFailureTimer) {
            clearTimeout(iceFailureTimer);
            iceFailureTimer = null;
          }
          if (isCallerRef.current && !iceRestartedRef.current) {
            restartIce(pc, partnerId);
          } else {
            resetCall();
          }
        } else if (state === 'disconnected') {
          if (wasConnectedRef.current && !disconnectTimer) {
            disconnectTimer = setTimeout(() => {
              disconnectTimer = null;
              if (pc.iceConnectionState === 'disconnected') {
                resetCall();
              }
            }, 10000);
          }
        } else if (state === 'checking') {
          if (!iceFailureTimer && !wasConnectedRef.current) {
            iceFailureTimer = setTimeout(() => {
              iceFailureTimer = null;
              if (!wasConnectedRef.current && pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
                resetCall();
              }
            }, 15000);
          }
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          resetCall();
        }
      };

      try {
        const constraints: MediaStreamConstraints =
          callTypeRef.current === 'video'
            ? { audio: true, video: { facingMode: 'user', width: 640, height: 480 } }
            : { audio: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        setLocalStream(stream);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      } catch (err) {
        console.warn('Failed to get user media:', err);
        await resetCall();
        return null;
      }

      // Subscribe to realtime messages from partner for THIS call only
      const channel = supabase
        .channel(`call-${callIdRef.current}-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'call_signaling',
            filter: `sender_id=eq.${partnerId}`,
          },
          (payload) => {
            const msg = payload.new as SignalingMessage;
            handleSignalingMessage(msg);
          },
        );

      callChannelRef.current = channel;

      await waitForSubscription(channel);

      // Fetch any messages that were sent before subscription was ready
      await pollMissedMessages(partnerId);

      // Start periodic polling as a safety net
      startPolling(partnerId);

      return pc;
    },
    [isWeb, user, sendSignal, resetCall, restartIce, handleSignalingMessage, pollMissedMessages, startPolling, stopPolling, waitForSubscription, startDurationTimer, stopTimeout],
  );

  // Listen for incoming calls and hangup signals (when idle or incoming)
  useEffect(() => {
    if (!user || !isWeb) return;
    if (callState !== 'idle' && callState !== 'incoming') return;

    const channel = supabase
      .channel(`incoming-calls-${user.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_signaling',
          filter: `callee_id=eq.${user.id}`,
        },
        async (payload) => {
          const msg = payload.new as SignalingMessage;
          if (msg.sender_id === user.id) return;

          if (msg.type === 'offer' && !callPartnerIdRef.current) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', msg.sender_id)
              .maybeSingle();

            if (profile && !callPartnerIdRef.current) {
              callPartnerIdRef.current = msg.sender_id;
              callCallerIdRef.current = msg.caller_id;
              callCalleeIdRef.current = msg.callee_id;
              callIdRef.current = msg.call_id;
              const type: CallType = msg.call_type === 'video' ? 'video' : 'audio';
              callTypeRef.current = type;
              setCallType(type);
              setCallerProfile(profile as Profile);
              setIsCaller(false);
              setCallState('incoming');

              incomingTimeoutRef.current = setTimeout(() => {
                endReasonRef.current = 'unanswered';
                resetCall();
              }, CALL_TIMEOUT_MS);
            }
          } else if (msg.type === 'hangup' || msg.type === 'reject') {
            if (callIdRef.current && msg.call_id === callIdRef.current) {
              await resetCall();
            }
          }
        },
      )
      .subscribe();

    incomingChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      incomingChannelRef.current = null;
    };
  }, [user, isWeb, callState, resetCall]);

  const startCall = useCallback(
    async (callee: Profile, video?: boolean) => {
      if (!user || !isWeb || callState !== 'idle') return;

      const type: CallType = video ? 'video' : 'audio';
      const callId = generateCallId();
      callIdRef.current = callId;
      callPartnerIdRef.current = callee.id;
      callCallerIdRef.current = user.id;
      callCalleeIdRef.current = callee.id;
      callTypeRef.current = type;
      isCallerRef.current = true;

      setCalleeProfile(callee);
      setIsCaller(true);
      setCallType(type);
      setIsCameraOff(false);
      setCallState('calling');

      const pc = await setupPeerConnection(callee.id, true);
      if (!pc) return;

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video',
      });
      await pc.setLocalDescription(offer);

      await sleep(100);

      await sendSignal(callee.id, 'offer', offer);

      timeoutRef.current = setTimeout(() => {
        endReasonRef.current = 'unanswered';
        resetCall();
      }, CALL_TIMEOUT_MS);
    },
    [user, isWeb, callState, setupPeerConnection, sendSignal, resetCall],
  );

  const acceptCall = useCallback(async () => {
    if (!user || !isWeb || !callerProfile || !callIdRef.current) return;
    stopIncomingTimeout();
    setCallState('calling');

    const partnerId = callPartnerIdRef.current!;

    const pc = await setupPeerConnection(partnerId, false);
    if (!pc) return;

    // Fetch the offer message for this specific call
    const { data: messages } = await supabase
      .from('call_signaling')
      .select('*')
      .eq('call_id', callIdRef.current)
      .eq('type', 'offer')
      .order('created_at', { ascending: false })
      .limit(1);

    if (messages && messages.length > 0) {
      const offerMsg = messages[0] as SignalingMessage;
      processedMsgIdsRef.current.add(offerMsg.id);
      const offer = offerMsg.payload;

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Apply any buffered ICE candidates
      for (const candidate of pendingCandidatesRef.current) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          // ignore
        }
      }
      pendingCandidatesRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await sleep(100);

      await sendSignal(partnerId, 'answer', answer);

      // Poll for any ICE candidates the caller already sent
      await pollMissedMessages(partnerId);
    } else {
      await resetCall();
    }
  }, [user, isWeb, callerProfile, setupPeerConnection, sendSignal, pollMissedMessages, resetCall, stopIncomingTimeout]);

  const rejectCall = useCallback(async () => {
    if (!user || !callPartnerIdRef.current) return;
    stopIncomingTimeout();
    endReasonRef.current = 'declined';
    await sendSignal(callPartnerIdRef.current, 'reject', {});
    await resetCall();
  }, [user, sendSignal, resetCall, stopIncomingTimeout]);

  const endCall = useCallback(async () => {
    if (!user || !callPartnerIdRef.current) return;
    await sendSignal(callPartnerIdRef.current, 'hangup', {});
    await resetCall();
  }, [user, sendSignal, resetCall]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    const newMuted = !isMuted;
    audioTracks.forEach((track) => {
      track.enabled = !newMuted;
    });
    setIsMuted(newMuted);
  }, [isMuted]);

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn((prev) => !prev);
  }, []);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTracks = localStreamRef.current.getVideoTracks();
    const newOff = !isCameraOff;
    videoTracks.forEach((track) => {
      track.enabled = !newOff;
    });
    setIsCameraOff(newOff);
  }, [isCameraOff]);

  return (
    <CallContext.Provider
      value={{
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
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleSpeaker,
        toggleCamera,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
