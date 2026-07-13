# SSH Profile Action Choices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the SSH Profiles Flow Launcher plugin so selecting a profile copies `ssh <alias>` by default, keeps Flow open, and shows explicit follow-up choices to copy again or open Windows Terminal.

**Architecture:** Keep the existing TypeScript/CommonJS JSON-RPC plugin shape, but split clipboard behavior into a focused Node module and refactor `src/main.ts` into exported pure handlers that are easy to test. Profile selection becomes a two-step Flow action: `select_profile` copies the SSH command, then returns `Flow.Launcher.ChangeQuery` to show `ssh action <alias>` results.

**Tech Stack:** TypeScript strict mode, Node.js built-ins (`child_process`, `os`, `path`), Flow Launcher JSON-RPC, Windows PowerShell `Set-Clipboard`, Windows Terminal CLI (`wt`), Vitest.

## Global Constraints

- Preserve existing plugin manifest identity: `plugin.json` `ID` stays `920423cc-798a-4595-9e0e-11431569cee6`.
- Preserve action keyword: `plugin.json` `ActionKeyword` stays `ssh`.
- Preserve runtime entry: `plugin.json` `ExecuteFileName` stays `dist\\main.js`.
- Add no runtime npm dependencies; use only Node.js built-ins for clipboard and terminal behavior.
- Keep stdout reserved for JSON-RPC responses only; diagnostics stay on stderr.
- Default profile selection copies exactly `ssh <hostAlias>`, not the `wt` command.
- Opening in terminal keeps the existing behavior: `wt -p "<terminal profile>" -- ssh <hostAlias>`.
- The initial profile result must use `JsonRPCAction.dontHideAfterAction: true` so Flow can keep showing the follow-up choices.
- Use `Flow.Launcher.ChangeQuery` with parameters `["ssh action <hostAlias>", true]` after copying the default command.
- Keep `ssh edit` opening `~/.ssh/config` in VS Code.
- Run `npm test` and `npm run build` before marking implementation complete.

---

## File Structure

```text
src/clipboard.ts          # New focused clipboard module using PowerShell Set-Clipboard through stdin
src/terminal.ts           # Add buildSshCommand(hostAlias), keep WT launch helpers
src/main.ts               # Refactor JSON-RPC dispatcher, profile selection, and action-choice results
tests/clipboard.test.ts   # Unit tests for clipboard process invocation and failure handling
tests/terminal.test.ts    # Existing tests plus buildSshCommand coverage
tests/main.test.ts        # Unit tests for JSON-RPC result shape and action side effects
README.md                 # Update user-facing behavior and smoke-test docs
docs/plan/2026-07-13-ssh-profile-action-choices.md # This implementation plan
```

---

### Task 1: Add SSH Command Builder and Clipboard Module

**Files:**
- Create: `src/clipboard.ts`
- Create: `tests/clipboard.test.ts`
- Modify: `src/terminal.ts`
- Modify: `tests/terminal.test.ts`

**Interfaces:**
- Consumes: existing `src/terminal.ts` Windows Terminal profile detection and launch behavior.
- Produces: `buildSshCommand(hostAlias: string): string` and `copyTextToClipboard(text: string): Promise<void>` for `src/main.ts`.

- [ ] **Step 1: Write the failing clipboard tests**

Create `tests/clipboard.test.ts` with this exact content:

