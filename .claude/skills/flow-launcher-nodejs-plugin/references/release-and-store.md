# Release And Plugin Store Reference

Official docs used:

- https://www.flowlauncher.com/docs/#/nodejs-setup-project
- https://www.flowlauncher.com/docs/#/nodejs-release-project
- https://github.com/Flow-Launcher/Flow.Launcher.PluginsManifest

## Release Workflow Requirements

Flow Launcher Node.js plugins should publish a zip that contains runtime dependencies, because users should not need to run `npm install` after installing a plugin.

The official setup guide describes a GitHub workflow that:

1. Runs manually through `workflow_dispatch` and on pushes to `main`.
2. Sets up Node.js.
3. Reads `Version` from `plugin.json`.
4. Runs `npm install` so `node_modules` exists.
5. Zips the plugin project.
6. Publishes a GitHub Release tagged from the plugin version.

Adapt this pattern to the existing project:

```yaml
name: Publish Release

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths-ignore:
      - .github/workflows/*

jobs:
  publish:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 16.18.0
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build --if-present

      - name: Test
        run: npm test --if-present

      - name: Read plugin version
        id: version
        shell: bash
        run: |
          node -e "const p=require('./plugin.json'); console.log('version=' + p.Version)" >> "$GITHUB_OUTPUT"

      - name: Create zip
        run: |
          zip -r Flow.Launcher.Plugin.Example.zip . \
            -x '*.git*' \
            -x 'src/*' \
            -x 'tests/*' \
            -x '.github/*'

      - name: Publish
        uses: softprops/action-gh-release@v2
        with:
          files: Flow.Launcher.Plugin.Example.zip
          tag_name: v${{ steps.version.outputs.version }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Notes:

- Keep the zip name aligned with the plugin/repo name.
- Match the Node.js version to the runtime you have verified in Flow. The official Node.js plugin docs reference Flow's portable Node.js 16.18.0 runtime; update this only after checking the current Flow runtime or bundling/transpiling accordingly.
- If the plugin needs TypeScript source for runtime, do not exclude `src/*`.
- If the plugin is JavaScript-only, exclude TypeScript source and tests to keep the artifact small.
- If the project does not have a lockfile, use `npm install` instead of `npm ci`, but prefer adding a lockfile.
- If the repo already uses another package manager, follow it and adapt the workflow.

## Runtime Artifact Checklist

The release zip should include:

- `plugin.json`
- configured `ExecuteFileName`
- built JS output if TypeScript compiles to `dist`
- `node_modules` or a bundled output containing runtime dependencies
- `Images/...` icon files
- `SettingsTemplate.yaml` if settings exist
- license/readme if the project includes them

The zip should not include:

- `.git`
- local caches
- unrelated screenshots/build artifacts
- test fixtures that are not needed at runtime
- secrets, `.env`, or local settings files

## Plugin Store Submission

To submit to Flow Launcher's Plugin Store, open a pull request against `Flow-Launcher/Flow.Launcher.PluginsManifest`.

Create a JSON file in `plugins/` named:

```text
<plugin-name>-<plugin-uuid>.json
```

Copy these from your plugin's `plugin.json`:

- `ID`
- `Name`
- `Description`
- `Author`
- `Version`
- `Language`
- `Website`

Add:

- `UrlDownload`: GitHub Release zip URL
- `UrlSourceCode`: repository URL
- `IcoPath`: globally accessible CDN URL, commonly jsDelivr for a GitHub-hosted icon
- `MinimumAppVersion`: optional when the plugin requires a newer Flow version

Example:

```json
{
  "ID": "2f4e384e-76ce-45c3-aea2-b16f5e5c328f",
  "Name": "Example Plugin",
  "Description": "Short description shown in the store",
  "Author": "Author",
  "Version": "1.0.0",
  "Language": "javascript",
  "Website": "https://github.com/owner/Flow.Launcher.Plugin.Example",
  "UrlDownload": "https://github.com/owner/Flow.Launcher.Plugin.Example/releases/download/v1.0.0/Flow.Launcher.Plugin.Example.zip",
  "UrlSourceCode": "https://github.com/owner/Flow.Launcher.Plugin.Example/tree/main",
  "IcoPath": "https://cdn.jsdelivr.net/gh/owner/Flow.Launcher.Plugin.Example@main/Images/app.png"
}
```

The official manifest repo states that new plugins become available after PR approval, and CDN synchronization may take several days. During that window, users can install manually:

```text
pm install <url or local path>
```

## Store Policy

Do not create or submit plugins that facilitate malicious code, piracy, deception, inappropriate content, illegal activity, impersonation, abuse, fraud, or spam. If a user request risks one of those categories, redirect to a benign plugin design.
