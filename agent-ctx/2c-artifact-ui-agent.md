# Task 2c-artifact-ui: Enhance ArtifactPreviewPanel.tsx

## Summary of Changes

All changes were made surgically to `/home/z/my-project/src/components/enhancements/ArtifactPreviewPanel.tsx` (now ~989 lines, up from 722).

### 1. Added Imports
- `detectArtifactType`, `getExportFormats`, `exportArtifact`, `ArtifactVersion` from `@/lib/artifact-system-v2`
- New Lucide icons: `History`, `ChevronDown`, `Clock`, `RotateCcw`, `FileDown`, `Globe`, `BarChart3`, `PenTool`, `Database`, `TerminalSquare`, `FileCode`, `Image`, `Layers`

### 2. New Helper Functions
- **`getTabTypeIcon(tab)`** — Maps artifact/tab types to appropriate Lucide icon components using `detectArtifactType`
- **`formatRelativeTime(isoDate)`** — Converts ISO date strings to human-readable relative time (e.g., "5m ago", "2h ago")

### 3. Version History Dropdown (Feature #1)
- New state: `showHistory`, `versions` (ArtifactVersion[]), `loadingVersions`
- `handleLoadVersions()` — Calls `/api/artifacts/versions?artifactId=` API route to load version history
- `handleRollbackVersion(version)` — Calls `/api/artifacts/versions` POST with `action: "rollback"`, then updates tab content via `updateTab()`
- Dropdown UI: Shows version number badge, commit message, relative time, token count, and a rollback icon (RotateCcw) on hover
- Click-outside handler to close dropdown
- Empty state with icon and helpful message when no versions exist
- Loading spinner while fetching

### 4. Export Button/Dropdown (Feature #2)
- New state: `showExport`
- `handleExport(format)` — Uses `exportArtifact()` (client-safe) to generate export, then creates Blob + `URL.createObjectURL` for download
- Uses `getExportFormats(detectedArtifact.type)` to list available formats dynamically
- Dropdown UI: Shows format icon (emoji), label, and file extension for each format
- Click-outside handler to close dropdown

### 5. Enhanced Tab Bar (Feature #3)
- Tab type icons: Each tab now shows a Lucide icon based on its detected artifact type
- Streaming indicator: Pulsing orange dot on tabs with `isStreaming: true`
- Close button: Hidden by default, appears on hover (`opacity-0 group-hover:opacity-60`); always visible on active tab
- Middle-click to close: Added `onAuxClick` handler with `e.button === 1` check
- "N tabs" indicator: Shows `{tabs.length} tabs` badge when there are more than 3 tabs
- Tab bar now shows even with 1 tab (changed from `tabs.length > 1` to `tabs.length > 0`)

### 6. Artifact Type Indicator (Feature #4)
- New section below tab bar showing:
  - Type icon (Lucide icon from `getTabTypeIcon`)
  - Artifact type name (capitalized, e.g., "Html", "Python")
  - Export format badge (e.g., ".html" in monospace)
  - MIME type (e.g., "text/html")
  - Streaming status with pulsing dot if `tab.isStreaming`
- Uses `detectArtifactType()` for runtime type detection

### 7. Destructured `updateTab` from store
- Added `updateTab` to the store destructuring for rollback content updates

### Lint Status
✅ Passes with no new warnings or errors (only pre-existing warning in FileBrowser.tsx)
