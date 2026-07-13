import { describe, it, expect } from "vitest";
import { detectWtProfileName, buildWtCommand, buildSshCommand } from "../src/terminal";

describe("detectWtProfileName", () => {
  it("prefers PowerShell 7", () => {
    const profiles = [
      { name: "PowerShell", guid: "{574e775e-4f2a-5b96-ac1e-a2962a402336}" },
      { name: "Command Prompt", guid: "{0caa0dad-35be-5f56-a8ff-afceeeaa6101}" },
    ];
    expect(detectWtProfileName(profiles)).toBe("PowerShell");
  });

  it("falls back to Command Prompt", () => {
    const profiles = [
      { name: "Command Prompt", guid: "{0caa0dad-35be-5f56-a8ff-afceeeaa6101}" },
    ];
    expect(detectWtProfileName(profiles)).toBe("Command Prompt");
  });

  it("falls back to first available", () => {
    expect(
      detectWtProfileName([{ name: "Git Bash", guid: "{x}" }])
    ).toBe("Git Bash");
  });

  it("empty list returns fallback", () => {
    expect(detectWtProfileName([])).toBe("Windows PowerShell");
  });
});

describe("buildWtCommand", () => {
  it("builds correct wt command", () => {
    expect(buildWtCommand("PowerShell", "my_server")).toBe(
      'wt -p "PowerShell" -- ssh my_server'
    );
  });

  it("handles profile names with spaces", () => {
    expect(buildWtCommand("Command Prompt", "vps")).toBe(
      'wt -p "Command Prompt" -- ssh vps'
    );
  });
});

describe("buildSshCommand", () => {
  it("builds the command copied to the clipboard", () => {
    expect(buildSshCommand("prod")).toBe("ssh prod");
  });
});

