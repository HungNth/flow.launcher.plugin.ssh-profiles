# SSH Profiles Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Flow Launcher plugin that reads `~/.ssh/config`, lists SSH profiles, and launches SSH sessions in Windows Terminal.

**Architecture:** TypeScript compiled to CommonJS. Three modules — SSH config parser, Windows Terminal launcher, JSON-RPC dispatcher. Zero runtime deps (only Node.js built-ins). Dev deps: `typescript`, `vitest`.

**Tech Stack:** TypeScript, Node.js, Flow Launcher JSON-RPC, Windows Terminal CLI (`wt`)

---

## File Structure

```
plugin.json                  # Flow manifest (ActionKeyword: "ssh")
package.json / tsconfig.json # Build config
src/main.ts                  # JSON-RPC dispatcher + handlers
src/ssh-config.ts            # Parse & filter ~/.ssh/config
src/terminal.ts              # Detect WT profile, launch SSH
tests/ssh-config.test.ts     # Parser unit tests
tests/terminal.test.ts       # WT detection unit tests
Images/app.png               # Plugin icon
.github/workflows/release.yml
```

---

### Task 1: Project Scaffolding

**Files:** Create `package.json`, `tsconfig.json`, `plugin.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "flow-launcher-plugin-ssh-profiles",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^3.2.1"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `plugin.json`**

Generate UUID via `[guid]::NewGuid()`.

```json
{
  "$schema": "https://www.flowlauncher.com/schemas/plugin.schema.json",
  "ID": "<GENERATE-UUID>",
  "ActionKeyword": "ssh",
  "Name": "SSH Profiles",
  "Description": "Quickly connect to SSH servers from ~/.ssh/config via Windows Terminal",
  "Author": "Hung",
  "Version": "1.0.0",
  "Language": "javascript",
  "Website": "https://github.com/user/flow.launcher.plugin.ssh-profiles",
  "IcoPath": "Images\\app.png",
  "ExecuteFileName": "dist\\main.js"
}
```

- [ ] **Step 4: Run `npm install`**
- [ ] **Step 5: Verify `npm run build` with placeholder `src/main.ts`**
- [ ] **Step 6: Commit**

```
git commit -m "chore: scaffold project with TS config and plugin manifest"
```

---

### Task 2: SSH Config Parser

**Files:** Create `src/ssh-config.ts`, `tests/ssh-config.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/ssh-config.test.ts` — Tests for `parseSshConfig` and `filterProfiles`:

```typescript
import { describe, it, expect } from "vitest";
import { parseSshConfig, filterProfiles } from "../src/ssh-config";

const SAMPLE = `
Host hungnth
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_hungnth

Host hs_nth
  HostName 10.10.0.2
  User nth
  IdentityFile ~/.ssh/id_vps_ed25519

Host hs_root
  HostName 10.10.0.2
  User root
  IdentityFile ~/.ssh/id_vps_ed25519

Host wptop.net
  HostName wptop.net
  Port 10795
  User wptopnet

Host gitlab-work
  HostName gitlab.com
  User git

Host *
  ServerAliveInterval 60
`;

describe("parseSshConfig", () => {
  it("parses all Host blocks", () => {
    const p = parseSshConfig(SAMPLE);
    expect(p).toHaveLength(5);
    expect(p[0].host).toBe("hungnth");
    expect(p[0].hostName).toBe("github.com");
  });
  it("parses port", () => {
    const p = parseSshConfig(SAMPLE);
    expect(p.find(x => x.host === "wptop.net")?.port).toBe("10795");
  });
  it("skips Host *", () => {
    expect(parseSshConfig(SAMPLE).find(x => x.host === "*")).toBeUndefined();
  });
  it("handles empty input", () => {
    expect(parseSshConfig("")).toEqual([]);
  });
});

