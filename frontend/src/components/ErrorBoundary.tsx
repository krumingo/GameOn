import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '@/theme/darkTheme';

interface State { hasError: boolean; }
interface Props { children: React.ReactNode; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() { return { hasError: true }; }

  componentDidCatch(error: any, info: any) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container} data-testid="error-boundary">
          <Text style={styles.title}>Нещо се обърка</Text>
          <Text style={styles.subtitle}>Неочаквана грешка. Моля опитайте отново.</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => this.setState({ hasError: false })}
            data-testid="error-boundary-retry"
          >
            <Text style={styles.buttonText}>Опитай отново</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children as any;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: theme.colors.background.primary,
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  title: { color: theme.colors.text.primary, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: theme.colors.text.secondary, fontSize: 14, marginBottom: 24, textAlign: 'center' },
  button: {
    paddingHorizontal: 24, paddingVertical: 12,
    backgroundColor: theme.colors.accent.primary, borderRadius: 12,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
