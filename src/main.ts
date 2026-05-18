import * as path from "path";
import * as os from "os";
import { readSshConfig, filterProfiles, SshProfile } from "./ssh-config";
import { launchSsh, openConfigInVSCode } from "./terminal";

interface FlowResult {
  Title: string;
  Subtitle: string;
  IcoPath: string;
  score: number;
  JsonRPCAction: {
    method: string;
    parameters: string[];
  };
}

const ICON = "Images\\app.png";
const SSH_CONFIG_PATH = path.join(os.homedir(), ".ssh", "config");

/**
 * Build a FlowResult for a single SSH profile.
 */
function profileToResult(p: SshProfile, score: number): FlowResult {
  const sub = p.user
    ? `${p.user}@${p.hostName}${p.port ? `:${p.port}` : ""}`
    : `${p.hostName}${p.port ? `:${p.port}` : ""}`;

  return {
    Title: p.host,
    Subtitle: sub,
    IcoPath: ICON,
    score,
    JsonRPCAction: {
      method: "open_ssh",
      parameters: [p.host],
    },
  };
}

// ── Handler map ────────────────────────────────────────────────

const handlers: Record<
  string,
  (params: string[], settings: Record<string, string>) => FlowResult[] | void
> = {
  query([rawQuery = ""], _settings) {
    const query = rawQuery.trim().toLowerCase();

    // "ssh edit" → open config in VS Code
    if (query === "edit" || query.startsWith("edit ")) {
      return [
        {
          Title: "Edit SSH Config",
          Subtitle: `Open ${SSH_CONFIG_PATH} in VS Code`,
          IcoPath: ICON,
          score: 100,
          JsonRPCAction: {
            method: "edit_config",
            parameters: [],
          },
        },
      ];
    }

    // "ssh profiles [search]" or "ssh [search]" → list profiles
    let searchTerm = "";
    if (query.startsWith("profiles ")) {
      searchTerm = query.slice("profiles ".length).trim();
    } else if (query !== "profiles" && query !== "") {
      searchTerm = query;
    }

    const filtered = filterProfiles(readSshConfig(), searchTerm);

    if (filtered.length === 0) {
      return [
        {
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
        },
      ];
    }

    return filtered.map((p, i) => profileToResult(p, 100 - i));
  },

  open_ssh([hostAlias]) {
    launchSsh(hostAlias);
  },

  edit_config() {
    openConfigInVSCode(SSH_CONFIG_PATH);
  },
};

// ── Dispatcher ─────────────────────────────────────────────────

let currentMethod = "query";

async function main(): Promise<void> {
  const req = JSON.parse(process.argv[2] || "{}");
  currentMethod = req.method;
  const params: string[] = Array.isArray(req.parameters)
    ? req.parameters
    : [];
  const handler = handlers[req.method];

  if (!handler) {
    if (req.method === "query") {
      process.stdout.write(JSON.stringify({ result: [] }));
    }
    return;
  }

  const result = handler(params, req.settings || {});
  if (req.method === "query") {
    process.stdout.write(
      JSON.stringify({ result: Array.isArray(result) ? result : [] })
    );
  } else if (result) {
    process.stdout.write(JSON.stringify(result));
  }
}

main().catch((error) => {
  console.error(error);
  if (currentMethod === "query") {
    process.stdout.write(
      JSON.stringify({
        result: [
          {
            Title: "SSH Profiles — Error",
            Subtitle:
              error instanceof Error ? error.message : String(error),
            IcoPath: ICON,
            score: 0,
          },
        ],
      })
    );
  }
});
