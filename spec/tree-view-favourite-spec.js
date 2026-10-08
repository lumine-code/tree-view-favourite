const fs = require("fs");
const os = require("os");
const path = require("path");

// `conditionPromise` is the harness global every suite in the ecosystem
// shares. The hand-rolled waiter this replaced deadlined on `Date.now()`,
// which the runner freezes at 0 — so its timeout never fired and a condition
// that never came hung until Jasmine's 120s ceiling instead of failing with
// the reason.
const waitFor = (predicate, description) => conditionPromise(predicate, description);

describe("tree-view-favourite", () => {
  let workspaceElement, mainModule, store, treeView;
  let projectDir, fileA, fileB, folder, folderFile;

  // Everything here runs against the real tree-view: the mocked service this
  // suite used to build could not have caught a single one of the contract
  // changes it was meant to pin.
  beforeEach(async () => {
    workspaceElement = lumine.views.getView(lumine.workspace);
    jasmine.attachToDOM(workspaceElement);

    projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tree-view-favourite-")));
    fileA = path.join(projectDir, "a.js");
    fileB = path.join(projectDir, "b.txt");
    folder = path.join(projectDir, "folder");
    folderFile = path.join(folder, "inner.js");
    fs.writeFileSync(fileA, "a");
    fs.writeFileSync(fileB, "b");
    fs.mkdirSync(folder);
    fs.writeFileSync(folderFile, "inner");
    lumine.project.setPaths([projectDir]);

    const treeViewPackage = await lumine.packages.activatePackage("tree-view");
    ({ mainModule } = await lumine.packages.activatePackage("tree-view-favourite"));
    treeView = treeViewPackage.mainModule.getTreeViewInstance();

    // Both packages survive across specs, so reset what they accumulated.
    store = mainModule.store;
    fs.writeFileSync(store.filePath, "{}\n");
    store.load();
    mainModule.syncRoots();
  });

  afterEach(async () => {
    fs.writeFileSync(store.filePath, "{}\n");
    store.load();
    mainModule.syncRoots();
    // Drop the project before the directory. The tree view rebuilds its roots on a debounced
    // onDidChangePaths, and the spec runner freezes setTimeout, so the
    // debounce never fires here — do the rebuild by hand.
    lumine.project.setPaths([]);
    treeView.updateRoots();
    await lumine.fileWatchClient.settlePendingTeardown();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  function section(groupName = "Favourite") {
    return treeView.specialRoots.find((candidate) => candidate.config.name === groupName);
  }

  function pin(entryPath, groupName = "Favourite") {
    store.addEntry(groupName, entryPath);
    store.save();
    mainModule.syncRoots();
  }

  it("registers its commands", () => {
    const workspaceCommands = lumine.commands
      .findCommands({ target: workspaceElement })
      .map((command) => command.name);
    expect(workspaceCommands).toContain("tree-view-favourite:edit");
    expect(workspaceCommands).toContain("tree-view-favourite:toggle");

    const treeCommands = lumine.commands
      .findCommands({ target: treeView.element })
      .map((command) => command.name);
    expect(treeCommands).toContain("tree-view-favourite:add");
    expect(treeCommands).toContain("tree-view-favourite:remove");
    expect(treeCommands).toContain("tree-view-favourite:reveal");
  });

  describe("the favourite store", () => {
    for (const name of ["constructor", "toString", "__proto__"]) {
      it(`adds, persists, reloads and removes the literal group ${name}`, () => {
        expect(store.getFilteredEntries(name)).toEqual([]);
        expect(store.removeEntry(name, fileA)).toBe(false);
        expect(store.addEntry(name, fileA)).toBe(true);
        expect(store.addEntry(name, fileA)).toBe(false);
        expect(store.findGroupForPath(fileA)).toBe(name);
        expect(store.getFilteredEntries(name)).toEqual([fileA]);
        store.save();

        const data = JSON.parse(fs.readFileSync(store.filePath, "utf8"));
        expect(Object.hasOwn(data, name)).toBe(true);
        expect(data[name]).toEqual([fileA]);
        store.load();
        expect(Object.getPrototypeOf(store.groups)).toBeNull();
        expect(store.getGroupNames()).toEqual([name]);
        expect(store.groups[name]).toEqual([fileA]);
        expect(store.removeEntry(name, fileA)).toBe(true);
        expect(store.removeEntry(name, fileA)).toBe(false);
        store.save();
        store.load();
        expect(store.getGroupNames()).toEqual([]);
      });
    }

    it("loads prototype-named groups from the file without changing the dictionary prototype", () => {
      fs.writeFileSync(
        store.filePath,
        JSON.stringify({
          ["__proto__"]: [fileA],
          constructor: [fileB],
          toString: [folder],
        }),
      );
      store.load();

      expect(Object.getPrototypeOf(store.groups)).toBeNull();
      expect(store.getGroupNames()).toEqual(["__proto__", "constructor", "toString"]);
      expect(store.groups.__proto__).toEqual([fileA]);
      expect(store.findGroupForPath(fileA)).toBe("__proto__");
      expect(store.findGroupForPath(fileB)).toBe("constructor");
      expect(store.findGroupForPath(folder)).toBe("toString");
      store.save();
      expect(Object.keys(JSON.parse(fs.readFileSync(store.filePath, "utf8")))).toEqual([
        "__proto__",
        "constructor",
        "toString",
      ]);
    });

    it("persists groups to favourite.json in the config directory", () => {
      expect(store.filePath).toBe(path.join(lumine.getConfigDirPath(), "favourite.json"));
      pin(fileA);

      const data = JSON.parse(fs.readFileSync(store.filePath, "utf8"));
      expect(data.Favourite).toEqual([fileA]);
    });

    it("deduplicates entries and deletes empty groups", () => {
      expect(store.addEntry("Favourite", fileA)).toBe(true);
      expect(store.addEntry("Favourite", fileA)).toBe(false);
      expect(store.groups.Favourite).toEqual([fileA]);

      expect(store.removeEntry("Favourite", fileA)).toBe(true);
      expect(store.getGroupNames()).toEqual([]);
    });

    it("filters entries to the current project paths", () => {
      const foreign = path.join(os.tmpdir(), "unrelated", "x.js");
      store.addEntry("Favourite", fileA);
      store.addEntry("Favourite", foreign);

      expect(store.getFilteredEntries("Favourite")).toEqual([fileA]);
    });

    it("keeps what it has when the file is mid-edit rather than reading it as empty", () => {
      spyOn(lumine.notifications, "addWarning");
      store.addEntry("Favourite", fileA);
      spyOn(store, "contentsOnDisk").and.returnValue('{ "Favourite": [');

      store.load();

      expect(store.groups.Favourite).toEqual([fileA]);
      expect(lumine.notifications.addWarning).toHaveBeenCalled();
    });

    it("gives two groups that kebab alike distinct class names", () => {
      pin(fileA, "Configs");
      pin(fileB, "configs!");

      const classNames = Array.from(mainModule.classNames.values());
      expect(classNames).toEqual(["configs", "configs-2"]);
    });
  });

  describe("the tree-view.roots integration", () => {
    it("uses a prototype-named default group and removes its rendered section", () => {
      lumine.config.set("tree-view-favourite.defaultGroup", "__proto__");
      mainModule.addPaths([fileA]);
      expect(section("__proto__").entries[0].getPath()).toBe(fileA);
      expect(mainModule.rootHandles.has("__proto__")).toBe(true);

      mainModule.removePaths([fileA]);
      expect(mainModule.rootHandles.has("__proto__")).toBe(false);
      expect(section("__proto__")).toBeUndefined();
      expect(JSON.parse(fs.readFileSync(store.filePath, "utf8"))).toEqual({});
    });

    it("registers a section for each group and renders its rows", () => {
      pin(fileA);

      const rows = section().element.querySelectorAll(".tree-view-special-entry");
      expect(rows.length).toBe(1);
      expect(rows[0].getPath()).toBe(fileA);
      expect(rows[0]).toHaveClass("favourite-entry");
    });

    it("expands a pinned folder in place", async () => {
      pin(folder);
      const pinned = section().entries[0];
      expect(pinned.kind).toBe("directory");

      await pinned.expand();
      treeView.rebuildVisibleRows();

      const names = pinned.children.map((child) => child.name);
      expect(names).toEqual(["inner.js"]);
      expect(treeView.elementForTreeEntry(pinned.children[0]).parentElement).toBe(
        section().element,
      );
    });

    it("adds the tree-view selection, and never the section header itself", async () => {
      pin(fileA);
      // The path lookup falls back to a loaded ancestor until the directory's
      // asynchronous listing finishes. Select the real file row after expansion.
      await treeView.roots[0].expand();
      const fileEntry = treeView.treeEntryForPath(fileB);
      const header = section().root;
      expect(fileEntry.getPath()).toBe(fileB);
      expect(fileEntry.kind).toBe("file");
      expect(header.specialRoot).toBe(true);
      treeView.selectEntry(fileEntry);
      treeView.selectMultipleEntries(header);
      expect(treeView.getSelectedEntries()).toContain(fileEntry);
      expect(treeView.getSelectedEntries()).toContain(header);
      expect(treeView.selectedPaths()).toEqual([fileB]);

      lumine.commands.dispatch(treeView.element, "tree-view-favourite:add");

      expect(store.groups.Favourite).toEqual([fileA, fileB]);
    });

    it("leaves favourites unchanged when only a section header is selected", () => {
      pin(fileA);
      const header = section().root;
      treeView.selectEntry(header);
      expect(treeView.getSelectedEntries()).toEqual([header]);
      expect(treeView.selectedPaths()).toEqual([]);

      lumine.commands.dispatch(treeView.element, "tree-view-favourite:add");

      expect(store.groups.Favourite).toEqual([fileA]);
    });

    it("unpins rather than deletes when tree-view:remove reaches a pinned row", async () => {
      pin(fileA);
      spyOn(treeView, "hasFocus").and.returnValue(true);
      treeView.selectEntry(section().entries[0]);

      await treeView.removeSelectedEntries();

      expect(store.getGroupNames()).toEqual([]);
      expect(fs.existsSync(fileA)).toBe(true);
    });

    it("pins what is dropped on a section header", () => {
      pin(fileA);

      section().config.onDrop([fileB, folder]);

      expect(store.groups.Favourite).toEqual([fileA, fileB, folder]);
    });

    it("moves a favourite dropped on another group's header", () => {
      pin(fileA);
      pin(fileB, "Extras");

      section("Extras").config.onDrop([fileA]);

      expect(store.groups.Favourite).toBeUndefined();
      expect(store.groups.Extras).toEqual([fileB, fileA]);
    });

    it("falls back to a usable group name when the setting is blank", () => {
      lumine.config.set("tree-view-favourite.defaultGroup", "   ");

      mainModule.addPaths([fileA]);

      expect(store.groups.Favourite).toEqual([fileA]);
      lumine.config.unset("tree-view-favourite.defaultGroup");
    });

    it("removes the selection with tree-view-favourite:remove", () => {
      pin(fileA);
      treeView.selectEntry(section().entries[0]);

      lumine.commands.dispatch(treeView.element, "tree-view-favourite:remove");

      expect(store.getGroupNames()).toEqual([]);
      expect(treeView.specialRoots.length).toBe(0);
    });

    it("reveals the project copy of a pinned path", async () => {
      pin(folder);
      treeView.selectEntry(section().entries[0]);

      await lumine.commands.dispatch(treeView.element, "tree-view-favourite:reveal");
      await waitFor(
        () => treeView.selectedEntry()?.section == null,
        "the selection to leave the section",
      );

      expect(treeView.selectedEntry().getPath()).toBe(folder);
      expect(treeView.selectedEntry().section).toBeNull();
    });

    it("toggles section visibility with tree-view-favourite:toggle", () => {
      pin(fileA);
      expect(section().element.hidden).toBe(false);

      lumine.commands.dispatch(workspaceElement, "tree-view-favourite:toggle");
      expect(section().element.hidden).toBe(true);

      lumine.commands.dispatch(workspaceElement, "tree-view-favourite:toggle");
      expect(section().element.hidden).toBe(false);
    });

    it("drops the section when the group vanishes from the store", () => {
      pin(fileA);
      pin(fileB, "Extras");
      expect(Array.from(mainModule.rootHandles.keys()).sort()).toEqual(["Extras", "Favourite"]);
      const extrasElement = section("Extras").element;

      store.removeEntry("Extras", fileB);
      store.save();
      mainModule.syncRoots();

      expect(Array.from(mainModule.rootHandles.keys())).toEqual(["Favourite"]);
      expect(extrasElement.parentElement).toBeNull();
    });
  });

  describe("external edits to the favourite file", () => {
    it("reloads groups when favourite.json changes on disk", async () => {
      await store.file.ready;

      fs.writeFileSync(store.filePath, JSON.stringify({ External: [fileB] }, null, 2));

      await waitFor(
        () => store.getGroupNames().includes("External"),
        "the watcher to report the external edit",
      );
      expect(store.groups.External).toEqual([fileB]);
      await waitFor(() => mainModule.rootHandles.has("External"), "the External section to appear");
    });

    it("ignores the write it just made itself", async () => {
      await store.file.ready;
      spyOn(store, "load").and.callThrough();

      pin(fileA);
      // Give the watcher every chance to fire before concluding it did not.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(store.load).not.toHaveBeenCalled();
    });
  });
});
