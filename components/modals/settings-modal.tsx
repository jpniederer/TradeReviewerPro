import { pricingProviders, type PricingProviderId } from "../../lib/pricing";

type SettingsModalProps = {
  provider: PricingProviderId;
  twelveDataKey: string;
  hasSelectedAccount: boolean;
  onProviderChange: (provider: PricingProviderId) => void;
  onKeyChange: (key: string) => void;
  onSave: () => void;
  onClose: () => void;
  onDeleteSelected: () => void;
  onDeleteAll: () => void;
};

export function SettingsModal(props: SettingsModalProps) {
  const { provider, twelveDataKey, hasSelectedAccount, onProviderChange, onKeyChange, onSave, onClose, onDeleteSelected, onDeleteAll } = props;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close settings">×</button><p className="kicker">MARKET DATA</p><h2 id="settings-title">Pricing settings</h2><p>Choose the engine used for current holding quotes and daily SPY history.</p>
        <fieldset className="provider-options"><legend>PRICE ENGINE</legend>{Object.values(pricingProviders).map((option) => { const browserBlocked = option.id === "yahoo"; return <label key={option.id} className={`${provider === option.id ? "selected" : ""} ${browserBlocked ? "disabled" : ""}`}><input type="radio" name="pricing-provider" value={option.id} checked={provider === option.id} disabled={browserBlocked} onChange={() => onProviderChange(option.id)} /><span><strong>{option.name}</strong><small>{browserBlocked ? "Unavailable in-browser · CORS blocked" : "Default · official API · your own key"}</small></span><i>{provider === option.id ? "✓" : ""}</i></label>; })}</fieldset>
        {provider === "twelve-data" && <label className="api-key-field"><span>TWELVE DATA API KEY</span><input type="password" value={twelveDataKey} onChange={(event) => onKeyChange(event.target.value)} placeholder="Paste your API key" autoComplete="off" /><small>Saved only in this browser. It is sent only to Twelve Data.</small></label>}
        {provider === "twelve-data" && <details className="setup-guide api-key-guide"><summary>How to get a Twelve Data API key</summary><ol><li><a href="https://twelvedata.com/register" target="_blank" rel="noreferrer">Create a Twelve Data account ↗</a> and select the free Basic plan.</li><li>Confirm your email, sign in, and open your Twelve Data dashboard.</li><li>Copy the API key shown in the dashboard, paste it above, and save.</li></ol><p>The Basic plan currently includes 8 API credits per minute and 800 per day. TradeReviewerPro batches and caches requests around that limit.</p><a href="https://twelvedata.com/pricing" target="_blank" rel="noreferrer">Review Twelve Data plans and limits ↗</a></details>}
        <div className="settings-privacy"><span>◉</span><p><strong>Eight-credit-aware</strong><br />Held positions are always priced first. SPY history follows, and exited-position batches remain locked until held-stock coverage is complete.</p></div>
        <button className="save-settings" onClick={onSave} disabled={provider === "twelve-data" && !twelveDataKey.trim()}>Save pricing settings</button>
        <div className="danger-zone"><p className="label">LOCAL DATA</p><p>Delete an account without affecting the others, or erase every account, cache, key, and setting stored by this app.</p><div><button disabled={!hasSelectedAccount} onClick={onDeleteSelected}>Delete selected account</button><button className="danger" onClick={onDeleteAll}>Delete all local data</button></div></div>
      </section>
    </div>
  );
}
