const fs = require("fs");
const os = require("os");
const path = require("path");

describe("favourite tree service ownership", () => {
  let directory, file, treePackage, tree, main, providers;

  function provide(name, payload) {
    const provider = lumine.packages.serviceHub.provide(name, "1.0.0", payload);
    providers.push(provider);
    return provider;
  }

  function section() {
    return tree.specialRoots.find((candidate) => candidate.config.name === "Ownership");
  }

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    directory = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "favourite-owner-")));
    file = path.join(directory, "pinned.txt");
    fs.writeFileSync(file, "pin");
    lumine.project.setPaths([directory]);
    treePackage = await lumine.packages.activatePackage("tree-view");
    main = (await lumine.packages.activatePackage("tree-view-favourite")).mainModule;
    tree = treePackage.mainModule.getTreeViewInstance();
    main.store.groups = Object.create(null);
    main.store.addEntry("Ownership", file);
    main.syncRoots();
    providers = [];
  });

  afterEach(async () => {
    for (const provider of providers) provider.dispose();
    if (lumine.packages.isPackageActive("tree-view-favourite")) {
      await lumine.packages.deactivatePackage("tree-view-favourite");
    }
    lumine.project.setPaths([]);
    tree.updateRoots();
    await lumine.fileWatchClient.settlePendingTeardown();
    const relative = path.relative(fs.realpathSync.native(os.tmpdir()), directory);
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
      throw new Error("Unsafe favourite fixture cleanup");
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("keeps the rendered section until the final shared roots edge is withdrawn", () => {
    const api = treePackage.mainModule.provideTreeViewRoots();
    const first = provide("tree-view.roots", api);
    const second = provide("tree-view.roots", api);
    const rendered = section();
    first.dispose();
    expect(main.rootsApi).toBe(api);
    expect(section()).toBe(rendered);
    expect(section()?.entries[0].getPath()).toBe(file);
    second.dispose();
    // The package-provided roots service is still connected and becomes current again.
    expect(section()?.entries[0].getPath()).toBe(file);
  });

  it("keeps a shared selection service usable after the first edge is withdrawn", () => {
    const api = treePackage.mainModule.provideTreeViewSelection();
    const first = provide("tree-view.selection", api);
    provide("tree-view.selection", api);
    tree.selectEntry(section().entries[0]);
    first.dispose();
    expect(main.treeView).toBe(api);
    expect(main.selectedPaths()).toEqual([file]);
  });

  it("leaves the newer roots payload in place when an older distinct edge retires", () => {
    const older = treePackage.mainModule.provideTreeViewRoots();
    const newer = treePackage.mainModule.provideTreeViewRoots();
    const first = provide("tree-view.roots", older);
    const second = provide("tree-view.roots", newer);
    first.dispose();
    expect(main.rootsApi).toBe(newer);
    expect(section()?.entries[0].getPath()).toBe(file);
    second.dispose();
    expect(section()?.entries[0].getPath()).toBe(file);
    expect(
      tree.specialRoots.filter((candidate) => candidate.config.name === "Ownership").length,
    ).toBe(1);
  });

  it("restores an older live roots and selection provider when the newest retires", () => {
    const olderRoots = treePackage.mainModule.provideTreeViewRoots();
    const newerRoots = treePackage.mainModule.provideTreeViewRoots();
    provide("tree-view.roots", olderRoots);
    const newest = provide("tree-view.roots", newerRoots);
    newest.dispose();
    expect(main.rootsApi).toBe(olderRoots);
    expect(section()?.entries[0].getPath()).toBe(file);
    const olderSelection = treePackage.mainModule.provideTreeViewSelection();
    const newerSelection = treePackage.mainModule.provideTreeViewSelection();
    provide("tree-view.selection", olderSelection);
    const latest = provide("tree-view.selection", newerSelection);
    latest.dispose();
    expect(main.treeView).toBe(olderSelection);
  });

  it("rejects a retained roots consumer from a retired package generation", async () => {
    const retired = main.consumeTreeViewRoots.bind(main);
    await lumine.packages.deactivatePackage("tree-view-favourite");
    main = (await lumine.packages.activatePackage("tree-view-favourite")).mainModule;
    main.store.groups = Object.create(null);
    main.store.addEntry("Ownership", file);
    main.syncRoots();
    const rendered = section();
    const lease = retired(treePackage.mainModule.provideTreeViewRoots());
    expect(
      tree.specialRoots.filter((candidate) => candidate.config.name === "Ownership").length,
    ).toBe(1);
    lease.dispose();
    expect(section()).toBe(rendered);
  });

  it("restores the most recent surviving roots edge in A-B-A consumption order", () => {
    const a = treePackage.mainModule.provideTreeViewRoots();
    const b = treePackage.mainModule.provideTreeViewRoots();
    provide("tree-view.roots", a);
    const middle = provide("tree-view.roots", b);
    const latest = provide("tree-view.roots", a);
    expect(main.rootsApi).toBe(a);
    latest.dispose();
    expect(main.rootsApi).toBe(b);
    expect(section()?.entries[0].getPath()).toBe(file);
    middle.dispose();
    expect(main.rootsApi).toBe(a);
  });

  it("restores the most recent surviving selection edge in A-B-A consumption order", () => {
    const a = treePackage.mainModule.provideTreeViewSelection();
    const b = treePackage.mainModule.provideTreeViewSelection();
    provide("tree-view.selection", a);
    const middle = provide("tree-view.selection", b);
    const latest = provide("tree-view.selection", a);
    expect(main.treeView).toBe(a);
    latest.dispose();
    expect(main.treeView).toBe(b);
    middle.dispose();
    expect(main.treeView).toBe(a);
  });
});