```typescript
import { EventEmitter } from "events";
import { Writable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("child_process", () => ({
  spawn: spawnMock,
}));

import { POWERSHELL_CLIPBOARD_ARGS, copyTextToClipboard } from "../src/clipboard";

function createMockChildProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable;
    stderr: EventEmitter;
  };
  const stdinChunks: string[] = [];

  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      stdinChunks.push(chunk.toString());
      callback();
    },
  });
  child.stderr = new EventEmitter();

  return { child, stdinChunks };
}

describe("POWERSHELL_CLIPBOARD_ARGS", () => {
  it("uses a non-interactive PowerShell command that reads clipboard text from stdin", () => {
    expect(POWERSHELL_CLIPBOARD_ARGS).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Set-Clipboard -Value ([Console]::In.ReadToEnd())",
    ]);
  });
});

describe("copyTextToClipboard", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("writes the SSH command to powershell.exe stdin", async () => {
    const { child, stdinChunks } = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = copyTextToClipboard("ssh prod");
    child.emit("close", 0);

    await expect(promise).resolves.toBeUndefined();
    expect(spawnMock).toHaveBeenCalledWith("powershell.exe", POWERSHELL_CLIPBOARD_ARGS, {
      windowsHide: true,
    });
    expect(stdinChunks.join("")).toBe("ssh prod");
  });

  it("rejects with stderr when Set-Clipboard exits with a non-zero code", async () => {
    const { child } = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = copyTextToClipboard("ssh broken");
    child.stderr.emit("data", Buffer.from("clipboard denied"));
    child.emit("close", 1);

    await expect(promise).rejects.toThrow(
      "Set-Clipboard failed with exit code 1: clipboard denied"
    );
  });

  it("rejects when powershell.exe cannot be started", async () => {
    const { child } = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = copyTextToClipboard("ssh missing-powershell");
    child.emit("error", new Error("spawn powershell.exe ENOENT"));

    await expect(promise).rejects.toThrow("spawn powershell.exe ENOENT");
  });
});
```

- [ ] **Step 2: Add the failing terminal command-builder test**

Append this block to `tests/terminal.test.ts`:

```typescript
describe("buildSshCommand", () => {
  it("builds the command copied to the clipboard", () => {
    expect(buildSshCommand("prod")).toBe("ssh prod");
  });
});
```

Update the import at the top of `tests/terminal.test.ts` to include `buildSshCommand`:

```typescript
import { describe, it, expect } from "vitest";
import { detectWtProfileName, buildWtCommand, buildSshCommand } from "../src/terminal";
```

- [ ] **Step 3: Run tests to verify they fail for the right reason**

Run:

```bash
npm test -- tests/clipboard.test.ts tests/terminal.test.ts
```

Expected result:

```text
FAIL tests/clipboard.test.ts
Error: Cannot find module '../src/clipboard'

FAIL tests/terminal.test.ts
Error: buildSshCommand is not exported by ../src/terminal
```

- [ ] **Step 4: Implement `src/clipboard.ts`**

Create `src/clipboard.ts` with this exact content:

```typescript
import { spawn } from "child_process";

export const POWERSHELL_CLIPBOARD_ARGS = [
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  "Set-Clipboard -Value ([Console]::In.ReadToEnd())",
];

/**
 * Copy text to the Windows clipboard without shell-escaping the text.
 * The text is passed through stdin so commands such as `ssh prod` are copied exactly.
 */
export function copyTextToClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", POWERSHELL_CLIPBOARD_ARGS, {
      windowsHide: true,
    });

    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const suffix = stderr.trim() ? `: ${stderr.trim()}` : "";
      reject(new Error(`Set-Clipboard failed with exit code ${code}${suffix}`));
    });

    child.stdin.end(text);
  });
}
```

- [ ] **Step 5: Implement `buildSshCommand` in `src/terminal.ts`**

Insert this function directly after `buildWtCommand` in `src/terminal.ts`:

```typescript
/**
 * Build the plain SSH command copied to the clipboard.
 */
export function buildSshCommand(hostAlias: string): string {
  return `ssh ${hostAlias}`;
}
```

Do not change `launchSsh`; it should still use `buildWtCommand(profileName, hostAlias)`.

- [ ] **Step 6: Run tests to verify Task 1 passes**

Run:

```bash
npm test -- tests/clipboard.test.ts tests/terminal.test.ts
```

Expected result:

```text
PASS tests/clipboard.test.ts
PASS tests/terminal.test.ts
```

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add src/clipboard.ts src/terminal.ts tests/clipboard.test.ts tests/terminal.test.ts
git commit -m "feat: add ssh command clipboard support" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Refactor JSON-RPC Flow to Copy by Default and Show Action Choices

