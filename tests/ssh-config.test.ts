import { describe, it, expect } from "vitest";
import { parseSshConfig, filterProfiles } from "../src/ssh-config";

const SAMPLE = `
# Personal GitHub
Host hungnth
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_hungnth

Host hs_nth
  HostName 10.10.0.2
  User nth
  IdentityFile ~/.ssh/id_vps_ed25519

Host hs_root
  HostName 10.10.0.2
  User root
  IdentityFile ~/.ssh/id_vps_ed25519

Host wptop.net
  HostName wptop.net
  Port 10795
  User wptopnet
  IdentityFile ~/.ssh/id_vps_ed25519

Host gitlab-work
  HostName gitlab.com
  User git
  IdentityFile ~/.ssh/id_work

Host *
  ServerAliveInterval 60
`;

describe("parseSshConfig", () => {
  it("parses all Host blocks", () => {
    const p = parseSshConfig(SAMPLE);
    expect(p).toHaveLength(5);
    expect(p[0].host).toBe("hungnth");
    expect(p[0].hostName).toBe("github.com");
  });

  it("parses port when present", () => {
    const p = parseSshConfig(SAMPLE);
    expect(p.find((x) => x.host === "wptop.net")?.port).toBe("10795");
  });

  it("skips Host * wildcard", () => {
    expect(parseSshConfig(SAMPLE).find((x) => x.host === "*")).toBeUndefined();
  });

  it("handles empty input", () => {
    expect(parseSshConfig("")).toEqual([]);
  });

  it("handles comments-only input", () => {
    expect(parseSshConfig("# just a comment\n# another")).toEqual([]);
  });
});

describe("filterProfiles", () => {
  const all = parseSshConfig(SAMPLE);

  it("excludes github.com and gitlab.com", () => {
    const f = filterProfiles(all, "");
    expect(f.map((x) => x.hostName)).not.toContain("github.com");
    expect(f.map((x) => x.hostName)).not.toContain("gitlab.com");
    expect(f).toHaveLength(3);
  });

  it("filters by host alias", () => {
    expect(filterProfiles(all, "hs")).toHaveLength(2);
  });

  it("filters by user", () => {
    expect(filterProfiles(all, "root")).toHaveLength(1);
  });

  it("filter is case-insensitive", () => {
    expect(filterProfiles(all, "HS_NTH")).toHaveLength(1);
  });

  it("returns empty when nothing matches", () => {
    expect(filterProfiles(all, "xyz")).toHaveLength(0);
  });
});
