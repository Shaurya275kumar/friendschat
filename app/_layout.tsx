import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider } from '@/lib/auth';
import { CallProvider } from '@/lib/call';
import { GroupCallProvider } from '@/lib/groupCall';
import { CallScreen } from '@/components/CallScreen';
import { GroupCallScreen } from '@/components/GroupCallScreen';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  useFrameworkReady();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <CallProvider>
              <GroupCallProvider>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="login" />
                  <Stack.Screen name="edit-profile" />
                  <Stack.Screen name="+not-found" />
                </Stack>
                <CallScreen />
                <GroupCallScreen />
                <ThemedStatusBar />
              </GroupCallProvider>
            </CallProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
