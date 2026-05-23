import { SUPPORTED_PLATFORMS } from "@/lib/platforms";
import styles from "@/app/page.module.css";

export default function CollectorsPage() {
  return (
    <div className={styles.collectorShell}>
      <header className={styles.collectorHeader}>
        <div>
          <p className={styles.cleanEyebrow}>Collector setup</p>
          <h1 className={styles.cleanTitle}>Where data comes from now.</h1>
          <p className={styles.cleanLead}>
            The extension handles manual multi-social sync from open web tabs. Imports handle full export files.
            The homepage stays intentionally quiet so search remains the main event.
          </p>
        </div>
        <a className={styles.cleanButtonSecondary} href="/">
          Back to search
        </a>
      </header>

      <section className={styles.collectorGrid}>
        {SUPPORTED_PLATFORMS.map((platform) => (
          <article key={platform.id} className={styles.collectorCard}>
            <div className={styles.cleanItemTop}>
              <span className={styles.cleanPlatformBadge}>{platform.label}</span>
              <span className={styles.cleanItemType}>{platform.kind}</span>
            </div>
            <h2>{platform.label}</h2>
            <p>{platform.sector}</p>
            <ul className={styles.collectorList}>
              <li>Extension manual sync supported</li>
              <li>Open the relevant web tab and stay logged in</li>
              <li>Search lands on the main dashboard immediately after sync</li>
            </ul>
          </article>
        ))}
      </section>

      <section className={styles.collectorImportSection}>
        <h2>Supported imports</h2>
        <p>
          Import route currently supports Instagram data export ZIP/JSON, WhatsApp exported chat TXT,
          Slack export ZIP/JSON, and existing archive JSON.
        </p>
      </section>
    </div>
  );
}
