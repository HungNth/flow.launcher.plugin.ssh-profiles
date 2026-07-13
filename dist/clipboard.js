"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POWERSHELL_CLIPBOARD_ARGS = void 0;
exports.copyTextToClipboard = copyTextToClipboard;
const child_process_1 = require("child_process");
exports.POWERSHELL_CLIPBOARD_ARGS = [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Set-Clipboard -Value ([Console]::In.ReadToEnd())",
];
/**
 * Copy text to the Windows clipboard without shell-escaping the text.
 * The text is passed through stdin so commands such as `ssh prod` are copied exactly.
 */
function copyTextToClipboard(text) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)("powershell.exe", exports.POWERSHELL_CLIPBOARD_ARGS, {
            windowsHide: true,
        });
        let stderr = "";
        child.stderr.on("data", (chunk) => {
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
