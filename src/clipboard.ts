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