describe("filterProfiles", () => {
  const all = parseSshConfig(SAMPLE);
  it("excludes github.com and gitlab.com", () => {
    const f = filterProfiles(all, "");
    expect(f.map(x => x.hostName)).not.toContain("github.com");
    expect(f.map(x => x.hostName)).not.toContain("gitlab.com");
    expect(f).toHaveLength(3);
  });
  it("filters by host alias", () => {
    expect(filterProfiles(all, "hs")).toHaveLength(2);
  });
  it("filters by user", () => {
    expect(filterProfiles(all, "root")).toHaveLength(1);
  });
  it("case-insensitive", () => {
    expect(filterProfiles(all, "HS_NTH")).toHaveLength(1);
  });
  it("no match returns empty", () => {
    expect(filterProfiles(all, "xyz")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```powershell
npx vitest run
```

- [ ] **Step 3: Implement `src/ssh-config.ts`**

```typescript
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface SshProfile {
  host: string;
  hostName: string;
  user: string | undefined;
  port: string | undefined;
  identityFile: string | undefined;
}

const EXCLUDED_HOSTNAMES = ["github.com", "gitlab.com"];

export function parseSshConfig(content: string): SshProfile[] {
  const lines = content.split(/\r?\n/);
  const profiles: SshProfile[] = [];
  let current: Partial<SshProfile> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const hostMatch = trimmed.match(/^Host\s+(.+)/i);
    if (hostMatch) {
      if (current?.host && current?.hostName) {
        profiles.push(current as SshProfile);
      }
      const hostValue = hostMatch[1].trim();
      if (hostValue === "*") { current = null; continue; }
      current = { host: hostValue, hostName: undefined as any, user: undefined, port: undefined, identityFile: undefined };
      continue;
    }

    if (current) {
      const kvMatch = trimmed.match(/^(\S+)\s+(.+)/);
      if (kvMatch) {
        const key = kvMatch[1].toLowerCase();
        const value = kvMatch[2].trim();
        if (key === "hostname") current.hostName = value;
        else if (key === "user") current.user = value;
        else if (key === "port") current.port = value;
        else if (key === "identityfile") current.identityFile = value;
      }
    }
  }

  if (current?.host && current?.hostName) {
    profiles.push(current as SshProfile);
  }
  return profiles;
}

export function filterProfiles(profiles: SshProfile[], query: string): SshProfile[] {
  let filtered = profiles.filter(
    (p) => !EXCLUDED_HOSTNAMES.includes(p.hostName.toLowerCase())
  );
  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.host.toLowerCase().includes(q) ||
        p.hostName.toLowerCase().includes(q) ||
        (p.user && p.user.toLowerCase().includes(q))
    );
  }
  return filtered;
}

export function readSshConfig(): SshProfile[] {
  const configPath = path.join(os.homedir(), ".ssh", "config");
  try {
    return parseSshConfig(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Commit**

```
git commit -m "feat: add SSH config parser with filtering"
```

---

### Task 3: Windows Terminal Launcher

**Files:** Create `src/terminal.ts`, `tests/terminal.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/terminal.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { detectWtProfileName, buildWtCommand } from "../src/terminal";

describe("detectWtProfileName", () => {
  it("prefers PowerShell 7", () => {
    const profiles = [
      { name: "PowerShell", guid: "{574e775e-4f2a-5b96-ac1e-a2962a402336}" },
      { name: "Command Prompt", guid: "{0caa0dad-35be-5f56-a8ff-afceeeaa6101}" },
    ];
    expect(detectWtProfileName(profiles)).toBe("PowerShell");
  });
  it("falls back to Command Prompt", () => {
    const profiles = [
      { name: "Command Prompt", guid: "{0caa0dad-35be-5f56-a8ff-afceeeaa6101}" },
    ];
    expect(detectWtProfileName(profiles)).toBe("Command Prompt");
  });
  it("falls back to first available", () => {
    expect(detectWtProfileName([{ name: "Git Bash", guid: "{x}" }])).toBe("Git Bash");
  });
  it("empty list returns fallback", () => {
    expect(detectWtProfileName([])).toBe("Windows PowerShell");
  });
});

describe("buildWtCommand", () => {
  it("builds correct command", () => {
    expect(buildWtCommand("PowerShell", "my_server")).toBe('wt -p "PowerShell" -- ssh my_server');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**
- [ ] **Step 3: Implement `src/terminal.ts`**

```typescript
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";

interface WtProfile { name: string; guid: string; }

const PWSH7_GUID = "{574e775e-4f2a-5b96-ac1e-a2962a402336}";
const CMD_GUID = "{0caa0dad-35be-5f56-a8ff-afceeeaa6101}";

export function detectWtProfileName(profiles: WtProfile[]): string {
  const pwsh7 = profiles.find(p => p.name === "PowerShell" || p.guid === PWSH7_GUID);
  if (pwsh7) return pwsh7.name;
  const cmd = profiles.find(p => p.name === "Command Prompt" || p.guid === CMD_GUID);
  if (cmd) return cmd.name;
  return profiles[0]?.name || "Windows PowerShell";
}

export function buildWtCommand(profileName: string, hostAlias: string): string {
  return `wt -p "${profileName}" -- ssh ${hostAlias}`;
}

function readWtProfiles(): WtProfile[] {
  const settingsPath = path.join(
    process.env.LOCALAPPDATA || "",
    "Packages", "Microsoft.WindowsTerminal_8wekyb3d8bbwe",
    "LocalState", "settings.json"
  );
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    const list = settings?.profiles?.list;
    if (!Array.isArray(list)) return [];
    return list.map((p: any) => ({ name: p.name || "", guid: p.guid || "" }));
  } catch { return []; }
}

export function launchSsh(hostAlias: string): void {
  const profiles = readWtProfiles();
  const profileName = detectWtProfileName(profiles);
  exec(buildWtCommand(profileName, hostAlias), (err) => {
    if (err) console.error(`Failed to launch: ${err.message}`);
  });
}

export function openConfigInVSCode(configPath: string): void {
  exec(`code "${configPath}"`, (err) => {
    if (err) console.error(`Failed to open VS Code: ${err.message}`);
  });
}
```

- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Commit**

```
git commit -m "feat: add Windows Terminal launcher with profile detection"
```

---

### Task 4: JSON-RPC Dispatcher (Main Entry)

**Files:** Create `src/main.ts`

- [ ] **Step 1: Implement `src/main.ts`**

```typescript
import * as path from "path";
import * as os from "os";
import { readSshConfig, filterProfiles, SshProfile } from "./ssh-config";
import { launchSsh, openConfigInVSCode } from "./terminal";

interface FlowResult {
  Title: string; Subtitle: string; IcoPath: string;
  score: number; JsonRPCAction: { method: string; parameters: string[] };
}

const ICON = "Images\\app.png";
const SSH_CONFIG_PATH = path.join(os.homedir(), ".ssh", "config");

function profileToResult(p: SshProfile, score: number): FlowResult {
  const sub = p.user
    ? `${p.user}@${p.hostName}${p.port ? `:${p.port}` : ""}`
    : `${p.hostName}${p.port ? `:${p.port}` : ""}`;
  return {
    Title: p.host, Subtitle: sub, IcoPath: ICON, score,
    JsonRPCAction: { method: "open_ssh", parameters: [p.host] },
  };
}

const handlers: Record<string, (params: string[], settings: any) => FlowResult[] | void> = {
  query([rawQuery = ""]) {
    const query = rawQuery.trim().toLowerCase();

    // "ssh edit"
    if (query === "edit" || query.startsWith("edit ")) {
      return [{
        Title: "Edit SSH Config",
        Subtitle: `Open ${SSH_CONFIG_PATH} in VS Code`,
        IcoPath: ICON, score: 100,
        JsonRPCAction: { method: "edit_config", parameters: [] },
      }];
    }

    // "ssh profiles [search]" or "ssh [search]"
    let searchTerm = "";
    if (query.startsWith("profiles ")) searchTerm = query.slice(9).trim();
    else if (query !== "profiles" && query !== "") searchTerm = query;

    const filtered = filterProfiles(readSshConfig(), searchTerm);

    if (filtered.length === 0) {
      return [{
        Title: "No SSH profiles found",
        Subtitle: searchTerm ? `No match for "${searchTerm}"` : "Check ~/.ssh/config",
        IcoPath: ICON, score: 0,
        JsonRPCAction: { method: "edit_config", parameters: [] },
      }];
    }
    return filtered.map((p, i) => profileToResult(p, 100 - i));
  },

  open_ssh([hostAlias]) { launchSsh(hostAlias); },
  edit_config() { openConfigInVSCode(SSH_CONFIG_PATH); },
};

let currentMethod = "query";

async function main(): Promise<void> {
  const req = JSON.parse(process.argv[2] || "{}");
  currentMethod = req.method;
  const params: string[] = Array.isArray(req.parameters) ? req.parameters : [];
  const handler = handlers[req.method];

  if (!handler) {
    if (req.method === "query") process.stdout.write(JSON.stringify({ result: [] }));
    return;
  }

  const result = handler(params, req.settings || {});
  if (req.method === "query") {
    process.stdout.write(JSON.stringify({ result: Array.isArray(result) ? result : [] }));
  } else if (result) {
    process.stdout.write(JSON.stringify(result));
  }
}

main().catch((error) => {
  console.error(error);
  if (currentMethod === "query") {
    process.stdout.write(JSON.stringify({
      result: [{ Title: "SSH Profiles — Error",
        Subtitle: error instanceof Error ? error.message : String(error),
        IcoPath: ICON, score: 0 }],
    }));
  }
});
```

- [ ] **Step 2: Build — `npm run build`** — expect `dist/main.js` created
- [ ] **Step 3: Commit**

```
git commit -m "feat: add JSON-RPC dispatcher with query, open_ssh, edit_config"
```

---

### Task 5: Plugin Icon

- [ ] **Step 1: Generate SSH-themed icon** — use `generate_image` tool, save to `Images/app.png`
- [ ] **Step 2: Commit**

```
git commit -m "chore: add plugin icon"
```

---

### Task 6: Build & Smoke Test

- [ ] **Step 1:** `npm test` — all unit tests pass
- [ ] **Step 2:** `npm run build` — compiles successfully
- [ ] **Step 3:** Smoke-test query:

```powershell
node dist\main.js '{\"method\":\"query\",\"parameters\":[\"\"],\"settings\":{}}'
```

Expected: JSON with `result` array of SSH profiles (no github.com/gitlab.com).

- [ ] **Step 4:** Smoke-test search:

```powershell
node dist\main.js '{\"method\":\"query\",\"parameters\":[\"profiles wptop\"],\"settings\":{}}'
```

- [ ] **Step 5:** Smoke-test edit:

```powershell
node dist\main.js '{\"method\":\"query\",\"parameters\":[\"edit\"],\"settings\":{}}'
```

- [ ] **Step 6:** Install in Flow Launcher, test `ssh profiles` and `ssh edit` live.
- [ ] **Step 7:** Commit any fixes.

---

### Task 7: GitHub Actions Release

**Files:** Create `.github/workflows/release.yml`

- [ ] **Step 1: Create workflow**

```yaml
name: Publish Release
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths-ignore: [.github/workflows/*]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: npm }
      - run: npm ci
      - run: npm run build
      - run: npm test
      - name: Read version
        id: version
        run: node -e "const p=require('./plugin.json'); console.log('version=' + p.Version)" >> "$GITHUB_OUTPUT"
      - name: Zip
        run: zip -r Flow.Launcher.Plugin.SshProfiles.zip plugin.json dist/ Images/ -x '*.git*'
      - uses: softprops/action-gh-release@v2
        with:
          files: Flow.Launcher.Plugin.SshProfiles.zip
          tag_name: v${{ steps.version.outputs.version }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Commit**

```
git commit -m "ci: add GitHub Actions release workflow"
```

---

## Verification Plan

### Automated Tests
- `npm test` — SSH parser (9 tests) + WT detection (5 tests)
- `npm run build` — zero TS errors

### Manual Smoke Tests
```powershell
node dist\main.js '{\"method\":\"query\",\"parameters\":[\"\"],\"settings\":{}}'
node dist\main.js '{\"method\":\"query\",\"parameters\":[\"profiles wptop\"],\"settings\":{}}'
node dist\main.js '{\"method\":\"query\",\"parameters\":[\"edit\"],\"settings\":{}}'
```

### Flow Launcher Integration
- `ssh profiles` → profiles listed (no github/gitlab)
- `ssh profiles hs` → filtered results
- Select profile → Windows Terminal opens SSH (pwsh7)
- `ssh edit` → VS Code opens `~/.ssh/config`
