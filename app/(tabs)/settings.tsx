import { useState } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  Image,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme, ThemeMode } from '@/lib/theme';
import {
  Pencil,
  ChevronRight,
  LogOut,
  Info,
  Bell,
  Lock,
  HelpCircle,
  X,
  MessageCircle,
  Shield,
  Eye,
  Trash2,
  Sun,
  Moon,
  Monitor,
  UserX,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';

export default function SettingsScreen() {
  const { profile, signOut, user, updatePresence } = useAuth();
  const { colors: c, isDark, mode, setMode } = useTheme();
  const [notifModal, setNotifModal] = useState(false);
  const [privacyModal, setPrivacyModal] = useState(false);
  const [aboutModal, setAboutModal] = useState(false);
  const [helpModal, setHelpModal] = useState(false);
  const [themeModal, setThemeModal] = useState(false);

  const [notifEnabled, setNotifEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrateEnabled, setVibrateEnabled] = useState(false);
  const [readReceipts, setReadReceipts] = useState(true);
  const [onlineStatus, setOnlineStatus] = useState(true);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account, all your messages, stories, call history, and forget your email. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            await updatePresence(false);
            const { error } = await supabase.from('profiles').delete().eq('id', user.id);
            if (error) {
              Alert.alert('Error', 'Could not delete account. Please try again.');
              return;
            }
            await signOut();
          },
        },
      ],
    );
  };

  const handleClearChatHistory = () => {
    Alert.alert(
      'Clear All Chats',
      'This will permanently delete all your messages in all conversations. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            const { data: chats } = await supabase
              .from('chat_participants')
              .select('chat_id')
              .eq('user_id', user.id);
            if (!chats || chats.length === 0) return;
            const chatIds = chats.map((c) => c.chat_id);
            await supabase.from('messages').delete().in('chat_id', chatIds);
            Alert.alert('Done', 'All your messages have been cleared.');
          },
        },
      ],
    );
  };

  const themeOptions: { key: ThemeMode; label: string; icon: any }[] = [
    { key: 'light', label: 'Light', icon: Sun },
    { key: 'dark', label: 'Dark', icon: Moon },
    { key: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.pageTitle, { color: c.text }]}>Settings</Text>

        <TouchableOpacity
          style={[styles.profileCard, { backgroundColor: c.surface }]}
          onPress={() => router.push('/edit-profile')}
          activeOpacity={0.8}
        >
          <View style={styles.avatarWrap}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: c.primary[200], justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={[styles.avatarText, { color: c.primary[isDark ? 400 : 800] }]}>
                  {profile?.name?.charAt(0).toUpperCase() ?? '?'}
                </Text>
              </View>
            )}
            {profile?.is_online && <View style={[styles.onlineDot, { borderColor: c.surface }]} />}
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: c.text }]}>{profile?.name ?? 'Unknown'}</Text>
            <Text style={[styles.profileAbout, { color: c.textSecondary }]}>{profile?.about || 'No about set'}</Text>
            {profile?.status ? (
              <Text style={[styles.profileStatus, { color: c.primary[isDark ? 400 : 600] }]}>{profile.status}</Text>
            ) : null}
            <Text style={[styles.profileEmail, { color: c.textMuted }]}>{profile?.email ?? ''}</Text>
          </View>
          <View style={[styles.editBadge, { backgroundColor: c.primary[isDark ? 100 : 50] }]}>
            <Pencil size={16} color={c.primary[isDark ? 400 : 600]} strokeWidth={2} />
          </View>
        </TouchableOpacity>

        <View style={[styles.menuSection, { backgroundColor: c.surface }]}>
          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Appearance</Text>
          <TouchableOpacity
            style={[styles.menuItem, styles.menuItemLast]}
            onPress={() => setThemeModal(true)}
            activeOpacity={0.7}
          >
            <View style={styles.menuIcon}>
              {isDark ? <Moon size={20} color={c.primary[isDark ? 400 : 600]} strokeWidth={2} /> : <Sun size={20} color={c.primary[isDark ? 400 : 600]} strokeWidth={2} />}
            </View>
            <Text style={[styles.menuLabel, { color: c.text }]}>Theme</Text>
            <Text style={[styles.menuValue, { color: c.textSecondary }]}>
              {mode === 'system' ? 'System' : isDark ? 'Dark' : 'Light'}
            </Text>
            <ChevronRight size={18} color={c.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <View style={[styles.menuSection, { backgroundColor: c.surface }]}>
          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Preferences</Text>
          <MenuItem icon={Bell} label="Notifications" onPress={() => setNotifModal(true)} colors={c} isDark={isDark} />
          <MenuItem icon={Lock} label="Privacy" onPress={() => setPrivacyModal(true)} colors={c} isDark={isDark} />
          <MenuItem icon={Info} label="About FriendsChat" onPress={() => setAboutModal(true)} colors={c} isDark={isDark} />
          <MenuItem icon={HelpCircle} label="Help & Support" onPress={() => setHelpModal(true)} colors={c} isDark={isDark} last />
        </View>

        <View style={[styles.menuSection, { backgroundColor: c.surface }]}>
          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Account</Text>
          <TouchableOpacity
            style={[styles.menuItem, styles.menuItemLast, { borderBottomColor: c.border }]}
            onPress={handleClearChatHistory}
            activeOpacity={0.7}
          >
            <View style={styles.menuIcon}>
              <Trash2 size={20} color={c.error[500]} strokeWidth={2} />
            </View>
            <Text style={[styles.menuLabel, { color: c.error[500] }]}>Clear All Chats</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.menuSection, { backgroundColor: c.surface }]}>
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast, { borderBottomColor: c.border }]} onPress={handleDeleteAccount} activeOpacity={0.7}>
            <View style={styles.menuIcon}>
              <UserX size={20} color={c.error[500]} strokeWidth={2} />
            </View>
            <Text style={[styles.menuLabel, { color: c.error[500] }]}>Delete Account</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.menuSection, { backgroundColor: c.surface }]}>
          <TouchableOpacity style={styles.signOutItem} onPress={handleSignOut} activeOpacity={0.7}>
            <LogOut size={20} color={c.error[500]} strokeWidth={2} />
            <Text style={[styles.signOutText, { color: c.error[500] }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.version, { color: c.textMuted }]}>FriendsChat v1.0.0</Text>
      </ScrollView>

      {/* Theme Modal */}
      <SettingsModal visible={themeModal} onClose={() => setThemeModal(false)} title="Theme" icon={isDark ? Moon : Sun} colors={c} isDark={isDark}>
        {themeOptions.map((opt, i) => {
          const Icon = opt.icon;
          const isSelected = mode === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.themeOption, i === themeOptions.length - 1 && styles.menuItemLast, { borderBottomColor: c.border }]}
              onPress={() => { setMode(opt.key); setThemeModal(false); }}
              activeOpacity={0.7}
            >
              <View style={styles.menuIcon}>
                <Icon size={20} color={isSelected ? c.primary[isDark ? 400 : 600] : c.textSecondary} strokeWidth={2} />
              </View>
              <Text style={[styles.menuLabel, { color: c.text, flex: 1 }]}>{opt.label}</Text>
              {isSelected && (
                <View style={[styles.themeCheck, { backgroundColor: c.primary[isDark ? 400 : 500] }]}>
                  <Text style={styles.themeCheckText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </SettingsModal>

      {/* Notifications Modal */}
      <SettingsModal visible={notifModal} onClose={() => setNotifModal(false)} title="Notifications" icon={Bell} colors={c} isDark={isDark}>
        <ToggleRow label="Push notifications" value={notifEnabled} onValueChange={setNotifEnabled} colors={c} />
        <ToggleRow label="Message sound" value={soundEnabled} onValueChange={setSoundEnabled} colors={c} />
        <ToggleRow label="Vibrate on message" value={vibrateEnabled} onValueChange={setVibrateEnabled} colors={c} last />
      </SettingsModal>

      {/* Privacy Modal */}
      <SettingsModal visible={privacyModal} onClose={() => setPrivacyModal(false)} title="Privacy" icon={Shield} colors={c} isDark={isDark}>
        <ToggleRow label="Read receipts" value={readReceipts} onValueChange={setReadReceipts} colors={c} />
        <ToggleRow label="Show online status" value={onlineStatus} onValueChange={setOnlineStatus} colors={c} last />
        <View style={styles.privacyNote}>
          <Eye size={16} color={c.textMuted} strokeWidth={2} />
          <Text style={[styles.privacyNoteText, { color: c.textSecondary }]}>
            Your conversations are always private and only visible to you and the person you're chatting with.
          </Text>
        </View>
      </SettingsModal>

      {/* About Modal */}
      <SettingsModal visible={aboutModal} onClose={() => setAboutModal(false)} title="About" icon={Info} colors={c} isDark={isDark}>
        <View style={styles.aboutContent}>
          <View style={[styles.aboutLogo, { backgroundColor: c.primary[isDark ? 100 : 50] }]}>
            <Logo size={56} />
          </View>
          <Text style={[styles.aboutTitle, { color: c.text }]}>FriendsChat</Text>
          <Text style={[styles.aboutVersion, { color: c.textSecondary }]}>Version 1.0.0</Text>
          <Text style={[styles.aboutDesc, { color: c.textSecondary }]}>
            Stay connected with friends through private messages and shared status updates. All your conversations are end-to-end private.
          </Text>
        </View>
      </SettingsModal>

      {/* Help Modal */}
      <SettingsModal visible={helpModal} onClose={() => setHelpModal(false)} title="Help & Support" icon={HelpCircle} colors={c} isDark={isDark}>
        <HelpItem icon={MessageCircle} title="Getting Started" desc="Learn how to start a chat with anyone" colors={c} isDark={isDark} />
        <HelpItem icon={Eye} title="Status" desc="Share moments that last 24 hours" colors={c} isDark={isDark} />
        <HelpItem icon={Lock} title="Privacy" desc="How we keep your conversations private" colors={c} isDark={isDark} last />
      </SettingsModal>
    </View>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onPress,
  last,
  colors: c,
  isDark,
}: {
  icon: any;
  label: string;
  onPress?: () => void;
  last?: boolean;
  colors: any;
  isDark: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.menuItem, last && styles.menuItemLast, { borderBottomColor: c.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.menuIcon}>
        <Icon size={20} color={c.textSecondary} strokeWidth={2} />
      </View>
      <Text style={[styles.menuLabel, { color: c.text }]}>{label}</Text>
      <ChevronRight size={18} color={c.textMuted} strokeWidth={2} />
    </TouchableOpacity>
  );
}

function SettingsModal({
  visible,
  onClose,
  title,
  icon: Icon,
  children,
  colors: c,
  isDark,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon: any;
  children: React.ReactNode;
  colors: any;
  isDark: boolean;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: c.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
            <View style={styles.modalTitleWrap}>
              <View style={[styles.modalIcon, { backgroundColor: c.primary[isDark ? 100 : 50] }]}>
                <Icon size={20} color={c.primary[isDark ? 400 : 600]} strokeWidth={2} />
              </View>
              <Text style={[styles.modalTitle, { color: c.text }]}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <X size={20} color={c.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalBody}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  last,
  colors: c,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
  colors: any;
}) {
  return (
    <View style={[styles.toggleRow, last && styles.toggleRowLast, { borderBottomColor: c.border }]}>
      <Text style={[styles.toggleLabel, { color: c.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: c.neutral[300], true: c.primary[500] }}
        thumbColor="#fff"
      />
    </View>
  );
}

function HelpItem({
  icon: Icon,
  title,
  desc,
  last,
  colors: c,
  isDark,
}: {
  icon: any;
  title: string;
  desc: string;
  last?: boolean;
  colors: any;
  isDark: boolean;
}) {
  return (
    <View style={[styles.helpItem, last && styles.toggleRowLast, { borderBottomColor: c.border }]}>
      <View style={[styles.helpIcon, { backgroundColor: c.primary[isDark ? 100 : 50] }]}>
        <Icon size={20} color={c.primary[isDark ? 400 : 600]} strokeWidth={2} />
      </View>
      <View style={styles.helpContent}>
        <Text style={[styles.helpTitle, { color: c.text }]}>{title}</Text>
        <Text style={[styles.helpDesc, { color: c.textSecondary }]}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
    padding: 24,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 24,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarWrap: {
    marginRight: 16,
    position: 'relative',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '600',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#16a34a',
    borderWidth: 2,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  profileAbout: {
    fontSize: 14,
    marginBottom: 2,
  },
  profileStatus: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 13,
  },
  editBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuSection: {
    borderRadius: 16,
    marginBottom: 16,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuIcon: {
    width: 32,
    marginRight: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
  },
  menuValue: {
    fontSize: 14,
    marginRight: 8,
  },
  signOutItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '500',
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 8,
  },
  // Theme options
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  themeCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeCheckText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: 440,
    maxWidth: '90%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    padding: 20,
  },
  // Toggle rows
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleRowLast: {
    borderBottomWidth: 0,
  },
  toggleLabel: {
    fontSize: 15,
  },
  // Privacy note
  privacyNote: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingHorizontal: 4,
  },
  privacyNoteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  // About
  aboutContent: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  aboutLogo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  aboutTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  aboutVersion: {
    fontSize: 14,
    marginBottom: 16,
  },
  aboutDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  // Help
  helpItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  helpIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  helpContent: {
    flex: 1,
  },
  helpTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  helpDesc: {
    fontSize: 13,
  },
});
