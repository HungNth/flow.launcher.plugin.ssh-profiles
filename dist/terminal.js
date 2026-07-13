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
exports.detectWtProfileName = detectWtProfileName;
exports.buildWtCommand = buildWtCommand;
exports.buildSshCommand = buildSshCommand;
exports.launchSsh = launchSsh;
exports.openConfigInVSCode = openConfigInVSCode;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
// Well-known GUIDs for built-in Windows Terminal profiles
const PWSH7_GUID = "{574e775e-4f2a-5b96-ac1e-a2962a402336}";
const CMD_GUID = "{0caa0dad-35be-5f56-a8ff-afceeeaa6101}";
/**
 * Pick the best profile name from a list of WT profiles.
 * Priority: PowerShell 7 → Command Prompt → first available → fallback.
 */
function detectWtProfileName(profiles) {
    const pwsh7 = profiles.find((p) => p.name === "PowerShell" || p.guid === PWSH7_GUID);
    if (pwsh7)
        return pwsh7.name;
    const cmd = profiles.find((p) => p.name === "Command Prompt" || p.guid === CMD_GUID);
    if (cmd)
        return cmd.name;
    return profiles[0]?.name || "Windows PowerShell";
}
/**
 * Build the `wt` CLI command string to launch an SSH session.
 */
function buildWtCommand(profileName, hostAlias) {
    return `wt -p "${profileName}" -- ssh ${hostAlias}`;
}
/**
 * Build the plain SSH command copied to the clipboard.
 */
function buildSshCommand(hostAlias) {
    return `ssh ${hostAlias}`;
}
/**
 * Read Windows Terminal settings.json and return the profile list.
 */
function readWtProfiles() {
    const settingsPath = path.join(process.env.LOCALAPPDATA || "", "Packages", "Microsoft.WindowsTerminal_8wekyb3d8bbwe", "LocalState", "settings.json");
    try {
        const raw = fs.readFileSync(settingsPath, "utf-8");
        const settings = JSON.parse(raw);
        const list = settings?.profiles?.list;
        if (!Array.isArray(list))
            return [];
        return list.map((p) => ({
            name: p.name || "",
            guid: p.guid || "",
        }));
    }
    catch {
        return [];
    }
}
/**
 * Launch an SSH session in Windows Terminal.
 * Detects the best WT profile (pwsh7 preferred, cmd fallback).
 */
function launchSsh(hostAlias) {
    const profiles = readWtProfiles();
    const profileName = detectWtProfileName(profiles);
    const command = buildWtCommand(profileName, hostAlias);
    (0, child_process_1.exec)(command, (err) => {
        if (err) {
            console.error(`Failed to launch SSH session: ${err.message}`);
        }
    });
}
/**
 * Open the SSH config file in VS Code.
 */
function openConfigInVSCode(configPath) {
    (0, child_process_1.exec)(`code "${configPath}"`, (err) => {
        if (err) {
            console.error(`Failed to open VS Code: ${err.message}`);
        }
    });
}
