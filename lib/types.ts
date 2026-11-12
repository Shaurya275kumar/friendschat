export type Profile = {
  id: string;
  phone: string | null;
  email: string | null;
  name: string;
  avatar_url: string | null;
  about: string;
  status: string | null;
  is_online: boolean;
  last_seen: string;
  created_at: string;
};

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  requester?: Profile;
  addressee?: Profile;
};

export type Chat = {
  id: string;
  created_at: string;
  is_group: boolean;
  group_name: string | null;
  group_avatar_url: string | null;
};

export type MessageType = 'image' | 'video' | null;

export type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  body: string | null;
  media_url: string | null;
  media_type: MessageType;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type ChatWithDetails = {
  id: string;
  created_at: string;
  is_group: boolean;
  group_name: string | null;
  group_avatar_url: string | null;
  other_user: Profile;
  participants: Profile[];
  last_message?: Message;
};

export type Story = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  caption: string | null;
  created_at: string;
  expires_at: string;
  viewed?: boolean;
};

export type StoryWithUser = Story & {
  user: Profile;
};

export type StoryView = {
  story_id: string;
  viewer_id: string;
  viewed_at: string;
};

export type GroupCallType = 'audio' | 'video';
export type GroupCallStatus = 'active' | 'ended';
export type GroupCallParticipantStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';

export type GroupCall = {
  id: string;
  chat_id: string;
  caller_id: string;
  call_type: GroupCallType;
  status: GroupCallStatus;
  created_at: string;
};

export type GroupCallParticipant = {
  user_id: string;
  joined_at: string;
  left_at: string | null;
  is_muted: boolean;
  is_camera_off: boolean;
  profile?: Profile;
};

export type GroupCallParticipantState = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isMuted: boolean;
  isCameraOff: boolean;
  connectionState: GroupCallParticipantStatus;
  stream: MediaStream | null;
  isLocal: boolean;
  joinedAt: string;
};

export type GroupCallState = 'idle' | 'ringing' | 'incoming' | 'joining' | 'connecting' | 'connected' | 'reconnecting' | 'ended';

export type CallDirection = 'outgoing' | 'incoming';
export type CallHistoryStatus = 'completed' | 'missed' | 'declined' | 'cancelled';

export type CallHistoryEntry = {
  id: string;
  peer_id: string;
  direction: CallDirection;
  call_type: 'audio' | 'video';
  status: CallHistoryStatus;
  duration_seconds: number;
  created_at: string;
  peer: Profile | null;
};
