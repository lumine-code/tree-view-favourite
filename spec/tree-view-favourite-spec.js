const fs = require("fs");
const os = require("os");
const path = require("path");

// The spec runner freezes `setTimeout`, so poll on animation frames instead.
function waitFor(predicate, timeout = 4000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      let value;
      try {
        value = predicate();
      } catch (error) {
        reject(error);
        return;
      }
      if (value) {
        resolve(value);
      } else if (Date.now() - start > timeout) {
        reject(new Error("Timed out waiting for condition"));
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  });
}

describe("tree-view-favourite", () => {
  let workspaceElement, mainModule, store, treeView;
  let projectDir, fileA, fileB, folder, folderFile;

  // Everything here runs against the real tree-view: the mocked service this
  // suite used to build could not have caught a single one of the contract
  // changes it was meant to pin.
  beforeEach(async () => {
    workspaceElement = atom.views.getView(atom.workspace);
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
    atom.project.setPaths([projectDir]);

    const treeViewPackage = await atom.packages.activatePackage("tree-view");
    ({ mainModule } = await atom.packages.activatePackage("tree-view-favourite"));
    treeView = treeViewPackage.mainModule.getTreeViewInstance();

    // Both packages survive across specs, so reset what they accumulated.
    store = mainModule.store;
    store.groups = {};
    store.save();
    mainModule.syncRoots();
  });

  afterEach(async () => {
    store.groups = {};
    store.save();
    mainModule.syncRoots();
    // Drop the project before the directory: the tree view holds an fs.watch
    // on every folder it expanded, and Windows refuses to remove a directory
    // underneath one. The tree view rebuilds its roots on a debounced
    // onDidChangePaths, and the spec runner freezes setTimeout, so the
    // debounce never fires here — do the rebuild by hand.
    atom.project.setPaths([]);
    treeView.updateRoots();
    // Retries because Windows keeps a directory non-empty until the last handle on a child
    // closes, and `force` swallows only ENOENT.
    fs.rmSync(projectDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  function section(groupName = "Favourites") {
    return treeView.specialRoots.find((candidate) => candidate.config.name === groupName);
  }

  function pin(entryPath, groupName = "Favourites") {
    store.addEntry(groupName, entryPath);
    store.save();
    mainModule.syncRoots();
  }

  it("registers its commands", () => {
    const workspaceCommands = atom.commands
      .findCommands({ target: workspaceElement })
      .map((command) => command.name);
    expect(workspaceCommands).toContain("tree-view-favourite:edit");
    expect(workspaceCommands).toContain("tree-view-favourite:toggle");

    const treeCommands = atom.commands
      .findCommands({ target: treeView.element })
      .map((command) => command.name);
    expect(treeCommands).toContain("tree-view-favourite:add");
    expect(treeCommands).toContain("tree-view-favourite:remove");
    expect(treeCommands).toContain("tree-view-favourite:reveal");
  });

  describe("the favourite store", () => {
    it("persists groups to favourite.json in the config directory", () => {
      expect(store.filePath).toBe(path.join(atom.getConfigDirPath(), "favourite.json"));
      pin(fileA);

      const data = JSON.parse(fs.readFileSync(store.filePath, "utf8"));
      expect(data.Favourites).toEqual([fileA]);
    });

    it("deduplicates entries and deletes empty groups", () => {
      expect(store.addEntry("Favourites", fileA)).toBe(true);
      expect(store.addEntry("Favourites", fileA)).toBe(false);
      expect(store.groups.Favourites).toEqual([fileA]);

      expect(store.removeEntry("Favourites", fileA)).toBe(true);
      expect(store.getGroupNames()).toEqual([]);
    });

    it("filters entries to the current project paths", () => {
      const foreign = path.join(os.tmpdir(), "unrelated", "x.js");
      store.addEntry("Favourites", fileA);
      store.addEntry("Favourites", foreign);

      expect(store.getFilteredEntries("Favourites")).toEqual([fileA]);
    });

    it("keeps what it has when the file is mid-edit rather than reading it as empty", () => {
      spyOn(atom.notifications, "addWarning");
      store.addEntry("Favourites", fileA);
      spyOn(store, "contentsOnDisk").and.returnValue('{ "Favourites": [');

      store.load();

      expect(store.groups.Favourites).toEqual([fileA]);
      expect(atom.notifications.addWarning).toHaveBeenCalled();
    });

    it("gives two groups that kebab alike distinct class names", () => {
      pin(fileA, "Configs");
      pin(fileB, "configs!");

      const classNames = Array.from(mainModule.classNames.values());
      expect(classNames).toEqual(["configs", "configs-2"]);
    });
  });

  describe("the tree-view.roots integration", () => {
    it("registers a section for each group and renders its rows", () => {
      pin(fileA);

      const rows = section().element.querySelectorAll(".tree-view-special-entry");
      expect(rows.length).toBe(1);
      expect(rows[0].getPath()).toBe(fileA);
      expect(rows[0]).toHaveClass("favourites-entry");
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

    it("adds the tree-view selection, and never the section header itself", () => {
      pin(fileA);
      treeView.selectEntry(treeView.treeEntryForPath(fileB));
      treeView.selectMultipleEntries(section().root);

      atom.commands.dispatch(treeView.element, "tree-view-favourite:add");

      expect(store.groups.Favourites).toEqual([fileA, fileB]);
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

      expect(store.groups.Favourites).toEqual([fileA, fileB, folder]);
    });

    it("moves a favourite dropped on another group's header", () => {
      pin(fileA);
      pin(fileB, "Extras");

      section("Extras").config.onDrop([fileA]);

      expect(store.groups.Favourites).toBeUndefined();
      expect(store.groups.Extras).toEqual([fileB, fileA]);
    });

    it("falls back to a usable group name when the setting is blank", () => {
      atom.config.set("tree-view-favourite.defaultGroup", "   ");

      mainModule.addPaths([fileA]);

      expect(store.groups.Favourites).toEqual([fileA]);
      atom.config.unset("tree-view-favourite.defaultGroup");
    });

    it("removes the selection with tree-view-favourite:remove", () => {
      pin(fileA);
      treeView.selectEntry(section().entries[0]);

      atom.commands.dispatch(treeView.element, "tree-view-favourite:remove");

      expect(store.getGroupNames()).toEqual([]);
      expect(treeView.specialRoots.length).toBe(0);
    });

    it("reveals the project copy of a pinned path", async () => {
      pin(folder);
      treeView.selectEntry(section().entries[0]);

      await atom.commands.dispatch(treeView.element, "tree-view-favourite:reveal");
      await waitFor(() => treeView.selectedEntry()?.section == null);

      expect(treeView.selectedEntry().getPath()).toBe(folder);
      expect(treeView.selectedEntry().section).toBeNull();
    });

    it("toggles section visibility with tree-view-favourite:toggle", () => {
      pin(fileA);
      expect(section().element.hidden).toBe(false);

      atom.commands.dispatch(workspaceElement, "tree-view-favourite:toggle");
      expect(section().element.hidden).toBe(true);

      atom.commands.dispatch(workspaceElement, "tree-view-favourite:toggle");
      expect(section().element.hidden).toBe(false);
    });

    it("drops the section when the group vanishes from the store", () => {
      pin(fileA);
      pin(fileB, "Extras");
      expect(Array.from(mainModule.rootHandles.keys()).sort()).toEqual(["Extras", "Favourites"]);
      const extrasElement = section("Extras").element;

      store.removeEntry("Extras", fileB);
      store.save();
      mainModule.syncRoots();

      expect(Array.from(mainModule.rootHandles.keys())).toEqual(["Favourites"]);
      expect(extrasElement.parentElement).toBeNull();
    });
  });

  describe("external edits to the favourite file", () => {
    it("reloads groups when favourite.json changes on disk", async () => {
      await store.file.getStartPromise();

      fs.writeFileSync(store.filePath, JSON.stringify({ External: [fileB] }, null, 2));

      await waitFor(() => store.getGroupNames().includes("External"));
      expect(store.groups.External).toEqual([fileB]);
      await waitFor(() => mainModule.rootHandles.has("External"));
    });

    it("ignores the write it just made itself", async () => {
      await store.file.getStartPromise();
      spyOn(store, "load").and.callThrough();

      pin(fileA);
      // Give the watcher every chance to fire before concluding it did not.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(store.load).not.toHaveBeenCalled();
    });
  });
});
