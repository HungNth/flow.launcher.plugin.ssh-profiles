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