**Files:**
- Create: `tests/main.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `buildSshCommand(hostAlias: string): string` and `copyTextToClipboard(text: string): Promise<void>` from Task 1.
- Produces: `handleRequest(req, deps)`, `handleQuery(rawQuery, deps)`, `createProfileResult(profile, score)`, and `createProfileActionResults(hostAlias)` for unit tests and CLI behavior.

- [ ] **Step 1: Write the failing JSON-RPC behavior tests**

Create `tests/main.test.ts` with this exact content:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SshProfile } from "../src/ssh-config";
import {
  CHANGE_QUERY_METHOD,
  SHOW_MSG_METHOD,
  type HandlerDependencies,
  handleRequest,
} from "../src/main";

const PROD_PROFILE: SshProfile = {
  host: "prod",
  hostName: "203.0.113.10",
  user: "deploy",
  port: "22",
  identityFile: "~/.ssh/id_ed25519",
};

function createDeps(profiles: SshProfile[] = [PROD_PROFILE]): HandlerDependencies {
  return {
    readProfiles: vi.fn(() => profiles),
    copyTextToClipboard: vi.fn(async () => undefined),
    launchSsh: vi.fn(),
    openConfigInVSCode: vi.fn(),
  };
}

describe("handleRequest query", () => {
  let deps: HandlerDependencies;

  beforeEach(() => {
    deps = createDeps();
  });

  it("returns profile results that copy by default and keep Flow open", async () => {
    const response = await handleRequest(
      { method: "query", parameters: ["prod"], settings: {} },
      deps
    );

    expect(response).toEqual({
      result: [
        {
          Title: "prod",
          Subtitle: 'deploy@203.0.113.10:22 — Enter: copy "ssh prod" and show actions',
          IcoPath: "Images\\app.png",
          score: 100,
          JsonRPCAction: {
            method: "select_profile",
            parameters: ["prod"],
            dontHideAfterAction: true,
          },
        },
      ],
    });
  });

  it("returns copy and terminal choices for the action query", async () => {
    const response = await handleRequest(
      { method: "query", parameters: ["action prod"], settings: {} },
      deps
    );

    expect(response).toEqual({
      result: [
        {
          Title: "Copy to clipboard",
          Subtitle: "Copy: ssh prod",
          IcoPath: "Images\\app.png",
          score: 100,
          JsonRPCAction: {
            method: "copy_ssh_command",
            parameters: ["prod"],
          },
        },
        {
          Title: "Open in terminal",
          Subtitle: "Open Windows Terminal and run: ssh prod",
          IcoPath: "Images\\app.png",
          score: 90,
          JsonRPCAction: {
            method: "open_ssh",
            parameters: ["prod"],
          },
        },
      ],
    });
  });

  it("keeps ssh edit behavior", async () => {
    const response = await handleRequest(
      { method: "query", parameters: ["edit"], settings: {} },
      deps
    );

    expect(response).toMatchObject({
      result: [
        {
          Title: "Edit SSH Config",
          JsonRPCAction: {
            method: "edit_config",
            parameters: [],
          },
        },
      ],
    });
  });
});

describe("handleRequest actions", () => {
  let deps: HandlerDependencies;

  beforeEach(() => {
    deps = createDeps();
  });

  it("select_profile copies the SSH command and changes the query to the action menu", async () => {
    const response = await handleRequest(
      { method: "select_profile", parameters: ["prod"], settings: {} },
      deps
    );

    expect(deps.copyTextToClipboard).toHaveBeenCalledWith("ssh prod");
    expect(deps.launchSsh).not.toHaveBeenCalled();
    expect(response).toEqual({
      method: CHANGE_QUERY_METHOD,
      parameters: ["ssh action prod", true],
    });
  });

  it("copy_ssh_command copies the SSH command and shows a confirmation message", async () => {
    const response = await handleRequest(
      { method: "copy_ssh_command", parameters: ["prod"], settings: {} },
      deps
    );

    expect(deps.copyTextToClipboard).toHaveBeenCalledWith("ssh prod");
    expect(response).toEqual({
      method: SHOW_MSG_METHOD,
      parameters: ["SSH Profiles", "Copied: ssh prod"],
    });
  });

  it("open_ssh launches Windows Terminal without copying again", async () => {
    const response = await handleRequest(
      { method: "open_ssh", parameters: ["prod"], settings: {} },
      deps
    );

    expect(deps.launchSsh).toHaveBeenCalledWith("prod");
    expect(deps.copyTextToClipboard).not.toHaveBeenCalled();
    expect(response).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail for the right reason**

Run:

```bash
npm test -- tests/main.test.ts
```

Expected result:

```text
FAIL tests/main.test.ts
Error: CHANGE_QUERY_METHOD is not exported by ../src/main
Error: HandlerDependencies is not exported by ../src/main
Error: handleRequest is not exported by ../src/main
```

- [ ] **Step 3: Replace `src/main.ts` with the refactored implementation**

Replace all content in `src/main.ts` with this exact content:

```typescript
import * as os from "os";
import * as path from "path";
import { copyTextToClipboard } from "./clipboard";
import { filterProfiles, readSshConfig, SshProfile } from "./ssh-config";
import { buildSshCommand, launchSsh, openConfigInVSCode } from "./terminal";

