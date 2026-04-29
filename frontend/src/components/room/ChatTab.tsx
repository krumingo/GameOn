import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chatApi } from '@/api/client';
import { Avatar } from '@/components/Avatar';
import { theme } from '@/theme/darkTheme';

interface Props {
  groupId: string;
  matchId?: string;
  currentUserId?: string;
}

export const ChatTab: React.FC<Props> = ({ groupId, matchId, currentUserId }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const pollerRef = useRef<any>(null);

  const fetch = async () => {
    try {
      const d = await chatApi.getMessages(groupId, undefined, matchId);
      setMessages(d.messages || []);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    } catch {}
  };

  useEffect(() => {
    fetch();
    pollerRef.current = setInterval(fetch, 10000);
    return () => clearInterval(pollerRef.current);
  }, [groupId, matchId]);

  const handleSend = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText('');
    // Optimistic
    setMessages((m) => [...m, {
      id: `tmp-${Date.now()}`, user_id: currentUserId, user_name: 'Аз',
      text: t, created_at: new Date().toISOString(), _optimistic: true,
    }]);
    try {
      await chatApi.send(groupId, t, matchId);
      await fetch();
    } catch (e) {
      // revert by re-fetching
      await fetch();
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        testID="chat-list"
      >
        {messages.length === 0 && (
          <Text style={{ color: theme.colors.text.muted, textAlign: 'center', marginTop: 24 }}>
            Все още няма съобщения
          </Text>
        )}
        {messages.map((m) => {
          const mine = m.user_id === currentUserId;
          return (
            <View
              key={m.id}
              style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}
              testID={`chat-msg-${m.id}`}
            >
              {!mine && (
                <Avatar name={m.user_name || '?'} size={30} />
              )}
              <View style={[
                styles.bubble,
                mine
                  ? { backgroundColor: theme.colors.accent.primary, borderTopRightRadius: 4 }
                  : { backgroundColor: theme.colors.background.card, borderTopLeftRadius: 4 },
              ]}>
                {!mine && <Text style={styles.author}>{m.user_name}</Text>}
                <Text style={[styles.bubbleText, mine && { color: '#fff' }]}>{m.text}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Напиши съобщение..."
          placeholderTextColor={theme.colors.text.muted}
          multiline
          maxLength={2000}
          style={styles.input}
          testID="chat-input"
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!text.trim() || sending}
          style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
          testID="chat-send"
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  bubbleRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: theme.colors.background.input,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: theme.colors.text.primary, fontWeight: '700', fontSize: 12 },
  bubble: { maxWidth: '78%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  author: { color: theme.colors.text.muted, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  bubbleText: { color: theme.colors.text.primary, fontSize: 14, lineHeight: 20 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10,
    borderTopWidth: 1, borderTopColor: theme.colors.border.primary,
    backgroundColor: theme.colors.background.secondary,
  },
  input: {
    flex: 1, color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.input,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 999, fontSize: 14, maxHeight: 120,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.accent.primary,
    alignItems: 'center', justifyContent: 'center',
  },
});
