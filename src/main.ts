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
