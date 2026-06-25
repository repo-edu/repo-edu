export const overviewCoverStyles = `    .swatch {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      flex: none;
      display: inline-block;
    }

    .cover {
      display: flex;
      flex-direction: column;
      gap: 26px;
    }

    .cover-legend {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: var(--muted);
    }

    .cover-legend span {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .cover-block h3 {
      margin: 0 0 12px;
      font-size: 14px;
      font-weight: 700;
    }

    .conc-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .conc-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 6px;
    }

    .conc-name {
      font-size: 15px;
      font-weight: 650;
    }

    .conc-stat {
      font-size: 13px;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }

    .conc-bar {
      display: flex;
      height: 28px;
      border-radius: 6px;
      overflow: hidden;
      background: var(--line);
    }

    .conc-seg {
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      color: #ffffff;
      font-size: 11px;
      white-space: nowrap;
      border-right: 2px solid var(--panel);
    }

    .conc-seg:last-child {
      border-right: none;
    }

    .matrix-wrap {
      overflow-x: auto;
    }

    .cover-matrix {
      border-collapse: collapse;
      width: 100%;
      font-size: 13px;
    }

    .cover-matrix th,
    .cover-matrix td {
      border-bottom: 1px solid var(--line);
      padding: 8px 12px;
      vertical-align: middle;
    }

    .cover-matrix thead th {
      text-align: left;
      background: var(--th-bg);
      color: var(--muted);
    }

    .cover-matrix .cm-part {
      width: 42%;
    }

    .cover-matrix .cm-cover {
      display: block;
      font-size: 13px;
      font-weight: 650;
      color: var(--text);
    }

    .cover-matrix .cm-sub {
      display: block;
      font-size: 11px;
      font-weight: 500;
      color: var(--muted);
    }

    .cm-part-inner {
      display: flex;
      align-items: center;
      gap: 9px;
    }

    .cm-name {
      flex: 1 1 auto;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cm-badge {
      flex: none;
      font-size: 11px;
      color: var(--muted);
      background: var(--badge-bg);
      border-radius: 999px;
      padding: 1px 8px;
      font-variant-numeric: tabular-nums;
    }

    .cm-badge.hot {
      color: #ffffff;
      background: var(--bar);
    }

    .cm-lines {
      flex: none;
      min-width: 42px;
      text-align: right;
      font-size: 11px;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }

    .cm-cell-inner {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cm-track {
      flex: 1;
      min-width: 36px;
      height: 12px;
      border-radius: 6px;
      background: var(--bar-track);
      overflow: hidden;
    }

    .cm-fill {
      display: block;
      height: 100%;
      border-radius: 6px;
      background: var(--bar);
    }

    .cm-num {
      flex: none;
      width: 22px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .cm-num.zero {
      color: var(--zero);
    }

    .cover-note {
      margin: 12px 0 0;
      font-size: 12px;
      color: var(--muted);
    }`