export interface FlowAction {
  method: string;
  parameters: string[];
  dontHideAfterAction?: boolean;
}

export interface FlowResult {
  Title: string;
  Subtitle: string;
  IcoPath: string;
  score: number;
  JsonRPCAction?: FlowAction;
}

export interface FlowApiAction {
  method: string;
  parameters: unknown[];
}

export interface JsonRpcRequest {
  method?: string;
  parameters?: unknown;
  settings?: Record<string, unknown>;
}

export interface HandlerDependencies {
  readProfiles: () => SshProfile[];
  copyTextToClipboard: (text: string) => Promise<void>;
  launchSsh: (hostAlias: string) => void;
  openConfigInVSCode: (configPath: string) => void;
}

export const ICON = "Images\\app.png";
export const CHANGE_QUERY_METHOD = "Flow.Launcher.ChangeQuery";
export const SHOW_MSG_METHOD = "Flow.Launcher.ShowMsg";

const SSH_CONFIG_PATH = path.join(os.homedir(), ".ssh", "config");

const defaultDeps: HandlerDependencies = {
  readProfiles: readSshConfig,
  copyTextToClipboard,
  launchSsh,
  openConfigInVSCode,
};

function profileSubtitle(p: SshProfile): string {
  return p.user
    ? `${p.user}@${p.hostName}${p.port ? `:${p.port}` : ""}`
    : `${p.hostName}${p.port ? `:${p.port}` : ""}`;
}

/**
 * Build a Flow result for a single SSH profile.
 * Enter now copies the plain SSH command first and keeps Flow open.
 */
export function createProfileResult(p: SshProfile, score: number): FlowResult {
  const sshCommand = buildSshCommand(p.host);

  return {
    Title: p.host,
    Subtitle: `${profileSubtitle(p)} — Enter: copy "${sshCommand}" and show actions`,
    IcoPath: ICON,
    score,
    JsonRPCAction: {
      method: "select_profile",
      parameters: [p.host],
      dontHideAfterAction: true,
    },
  };
}

/**
 * Build the two explicit actions shown after a profile is selected.
 */
export function createProfileActionResults(hostAlias: string): FlowResult[] {
  const sshCommand = buildSshCommand(hostAlias);

  return [
    {
      Title: "Copy to clipboard",
      Subtitle: `Copy: ${sshCommand}`,
      IcoPath: ICON,
      score: 100,
      JsonRPCAction: {
        method: "copy_ssh_command",
        parameters: [hostAlias],
      },
    },
    {
      Title: "Open in terminal",
      Subtitle: `Open Windows Terminal and run: ${sshCommand}`,
      IcoPath: ICON,
      score: 90,
      JsonRPCAction: {
        method: "open_ssh",
        parameters: [hostAlias],
      },
    },
  ];
}

function createNoProfileSelectedResult(): FlowResult[] {
  return [
    {
      Title: "No SSH profile selected",
      Subtitle: "Search for a profile with `ssh <keyword>` first",
      IcoPath: ICON,
      score: 0,
      JsonRPCAction: {
        method: "query",
        parameters: [""],
      },
    },
  ];
}

function createEditConfigResult(): FlowResult {
  return {
    Title: "Edit SSH Config",
    Subtitle: `Open ${SSH_CONFIG_PATH} in VS Code`,
    IcoPath: ICON,
    score: 100,
    JsonRPCAction: {
      method: "edit_config",
      parameters: [],
    },
  };
}

function createNoProfilesFoundResult(searchTerm: string): FlowResult {
  return {
    Title: "No SSH profiles found",
    Subtitle: searchTerm
      ? `No match for "${searchTerm}"`
      : "Check your ~/.ssh/config file",
    IcoPath: ICON,
    score: 0,
    JsonRPCAction: {
      method: "edit_config",
      parameters: [],
    },
  };
}

