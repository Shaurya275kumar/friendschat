import { supabase } from './supabase';
import { ChatWithDetails, Message, Profile, Story, StoryWithUser } from './types';

export async function getOrCreateChat(otherUserId: string, _currentUserId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_or_get_chat', {
    other_user_id: otherUserId,
  });
  if (error) return null;
  return data as string;
}

export async function createGroupChat(
  groupName: string,
  memberIds: string[],
): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_group_chat', {
    p_group_name: groupName,
    p_member_ids: memberIds,
  });
  if (error) return null;
  return data as string;
}

export async function fetchChatsList(
  currentUserId: string,
): Promise<ChatWithDetails[] | null> {
  const { data: myChats, error: e1 } = await supabase
    .from('chat_participants')
    .select('chat_id')
    .eq('user_id', currentUserId);
  if (e1) return null;
  if (!myChats || myChats.length === 0) return [];

  const chatIds = myChats.map((c) => c.chat_id);

  // Fetch chat rows to know which are groups
  const { data: chatRows, error: eChat } = await supabase
    .from('chats')
    .select('id, created_at, is_group, group_name, group_avatar_url')
    .in('id', chatIds);
  if (eChat || !chatRows) return null;

  const { data: participants, error: e2 } = await supabase
    .from('chat_participants')
    .select('chat_id, user_id')
    .in('chat_id', chatIds);
  if (e2 || !participants) return null;

  // Collect all user IDs we need to fetch profiles for
  const allUserIds = Array.from(
    new Set(participants.map((p) => p.user_id)),
  );

  const { data: profiles, error: e3 } = await supabase
    .from('profiles')
    .select('*')
    .in('id', allUserIds);
  if (e3 || !profiles) return null;

  const profileMap = new Map<string, Profile>();
  for (const prof of profiles as Profile[]) {
    profileMap.set(prof.id, prof);
  }

  // Build chatId -> participants map
  const chatParticipants = new Map<string, Profile[]>();
  const chatToOtherUser = new Map<string, string>();
  for (const p of participants) {
    const prof = profileMap.get(p.user_id);
    if (!prof) continue;
    if (!chatParticipants.has(p.chat_id)) {
      chatParticipants.set(p.chat_id, []);
    }
    chatParticipants.get(p.chat_id)!.push(prof);
    if (p.user_id !== currentUserId) {
      chatToOtherUser.set(p.chat_id, p.user_id);
    }
  }

  const { data: lastMessages } = await supabase
    .from('messages')
    .select('chat_id, body, media_url, media_type, created_at, sender_id, deleted_at, id, edited_at')
    .in('chat_id', chatIds)
    .order('created_at', { ascending: false });

  const latestPerChat = new Map<string, Message>();
  if (lastMessages) {
    for (const msg of lastMessages as Message[]) {
      if (!latestPerChat.has(msg.chat_id)) {
        latestPerChat.set(msg.chat_id, msg);
      }
    }
  }

  const chats: ChatWithDetails[] = [];
  for (const chatRow of chatRows as any[]) {
    const parts = chatParticipants.get(chatRow.id) ?? [];
    const otherUserId = chatToOtherUser.get(chatRow.id);
    const otherUser = otherUserId ? profileMap.get(otherUserId) : null;
    if (!otherUser && !chatRow.is_group) continue;

    chats.push({
      id: chatRow.id,
      created_at: chatRow.created_at ?? '',
      is_group: chatRow.is_group ?? false,
      group_name: chatRow.group_name,
      group_avatar_url: chatRow.group_avatar_url,
      other_user: otherUser ?? parts[0] ?? ({} as Profile),
      participants: parts,
      last_message: latestPerChat.get(chatRow.id) ?? undefined,
    });
  }

  chats.sort((a, b) => {
    const at = a.last_message?.created_at ?? '';
    const bt = b.last_message?.created_at ?? '';
    return bt.localeCompare(at);
  });

  return chats;
}

