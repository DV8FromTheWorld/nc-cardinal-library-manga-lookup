/**
 * Account screen for viewing checkouts, history, and holds in React Native.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  useColorScheme,
  Linking,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../routing/native/Router';
import { useAuthStore, logout } from '../../authentication/store';
import {
  useAccountStore,
  fetchCheckouts,
  fetchHistory,
  fetchMoreHistory,
  fetchHolds,
} from '../store';
import { LoginModal } from '../../login/native/LoginModal';
import { Text } from '../../../design/components/Text/native/Text';
import { Heading } from '../../../design/components/Heading/native/Heading';
import { colors, spacing } from '../../search/native/theme';
import type { CheckedOutItem, HistoryItem, HoldItem } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Account'>;

type TabType = 'checkouts' | 'history' | 'holds';

export function AccountScreen({ navigation }: Props): JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? colors.dark : colors.light;

  const session = useAuthStore((s) => s.session);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const isLoggedIn = session !== null;

  const checkouts = useAccountStore((s) => s.checkouts);
  const isFetchingCheckouts = useAccountStore((s) => s.isFetchingCheckouts);
  const history = useAccountStore((s) => s.history);
  const isFetchingHistory = useAccountStore((s) => s.isFetchingHistory);
  const historyEnabled = useAccountStore((s) => s.historyEnabled);
  const hasMoreHistory = useAccountStore((s) => s.hasMoreHistory);
  const holds = useAccountStore((s) => s.holds);
  const isFetchingHolds = useAccountStore((s) => s.isFetchingHolds);
  const error = useAccountStore((s) => s.error);

  const [activeTab, setActiveTab] = useState<TabType>('checkouts');
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Fetch data when tab changes or user logs in
  useEffect(() => {
    if (!isLoggedIn || !isInitialized) return;

    if (activeTab === 'checkouts' && checkouts.length === 0) {
      fetchCheckouts();
    } else if (activeTab === 'history' && history.length === 0) {
      fetchHistory(0);
    } else if (activeTab === 'holds' && holds.length === 0) {
      fetchHolds();
    }
  }, [activeTab, isLoggedIn, isInitialized, checkouts.length, history.length, holds.length]);

  const handleItemPress = useCallback((recordId: string) => {
    Linking.openURL(`https://nccardinal.org/eg/opac/record/${recordId}`);
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    navigation.goBack();
  }, [navigation]);

  if (!isInitialized) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text variant="text-md/normal" color="text-secondary" style={styles.loadingText}>
            Loading...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text variant="text-lg/normal" color="text-secondary">←</Text>
          </TouchableOpacity>
          <Heading level={1} variant="header-lg/bold">My Account</Heading>
        </View>

        <View style={styles.loginPrompt}>
          <Text variant="header-xl/normal" style={styles.loginPromptIcon}>🔒</Text>
          <Text variant="text-lg/medium" color="text-primary" style={styles.loginPromptTitle}>
            Sign in to view your account
          </Text>
          <Text variant="text-md/normal" color="text-secondary" style={styles.loginPromptSubtitle}>
            View your checked out items, history, and holds
          </Text>
          <TouchableOpacity
            style={[styles.loginButton, { backgroundColor: theme.accent }]}
            onPress={() => setShowLoginModal(true)}
          >
            <Text variant="text-md/semibold" style={styles.loginButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>

        <LoginModal visible={showLoginModal} onClose={() => setShowLoginModal(false)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text variant="text-lg/normal" color="text-secondary">←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Heading level={1} variant="header-lg/bold">My Account</Heading>
          {session?.displayName && (
            <Text variant="text-sm/normal" color="text-secondary">{session.displayName}</Text>
          )}
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text variant="text-sm/medium" color="error">Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'checkouts' && [styles.tabActive, { borderBottomColor: theme.accent }]]}
          onPress={() => setActiveTab('checkouts')}
        >
          <Text
            variant={activeTab === 'checkouts' ? 'text-sm/semibold' : 'text-sm/normal'}
            color={activeTab === 'checkouts' ? 'accent' : 'text-secondary'}
          >
            Checked Out
          </Text>
          {checkouts.length > 0 && (
            <View style={[styles.tabBadge, { backgroundColor: theme.accent }]}>
              <Text variant="text-xs/semibold" style={styles.tabBadgeText}>{checkouts.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && [styles.tabActive, { borderBottomColor: theme.accent }]]}
          onPress={() => setActiveTab('history')}
        >
          <Text
            variant={activeTab === 'history' ? 'text-sm/semibold' : 'text-sm/normal'}
            color={activeTab === 'history' ? 'accent' : 'text-secondary'}
          >
            History
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'holds' && [styles.tabActive, { borderBottomColor: theme.accent }]]}
          onPress={() => setActiveTab('holds')}
        >
          <Text
            variant={activeTab === 'holds' ? 'text-sm/semibold' : 'text-sm/normal'}
            color={activeTab === 'holds' ? 'accent' : 'text-secondary'}
          >
            Holds
          </Text>
          {holds.length > 0 && (
            <View style={[styles.tabBadge, { backgroundColor: theme.accent }]}>
              <Text variant="text-xs/semibold" style={styles.tabBadgeText}>{holds.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {error && (
        <View style={[styles.errorBox, { backgroundColor: theme.errorBg }]}>
          <Text variant="text-sm/normal" color="error">⚠ {error}</Text>
        </View>
      )}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Checkouts Tab */}
        {activeTab === 'checkouts' && (
          <>
            {isFetchingCheckouts ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text variant="text-md/normal" color="text-secondary" style={styles.loadingText}>
                  Loading checkouts...
                </Text>
              </View>
            ) : checkouts.length === 0 ? (
              <View style={styles.emptyState}>
                <Text variant="header-xl/normal" style={styles.emptyIcon}>📚</Text>
                <Text variant="text-md/normal" color="text-secondary">No items checked out</Text>
              </View>
            ) : (
              checkouts.map((item) => (
                <CheckoutCard
                  key={item.barcode}
                  item={item}
                  onPress={() => handleItemPress(item.recordId)}
                  theme={theme}
                />
              ))
            )}
          </>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <>
            {isFetchingHistory && history.length === 0 ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text variant="text-md/normal" color="text-secondary" style={styles.loadingText}>
                  Loading history...
                </Text>
              </View>
            ) : !historyEnabled ? (
              <View style={[styles.historyDisabled, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
                <Text variant="header-xl/normal" style={styles.historyDisabledIcon}>📊</Text>
                <Text variant="text-md/semibold" color="text-primary" style={styles.historyDisabledTitle}>
                  History Tracking Disabled
                </Text>
                <Text variant="text-sm/normal" color="text-secondary" style={styles.historyDisabledText}>
                  To track your checkout history, enable it in your NC Cardinal account settings.
                </Text>
                <TouchableOpacity
                  style={[styles.enableHistoryButton, { backgroundColor: theme.accent }]}
                  onPress={() => Linking.openURL('https://nccardinal.org/eg/opac/myopac/prefs_settings')}
                >
                  <Text variant="text-sm/semibold" style={styles.enableHistoryButtonText}>
                    Open Settings
                  </Text>
                </TouchableOpacity>
              </View>
            ) : history.length === 0 ? (
              <View style={styles.emptyState}>
                <Text variant="header-xl/normal" style={styles.emptyIcon}>📖</Text>
                <Text variant="text-md/normal" color="text-secondary">No checkout history</Text>
              </View>
            ) : (
              <>
                {history.map((item, idx) => (
                  <HistoryCard
                    key={`${item.recordId}-${idx}`}
                    item={item}
                    onPress={() => handleItemPress(item.recordId)}
                    theme={theme}
                  />
                ))}
                {hasMoreHistory && (
                  <TouchableOpacity
                    style={[styles.loadMoreButton, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
                    onPress={fetchMoreHistory}
                    disabled={isFetchingHistory}
                  >
                    <Text variant="text-sm/normal" color="text-secondary">
                      {isFetchingHistory ? 'Loading...' : 'Load more'}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        )}

        {/* Holds Tab */}
        {activeTab === 'holds' && (
          <>
            {isFetchingHolds ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text variant="text-md/normal" color="text-secondary" style={styles.loadingText}>
                  Loading holds...
                </Text>
              </View>
            ) : holds.length === 0 ? (
              <View style={styles.emptyState}>
                <Text variant="header-xl/normal" style={styles.emptyIcon}>🔖</Text>
                <Text variant="text-md/normal" color="text-secondary">No active holds</Text>
              </View>
            ) : (
              holds.map((item) => (
                <HoldCard
                  key={item.recordId}
                  item={item}
                  onPress={() => handleItemPress(item.recordId)}
                  theme={theme}
                />
              ))
            )}
          </>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface CheckoutCardProps {
  item: CheckedOutItem;
  onPress: () => void;
  theme: typeof colors.light;
}

function CheckoutCard({ item, onPress, theme }: CheckoutCardProps): JSX.Element {
  return (
    <TouchableOpacity
      style={[
        styles.itemCard,
        { backgroundColor: theme.bgSecondary, borderColor: item.overdue ? theme.error : theme.border },
      ]}
      onPress={onPress}
    >
      <View style={[styles.itemCover, { backgroundColor: theme.bgTertiary }]}>
        <Text variant="header-md/normal">📚</Text>
      </View>
      <View style={styles.itemInfo}>
        <Text variant="text-md/semibold" color="text-primary" numberOfLines={2}>
          {item.title}
        </Text>
        {item.author && (
          <Text variant="text-sm/normal" color="text-secondary" numberOfLines={1}>
            {item.author}
          </Text>
        )}
        <View style={styles.itemMeta}>
          <Text variant="text-xs/normal" color="text-muted">📅 Due: {item.dueDate}</Text>
          {item.overdue && (
            <View style={[styles.overdueBadge, { backgroundColor: theme.error }]}>
              <Text variant="text-xs/semibold" style={styles.overdueBadgeText}>Overdue</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

interface HistoryCardProps {
  item: HistoryItem;
  onPress: () => void;
  theme: typeof colors.light;
}

function HistoryCard({ item, onPress, theme }: HistoryCardProps): JSX.Element {
  return (
    <TouchableOpacity
      style={[styles.itemCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
      onPress={onPress}
    >
      <View style={[styles.itemCover, { backgroundColor: theme.bgTertiary }]}>
        <Text variant="header-md/normal">📖</Text>
      </View>
      <View style={styles.itemInfo}>
        <Text variant="text-md/semibold" color="text-primary" numberOfLines={2}>
          {item.title}
        </Text>
        {item.author && (
          <Text variant="text-sm/normal" color="text-secondary" numberOfLines={1}>
            {item.author}
          </Text>
        )}
        <View style={styles.itemMeta}>
          <Text variant="text-xs/normal" color="text-muted">📥 {item.checkoutDate}</Text>
          {item.returnDate && (
            <Text variant="text-xs/normal" color="text-muted">📤 {item.returnDate}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

interface HoldCardProps {
  item: HoldItem;
  onPress: () => void;
  theme: typeof colors.light;
}

function HoldCard({ item, onPress, theme }: HoldCardProps): JSX.Element {
  return (
    <TouchableOpacity
      style={[styles.itemCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
      onPress={onPress}
    >
      <View style={[styles.itemCover, { backgroundColor: theme.bgTertiary }]}>
        <Text variant="header-md/normal">🔖</Text>
      </View>
      <View style={styles.itemInfo}>
        <Text variant="text-md/semibold" color="text-primary" numberOfLines={2}>
          {item.title}
        </Text>
        {item.author && (
          <Text variant="text-sm/normal" color="text-secondary" numberOfLines={1}>
            {item.author}
          </Text>
        )}
        <View style={styles.itemMeta}>
          <Text variant="text-xs/normal" color="text-muted">📅 {item.holdDate}</Text>
          {item.status && (
            <Text variant="text-xs/normal" color="text-muted">{item.status}</Text>
          )}
          {item.position && (
            <Text variant="text-xs/normal" color="text-muted">#{item.position}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  backButton: {
    padding: spacing.sm,
    marginLeft: -spacing.sm,
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  logoutButton: {
    padding: spacing.sm,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginHorizontal: spacing.lg,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    // borderBottomColor set dynamically
  },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  tabBadgeText: {
    color: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
  },
  loadingText: {
    marginTop: spacing.md,
  },
  errorBox: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 8,
  },
  loginPrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  loginPromptIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  loginPromptTitle: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  loginPromptSubtitle: {
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  loginButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 10,
  },
  loginButtonText: {
    color: '#fff',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  historyDisabled: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: spacing.md,
  },
  historyDisabledIcon: {
    fontSize: 40,
    marginBottom: spacing.md,
  },
  historyDisabledTitle: {
    marginBottom: spacing.sm,
  },
  historyDisabledText: {
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  enableHistoryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  enableHistoryButtonText: {
    color: '#fff',
  },
  itemCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  itemCover: {
    width: 50,
    height: 75,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  itemMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  overdueBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
  },
  overdueBadgeText: {
    color: '#fff',
  },
  loadMoreButton: {
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  bottomPadding: {
    height: spacing.xl,
  },
});