function createChangeQueryAction(query: string): FlowApiAction {
  return {
    method: CHANGE_QUERY_METHOD,
    parameters: [query, true],
  };
}

function createShowMessageAction(title: string, message: string): FlowApiAction {
  return {
    method: SHOW_MSG_METHOD,
    parameters: [title, message],
  };
}

function normalizeParams(parameters: unknown): string[] {
  if (!Array.isArray(parameters)) return [];
  return parameters.map((value) => String(value));
}

export async function handleQuery(
  rawQuery: string,
  deps: HandlerDependencies = defaultDeps
): Promise<FlowResult[]> {
  const queryText = rawQuery.trim();
  const lowerQuery = queryText.toLowerCase();

  if (lowerQuery === "edit" || lowerQuery.startsWith("edit ")) {
    return [createEditConfigResult()];
  }

  if (lowerQuery === "action" || lowerQuery.startsWith("action ")) {
    const hostAlias = queryText.slice("action".length).trim();
    return hostAlias ? createProfileActionResults(hostAlias) : createNoProfileSelectedResult();
  }

  let searchTerm = "";
  if (lowerQuery.startsWith("profiles ")) {
    searchTerm = queryText.slice("profiles ".length).trim();
  } else if (lowerQuery !== "profiles" && queryText !== "") {
    searchTerm = queryText;
  }

  const filtered = filterProfiles(deps.readProfiles(), searchTerm);

  if (filtered.length === 0) {
    return [createNoProfilesFoundResult(searchTerm)];
  }

  return filtered.map((profile, index) => createProfileResult(profile, 100 - index));
}

async function handleAction(
  method: string,
  params: string[],
  deps: HandlerDependencies
): Promise<FlowApiAction | void> {
  const [hostAlias = ""] = params;

  if (method === "select_profile") {
    const sshCommand = buildSshCommand(hostAlias);
    await deps.copyTextToClipboard(sshCommand);
    return createChangeQueryAction(`ssh action ${hostAlias}`);
  }

  if (method === "copy_ssh_command") {
    const sshCommand = buildSshCommand(hostAlias);
    await deps.copyTextToClipboard(sshCommand);
    return createShowMessageAction("SSH Profiles", `Copied: ${sshCommand}`);
  }

  if (method === "open_ssh") {
    deps.launchSsh(hostAlias);
    return undefined;
  }

  if (method === "edit_config") {
    deps.openConfigInVSCode(SSH_CONFIG_PATH);
    return undefined;
  }

  return undefined;
}

export async function handleRequest(
  req: JsonRpcRequest,
  deps: HandlerDependencies = defaultDeps
): Promise<{ result: FlowResult[] } | FlowApiAction | void> {
  const method = req.method || "query";
  const params = normalizeParams(req.parameters);

  if (method === "query") {
    return { result: await handleQuery(params[0] || "", deps) };
  }

  return handleAction(method, params, deps);
}

function createErrorResult(error: unknown): FlowResult {
  return {
    Title: "SSH Profiles — Error",
    Subtitle: error instanceof Error ? error.message : String(error),
    IcoPath: ICON,
    score: 0,
  };
}

let currentMethod = "query";

