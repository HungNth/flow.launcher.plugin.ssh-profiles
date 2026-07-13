import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SshProfile } from "../src/ssh-config";
import {
  CHANGE_QUERY_METHOD,
  SHOW_MSG_METHOD,
  type HandlerDependencies,
  handleRequest,
} from "../src/main";

const PROD_PROFILE: SshProfile = {
  host: "prod",
  hostName: "203.0.113.10",
  user: "deploy",
  port: "22",
  identityFile: "~/.ssh/id_ed25519",
};

function createDeps(profiles: SshProfile[] = [PROD_PROFILE]): HandlerDependencies {
  return {
    readProfiles: vi.fn(() => profiles),
    copyTextToClipboard: vi.fn(async () => undefined),
    launchSsh: vi.fn(),
    openConfigInVSCode: vi.fn(),
  };
}

describe("handleRequest query", () => {
  let deps: HandlerDependencies;

  beforeEach(() => {
    deps = createDeps();
  });

  it("returns profile results that copy by default and keep Flow open", async () => {
    const response = await handleRequest(
      { method: "query", parameters: ["prod"], settings: {} },
      deps
    );

    expect(response).toEqual({
      result: [
        {
          Title: "prod",
          Subtitle: 'deploy@203.0.113.10:22 — Enter: copy "ssh prod" and show actions',
          IcoPath: "Images\\app.png",
          score: 100,
          JsonRPCAction: {
            method: "select_profile",
            parameters: ["prod"],
            dontHideAfterAction: true,
          },
        },
      ],
    });
  });

  it("returns copy and terminal choices for the action query", async () => {
    const response = await handleRequest(
      { method: "query", parameters: ["action prod"], settings: {} },
      deps
    );

    expect(response).toEqual({
      result: [
        {
          Title: "Copy to clipboard",
          Subtitle: "Copy: ssh prod",
          IcoPath: "Images\\app.png",
          score: 100,
          JsonRPCAction: {
            method: "copy_ssh_command",
            parameters: ["prod"],
          },
        },
        {
          Title: "Open in terminal",
          Subtitle: "Open Windows Terminal and run: ssh prod",
          IcoPath: "Images\\app.png",
          score: 90,
          JsonRPCAction: {
            method: "open_ssh",
            parameters: ["prod"],
          },
        },
      ],
    });
  });

  it("keeps ssh edit behavior", async () => {
    const response = await handleRequest(
      { method: "query", parameters: ["edit"], settings: {} },
      deps
    );

    expect(response).toMatchObject({
      result: [
        {
          Title: "Edit SSH Config",
          JsonRPCAction: {
            method: "edit_config",
            parameters: [],
          },
        },
      ],
    });
  });
});

describe("handleRequest actions", () => {
  let deps: HandlerDependencies;

  beforeEach(() => {
    deps = createDeps();
  });

  it("select_profile copies the SSH command and changes the query to the action menu", async () => {
    const response = await handleRequest(
      { method: "select_profile", parameters: ["prod"], settings: {} },
      deps
    );

    expect(deps.copyTextToClipboard).toHaveBeenCalledWith("ssh prod");
    expect(deps.launchSsh).not.toHaveBeenCalled();
    expect(response).toEqual({
      method: CHANGE_QUERY_METHOD,
      parameters: ["ssh action prod", true],
    });
  });

  it("copy_ssh_command copies the SSH command and shows a confirmation message", async () => {
    const response = await handleRequest(
      { method: "copy_ssh_command", parameters: ["prod"], settings: {} },
      deps
    );

    expect(deps.copyTextToClipboard).toHaveBeenCalledWith("ssh prod");
    expect(response).toEqual({
      method: SHOW_MSG_METHOD,
      parameters: ["SSH Profiles", "Copied: ssh prod"],
    });
  });

  it("open_ssh launches Windows Terminal without copying again", async () => {
    const response = await handleRequest(
      { method: "open_ssh", parameters: ["prod"], settings: {} },
      deps
    );

    expect(deps.launchSsh).toHaveBeenCalledWith("prod");
    expect(deps.copyTextToClipboard).not.toHaveBeenCalled();
    expect(response).toBeUndefined();
  });
});
