export const overviewPageStyles = `    :root {
      color-scheme: light dark;
      --bg: #f7f8f5;
      --panel: #ffffff;
      --text: #202124;
      --muted: #626b73;
      --line: #d7ddd6;
      --fresh: #1f8a4c;
      --stale: #b7791f;
      --dirty: #b45309;
      --apps: #3b82a0;
      --packages: #5b8f49;
      --tools: #b25f3c;
      --bar: #d9822b;
      --bar-track: #ece6dc;
      --root-frame: rgba(32, 33, 36, 0.35);
      --package-frame: rgba(32, 33, 36, 0.5);
      --rect-stroke: rgba(255, 255, 255, 0.88);
      --th-bg: #f1f4f0;
      --badge-bg: #eef1ec;
      --zero: #a0a7ad;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #141414;
        --panel: #1f1f1f;
        --text: #e5e5e5;
        --muted: #a0a0a0;
        --line: #404040;
        --fresh: #22c55e;
        --stale: #f59e0b;
        --dirty: #fb923c;
        --apps: #4c97b5;
        --packages: #6fa55c;
        --tools: #cb6f46;
        --bar: #f59e0b;
        --bar-track: #2e2e2e;
        --root-frame: rgba(229, 229, 229, 0.3);
        --package-frame: rgba(229, 229, 229, 0.45);
        --rect-stroke: rgba(15, 15, 15, 0.5);
        --th-bg: #262626;
        --badge-bg: #333333;
        --zero: #6b6b6b;
      }
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }

    main {
      max-width: 1280px;
      margin: 0 auto;
      padding: 32px 28px 44px;
    }

    header {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 22px;
    }

    h1 {
      margin: 0;
      font-size: 32px;
      line-height: 1.1;
      font-weight: 720;
    }

    h2 {
      margin: 0 0 14px;
      font-size: 18px;
      line-height: 1.2;
    }

    .meta {
      color: var(--muted);
      font-size: 13px;
      text-align: right;
      white-space: nowrap;
    }

    .banner {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 22px;
    }

    .claim,
    section {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
    }

    .claim {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 10px;
      align-items: start;
      padding: 14px 16px;
    }

    .status-dot {
      width: 10px;
      height: 10px;
      margin-top: 5px;
      border-radius: 999px;
      background: var(--fresh);
    }

    .status-dot.stale {
      background: var(--stale);
    }

    .status-dot.dirty {
      background: var(--dirty);
    }

    .claim-title {
      margin: 0 0 4px;
      font-size: 13px;
      color: var(--muted);
      text-transform: uppercase;
    }

    .claim-text {
      margin: 0;
      font-size: 15px;
      line-height: 1.35;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 22px;
    }

    .stat {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      padding: 12px 14px;
    }

    .stat-label {
      margin: 0 0 6px;
      color: var(--muted);
      font-size: 13px;
    }

    .stat-value {
      margin: 0;
      font-size: 24px;
      line-height: 1;
      font-weight: 720;
    }

    section {
      padding: 18px;
      margin-bottom: 22px;
      overflow: hidden;
    }

    @media (max-width: 820px) {
      main {
        padding: 22px 16px 32px;
      }

      header,
      .banner,
      .stats {
        grid-template-columns: 1fr;
        display: grid;
      }

      .meta {
        text-align: left;
        white-space: normal;
      }
    }`
