import type { ChangeEvent, DragEvent } from "react";

type ImportModalProps = {
  mode: "new" | "replace";
  accountName: string;
  selectedAccountName?: string;
  importing: boolean;
  error: string;
  onClose: () => void;
  onModeChange: (mode: "new" | "replace") => void;
  onAccountNameChange: (name: string) => void;
  onFile: (file?: File) => void;
};

export function ImportModal(props: ImportModalProps) {
  const { mode, accountName, selectedAccountName, importing, error, onClose, onModeChange, onAccountNameChange, onFile } = props;
  function onDrop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); onFile(event.dataTransfer.files[0]); }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">×</button><p className="kicker">PRIVATE ACCOUNT IMPORT</p><h2 id="import-title">{mode === "new" ? "Add a Robinhood account." : `Update ${selectedAccountName}.`}</h2><p>Each CSV belongs to one local account. Switch accounts anytime to review performance independently.</p>
        <div className="import-mode" aria-label="Import mode"><button className={mode === "new" ? "selected" : ""} onClick={() => onModeChange("new")}>New account</button><button className={mode === "replace" ? "selected" : ""} disabled={!selectedAccountName} onClick={() => onModeChange("replace")}>Replace selected</button></div>
        <details className="setup-guide"><summary>How to export your Robinhood trade history</summary><div className="setup-guide-grid"><section><strong>Robinhood mobile app</strong><ol><li>Open <b>Account</b>, then the three-bar menu.</li><li>Choose <b>Reports and statements</b> → <b>Account activity reports</b>.</li><li>Select <b>Generate new report</b>. Choose the account and your full trading date range.</li><li>When Robinhood notifies you, download the CSV and select it below.</li></ol></section><section><strong>Robinhood website</strong><ol><li>Sign in and open <b>Account</b> → <b>Reports and statements</b>.</li><li>Open <b>Account activity reports</b>, then <b>Generate new report</b>.</li><li>Choose the account and your full trading date range, then generate the report.</li><li>Download the finished CSV and select it below.</li></ol></section></div><p>Robinhood says most reports take about two hours, but they can take up to 24 hours. Brokerage and retirement activity are supported; futures, crypto, and spending activity are not included in this report.</p><a href="https://robinhood.com/us/en/support/articles/finding-your-reports-and-statements/" target="_blank" rel="noreferrer">Open Robinhood’s report instructions ↗</a></details>
        {mode === "new" && <label className="account-name-field"><span>ACCOUNT NAME</span><input value={accountName} onChange={(event) => onAccountNameChange(event.target.value)} placeholder="Main, Managed, Roth IRA…" /></label>}
        <label className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}><input type="file" accept=".csv,text/csv" onChange={(event: ChangeEvent<HTMLInputElement>) => onFile(event.target.files?.[0])} /><span className="upload-icon">↑</span><strong>{importing ? "Reading your trades…" : "Drop your Robinhood CSV here"}</strong><small>or click to choose a file · CSV only</small></label>
        {error && <p className="error">{error}</p>}<div className="privacy-row"><span>◉</span><div><strong>Stays on your device</strong><p>Stored only in your browser so you can return later.</p></div></div>
      </section>
    </div>
  );
}