async function main(): Promise<void> {
  const req = JSON.parse(process.argv[2] || "{}") as JsonRpcRequest;
  currentMethod = req.method || "query";

  const result = await handleRequest(req);

  if (currentMethod === "query") {
    process.stdout.write(JSON.stringify(result || { result: [] }));
  } else if (result) {
    process.stdout.write(JSON.stringify(result));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    if (currentMethod === "query") {
      process.stdout.write(JSON.stringify({ result: [createErrorResult(error)] }));
    }
  });
}
```

- [ ] **Step 4: Run Task 2 tests**

Run:

```bash
npm test -- tests/main.test.ts
```

Expected result:

```text
PASS tests/main.test.ts
```

- [ ] **Step 5: Run the full test suite**

Run:

```bash
npm test
```

Expected result:

```text
PASS tests/clipboard.test.ts
PASS tests/main.test.ts
PASS tests/ssh-config.test.ts
PASS tests/terminal.test.ts
```

- [ ] **Step 6: Build the plugin**

Run:

```bash
npm run build
```

Expected result:

```text
> flow-launcher-plugin-ssh-profiles@1.0.1 build
> tsc
```

The command exits with code `0` and creates updated JavaScript files under `dist/`.

- [ ] **Step 7: Smoke-test the action query without side effects**

Run:

```bash
node .\dist\main.js '{"method":"query","parameters":["action prod"],"settings":{}}'
```

Expected stdout is one JSON object with a `result` array containing exactly these two titles in order:

```json
{
  "result": [
    { "Title": "Copy to clipboard" },
    { "Title": "Open in terminal" }
  ]
}
```

The actual stdout also includes `Subtitle`, `IcoPath`, `score`, and `JsonRPCAction` fields.

- [ ] **Step 8: Smoke-test profile selection with an intentional clipboard side effect**

Run this only when it is acceptable to replace the current clipboard with `ssh prod`:

```bash
node .\dist\main.js '{"method":"select_profile","parameters":["prod"],"settings":{}}'
```

Expected stdout:

```json
{"method":"Flow.Launcher.ChangeQuery","parameters":["ssh action prod",true]}
```

Expected clipboard content:

```text
ssh prod
```

- [ ] **Step 9: Commit Task 2**

Run:

```bash
git add src/main.ts tests/main.test.ts dist/main.js dist/clipboard.js dist/terminal.js
git commit -m "feat: show ssh profile action choices" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Update Documentation and Verify in Flow Launcher

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 2 behavior: `select_profile`, `copy_ssh_command`, `open_ssh`, and `ssh action <alias>` query mode.
- Produces: README instructions that match the new UX and manual verification steps for Flow Launcher.

- [ ] **Step 1: Update the README overview behavior**

In `README.md`, replace the current overview sentence and support bullets at lines 15-23 with this exact block:

```markdown
**SSH Profiles** reads profiles from `~/.ssh/config`, shows them directly in Flow Launcher, copies the selected SSH command by default, and can still open an SSH session in Windows Terminal on demand.

The plugin currently supports:

- Reading `Host` blocks that define `HostName`.
- Skipping `Host *` and profiles pointing to `github.com` or `gitlab.com`.
- Searching by alias, `HostName`, or `User`.
- Copying `ssh <host-alias>` to the clipboard when you select a profile.
- Showing follow-up actions after profile selection: `Copy to clipboard` and `Open in terminal`.
- Opening profiles with `wt -p "<terminal profile>" -- ssh <host-alias>` when you choose `Open in terminal`.
- Opening the SSH config file in VS Code.
```

- [ ] **Step 2: Update the README usage section**

In `README.md`, replace the current paragraph and code block at lines 75-81 with this exact block:

```markdown
Select a profile result to copy this command to the clipboard:

```powershell
ssh <host-alias>
```

Flow Launcher then changes the query to `ssh action <host-alias>` and shows two choices:

| Choice | Description |
| --- | --- |
| `Copy to clipboard` | Copy `ssh <host-alias>` again. This is the top/default follow-up choice. |
| `Open in terminal` | Open Windows Terminal and run `wt -p "<terminal profile>" -- ssh <host-alias>`. |

The plugin automatically chooses a terminal profile in this order: PowerShell 7, Command Prompt, the first Windows Terminal profile, then Windows PowerShell as the fallback.
```

- [ ] **Step 3: Add manual verification instructions to the development section**

In `README.md`, after the existing JSON-RPC smoke-test block, add this exact block:

```markdown
Smoke-test the follow-up action query after building:

```powershell
node .\dist\main.js '{"method":"query","parameters":["action prod"],"settings":{}}'
```

Expected: stdout is valid JSON and the `result` array contains `Copy to clipboard` first and `Open in terminal` second.

Smoke-test profile selection only when replacing the current clipboard is acceptable:

```powershell
node .\dist\main.js '{"method":"select_profile","parameters":["prod"],"settings":{}}'
```

Expected: stdout returns `Flow.Launcher.ChangeQuery` with `ssh action prod`, and the clipboard contains `ssh prod`.
```

- [ ] **Step 4: Run documentation-adjacent verification**

Run:

