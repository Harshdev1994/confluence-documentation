import { describe, expect, it } from "vitest";
import { isUserDependent, listMacros } from "@/server/confluence/macros";
import { MemoryStore } from "@/server/cache/store";
import { parseManifestVersion } from "@/server/confluence/service";

describe("macro detection", () => {
  it("lists macros in storage format", () => {
    const storage = `<ac:structured-macro ac:name="info" ac:schema-version="1"/><ac:structured-macro ac:macro-id="x" ac:name="code"/>`;
    expect(listMacros(storage).sort()).toEqual(["code", "info"]);
    expect(isUserDependent(storage)).toBe(false);
  });

  it("flags macros whose output depends on the viewer", () => {
    expect(isUserDependent(`<ac:structured-macro ac:name="children"/>`)).toBe(true);
    expect(isUserDependent(`<ac:structured-macro ac:name="jira"><ac:parameter ac:name="key">A-1</ac:parameter></ac:structured-macro>`)).toBe(true);
  });
});

describe("MemoryStore", () => {
  it("expires entries and evicts the least recently used", async () => {
    let now = 0;
    const store = new MemoryStore(2, () => now);
    await store.set("a", 1, 10);
    await store.set("b", 2, 10);
    await store.get("a");
    await store.set("c", 3, 10); // evicts b
    expect(await store.get("b")).toBeUndefined();
    expect(await store.get("a")).toBe(1);
    now = 11_000;
    expect(await store.get("a")).toBeUndefined();
  });

  it("increments generations", async () => {
    const store = new MemoryStore();
    expect(await store.getNumber("gen")).toBe(0);
    expect(await store.incr("gen")).toBe(1);
    expect(await store.incr("gen")).toBe(2);
  });
});

describe("parseManifestVersion", () => {
  it("reads the Confluence version", () => {
    const xml = `<manifest><id>x</id><name>Confluence</name><typeId>confluence</typeId><version>10.2.19</version><buildNumber>1</buildNumber></manifest>`;
    expect(parseManifestVersion(xml)).toBe("10.2.19");
  });
});