export async function fetchMessages(chatId: string, userId?: string): Promise<Message[] | null> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });
  if (error) return null;

  if (!userId) return data as Message[];

  const { data: deletions } = await supabase
    .from('message_deletions')
    .select('message_id')
    .eq('user_id', userId);

  if (deletions && deletions.length > 0) {
    const deletedForMe = new Set(deletions.map((d) => d.message_id));
    return (data as Message[]).filter((m) => !deletedForMe.has(m.id));
  }

  return data as Message[];
}

export async function sendMessage(
  chatId: string,
  senderId: string,
  body: string | null,
  mediaUrl?: string | null,
  mediaType?: 'image' | 'video' | null,
): Promise<{ message: Message | null; error: string | null }> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      sender_id: senderId,
      body,
      media_url: mediaUrl ?? null,
      media_type: mediaType ?? null,
    })
    .select()
    .single();
  if (error) return { message: null, error: error.message };
  return { message: data as Message, error: null };
}

export async function editMessage(messageId: string, newBody: string): Promise<boolean> {
  const { error } = await supabase
    .from('messages')
    .update({ body: newBody, edited_at: new Date().toISOString() })
    .eq('id', messageId);
  return !error;
}

export async function deleteMessage(messageId: string): Promise<boolean> {
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString(), body: null, media_url: null, media_type: null })
    .eq('id', messageId);
  return !error;
}

export async function deleteMessageForMe(messageId: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('message_deletions')
    .upsert({
      message_id: messageId,
      user_id: userId,
      deleted_at: new Date().toISOString(),
    });
  return !error;
}

export async function uploadMedia(filePath: string, mimeType: string, currentUserId: string): Promise<string | null> {
  const ext = filePath.split('.').pop() ?? 'jpg';
  const path = `${currentUserId}/${Date.now()}.${ext}`;

  let body: Blob | FormData;
  if (typeof window !== 'undefined') {
    const response = await fetch(filePath);
    body = await response.blob();
  } else {
    const formData = new FormData();
    formData.append('file', {
      uri: filePath,
      name: path,
      type: mimeType,
    } as any);
    body = formData;
  }

  const { error } = await supabase.storage.from('media').upload(path, body, {
    contentType: mimeType,
  });
  if (error) return null;
  const { data } = supabase.storage.from('media').getPublicUrl(path);
  return data.publicUrl;
}

export async function fetchAllUsers(currentUserId: string): Promise<Profile[] | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', currentUserId)
    .order('name', { ascending: true });
  if (error) return null;
  return data as Profile[];
}

export async function searchUserByEmail(email: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  if (error) return null;
  return data as Profile | null;
}

// ===== Stories =====

export async function fetchActiveStories(): Promise<StoryWithUser[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('stories')
    .select('*, user:profiles!stories_user_id_fkey(*)')
    .gt('expires_at', now)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as StoryWithUser[];
}

export async function fetchMyStories(currentUserId: string): Promise<Story[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('user_id', currentUserId)
    .gt('expires_at', now)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as Story[];
}

export async function fetchStoryViews(storyId: string): Promise<number> {
  const { count, error } = await supabase
    .from('story_views')
    .select('*', { count: 'exact', head: true })
    .eq('story_id', storyId);
  if (error) return 0;
  return count ?? 0;
}

export async function hasViewedStory(storyId: string, viewerId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('story_views')
    .select('story_id')
    .eq('story_id', storyId)
    .eq('viewer_id', viewerId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

export async function markStoryViewed(storyId: string, viewerId: string): Promise<void> {
  await supabase.from('story_views').upsert({
    story_id: storyId,
    viewer_id: viewerId,
    viewed_at: new Date().toISOString(),
  });
}

export async function createStory(
  userId: string,
  mediaUrl: string,
  mediaType: 'image' | 'video',
  caption?: string | null,
): Promise<Story | null> {
  const { data, error } = await supabase
    .from('stories')
    .insert({
      user_id: userId,
      media_url: mediaUrl,
      media_type: mediaType,
      caption: caption ?? null,
    })
    .select()
    .single();
  if (error) return null;
  return data as Story;
}

export async function deleteStory(storyId: string): Promise<boolean> {
  const { error } = await supabase
    .from('stories')
    .delete()
    .eq('id', storyId);
  return !error;
}
