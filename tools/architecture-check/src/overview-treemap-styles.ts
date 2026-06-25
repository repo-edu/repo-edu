export const overviewTreemapStyles = `    .treemap-wrap {
      width: 100%;
      overflow-x: auto;
    }

    svg {
      display: block;
      max-width: 100%;
      height: auto;
      font-family: inherit;
    }

    .root-frame {
      fill: transparent;
      stroke: var(--root-frame);
      stroke-width: 1.2;
    }

    .root-label {
      fill: var(--text);
      font-size: 14px;
      font-weight: 720;
    }

    .package-frame {
      fill: transparent;
      stroke: var(--package-frame);
      stroke-width: 1.2;
    }

    .package-label {
      fill: var(--text);
      font-size: 12px;
      font-weight: 700;
    }

    .map-legend {
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
      font-size: 12px;
      color: var(--muted);
    }

    .map-legend span {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .legend-box {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      flex: none;
    }

    .legend-folder {
      border: 1.4px solid var(--root-frame);
    }

    .legend-package {
      border: 1.4px solid var(--package-frame);
    }

    .legend-label {
      margin-left: 2px;
    }

    .legend-apps {
      background: var(--apps);
      border: 1px solid var(--rect-stroke);
    }

    .legend-packages {
      background: var(--packages);
      border: 1px solid var(--rect-stroke);
    }

    .legend-tools {
      background: var(--tools);
      border: 1px solid var(--rect-stroke);
    }

    .partition-rect {
      stroke: var(--rect-stroke);
      stroke-width: 1;
    }

    .partition-rect.apps {
      fill: var(--apps);
    }

    .partition-rect.packages {
      fill: var(--packages);
    }

    .partition-rect.tools {
      fill: var(--tools);
    }

    .partition-label {
      fill: #ffffff;
      font-size: 12px;
      font-weight: 700;
      pointer-events: none;
    }

    .partition-meta {
      fill: rgba(255, 255, 255, 0.9);
      font-size: 11px;
      pointer-events: none;
    }`
