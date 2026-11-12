import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import {
  ActivityIndicator,
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Image,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { MessageCircle, Users, Settings, LogOut, Sun, Moon, PhoneCall } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { Logo } from '@/components/Logo';

import ChatsScreen from './index';
import CallsScreen from './calls';
import PeopleScreen from './contacts';
import SettingsScreen from './settings';
import { ConversationView } from '@/components/ConversationView';

type TabKey = 'chats' | 'calls' | 'people' | 'settings';

export default function TabLayout() {
  const { user, profile, loading, signOut } = useAuth();
  const { isDark, toggle, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const dimensions = useWindowDimensions();
  const isMobile = dimensions.width < 768;
  const [activeTab, setActiveTab] = useState<TabKey>('chats');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const c = colors;

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary[500]} />
      </View>
    );
  }

  if (!user || !profile) {
    return <Redirect href="/login" />;
  }

  const navItems: { key: TabKey; label: string; icon: typeof MessageCircle }[] = [
    { key: 'chats', label: 'Chats', icon: MessageCircle },
    { key: 'calls', label: 'Calls', icon: PhoneCall },
    { key: 'people', label: 'People', icon: Users },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  const openChat = (id: string) => setActiveChatId(id);

  return (
    <View style={[styles.container, { paddingTop: isMobile ? 0 : insets.top, backgroundColor: c.background }]}>
      {!isMobile && (
        <View style={[styles.topBar, { backgroundColor: c.headerBg, borderBottomColor: c.border }]}>
          <View style={styles.brand}>
            <Logo size={36} />
            <Text style={[styles.brandText, { color: c.primary[isDark ? 400 : 700] }]}>FriendsChat</Text>
          </View>

          <View style={styles.nav}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.navItem, isActive && { backgroundColor: c.primary[isDark ? 100 : 50] }]}
                  onPress={() => setActiveTab(item.key)}
                  activeOpacity={0.7}
                >
                  <Icon
                    size={20}
                    color={isActive ? c.primary[isDark ? 400 : 700] : c.textSecondary}
                    strokeWidth={2}
                  />
                  <Text style={[styles.navLabel, { color: isActive ? c.primary[isDark ? 400 : 700] : c.textSecondary }, isActive && { fontWeight: '600' }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.rightSection}>
            <TouchableOpacity onPress={toggle} style={styles.themeToggle} activeOpacity={0.7}>
              {isDark ? (
                <Sun size={20} color={c.primary[400]} strokeWidth={2} />
              ) : (
                <Moon size={20} color={c.textSecondary} strokeWidth={2} />
              )}
            </TouchableOpacity>

            <View style={styles.profileSection}>
              <View style={styles.profileAvatarWrap}>
                {profile.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.profileAvatar} />
                ) : (
                  <View style={[styles.profileAvatar, { backgroundColor: c.primary[200], justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={[styles.profileAvatarText, { color: c.primary[isDark ? 400 : 800] }]}>
                      {profile.name?.charAt(0).toUpperCase() ?? '?'}
                    </Text>
                  </View>
                )}
                {profile.is_online && <View style={[styles.profileOnlineDot, { borderColor: c.headerBg }]} />}
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.profileName, { color: c.text }]} numberOfLines={1}>{profile.name}</Text>
                <Text style={[styles.profileEmail, { color: c.textSecondary }]} numberOfLines={1}>{profile.email ?? ''}</Text>
              </View>
              <TouchableOpacity onPress={signOut} style={styles.logoutBtn}>
                <LogOut size={18} color={c.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <View style={[styles.mainArea, { backgroundColor: c.background }]}>
        {activeTab === 'chats' && <ChatsScreen onOpenChat={openChat} />}
        {activeTab === 'calls' && <CallsScreen />}
        {activeTab === 'people' && <PeopleScreen onOpenChat={openChat} />}
        {activeTab === 'settings' && <SettingsScreen />}
      </View>

      {isMobile && !activeChatId && (
        <View style={[styles.bottomTabBar, { paddingBottom: insets.bottom, backgroundColor: c.headerBg, borderTopColor: c.border }]}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={styles.bottomTab}
                onPress={() => setActiveTab(item.key)}
                activeOpacity={0.7}
              >
                <Icon
                  size={24}
                  color={isActive ? c.primary[isDark ? 400 : 600] : c.textMuted}
                  strokeWidth={2}
                />
                <Text style={[styles.bottomTabLabel, { color: isActive ? c.primary[isDark ? 400 : 600] : c.textMuted }, isActive && { fontWeight: '600' }]}>
                  {item.label}
                </Text>
                {isActive && <View style={[styles.bottomTabIndicator, { backgroundColor: c.primary[500] }]} />}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={toggle} style={styles.bottomTab} activeOpacity={0.7}>
            {isDark ? (
              <Sun size={24} color={c.primary[400]} strokeWidth={2} />
            ) : (
              <Moon size={24} color={c.textMuted} strokeWidth={2} />
            )}
            <Text style={[styles.bottomTabLabel, { color: c.textMuted }]}>
              {isDark ? 'Light' : 'Dark'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {activeChatId && (
        <View style={[styles.chatOverlay, { backgroundColor: c.background }]}>
          <ConversationView chatId={activeChatId} onBack={() => setActiveChatId(null)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandText: {
    fontSize: 20,
    fontWeight: '700',
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  navLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  themeToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  profileAvatarWrap: {
    position: 'relative',
  },
  profileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ccc',
  },
  profileAvatarText: {
    fontSize: 16,
    fontWeight: '600',
  },
  profileOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#16a34a',
    borderWidth: 2,
  },
  profileInfo: {
    maxWidth: 140,
  },
  profileName: {
    fontSize: 13,
    fontWeight: '600',
  },
  profileEmail: {
    fontSize: 11,
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainArea: {
    flex: 1,
  },
  bottomTabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
  },
  bottomTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    position: 'relative',
  },
  bottomTabLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  bottomTabIndicator: {
    position: 'absolute',
    top: 0,
    width: 24,
    height: 3,
    borderRadius: 2,
  },
  chatOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
});
