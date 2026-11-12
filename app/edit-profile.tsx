import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { ArrowLeft, Camera, Check } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';

export default function EditProfileScreen() {
  const { profile, user, refreshProfile } = useAuth();
  const { colors: c, isDark } = useTheme();
  const [name, setName] = useState(profile?.name ?? '');
  const [about, setAbout] = useState(profile?.about ?? '');
  const [status, setStatus] = useState(profile?.status ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    const uri = result.assets[0].uri;
    const ext = uri.split('.').pop() ?? 'jpg';
    const path = `${user?.id}/${Date.now()}.${ext}`;
    const formData = new FormData();
    formData.append('file', { uri, name: path, type: 'image/jpeg' } as any);
    const { error } = await supabase.storage.from('avatars').upload(path, formData);
    if (error) {
      Alert.alert('Error', 'Failed to upload photo.');
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    setUploading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    if (name.trim().length < 2) {
      Alert.alert('Invalid name', 'Name must be at least 2 characters.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ name: name.trim(), about: about.trim(), status: status.trim() || null, avatar_url: avatarUrl })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      Alert.alert('Error', 'Failed to save profile.');
      return;
    }
    await refreshProfile();
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { backgroundColor: c.headerBg, borderBottomColor: c.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={24} color={c.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveBtn}>
          {saving ? <ActivityIndicator size="small" color={c.primary[isDark ? 400 : 600]} /> : (
            <Check size={22} color={c.primary[isDark ? 400 : 600]} strokeWidth={2.5} />
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
      <View style={styles.avatarSection}>
        <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: c.primary[200], justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={[styles.avatarText, { color: c.primary[isDark ? 400 : 800] }]}>{name?.charAt(0).toUpperCase() ?? '?'}</Text>
            </View>
          )}
          <View style={[styles.cameraBadge, { backgroundColor: c.primary[500], borderColor: c.surface }]}>
            {uploading ? (
              <ActivityIndicator size="small" color={c.primary[isDark ? 400 : 600]} />
            ) : (
              <Camera size={16} color="#fff" strokeWidth={2} />
            )}
          </View>
        </TouchableOpacity>
        <Text style={[styles.avatarHint, { color: c.textSecondary }]}>Tap to change photo</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Name</Text>
          <TextInput
            style={[styles.input, { color: c.text, backgroundColor: c.surfaceAlt, borderColor: c.border }]}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={c.textMuted}
          />
        </View>
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: c.textMuted }]}>About</Text>
          <TextInput
            style={[styles.input, { color: c.text, backgroundColor: c.surfaceAlt, borderColor: c.border }]}
            value={about}
            onChangeText={setAbout}
            placeholder="About you"
            placeholderTextColor={c.textMuted}
            multiline
            maxLength={120}
          />
        </View>
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Status</Text>
          <TextInput
            style={[styles.input, { color: c.text, backgroundColor: c.surfaceAlt, borderColor: c.border }]}
            value={status}
            onChangeText={setStatus}
            placeholder="Set a status (e.g. Available, Busy, At work)"
            placeholderTextColor={c.textMuted}
            maxLength={60}
          />
        </View>
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Email</Text>
          <View style={[styles.disabledInput, { backgroundColor: c.surfaceAlt }]}>
            <Text style={[styles.disabledText, { color: c.textMuted }]}>{profile?.email ?? ''}</Text>
          </View>
          </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  saveBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 28,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  avatarText: {
    fontSize: 44,
    fontWeight: '600',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  avatarHint: {
    marginTop: 12,
    fontSize: 13,
  },
  form: {
    paddingHorizontal: 20,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  field: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  disabledInput: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  disabledText: {
    fontSize: 16,
  },
});
