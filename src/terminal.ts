import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";

interface WtProfile {
  name: string;
  guid: string;
}

// Well-known GUIDs for built-in Windows Terminal profiles
const PWSH7_GUID = "{574e775e-4f2a-5b96-ac1e-a2962a402336}";
const CMD_GUID = "{0caa0dad-35be-5f56-a8ff-afceeeaa6101}";

/**
 * Pick the best profile name from a list of WT profiles.
 * Priority: PowerShell 7 → Command Prompt → first available → fallback.
 */
export function detectWtProfileName(profiles: WtProfile[]): string {
  const pwsh7 = profiles.find(
    (p) => p.name === "PowerShell" || p.guid === PWSH7_GUID
  );
  if (pwsh7) return pwsh7.name;

  const cmd = profiles.find(
    (p) => p.name === "Command Prompt" || p.guid === CMD_GUID
  );
  if (cmd) return cmd.name;

  return profiles[0]?.name || "Windows PowerShell";
}

/**
 * Build the `wt` CLI command string to launch an SSH session.
 */
export function buildWtCommand(
  profileName: string,
  hostAlias: string
): string {
  return `wt -p "${profileName}" -- ssh ${hostAlias}`;
}

/**
 * Read Windows Terminal settings.json and return the profile list.
 */
function readWtProfiles(): WtProfile[] {
  const settingsPath = path.join(
    process.env.LOCALAPPDATA || "",
    "Packages",
    "Microsoft.WindowsTerminal_8wekyb3d8bbwe",
    "LocalState",
    "settings.json"
  );

  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(raw);
    const list = settings?.profiles?.list;
    if (!Array.isArray(list)) return [];
    return list.map((p: any) => ({
      name: p.name || "",
      guid: p.guid || "",
    }));
  } catch {
    return [];
  }
}

/**
 * Launch an SSH session in Windows Terminal.
 * Detects the best WT profile (pwsh7 preferred, cmd fallback).
 */
export function launchSsh(hostAlias: string): void {
  const profiles = readWtProfiles();
  const profileName = detectWtProfileName(profiles);
  const command = buildWtCommand(profileName, hostAlias);

  exec(command, (err: Error | null) => {
    if (err) {
      console.error(`Failed to launch SSH session: ${err.message}`);
    }
  });
}

/**
 * Open the SSH config file in VS Code.
 */
export function openConfigInVSCode(configPath: string): void {
  exec(`code "${configPath}"`, (err: Error | null) => {
    if (err) {
      console.error(`Failed to open VS Code: ${err.message}`);
    }
  });
}
