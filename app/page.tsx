"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImportModal } from "../components/modals/import-modal";
import { SettingsModal } from "../components/modals/settings-modal";
import { HoldingsTab } from "../components/tabs/holdings-tab";
import { OverviewTab } from "../components/tabs/overview-tab";
import { ReviewTab } from "../components/tabs/review-tab";
import { usePricing } from "../hooks/use-pricing";
import { useTradeAnalysis } from "../hooks/use-trade-analysis";
import {
  createPortfolioAccount,
  loadPortfolioAccounts,
  savePortfolioAccounts,
  type PortfolioAccount,
} from "../lib/accounts/store";
import { parseRobinhoodCsv } from "../lib/importers/robinhood";
import { demoHoldings } from "../lib/demo-data";
import { buildHoldings } from "../lib/portfolio/engine";
import {
  getCachedDailyPrices,
} from "../lib/pricing/cache";
import {
  DEFAULT_PRICING_PROVIDER,
  pricingProviders,
  type CurrentQuote,
  type DailyPrice,
  type PricingProviderId,
} from "../lib/pricing";
import { waitForTwelveDataCredits } from "../lib/pricing/rate-limit";
import { deleteLocalDatabase } from "../lib/storage/database";
import type { RatedTrade } from "../lib/trade-review/analyzer";
import { friendlyDate, money, percent, scoreTone } from "../lib/ui/format";
const INITIAL_HOLDING_QUOTE_COUNT = 7;
const HOLDING_QUOTE_BATCH_SIZE = 8;
const EXITED_PRICE_BATCH_SIZE = 8;
const PRICING_PROVIDER_KEY = "trade-reviewer-pro:pricing-provider";
const TWELVE_DATA_KEY = "trade-reviewer-pro:twelve-data-key";
const QUOTE_HOLDING_LIMIT_KEY = "trade-reviewer-pro:quote-holding-limit";
const EXITED_TICKER_LIMIT_KEY = "trade-reviewer-pro:exited-ticker-limit";
const SELECTED_ACCOUNT_KEY = "trade-reviewer-pro:selected-account";

function storedPricingProvider(): PricingProviderId {
  if (typeof window === "undefined") return DEFAULT_PRICING_PROVIDER;
  return localStorage.getItem(PRICING_PROVIDER_KEY) === "twelve-data"
    ? "twelve-data"
    : DEFAULT_PRICING_PROVIDER;
}

function storedTwelveDataKey() {
  return typeof window === "undefined" ? "" : localStorage.getItem(TWELVE_DATA_KEY) || "";
}

function accountProgressKey(key: string, accountId?: string) {
  return accountId ? `${key}:${accountId}` : key;
}

function storedQuoteHoldingLimit(accountId?: string) {
  if (typeof window === "undefined") return INITIAL_HOLDING_QUOTE_COUNT;
  const stored = Number(
    localStorage.getItem(accountProgressKey(QUOTE_HOLDING_LIMIT_KEY, accountId)) ||
    localStorage.getItem(QUOTE_HOLDING_LIMIT_KEY),
  );
  return Number.isFinite(stored) && stored >= INITIAL_HOLDING_QUOTE_COUNT
    ? Math.floor(stored)
    : INITIAL_HOLDING_QUOTE_COUNT;
}

function storedExitedTickerLimit(accountId?: string) {
  if (typeof window === "undefined") return 0;
  const stored = Number(
    localStorage.getItem(accountProgressKey(EXITED_TICKER_LIMIT_KEY, accountId)) ||
    localStorage.getItem(EXITED_TICKER_LIMIT_KEY),
  );
  return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
}