```bash
npm test
npm run build
node .\dist\main.js '{"method":"query","parameters":["action prod"],"settings":{}}'
```

Expected result:

```text
npm test: PASS all test files
npm run build: exits with code 0
node smoke test: stdout is valid JSON with Copy to clipboard first and Open in terminal second
```

- [ ] **Step 5: Verify in Flow Launcher manually**

Use this checklist on Windows with Flow Launcher running from this plugin folder:

```text
1. Reload or restart Flow Launcher.
2. Open Flow Launcher.
3. Type: ssh profiles
4. Select any SSH profile result.
5. Confirm the clipboard now contains: ssh <selected-host-alias>
6. Confirm Flow Launcher stays open and the visible query becomes: ssh action <selected-host-alias>
7. Confirm the first result is: Copy to clipboard
8. Confirm the second result is: Open in terminal
9. Press Enter on Copy to clipboard.
10. Confirm the clipboard still contains: ssh <selected-host-alias>
11. Reopen Flow Launcher, type: ssh action <selected-host-alias>
12. Select Open in terminal.
13. Confirm Windows Terminal opens and starts: ssh <selected-host-alias>
14. Type: ssh edit
15. Confirm VS Code opens ~/.ssh/config.
```

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add README.md
git commit -m "docs: document ssh profile action choices" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Final Verification Before PR or Release

- [ ] Run full tests:

```bash
npm test
```

Expected:

```text
PASS tests/clipboard.test.ts
PASS tests/main.test.ts
PASS tests/ssh-config.test.ts
PASS tests/terminal.test.ts
```

- [ ] Run TypeScript build:

```bash
npm run build
```

Expected:

```text
tsc exits with code 0
```

- [ ] Inspect git diff:

```bash
git diff --stat HEAD~3..HEAD
```

Expected changed areas:

```text
README.md
src/clipboard.ts
src/main.ts
src/terminal.ts
tests/clipboard.test.ts
tests/main.test.ts
tests/terminal.test.ts
dist/clipboard.js
dist/main.js
dist/terminal.js
```

- [ ] Run the no-side-effect action query smoke test:

```bash
node .\dist\main.js '{"method":"query","parameters":["action prod"],"settings":{}}'
```

Expected: valid JSON with `Copy to clipboard` then `Open in terminal`.

- [ ] Run the clipboard side-effect smoke test only when replacing the clipboard is acceptable:

```bash
node .\dist\main.js '{"method":"select_profile","parameters":["prod"],"settings":{}}'
```

Expected: stdout returns `Flow.Launcher.ChangeQuery`, and clipboard contains `ssh prod`.

- [ ] Complete the manual Flow Launcher checklist from Task 3 Step 5.

---

## Self-Review

**1. Spec coverage**

- Requirement: selecting a profile should no longer immediately open terminal. Covered by Task 2 `select_profile`, which calls `copyTextToClipboard` and does not call `launchSsh`.
- Requirement: selecting a profile copies the SSH access command. Covered by Task 1 `buildSshCommand` and Task 2 `select_profile` test expecting `ssh prod`.
- Requirement: Flow Launcher shows follow-up choices after selecting a profile. Covered by Task 2 `Flow.Launcher.ChangeQuery` to `ssh action <alias>` and `createProfileActionResults`.
- Requirement: first/default follow-up choice is Copy to clipboard. Covered by Task 2 action-query test expecting `Copy to clipboard` with score `100` before `Open in terminal`.
- Requirement: second follow-up choice opens terminal and automatically connects. Covered by Task 2 `open_ssh` action and existing `launchSsh` behavior.

**2. Placeholder scan**

- No `TBD`, `TODO`, `implement later`, or unspecified test instructions remain.
- Each code-changing step includes exact code or exact replacement text.
- Each command has an expected result.

**3. Type consistency**

- `buildSshCommand(hostAlias: string): string` is defined in Task 1 and consumed in Task 2.
- `copyTextToClipboard(text: string): Promise<void>` is defined in Task 1 and consumed through `HandlerDependencies` in Task 2.
- `CHANGE_QUERY_METHOD` and `SHOW_MSG_METHOD` constants are exported by Task 2 and used by `tests/main.test.ts`.
- `FlowResult.JsonRPCAction.dontHideAfterAction` uses the same property name in implementation and tests.
