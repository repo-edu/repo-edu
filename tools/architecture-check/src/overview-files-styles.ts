export const overviewFilesStyles = `    .files {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .files-folder {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--panel);
    }

    .files-folder > summary {
      cursor: pointer;
      padding: 9px 12px;
      font-size: 14px;
      font-weight: 700;
    }

    .files-children {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 4px 8px 8px 18px;
    }

    .files-package > summary,
    .files-partition > summary {
      cursor: pointer;
      padding: 5px 8px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
    }

    .files-partition > summary {
      font-size: 12px;
      font-weight: 500;
      color: var(--muted);
    }

    .files-package > summary:hover,
    .files-partition > summary:hover {
      background: var(--th-bg);
    }

    .files-tree {
      margin: 2px 0 8px 20px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      line-height: 1.5;
      color: var(--muted);
      white-space: pre;
      overflow-x: auto;
    }`
