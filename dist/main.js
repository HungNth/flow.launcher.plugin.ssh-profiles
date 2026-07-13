"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHOW_MSG_METHOD = exports.CHANGE_QUERY_METHOD = exports.ICON = void 0;
exports.createProfileResult = createProfileResult;
exports.createProfileActionResults = createProfileActionResults;
exports.handleQuery = handleQuery;
exports.handleRequest = handleRequest;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const clipboard_1 = require("./clipboard");
const ssh_config_1 = require("./ssh-config");
const terminal_1 = require("./terminal");
exports.ICON = "Images\\app.png";
exports.CHANGE_QUERY_METHOD = "Flow.Launcher.ChangeQuery";
exports.SHOW_MSG_METHOD = "Flow.Launcher.ShowMsg";
const SSH_CONFIG_PATH = path.join(os.homedir(), ".ssh", "config");
const defaultDeps = {
    readProfiles: ssh_config_1.readSshConfig,
    copyTextToClipboard: clipboard_1.copyTextToClipboard,
    launchSsh: terminal_1.launchSsh,
    openConfigInVSCode: terminal_1.openConfigInVSCode,
};
function profileSubtitle(p) {
    return p.user
        ? `${p.user}@${p.hostName}${p.port ? `:${p.port}` : ""}`
        : `${p.hostName}${p.port ? `:${p.port}` : ""}`;
}
/**
 * Build a Flow result for a single SSH profile.
 * Enter now copies the plain SSH command first and keeps Flow open.
 */
function createProfileResult(p, score) {
    const sshCommand = (0, terminal_1.buildSshCommand)(p.host);
    return {
        Title: p.host,
        Subtitle: `${profileSubtitle(p)} — Enter: copy "${sshCommand}" and show actions`,
        IcoPath: exports.ICON,
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
function createProfileActionResults(hostAlias) {
    const sshCommand = (0, terminal_1.buildSshCommand)(hostAlias);
    return [
        {
            Title: "Copy to clipboard",
            Subtitle: `Copy: ${sshCommand}`,
            IcoPath: exports.ICON,
            score: 100,
            JsonRPCAction: {
                method: "copy_ssh_command",
                parameters: [hostAlias],
            },
        },
        {
            Title: "Open in terminal",
            Subtitle: `Open Windows Terminal and run: ${sshCommand}`,
            IcoPath: exports.ICON,
            score: 90,
            JsonRPCAction: {
                method: "open_ssh",
                parameters: [hostAlias],
            },
        },
    ];
}
function createNoProfileSelectedResult() {
    return [
        {
            Title: "No SSH profile selected",
            Subtitle: "Search for a profile with `ssh <keyword>` first",
            IcoPath: exports.ICON,
            score: 0,
            JsonRPCAction: {
                method: "query",
                parameters: [""],
            },
        },
    ];
}
function createEditConfigResult() {
    return {
        Title: "Edit SSH Config",
        Subtitle: `Open ${SSH_CONFIG_PATH} in VS Code`,
        IcoPath: exports.ICON,
        score: 100,
        JsonRPCAction: {
            method: "edit_config",
            parameters: [],
        },
    };
}
function createNoProfilesFoundResult(searchTerm) {
    return {
        Title: "No SSH profiles found",
        Subtitle: searchTerm
            ? `No match for "${searchTerm}"`
            : "Check your ~/.ssh/config file",
        IcoPath: exports.ICON,
        score: 0,
        JsonRPCAction: {
            method: "edit_config",
            parameters: [],
        },
    };
}
function createChangeQueryAction(query) {
    return {
        method: exports.CHANGE_QUERY_METHOD,
        parameters: [query, true],
    };
}
function createShowMessageAction(title, message) {
    return {
        method: exports.SHOW_MSG_METHOD,
        parameters: [title, message],
    };
}
function normalizeParams(parameters) {
    if (!Array.isArray(parameters))
        return [];
    return parameters.map((value) => String(value));
}
async function handleQuery(rawQuery, deps = defaultDeps) {
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
    }
    else if (lowerQuery !== "profiles" && queryText !== "") {
        searchTerm = queryText;
    }
    const filtered = (0, ssh_config_1.filterProfiles)(deps.readProfiles(), searchTerm);
    if (filtered.length === 0) {
        return [createNoProfilesFoundResult(searchTerm)];
    }
    return filtered.map((profile, index) => createProfileResult(profile, 100 - index));
}
async function handleAction(method, params, deps) {
    const [hostAlias = ""] = params;
    if (method === "select_profile") {
        const sshCommand = (0, terminal_1.buildSshCommand)(hostAlias);
        await deps.copyTextToClipboard(sshCommand);
        return createChangeQueryAction(`ssh action ${hostAlias}`);
    }
    if (method === "copy_ssh_command") {
        const sshCommand = (0, terminal_1.buildSshCommand)(hostAlias);
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
async function handleRequest(req, deps = defaultDeps) {
    const method = req.method || "query";
    const params = normalizeParams(req.parameters);
    if (method === "query") {
        return { result: await handleQuery(params[0] || "", deps) };
    }
    return handleAction(method, params, deps);
}
function createErrorResult(error) {
    return {
        Title: "SSH Profiles — Error",
        Subtitle: error instanceof Error ? error.message : String(error),
        IcoPath: exports.ICON,
        score: 0,
    };
}
let currentMethod = "query";
async function main() {
    const req = JSON.parse(process.argv[2] || "{}");
    currentMethod = req.method || "query";
    const result = await handleRequest(req);
    if (currentMethod === "query") {
        process.stdout.write(JSON.stringify(result || { result: [] }));
    }
    else if (result) {
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
