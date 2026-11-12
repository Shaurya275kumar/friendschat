import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { MessageCircle, Mail, Lock, User, Eye, EyeOff } from 'lucide-react-native';
import { Logo } from '@/components/Logo';

export default function LoginScreen() {
  const { signInWithEmail, signUpWithEmail, user, profile, loading: authLoading } = useAuth();
  const { colors: c, isDark } = useTheme();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  useEffect(() => {
    if (!authLoading && user && profile) {
      router.replace('/(tabs)');
    }
  }, [user, profile, authLoading]);

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (mode === 'signup' && name.trim().length < 2) {
      setError('Please enter your name');
      return;
    }
    setLoading(true);
    const { error: err } =
      mode === 'signin'
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password, name.trim());
    setLoading(false);
    if (err) {
      setError(err);
    }
  };

  if (authLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary[500]} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <View style={styles.header}>
            <View style={[styles.logoCircle, { backgroundColor: c.primary[isDark ? 100 : 50] }]}>
              <Logo size={56} />
            </View>
            <Text style={[styles.title, { color: c.primary[isDark ? 400 : 700] }]}>FriendsChat</Text>
            <Text style={[styles.subtitle, { color: c.textSecondary }]}>
              {mode === 'signin'
                ? 'Welcome back! Sign in to continue'
                : 'Create your account to get started'}
            </Text>
          </View>

          <View style={styles.form}>
            {mode === 'signup' && (
              <View style={[styles.inputWrap, { backgroundColor: c.surface, borderColor: c.border }]}>
                <User size={20} color={c.textMuted} strokeWidth={2} />
                <TextInput
                  style={[styles.input, { color: c.text }]}
                  placeholder="Your name"
                  placeholderTextColor={c.textMuted}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={[styles.inputWrap, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Mail size={20} color={c.textMuted} strokeWidth={2} />
              <TextInput
                style={[styles.input, { color: c.text }]}
                placeholder="Email address"
                placeholderTextColor={c.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={[styles.inputWrap, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Lock size={20} color={c.textMuted} strokeWidth={2} />
              <TextInput
                style={[styles.input, { color: c.text }]}
                placeholder="Password"
                placeholderTextColor={c.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
              >
                {showPassword ? (
                  <EyeOff size={18} color={c.textMuted} strokeWidth={2} />
                ) : (
                  <Eye size={18} color={c.textMuted} strokeWidth={2} />
                )}
              </TouchableOpacity>
            </View>

            {error && (
              <View style={[styles.errorBox, { backgroundColor: c.error[50], borderColor: c.error[100] }]}>
                <Text style={[styles.errorText, { color: c.error[700] }]}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled, { backgroundColor: c.primary[500], shadowColor: c.primary[500] }]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
              <Text style={[styles.dividerText, { color: c.textMuted }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
            </View>

            <TouchableOpacity
              style={styles.toggleMode}
              onPress={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setError(null);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleText, { color: c.textSecondary }]}>
                {mode === 'signin'
                  ? "Don't have an account? "
                  : 'Already have an account? '}
                <Text style={[styles.toggleTextBold, { color: c.primary[isDark ? 400 : 600] }]}>
                  {mode === 'signin' ? 'Sign up' : 'Sign in'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  eyeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBox: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 14,
  },
  button: {
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  toggleMode: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  toggleText: {
    fontSize: 15,
  },
  toggleTextBold: {
    fontSize: 15,
    fontWeight: '600',
  },
});
