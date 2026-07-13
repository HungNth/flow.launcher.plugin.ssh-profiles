<div align="center">
  <img src="Images/app.png" alt="SSH Profiles icon" width="96" height="96">
  <h1>SSH Profiles</h1>
  <p>A Flow Launcher plugin to quickly find and open SSH profiles from <code>~/.ssh/config</code> with Windows Terminal.</p>
</div>

<p align="center">
  <img alt="Flow Launcher" src="https://img.shields.io/badge/Flow%20Launcher-plugin-2ea44f?style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20%2B-3c873a?style=flat-square&logo=node.js&logoColor=white">
</p>

## Overview

**SSH Profiles** reads profiles from `~/.ssh/config`, shows them directly in Flow Launcher, copies the selected SSH command by default, and can still open an SSH session in Windows Terminal on demand.

The plugin currently supports:

- Reading `Host` blocks that define `HostName`.
- Skipping `Host *` and profiles pointing to `github.com` or `gitlab.com`.
- Searching by alias, `HostName`, or `User`.
- Copying `ssh <host-alias>` to the clipboard when you select a profile.
- Showing follow-up actions after profile selection: `Copy to clipboard` and `Open in terminal`.
- Opening profiles with `wt -p "<terminal profile>" -- ssh <host-alias>` when you choose `Open in terminal`.
- Opening the SSH config file in VS Code.


## Requirements

- Windows and [Flow Launcher](https://www.flowlauncher.com/).
- [Windows Terminal](https://aka.ms/terminal).
- Node.js 20+ to build or run tests from source.
- An SSH config file at `~/.ssh/config`.

> [!NOTE]
> `ssh edit` uses the `code` CLI, so VS Code must be available in `PATH` if you want to open the config directly from Flow Launcher.

## Install From Source

Clone or place the plugin folder inside Flow Launcher's plugins directory, for example:

```powershell
cd "$env:APPDATA\FlowLauncher\Plugins"
git clone https://github.com/user/flow.launcher.plugin.ssh-profiles.git
cd flow.launcher.plugin.ssh-profiles
npm install
npm run build
```

Then reload or restart Flow Launcher. The plugin manifest is `plugin.json`, and the default action keyword is `ssh`.

## SSH Config

The plugin reads data from `~/.ssh/config`. Each profile should define `Host` and `HostName`:

```sshconfig
Host production
  HostName 203.0.113.10
  User deploy
  Port 22
  IdentityFile ~/.ssh/id_ed25519
```

> [!TIP]
> If a profile does not appear in Flow Launcher, check whether that block defines `HostName`.

## Usage

Open Flow Launcher and type:

| Command | Description |
| --- | --- |
| `ssh` | Show all valid SSH profiles |
| `ssh <keyword>` | Search profiles by alias, host, or user |
| `ssh profiles <keyword>` | Search profiles with the `profiles` prefix |
| `ssh edit` | Open `~/.ssh/config` in VS Code |

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


## Development

Common commands:

```powershell
npm install
npm run build
npm test
npm run test:watch
```

Smoke-test the JSON-RPC entry after building:

```powershell
node .\dist\main.js '{"method":"query","parameters":[""],"settings":{}}'
```

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


## Project Structure

```text
plugin.json          # Flow Launcher manifest
src/main.ts          # JSON-RPC dispatcher and query handler
src/ssh-config.ts    # Reads, parses, and filters ~/.ssh/config
src/terminal.ts      # Opens Windows Terminal and VS Code
tests/               # Vitest test suite
Images/app.png       # Icon plugin
```
