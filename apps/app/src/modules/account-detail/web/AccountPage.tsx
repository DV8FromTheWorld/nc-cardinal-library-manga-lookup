/**
 * Account page for viewing checkouts, history, and holds.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore, logout } from '../../authentication/store';
import {
  useAccountStore,
  fetchCheckouts,
  fetchHistory,
  fetchMoreHistory,
  fetchHolds,
} from '../store';
import { LoginModal } from '../../login/web/LoginModal';
import { Text } from '../../../design/components/Text/web/Text';
import type { CheckedOutItem, HistoryItem, HoldItem } from '../types';
import styles from './AccountPage.module.css';

type TabType = 'checkouts' | 'history' | 'holds';

export function AccountPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  
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

  // Determine initial tab from URL
  const getTabFromPath = (): TabType => {
    if (location.pathname.includes('history')) return 'history';
    if (location.pathname.includes('holds')) return 'holds';
    return 'checkouts';
  };

  const [activeTab, setActiveTab] = useState<TabType>(getTabFromPath);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Update URL when tab changes
  const handleTabChange = useCallback(
    (tab: TabType) => {
      setActiveTab(tab);
      const path = tab === 'checkouts' ? '/account/checkouts' : `/account/${tab}`;
      void navigate(path, { replace: true });
    },
    [navigate]
  );

  // Fetch data when tab changes or user logs in
  useEffect(() => {
    if (!isLoggedIn || !isInitialized) return;

    if (activeTab === 'checkouts' && checkouts.length === 0) {
      void fetchCheckouts();
    } else if (activeTab === 'history' && history.length === 0) {
      void fetchHistory(0);
    } else if (activeTab === 'holds' && holds.length === 0) {
      void fetchHolds();
    }
  }, [activeTab, isLoggedIn, isInitialized, checkouts.length, history.length, holds.length]);

  const handleBookClick = useCallback((recordId: string) => {
    window.open(`https://nccardinal.org/eg/opac/record/${recordId}`, '_blank');
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    void navigate('/');
  }, [navigate]);

  if (!isInitialized) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner} />
          <Text variant="text-md/normal" color="text-secondary">
            Loading...
          </Text>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/')}
          >
            ←
          </button>
          <Text variant="header-lg/bold"  className={styles.title}>
            My Account
          </Text>
        </header>

        <div className={styles.loginPrompt}>
          <Text variant="header-xl/normal" className={styles.loginPromptIcon}>
            🔒
          </Text>
          <Text variant="text-lg/medium" tag="p">
            Sign in to view your account
          </Text>
          <Text variant="text-md/normal" color="text-secondary" tag="p">
            View your checked out items, history, and holds
          </Text>
          <button
            type="button"
            className={styles.loginButton}
            onClick={() => setShowLoginModal(true)}
          >
            Sign In
          </button>
        </div>

        <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/')}
        >
          ←
        </button>
        <div className={styles.headerTitleSection}>
          <Text variant="header-lg/bold"  className={styles.title}>
            My Account
          </Text>
          {session?.displayName != null && (
            <Text variant="text-sm/normal" color="text-secondary">
              {session.displayName}
            </Text>
          )}
        </div>
        <button type="button" className={styles.logoutButton} onClick={handleLogout}>
          Sign Out
        </button>
      </header>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'checkouts' ? styles.active : ''}`}
          onClick={() => handleTabChange('checkouts')}
        >
          Checked Out
          {checkouts.length > 0 && <span className={styles.tabBadge}>{checkouts.length}</span>}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'history' ? styles.active : ''}`}
          onClick={() => handleTabChange('history')}
        >
          History
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'holds' ? styles.active : ''}`}
          onClick={() => handleTabChange('holds')}
        >
          Holds
          {holds.length > 0 && <span className={styles.tabBadge}>{holds.length}</span>}
        </button>
      </div>

      {error != null && (
        <div className={styles.error}>
          <span>⚠</span>
          <Text variant="text-md/normal">{error}</Text>
        </div>
      )}

      {/* Checkouts Tab */}
      {activeTab === 'checkouts' && (
        <>
          {isFetchingCheckouts ? (
            <div className={styles.loadingState}>
              <div className={styles.loadingSpinner} />
              <Text variant="text-md/normal" color="text-secondary">
                Loading checkouts...
              </Text>
            </div>
          ) : checkouts.length === 0 ? (
            <div className={styles.emptyState}>
              <Text variant="header-xl/normal" className={styles.emptyIcon}>
                📚
              </Text>
              <Text variant="text-md/normal" tag="p">
                No items checked out
              </Text>
              <Text variant="text-sm/normal" color="text-muted" tag="p">
                Search for manga to find your next read
              </Text>
            </div>
          ) : (
            <div className={styles.itemList}>
              {checkouts.map((item) => (
                <CheckoutCard key={item.barcode} item={item} onClick={() => handleBookClick(item.recordId)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <>
          {isFetchingHistory && history.length === 0 ? (
            <div className={styles.loadingState}>
              <div className={styles.loadingSpinner} />
              <Text variant="text-md/normal" color="text-secondary">
                Loading history...
              </Text>
            </div>
          ) : !historyEnabled ? (
            <div className={styles.historyDisabled}>
              <Text variant="header-xl/normal" className={styles.historyDisabledIcon}>
                📊
              </Text>
              <Text variant="header-sm/semibold" tag="p" className={styles.historyDisabledTitle}>
                History Tracking Disabled
              </Text>
              <Text variant="text-md/normal" color="text-secondary" tag="p" className={styles.historyDisabledText}>
                To track your checkout history, enable it in your NC Cardinal account settings.
                Only future checkouts will be recorded.
              </Text>
              <a
                href="https://nccardinal.org/eg/opac/myopac/prefs_settings"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.enableHistoryButton}
              >
                Open Account Settings
              </a>
            </div>
          ) : history.length === 0 ? (
            <div className={styles.emptyState}>
              <Text variant="header-xl/normal" className={styles.emptyIcon}>
                📖
              </Text>
              <Text variant="text-md/normal" tag="p">
                No checkout history
              </Text>
              <Text variant="text-sm/normal" color="text-muted" tag="p">
                Your checkout history will appear here
              </Text>
            </div>
          ) : (
            <>
              <div className={styles.itemList}>
                {history.map((item) => (
                  <HistoryCard
                    key={item.recordId}
                    item={item}
                    onClick={() => handleBookClick(item.recordId)}
                  />
                ))}
              </div>
              {hasMoreHistory && (
                <button
                  type="button"
                  className={styles.loadMore}
                  onClick={fetchMoreHistory}
                  disabled={isFetchingHistory}
                >
                  {isFetchingHistory ? 'Loading...' : 'Load more'}
                </button>
              )}
            </>
          )}
        </>
      )}

      {/* Holds Tab */}
      {activeTab === 'holds' && (
        <>
          {isFetchingHolds ? (
            <div className={styles.loadingState}>
              <div className={styles.loadingSpinner} />
              <Text variant="text-md/normal" color="text-secondary">
                Loading holds...
              </Text>
            </div>
          ) : holds.length === 0 ? (
            <div className={styles.emptyState}>
              <Text variant="header-xl/normal" className={styles.emptyIcon}>
                🔖
              </Text>
              <Text variant="text-md/normal" tag="p">
                No active holds
              </Text>
              <Text variant="text-sm/normal" color="text-muted" tag="p">
                Place holds on items to pick them up later
              </Text>
            </div>
          ) : (
            <div className={styles.itemList}>
              {holds.map((item) => (
                <HoldCard key={item.recordId} item={item} onClick={() => handleBookClick(item.recordId)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface CheckoutCardProps {
  item: CheckedOutItem;
  onClick: () => void;
}

function CheckoutCard({ item, onClick }: CheckoutCardProps): JSX.Element {
  return (
    <button type="button" className={`${styles.item} ${item.overdue ? styles.overdue : ''}`} onClick={onClick}>
      <div className={styles.itemCover}>
        <div className={styles.coverPlaceholder}>📚</div>
      </div>
      <div className={styles.itemInfo}>
        <Text variant="text-md/semibold"  className={styles.itemTitle}>
          {item.title}
        </Text>
        {item.author != null && (
          <Text variant="text-sm/normal" color="text-secondary" tag="p" className={styles.itemAuthor}>
            {item.author}
          </Text>
        )}
        <div className={styles.itemMeta}>
          <span className={styles.metaItem}>
            <span className={styles.metaIcon}>📅</span>
            <Text variant="text-xs/normal">Due: {item.dueDate}</Text>
          </span>
          {item.overdue === true && <span className={styles.overdueBadge}>Overdue</span>}
          {item.callNumber != null && (
            <span className={styles.metaItem}>
              <span className={styles.metaIcon}>📍</span>
              <Text variant="text-xs/normal">{item.callNumber}</Text>
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

interface HistoryCardProps {
  item: HistoryItem;
  onClick: () => void;
}

function HistoryCard({ item, onClick }: HistoryCardProps): JSX.Element {
  return (
    <button type="button" className={styles.item} onClick={onClick}>
      <div className={styles.itemCover}>
        <div className={styles.coverPlaceholder}>📖</div>
      </div>
      <div className={styles.itemInfo}>
        <Text variant="text-md/semibold"  className={styles.itemTitle}>
          {item.title}
        </Text>
        {item.author != null && (
          <Text variant="text-sm/normal" color="text-secondary" tag="p" className={styles.itemAuthor}>
            {item.author}
          </Text>
        )}
        <div className={styles.itemMeta}>
          <span className={styles.metaItem}>
            <span className={styles.metaIcon}>📥</span>
            <Text variant="text-xs/normal">Checked out: {item.checkoutDate}</Text>
          </span>
          {item.returnDate != null && (
            <span className={styles.metaItem}>
              <span className={styles.metaIcon}>📤</span>
              <Text variant="text-xs/normal">Returned: {item.returnDate}</Text>
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

interface HoldCardProps {
  item: HoldItem;
  onClick: () => void;
}

function HoldCard({ item, onClick }: HoldCardProps): JSX.Element {
  return (
    <button type="button" className={styles.item} onClick={onClick}>
      <div className={styles.itemCover}>
        <div className={styles.coverPlaceholder}>🔖</div>
      </div>
      <div className={styles.itemInfo}>
        <Text variant="text-md/semibold"  className={styles.itemTitle}>
          {item.title}
        </Text>
        {item.author != null && (
          <Text variant="text-sm/normal" color="text-secondary" tag="p" className={styles.itemAuthor}>
            {item.author}
          </Text>
        )}
        <div className={styles.itemMeta}>
          <span className={styles.metaItem}>
            <span className={styles.metaIcon}>📅</span>
            <Text variant="text-xs/normal">Placed: {item.holdDate}</Text>
          </span>
          {item.status !== '' && (
            <span className={styles.metaItem}>
              <span className={styles.metaIcon}>📍</span>
              <Text variant="text-xs/normal">{item.status}</Text>
            </span>
          )}
          {item.position != null && item.position > 0 ? (
            <span className={styles.metaItem}>
              <Text variant="text-xs/normal">Position: #{item.position}</Text>
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
