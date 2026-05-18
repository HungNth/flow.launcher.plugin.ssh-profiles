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

/**
 * Parse SSH config text content into an array of SshProfile objects.
 * Skips Host * wildcard entries and comment lines.
 */
export function parseSshConfig(content: string): SshProfile[] {
  const lines = content.split(/\r?\n/);
  const profiles: SshProfile[] = [];
  let current: Partial<SshProfile> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const hostMatch = trimmed.match(/^Host\s+(.+)/i);
    if (hostMatch) {
      // Save previous profile if valid
      if (current?.host && current?.hostName) {
        profiles.push(current as SshProfile);
      }

      const hostValue = hostMatch[1].trim();
      // Skip wildcards
      if (hostValue === "*") {
        current = null;
        continue;
      }

      current = {
        host: hostValue,
        hostName: undefined as any,
        user: undefined,
        port: undefined,
        identityFile: undefined,
      };
      continue;
    }

    // Parse key-value pairs for the current host block
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

  // Don't forget the last profile
  if (current?.host && current?.hostName) {
    profiles.push(current as SshProfile);
  }

  return profiles;
}

/**
 * Filter profiles: exclude github.com/gitlab.com, then match query
 * against host, hostName, and user fields (case-insensitive).
 */
export function filterProfiles(
  profiles: SshProfile[],
  query: string
): SshProfile[] {
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

/**
 * Read and parse the user's SSH config file.
 * Returns an empty array if the file does not exist.
 */
export function readSshConfig(): SshProfile[] {
  const configPath = path.join(os.homedir(), ".ssh", "config");
  try {
    return parseSshConfig(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return [];
  }
}
