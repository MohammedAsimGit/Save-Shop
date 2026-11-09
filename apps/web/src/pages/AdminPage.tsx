import { LogOut, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type {
  AdminProfile,
  ListingDetailResponse,
  ReviewQueueResponse,
} from '@smart-shopping/shared';

import { AdminLoginForm } from '../components/admin/AdminLoginForm';
import { ReviewDetailPanel } from '../components/admin/ReviewDetailPanel';
import { ReviewQueueList } from '../components/admin/ReviewQueueList';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { PageContainer } from '../components/ui/PageContainer';
import { SkeletonBlock } from '../components/ui/LoadingSkeleton';
import {
  clearAdminToken,
  fetchAdminProfile,
  fetchReviewListing,
  fetchReviewQueue,
  isSessionExpired,
  readAdminToken,
  submitReviewDecision,
  type AdminDecisionAction,
  type AdminDecisionBody,
} from '../services/admin.service';

/**
 * Catalogue review workspace.
 *
 * The route is protected in the only way that matters: every request carries a
 * session the API verifies and resolves to a live administrator. The local gate
 * below exists so ordinary shoppers never see an admin form they cannot use; it is
 * not itself a security boundary.
 */

const PAGE_SIZE = 20;

type QueueState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: ReviewQueueResponse }
  | { readonly status: 'error'; readonly message: string };