export default function Home() {
  const [tab, setTab] = useState<"overview" | "review" | "holdings">("overview");
  const [accounts, setAccounts] = useState<PortfolioAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<"new" | "replace">("new");
  const [accountName, setAccountName] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedTrade, setSelectedTrade] = useState<RatedTrade | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pricingProvider, setPricingProvider] = useState<PricingProviderId>(storedPricingProvider);
  const [draftProvider, setDraftProvider] = useState<PricingProviderId>(storedPricingProvider);
  const [twelveDataKey, setTwelveDataKey] = useState(storedTwelveDataKey);
  const [draftTwelveDataKey, setDraftTwelveDataKey] = useState(storedTwelveDataKey);
  const [currentQuotes, setCurrentQuotes] = useState<Record<string, CurrentQuote>>({});
  const [quotesLoaded, setQuotesLoaded] = useState(false);
  const [quoteStatus, setQuoteStatus] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const [pricingError, setPricingError] = useState("");
  const [spyPriceCount, setSpyPriceCount] = useState(0);
  const [spyPrices, setSpyPrices] = useState<DailyPrice[]>([]);
  const [quoteHoldingLimit, setQuoteHoldingLimit] = useState(storedQuoteHoldingLimit);
  const [quoteFetchInProgress, setQuoteFetchInProgress] = useState(false);
  const [quotesReadyForHistory, setQuotesReadyForHistory] = useState(false);
  const [exitedTickerLimit, setExitedTickerLimit] = useState(storedExitedTickerLimit);
  const [exitedDailyPrices, setExitedDailyPrices] = useState<Record<string, DailyPrice[]>>({});
  const [exitFetchInProgress, setExitFetchInProgress] = useState(
    () => storedExitedTickerLimit() > 0,
  );
  const [exitStatus, setExitStatus] = useState("");
  const [quoteRefreshVersion, setQuoteRefreshVersion] = useState(0);
  const handledQuoteRefreshVersion = useRef(0);

  useEffect(() => {
    void loadPortfolioAccounts().then((stored) => {
      setAccounts(stored);
      if (!stored.length) return;
      const remembered = localStorage.getItem(SELECTED_ACCOUNT_KEY);
      const selected = stored.some((account) => account.id === remembered)
        ? remembered!
        : stored[0].id;
      setSelectedAccountId(selected);
      setQuoteHoldingLimit(storedQuoteHoldingLimit(selected));
      setExitedTickerLimit(storedExitedTickerLimit(selected));
      setQuoteFetchInProgress(true);
      setExitFetchInProgress(storedExitedTickerLimit(selected) > 0);
      const account = stored.find((item) => item.id === selected)!;
      setNotice(`Restored ${account.name} with ${account.transactions.length.toLocaleString()} private transactions.`);
    });
  }, []);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId),
    [accounts, selectedAccountId],
  );
  const transactions = useMemo(
    () => selectedAccount?.transactions || [],
    [selectedAccount],
  );

  const rebuilt = useMemo(() => buildHoldings(transactions), [transactions]);
  const isDemo = transactions.length === 0;
  const baseHoldings = isDemo ? demoHoldings : rebuilt.holdings;
  const pricedHoldingSymbols = baseHoldings
    .slice(0, quoteHoldingLimit)
    .map((holding) => holding.ticker);
  const holdingSymbols = pricedHoldingSymbols.join(",");
  const pricedHoldingSet = new Set(pricedHoldingSymbols);
  const remainingQuoteCount = Math.max(0, baseHoldings.length - pricedHoldingSymbols.length);
  const nextQuoteBatchSize = Math.min(HOLDING_QUOTE_BATCH_SIZE, remainingQuoteCount);
  const pricingConfigurationError = pricingProviders[pricingProvider].requiresApiKey && !twelveDataKey
    ? "Add a Twelve Data API key in Settings to update market prices."
    : "";
  const displayedPricingError = pricingConfigurationError || pricingError;
  const pricingStatus = [quoteStatus, historyStatus, exitStatus].filter(Boolean).join(" · ");

  usePricing({
    transactions,
    isDemo,
    holdingSymbols,
    provider: pricingProvider,
    apiKey: twelveDataKey,
    refreshVersion: quoteRefreshVersion,
    handledRefreshVersionRef: handledQuoteRefreshVersion,
    quotesReadyForHistory,
    setCurrentQuotes,
    setQuotesLoaded,
    setQuoteFetchInProgress,
    setQuotesReadyForHistory,
    setQuoteStatus,
    setHistoryStatus,
    setPricingError,
    setSpyPriceCount,
    setSpyPrices,
  });


  const heldPricePhaseComplete = remainingQuoteCount === 0 && !quoteFetchInProgress;
  const analysis = useTradeAnalysis({
    transactions,
    isDemo,
    baseHoldings,
    realizedGain: rebuilt.realized,
    currentQuotes,
    spyPrices,
    exitedDailyPrices,
    heldPricePhaseComplete,
  });
  const { exitedTickerPriority } = analysis;
  const selectedExitedTickers = exitedTickerPriority.slice(0, exitedTickerLimit);
  const selectedExitedTickerKey = selectedExitedTickers.join(",");
  const remainingExitedTickerCount = Math.max(
    0,
    exitedTickerPriority.length - selectedExitedTickers.length,
  );
  const nextExitedBatchSize = Math.min(
    EXITED_PRICE_BATCH_SIZE,
    remainingExitedTickerCount,
  );
  useEffect(() => {
    if (
      !heldPricePhaseComplete ||
      !spyPriceCount ||
      !selectedExitedTickerKey ||
      isDemo
    ) return;
    if (pricingProviders[pricingProvider].requiresApiKey && !twelveDataKey) return;

    const controller = new AbortController();
    const tickers = selectedExitedTickerKey.split(",");
    const endDate = new Date().toISOString().slice(0, 10);
    const earliestExitByTicker = new Map<string, string>();
    transactions
      .filter((transaction) => transaction.type === "sell" && tickers.includes(transaction.ticker))
      .forEach((transaction) => {
        const existing = earliestExitByTicker.get(transaction.ticker);
        if (!existing || transaction.date < existing) {
          earliestExitByTicker.set(transaction.ticker, transaction.date);
        }
      });
    const options = {
      apiKey: pricingProvider === "twelve-data" ? twelveDataKey : undefined,
      signal: controller.signal,
      beforeRequest: async (credits: number) => {
        if (pricingProvider !== "twelve-data") return;
        await waitForTwelveDataCredits(credits, controller.signal, (milliseconds) => {
          if (controller.signal.aborted) return;
          setExitStatus(
            `Exited-position prices queued for the next credit window (${Math.max(1, Math.ceil(milliseconds / 1000))}s)`,
          );
        });
      },
    };

    void Promise.allSettled(tickers.map(async (ticker) => {
      const startDate = earliestExitByTicker.get(ticker);
      if (!startDate) return [ticker, []] as const;
      const prices = await getCachedDailyPrices(
        ticker,
        startDate,
        endDate,
        pricingProvider,
        options,
      );
      return [ticker, prices] as const;
    })).then((results) => {
      if (controller.signal.aborted) return;
      const entries = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : []
      );
      const failed = results.filter((result) => result.status === "rejected");
      if (!entries.length && failed.length) {
        const reason = failed[0].reason;
        throw reason instanceof Error ? reason : new Error("Exited-position prices could not be updated.");
      }
      setExitedDailyPrices((current) => ({
        ...current,
        ...Object.fromEntries(entries),
      }));
      setExitFetchInProgress(false);
      const available = entries.filter(([, prices]) => prices.length).length;
      const unavailable = entries.length - available;
      setExitStatus(
        `${available} of ${tickers.length} exited tickers analyzed` +
        `${unavailable ? ` · ${unavailable} unavailable` : ""}` +
        `${failed.length ? ` · ${failed.length} deferred after provider errors` : ""}`,
      );
    }).catch((caught) => {
      if (controller.signal.aborted) return;
      setExitFetchInProgress(false);
      setPricingError(caught instanceof Error ? caught.message : "Exited-position prices could not be updated.");
    });
    return () => controller.abort();
  }, [
    heldPricePhaseComplete,
    isDemo,
    pricingProvider,
    selectedExitedTickerKey,
    spyPriceCount,
    transactions,
    twelveDataKey,
  ]);

  useEffect(() => {
    if (!selectedTrade) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedTrade(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedTrade]);

  function openSettings() {
    setDraftProvider(pricingProvider);
    setDraftTwelveDataKey(twelveDataKey);
    setShowSettings(true);
  }

  function selectAccount(accountId: string) {
    if (accountId === selectedAccountId) return;
    setSelectedAccountId(accountId);
    localStorage.setItem(SELECTED_ACCOUNT_KEY, accountId);
    setCurrentQuotes({});
    setQuotesLoaded(false);
    setQuoteHoldingLimit(storedQuoteHoldingLimit(accountId));
    setExitedTickerLimit(storedExitedTickerLimit(accountId));
    setQuoteFetchInProgress(true);
    setQuotesReadyForHistory(false);
    setSpyPrices([]);
    setSpyPriceCount(0);
    setExitedDailyPrices({});
    setExitFetchInProgress(storedExitedTickerLimit(accountId) > 0);
    setPricingError("");
    setQuoteStatus("Preparing account prices…");
    setHistoryStatus("");
    setExitStatus("");
    setSelectedTrade(null);
  }

  function openNewAccountImport() {
    setImportMode("new");
    setAccountName("");
    setError("");
    setShowImport(true);
  }

  function savePricingSettings() {
    localStorage.setItem(PRICING_PROVIDER_KEY, draftProvider);
    if (draftTwelveDataKey.trim()) {
      localStorage.setItem(TWELVE_DATA_KEY, draftTwelveDataKey.trim());
    } else {
      localStorage.removeItem(TWELVE_DATA_KEY);
    }
    setPricingProvider(draftProvider);
    setTwelveDataKey(draftTwelveDataKey.trim());
    setCurrentQuotes({});
    setQuotesLoaded(false);
    setQuoteFetchInProgress(true);
    setQuotesReadyForHistory(false);
    setSpyPrices([]);
    setSpyPriceCount(0);
    setExitedDailyPrices({});
    setExitFetchInProgress(exitedTickerLimit > 0);
    setPricingError("");
    setQuoteStatus(`Preparing priority quotes with ${pricingProviders[draftProvider].name}…`);
    setHistoryStatus("");
    setExitStatus("");
    setShowSettings(false);
  }

  function fetchNextQuoteBatch() {
    if (!nextQuoteBatchSize || quoteFetchInProgress) return;
    setQuoteHoldingLimit((current) => {
      const next = Math.min(baseHoldings.length, current + HOLDING_QUOTE_BATCH_SIZE);
      localStorage.setItem(
        accountProgressKey(QUOTE_HOLDING_LIMIT_KEY, selectedAccountId),
        String(next),
      );
      return next;
    });
    setQuoteFetchInProgress(true);
    setPricingError("");
    setQuoteStatus(`Preparing the next ${nextQuoteBatchSize} holding quote${nextQuoteBatchSize === 1 ? "" : "s"}…`);
  }

  function refreshCurrentPrices() {
    if (quoteFetchInProgress || pricingConfigurationError) return;
    setQuoteFetchInProgress(true);
    setPricingError("");
    setQuoteStatus("Refreshing saved current prices…");
    setQuoteRefreshVersion((current) => current + 1);
  }

  function fetchNextExitedBatch() {
    if (
      !nextExitedBatchSize ||
      exitFetchInProgress ||
      !heldPricePhaseComplete ||
      !spyPriceCount
    ) return;
    setExitedTickerLimit((current) => {
      const next = Math.min(
        exitedTickerPriority.length,
        current + EXITED_PRICE_BATCH_SIZE,
      );
      localStorage.setItem(
        accountProgressKey(EXITED_TICKER_LIMIT_KEY, selectedAccountId),
        String(next),
      );
      return next;
    });
    setExitFetchInProgress(true);
    setPricingError("");
    setExitStatus(
      `Preparing ${nextExitedBatchSize} exited-position price${nextExitedBatchSize === 1 ? "" : "s"}…`,
    );
  }

  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a .csv export from Robinhood."); return;
    }
    setImporting(true); setError("");
    try {
      const parsed = parseRobinhoodCsv(await file.text());
      if (!parsed.length) throw new Error("No supported transactions were found.");
      let nextAccounts: PortfolioAccount[];
      let nextAccountId: string;
      if (importMode === "replace" && selectedAccount) {
        nextAccountId = selectedAccount.id;
        nextAccounts = accounts.map((account) => account.id === selectedAccount.id
          ? { ...account, transactions: parsed, updatedAt: new Date().toISOString() }
          : account
        );
      } else {
        const fallbackName = file.name.replace(/\.csv$/i, "").trim() || "Robinhood account";
        const created = createPortfolioAccount(accountName || fallbackName, parsed);
        nextAccountId = created.id;
        nextAccounts = [...accounts, created];
      }
      await savePortfolioAccounts(nextAccounts);
      setAccounts(nextAccounts);
      setSelectedAccountId(nextAccountId);
      localStorage.setItem(SELECTED_ACCOUNT_KEY, nextAccountId);
      setCurrentQuotes({});
      setQuotesLoaded(false);
      setQuoteHoldingLimit(INITIAL_HOLDING_QUOTE_COUNT);
      localStorage.setItem(
        accountProgressKey(QUOTE_HOLDING_LIMIT_KEY, nextAccountId),
        String(INITIAL_HOLDING_QUOTE_COUNT),
      );
      setQuoteFetchInProgress(true);
      setQuotesReadyForHistory(false);
      setSpyPrices([]);
      setSpyPriceCount(0);
      setExitedTickerLimit(0);
      localStorage.setItem(accountProgressKey(EXITED_TICKER_LIMIT_KEY, nextAccountId), "0");
      setExitedDailyPrices({});
      setExitFetchInProgress(false);
      setPricingError("");
      setQuoteStatus("Preparing priority quotes…");
      setHistoryStatus("");
      setExitStatus("");
      setSelectedTrade(null);
      const displayName = nextAccounts.find((account) => account.id === nextAccountId)?.name;
      setNotice(`${displayName} saved with ${parsed.length.toLocaleString()} private transactions.`);
      setShowImport(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t read this file.");
    } finally { setImporting(false); }
  }

  async function deleteSelectedAccount() {
    if (!selectedAccount) return;
    if (!window.confirm(`Delete ${selectedAccount.name} and its imported transactions from this device?`)) return;
    const nextAccounts = accounts.filter((account) => account.id !== selectedAccount.id);
    await savePortfolioAccounts(nextAccounts);
    localStorage.removeItem(accountProgressKey(QUOTE_HOLDING_LIMIT_KEY, selectedAccount.id));
    localStorage.removeItem(accountProgressKey(EXITED_TICKER_LIMIT_KEY, selectedAccount.id));
    setAccounts(nextAccounts);
    setShowSettings(false);
    if (nextAccounts.length) {
      selectAccount(nextAccounts[0].id);
      setNotice(`${selectedAccount.name} was deleted. Market-price caches remain reusable.`);
    } else {
      setSelectedAccountId("");
      localStorage.removeItem(SELECTED_ACCOUNT_KEY);
      setCurrentQuotes({});
      setSpyPrices([]);
      setSpyPriceCount(0);
      setExitedDailyPrices({});
      setQuoteFetchInProgress(false);
      setExitFetchInProgress(false);
      setQuoteStatus("");
      setHistoryStatus("");
      setExitStatus("");
      setNotice("The account was deleted. Add a CSV to begin again.");
    }
  }

  async function deleteAllSystemData() {
    if (!window.confirm("Delete every account, transaction, market-price cache, API key, and setting stored by TradeReviewerPro on this device?")) return;
    await deleteLocalDatabase();
    Object.keys(localStorage)
      .filter((key) => key.startsWith("trade-reviewer-pro:"))
      .forEach((key) => localStorage.removeItem(key));
    setAccounts([]);
    setSelectedAccountId("");
    setCurrentQuotes({});
    setSpyPrices([]);
    setSpyPriceCount(0);
    setExitedDailyPrices({});
    setQuoteHoldingLimit(INITIAL_HOLDING_QUOTE_COUNT);
    setExitedTickerLimit(0);
    setQuoteFetchInProgress(false);
    setExitFetchInProgress(false);
    setQuotesReadyForHistory(false);
    setPricingProvider(DEFAULT_PRICING_PROVIDER);
    setDraftProvider(DEFAULT_PRICING_PROVIDER);
    setTwelveDataKey("");
    setDraftTwelveDataKey("");
    setQuoteStatus("");
    setHistoryStatus("");
    setExitStatus("");
    setPricingError("");
    setSelectedTrade(null);
    setShowSettings(false);
    setNotice("All TradeReviewerPro data was deleted from this device.");
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#" aria-label="TradeReviewerPro home">
          <span className="brand-mark">tr</span>
          <span>TradeReviewer<span>Pro</span></span>
        </a>
        <nav aria-label="Primary">
          {(["overview", "review", "holdings"] as const).map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
              {item === "review" ? "Trade review" : item}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          {accounts.length > 0 && (
            <select
              className="account-selector"
              value={selectedAccountId}
              onChange={(event) => selectAccount(event.target.value)}
              aria-label="Select brokerage account"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          )}
          <button className="settings-button" onClick={openSettings} aria-label="Settings">⚙</button>
          <button className="import-button" onClick={openNewAccountImport}>
            <span>＋</span> Add account
          </button>
        </div>
      </header>

      <section className="shell">
        <div className="eyebrow-row">
          <p><span className="live-dot" /> {isDemo ? "DEMO PORTFOLIO" : selectedAccount?.name.toUpperCase()}</p>
          <p className="as-of">
            {currentQuotes.SPY ? `PRICES AS OF ${friendlyDate(currentQuotes.SPY.asOf.slice(0, 10)).toUpperCase()}` : "MARKET DATA READY"} · <span>TRADES STAY ON THIS DEVICE</span>
          </p>
        </div>

        {notice && <button className="notice" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
        {!isDemo && (pricingStatus || displayedPricingError || remainingQuoteCount > 0 || remainingExitedTickerCount > 0) && (
          <div className={`pricing-notice ${displayedPricingError ? "error-state" : ""}`}>
            <span>{displayedPricingError ? "!" : "↻"}</span>
            <strong>{displayedPricingError || pricingStatus || `${Object.keys(currentQuotes).length} quotes cached`}</strong>
            <div className="pricing-actions">
              {displayedPricingError && <button onClick={openSettings}>Open settings</button>}
              {quotesLoaded && !pricingConfigurationError && (
                <button onClick={refreshCurrentPrices} disabled={quoteFetchInProgress}>
                  {quoteFetchInProgress ? "Refreshing…" : "Refresh prices"}
                </button>
              )}
              {remainingQuoteCount > 0 && !pricingConfigurationError && (
                <button onClick={fetchNextQuoteBatch} disabled={quoteFetchInProgress}>
                  {quoteFetchInProgress ? "Fetching…" : `Fetch next ${nextQuoteBatchSize}`}
                </button>
              )}
              {heldPricePhaseComplete && remainingExitedTickerCount > 0 && !pricingConfigurationError && (
                <button
                  onClick={fetchNextExitedBatch}
                  disabled={exitFetchInProgress || !spyPriceCount}
                >
                  {!spyPriceCount
                    ? "Waiting for SPY…"
                    : exitFetchInProgress
                      ? "Fetching exits…"
                      : `Fetch exited ${nextExitedBatchSize}`}
                </button>
              )}
            </div>
          </div>
        )}

        {tab === "overview" && (
          <OverviewTab
            analysis={analysis}
            isDemo={isDemo}
            purchaseCount={transactions.filter((transaction) => transaction.type === "buy").length}
            spyPriceCount={spyPriceCount}
            accountName={selectedAccount?.name}
            onNavigate={setTab}
          />
        )}
        {tab === "review" && (
          <ReviewTab
            analysis={analysis}
            isDemo={isDemo}
            spyPriceCount={spyPriceCount}
            onSelectTrade={setSelectedTrade}
          />
        )}
        {tab === "holdings" && (
          <HoldingsTab
            analysis={analysis}
            currentQuotes={currentQuotes}
            pricedHoldingSymbols={pricedHoldingSet}
            quotesLoaded={quotesLoaded}
            isDemo={isDemo}
            spyPriceCount={spyPriceCount}
          />
        )}
      </section>

      <footer><span>TradeReviewerPro</span><p>Private by design. Your trading data never leaves your browser.</p><span>Not investment advice.</span></footer>

      {showImport && (
        <ImportModal
          mode={importMode}
          accountName={accountName}
          selectedAccountName={selectedAccount?.name}
          importing={importing}
          error={error}
          onClose={() => setShowImport(false)}
          onModeChange={setImportMode}
          onAccountNameChange={setAccountName}
          onFile={(file) => void handleFile(file)}
        />
      )}

      {showSettings && (
        <SettingsModal
          provider={draftProvider}
          twelveDataKey={draftTwelveDataKey}
          hasSelectedAccount={Boolean(selectedAccount)}
          onProviderChange={setDraftProvider}
          onKeyChange={setDraftTwelveDataKey}
          onSave={savePricingSettings}
          onClose={() => setShowSettings(false)}
          onDeleteSelected={() => void deleteSelectedAccount()}
          onDeleteAll={() => void deleteAllSystemData()}
        />
      )}

      {selectedTrade && (
        <div className="trade-detail-backdrop" role="presentation" onMouseDown={() => setSelectedTrade(null)}>
          <section className="trade-detail" role="dialog" aria-modal="true" aria-labelledby="trade-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="trade-detail-close" onClick={() => setSelectedTrade(null)} aria-label="Close trade details">×</button>
            <div className="trade-detail-top">
              <div>
                <button className="back-to-ledger" onClick={() => setSelectedTrade(null)}>← Back to trade review</button>
                <p className="kicker">{selectedTrade.side.toUpperCase()} EXECUTION · {friendlyDate(selectedTrade.date).toUpperCase()}</p>
                <h2 id="trade-detail-title">{selectedTrade.ticker} <em>trade review</em></h2>
                <p>{selectedTrade.description.split("\n")[0] || selectedTrade.ticker}</p>
              </div>
              <div className={`detail-grade ${scoreTone(selectedTrade.score)}`}>
                <span>{selectedTrade.grade}</span>
                <p>{selectedTrade.score}/100<br /><strong>{selectedTrade.verdict}</strong></p>
              </div>
            </div>

            <div className="detail-summary">
              <p className="label">THE READ</p>
              <h3>{selectedTrade.summary}</h3>
              <div className="confidence"><i /> {selectedTrade.confidence} confidence · {selectedTrade.spyValue !== null ? "uploaded activity + cached market data" : "based only on uploaded activity"}</div>
            </div>

            <div className="detail-metrics">
              <article>
                <p className="label">EXECUTION PRICE</p>
                <strong>{money(selectedTrade.price, 2)}</strong>
                <small>{selectedTrade.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares · {money(selectedTrade.amount, 2)}</small>
                {selectedTrade.side === "Buy" && selectedTrade.normalizedPrice !== null && Math.abs(selectedTrade.normalizedPrice - selectedTrade.price) > 0.01 && (
                  <small className="split-normalized">Current equivalent: {selectedTrade.normalizedQuantity?.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares @ {money(selectedTrade.normalizedPrice, 2)}</small>
                )}
              </article>
              <article><p className="label">{selectedTrade.referenceLabel}</p><strong>{selectedTrade.referencePrice === null ? "—" : money(selectedTrade.referencePrice, 2)}</strong><small>{selectedTrade.status}</small></article>
              <article><p className="label">OBSERVED OUTCOME</p><strong className={selectedTrade.outcomePct === null ? "" : selectedTrade.outcomePct >= 0 ? "positive" : "negative"}>{percent(selectedTrade.outcomePct)}</strong><small>{selectedTrade.holdingDays === null ? "Holding period unavailable" : `${selectedTrade.holdingDays} observed days`}</small></article>
            </div>

            {selectedTrade.spyValue !== null && selectedTrade.spyEntryPrice !== null && (
              <section className="lazy-benchmark" aria-label="Lazy investor SPY comparison">
                <div className="lazy-benchmark-head">
                  <div><p className="kicker">THE LAZY INVESTOR TEST</p><h3>What if this money simply went into SPY?</h3></div>
                  <span className={selectedTrade.excessReturnPct !== null && selectedTrade.excessReturnPct >= 0 ? "positive" : "negative"}>
                    {selectedTrade.excessReturnPct === null ? "—" : `${selectedTrade.excessReturnPct >= 0 ? "+" : ""}${selectedTrade.excessReturnPct.toFixed(1)} pts`}
                  </span>
                </div>
                <div className="lazy-benchmark-grid">
                  <article>
                    <p className="label">ORIGINAL INVESTMENT</p>
                    <strong>{money(selectedTrade.amount, 2)}</strong>
                    <small>{selectedTrade.spyShares?.toFixed(4)} fractional SPY shares at {money(selectedTrade.spyEntryPrice, 2)}</small>
                  </article>
                  <article>
                    <p className="label">YOUR TRADE VALUE</p>
                    <strong>{selectedTrade.currentValue === null ? "—" : money(selectedTrade.currentValue, 2)}</strong>
                    <small>{selectedTrade.status === "Closed" ? "Realized proceeds" : "Current and realized value combined"}</small>
                  </article>
                  <article>
                    <p className="label">SPY VALUE TODAY</p>
                    <strong>{money(selectedTrade.spyValue, 2)}</strong>
                    <small>{percent(selectedTrade.spyReturnPct)} lazy return</small>
                  </article>
                </div>
                <p>
                  The SPY comparison uses the next available adjusted daily price on or after the trade date and today’s cached SPY quote. Fractional shares keep the starting dollars identical.
                </p>
              </section>
            )}

            {selectedTrade.exitEdgePct !== null && (
              <section className="lazy-benchmark exit-benchmark" aria-label="Post-exit performance comparison">
                <div className="lazy-benchmark-head">
                  <div><p className="kicker">EXIT QUALITY</p><h3>What happened after you sold?</h3></div>
                  <span className={selectedTrade.exitEdgePct >= 0 ? "positive" : "negative"}>
                    {selectedTrade.exitEdgePct >= 0 ? "+" : ""}{selectedTrade.exitEdgePct.toFixed(1)} pts
                  </span>
                </div>
                <div className="lazy-benchmark-grid">
                  <article>
                    <p className="label">{selectedTrade.ticker} SINCE EXIT</p>
                    <strong className={selectedTrade.postExitReturnPct !== null && selectedTrade.postExitReturnPct >= 0 ? "positive" : "negative"}>{percent(selectedTrade.postExitReturnPct)}</strong>
                    <small>{selectedTrade.adjustedExitPrice === null || selectedTrade.postExitCurrentPrice === null ? "Adjusted prices unavailable" : `${money(selectedTrade.adjustedExitPrice, 2)} adjusted exit → ${money(selectedTrade.postExitCurrentPrice, 2)} latest`}</small>
                  </article>
                  <article>
                    <p className="label">SPY SINCE EXIT</p>
                    <strong className={selectedTrade.postExitSpyReturnPct !== null && selectedTrade.postExitSpyReturnPct >= 0 ? "positive" : "negative"}>{percent(selectedTrade.postExitSpyReturnPct)}</strong>
                    <small>Same post-sale observation period</small>
                  </article>
                  <article>
                    <p className="label">EXIT EDGE</p>
                    <strong className={selectedTrade.exitEdgePct >= 0 ? "positive" : "negative"}>{selectedTrade.exitEdgePct >= 0 ? "+" : ""}{selectedTrade.exitEdgePct.toFixed(1)} pts</strong>
                    <small>{selectedTrade.exitEdgePct >= 0 ? "The exit avoided relative underperformance." : "The stock outperformed SPY after the exit."}</small>
                  </article>
                </div>
                <p>Exit quality compares split-adjusted daily performance after the sale with SPY over the same dates. It contributes up to ±15 points without overriding the realized result or original holding discipline.</p>
              </section>
            )}

            <div className="detail-notes">
              <article><span>↗</span><div><p className="label">WHAT WORKED</p><h3>{selectedTrade.strength}</h3></div></article>
              <article><span>◎</span><div><p className="label">WATCH NEXT TIME</p><h3>{selectedTrade.watchout}</h3></div></article>
            </div>

            <div className="score-explainer">
              <div><p className="label">HOW THIS SCORE WORKS</p><p>Observed outcome contributes up to 35 points. When current and historical pricing are available, performance versus the same dollars invested in SPY adds or subtracts up to 15 points. Split normalization, holding discipline, and unusually large position sizes also adjust the score.</p></div>
              <span>{selectedTrade.rawCode} · {selectedTrade.transactionId}</span>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