type DetailState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: ListingDetailResponse }
  | { readonly status: 'error'; readonly message: string };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function AdminPage() {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [checking, setChecking] = useState(() => readAdminToken() !== null);
  const [gateReason, setGateReason] = useState<string | undefined>(undefined);

  const [scope, setScope] = useState<'pending' | 'decided' | 'all'>('pending');
  const [verdict, setVerdict] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [queue, setQueue] = useState<QueueState>({ status: 'idle' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>({ status: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);

  const signOut = useCallback((reason?: string) => {
    clearAdminToken();
    setProfile(null);
    setQueue({ status: 'idle' });
    setDetail({ status: 'idle' });
    setSelectedId(null);
    setNotice(null);
    if (reason) setGateReason(reason);
  }, []);

  // A stored token is only trusted after the API confirms the account is live.
  useEffect(() => {
    if (!readAdminToken()) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    fetchAdminProfile()
      .then((current) => {
        if (!cancelled) setProfile(current);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        signOut(
          isSessionExpired(error)
            ? 'Your administrator session expired. Sign in again.'
            : undefined,
        );
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [signOut]);

  useEffect(() => {
    if (!profile) return;

    const controller = new AbortController();
    let cancelled = false;
    setQueue({ status: 'loading' });

    fetchReviewQueue(
      {
        scope,
        page,
        pageSize: PAGE_SIZE,
        ...(verdict ? { verdict } : {}),
        ...(query ? { q: query } : {}),
      },
      { signal: controller.signal },
    )
      .then((data) => {
        if (cancelled) return;
        setQueue({ status: 'ready', data });
        setSelectedId((current) =>
          current && data.items.some((item) => item.listing.id === current)
            ? current
            : (data.items[0]?.listing.id ?? null),
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isSessionExpired(error)) {
          signOut('Your administrator session expired. Sign in again.');
          return;
        }
        setQueue({ status: 'error', message: messageOf(error) });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [profile, scope, verdict, query, page, reloadKey, signOut]);

  useEffect(() => {
    if (!profile || !selectedId) {
      setDetail({ status: 'idle' });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setDetail({ status: 'loading' });

    fetchReviewListing(selectedId, { signal: controller.signal })
      .then((data) => {
        if (!cancelled) setDetail({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isSessionExpired(error)) {
          signOut('Your administrator session expired. Sign in again.');
          return;
        }
        setDetail({ status: 'error', message: messageOf(error) });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [profile, selectedId, reloadKey, signOut]);

  async function handleDecision(
    action: AdminDecisionAction,
    body: AdminDecisionBody,
  ): Promise<void> {
    if (!selectedId) return;

    try {
      const result = await submitReviewDecision(selectedId, action, body);
      setNotice(result.notices[0] ?? 'The decision was recorded.');
      setReloadKey((value) => value + 1);
    } catch (error) {
      if (isSessionExpired(error)) {
        signOut('Your administrator session expired. Sign in again.');
      }
      throw error;
    }
  }

  if (checking) {
    return (
      <PageContainer size="narrow" className="py-12">
        <div aria-busy="true" className="space-y-3">
          <SkeletonBlock className="h-8 w-64" />
          <SkeletonBlock className="h-4 w-80" />
          <SkeletonBlock className="h-40 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (!profile) {
    return (
      <PageContainer size="narrow" className="py-8 sm:py-12">
        <AdminLoginForm
          onSignedIn={(signedIn) => {
            setGateReason(undefined);
            setProfile(signedIn);
          }}
          {...(gateReason ? { reason: gateReason } : {})}
        />
        <p className="mt-6 text-center text-xs text-ink-subtle">
          Looking for the storefront?{' '}
          <Link to="/" className="font-semibold text-brand-dark underline dark:text-brand">
            Return to SaveShop
          </Link>
        </p>
      </PageContainer>
    );
  }

  const queueData = queue.status === 'ready' ? queue.data : null;
  const detailData = detail.status === 'ready' ? detail.data : null;
  const totalPages = queueData ? Math.max(1, Math.ceil(queueData.totalItems / PAGE_SIZE)) : 1;

  return (
    <PageContainer className="space-y-5 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-brand-dark uppercase dark:text-brand">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            Catalogue administration
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Match review</h1>
          <p className="max-w-2xl text-sm text-ink-muted">
            Every decision is recorded as a human review with your administrator identity, the
            identity facts in play and the matcher version. Automatic matching cannot override it.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-right text-xs">
            <p className="font-semibold text-ink">{profile.displayName}</p>
            <p className="text-ink-muted">{profile.email}</p>
          </div>
          <Badge tone="brand">catalogue_admin</Badge>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => signOut()}
            leadingIcon={<LogOut aria-hidden="true" className="size-4" />}
          >
            Sign out
          </Button>
        </div>
      </header>

      <section className="space-y-3 rounded-card border border-line bg-surface p-4 shadow-soft">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
            Scope
            <select
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as typeof scope);
                setPage(1);
              }}
              className="h-10 rounded-full border border-line bg-background-alt px-3 text-sm text-ink"
            >
              <option value="pending">Pending review</option>
              <option value="decided">Decided</option>
              <option value="all">All listings</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
            Verdict
            <select
              value={verdict}
              onChange={(event) => {
                setVerdict(event.target.value);
                setPage(1);
              }}
              className="h-10 rounded-full border border-line bg-background-alt px-3 text-sm text-ink"
            >
              <option value="">Any verdict</option>
              <option value="possible">Possible</option>
              <option value="conflict">Conflict</option>
              <option value="unmatched">Unmatched</option>
              <option value="exact">Exact</option>
              <option value="strong">Strong</option>
            </select>
          </label>

          <form
            className="flex min-w-56 flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setQuery(searchInput.trim());
              setPage(1);
            }}
          >
            <div className="flex h-10 flex-1 items-center gap-2 rounded-full border border-line bg-background-alt px-3 focus-within:ring-2 focus-within:ring-brand/30">
              <Search aria-hidden="true" className="size-4 text-ink-subtle" />
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Title, brand, model or external id"
                aria-label="Search the review queue"
                className="h-full w-full bg-transparent text-sm text-ink placeholder:text-ink-subtle focus:outline-none"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">
              Search
            </Button>
          </form>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReloadKey((value) => value + 1)}
            leadingIcon={<RefreshCw aria-hidden="true" className="size-4" />}
          >
            Refresh
          </Button>
        </div>

        {queueData && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Badge tone="warning">{queueData.counts.pending} pending</Badge>
            <Badge tone="discount">{queueData.counts.requiresReview} flagged</Badge>
            <Badge tone="success">{queueData.counts.decided} decided</Badge>
            {Object.entries(queueData.counts.byVerdict)
              .filter(([, count]) => count > 0)
              .map(([status, count]) => (
                <Badge key={status} tone="outline">
                  {status}: {count}
                </Badge>
              ))}
            <span className="ml-auto text-xs text-ink-subtle">
              {queueData.totalItems} matching listing(s)
            </span>
          </div>
        )}
      </section>

      {notice && (
        <p
          role="status"
          className="rounded-tile border border-brand/30 bg-brand-soft px-3 py-2 text-sm text-brand-dark dark:text-brand"
        >
          {notice}
        </p>
      )}

      {queueData?.notices.length ? (
        <p className="text-xs text-ink-subtle">{queueData.notices.join(' ')}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
        <div className="space-y-3">
          <ReviewQueueList
            items={queueData?.items ?? []}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={queue.status === 'loading' || queue.status === 'idle'}
            error={queue.status === 'error' ? queue.message : null}
            onRetry={() => setReloadKey((value) => value + 1)}
          />

          {queueData && queueData.totalItems > 0 && (
            <div className="flex items-center justify-between text-sm">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-ink-muted">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-20">
          <ReviewDetailPanel
            item={queueData?.items.find((item) => item.listing.id === selectedId) ?? null}
            detail={detailData}
            loading={detail.status === 'loading'}
            error={detail.status === 'error' ? detail.message : null}
            onRetry={() => setReloadKey((value) => value + 1)}
            onDecision={handleDecision}
          />
        </div>
      </div>
    </PageContainer>
  );
}
