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

// A stand-in for the tree-view package's `tree-view.roots` service that mimics
// the shape of its registerRoot handles and special-root DOM.
function createFakeRootsApi(container) {
  return {
    registerRoot(config) {
      const element = document.createElement("ol");
      element.classList.add(config.className, "tree-view-special");
      container.appendChild(element);
      const render = () => {
        element.innerHTML = "";
        for (const entryPath of config.getEntries()) {
          const li = document.createElement("li");
          li.classList.add(config.entryClassName, "tree-view-special-entry", "entry");
          li.getPath = () => entryPath;
          element.appendChild(li);
        }
      };
      render();
      return {
        element,
        visible: true,
        update: render,
        toggle() {
          this.visible = !this.visible;
          element.style.display = this.visible ? "" : "none";
        },
        dispose() {
          element.remove();
        },
      };
    },
  };
}

describe("tree-view-favourites", () => {
  let workspaceElement, mainModule, treeViewElement, projectDir, fileA, fileB;

  beforeEach(async () => {
    workspaceElement = atom.views.getView(atom.workspace);
    jasmine.attachToDOM(workspaceElement);

    projectDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "tree-view-favourites-spec-")),
    );
    fileA = path.join(projectDir, "a.js");
    fileB = path.join(projectDir, "b.txt");
    fs.writeFileSync(fileA, "a");
    fs.writeFileSync(fileB, "b");
    atom.project.setPaths([projectDir]);

    ({ mainModule } = await atom.packages.activatePackage("tree-view-favourites"));

    // The package (and its store) survives across specs, so reset its state.
    for (const handle of mainModule.rootHandles.values()) handle.dispose();
    mainModule.rootHandles.clear();
    mainModule.store.groups = {};
    mainModule.store.save();

    treeViewElement = document.createElement("div");
    treeViewElement.classList.add("tree-view");
    workspaceElement.appendChild(treeViewElement);
    mainModule.consumeTreeViewRoots(createFakeRootsApi(treeViewElement));
  });

  afterEach(() => {
    // Retries because Windows keeps a directory non-empty until the last handle on a child
    // closes, and `force` swallows only ENOENT.
    fs.rmSync(projectDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  it("registers its commands", () => {
    const workspaceCommands = atom.commands
      .findCommands({ target: workspaceElement })
      .map((command) => command.name);
    expect(workspaceCommands).toContain("tree-view-favourites:edit");
    expect(workspaceCommands).toContain("tree-view-favourites:toggle");

    const treeCommands = atom.commands
      .findCommands({ target: treeViewElement })
      .map((command) => command.name);
    expect(treeCommands).toContain("tree-view-favourites:add");
    expect(treeCommands).toContain("tree-view-favourites:remove");
  });

  describe("the favourite store", () => {
    it("persists groups to favourites.json in the config directory", () => {
      const store = mainModule.store;
      expect(store.filePath).toBe(path.join(atom.getConfigDirPath(), "favourites.json"));
      store.addEntry("Favourites", fileA);

      const data = JSON.parse(fs.readFileSync(store.filePath, "utf8"));
      expect(data.Favourites).toEqual([fileA]);
    });

    it("deduplicates entries and deletes empty groups", () => {
      const store = mainModule.store;
      store.addEntry("Favourites", fileA);
      store.addEntry("Favourites", fileA);
      expect(store.groups.Favourites).toEqual([fileA]);

      store.removeEntry("Favourites", fileA);
      expect(store.getGroupNames()).toEqual([]);
    });

    it("filters entries to the current project paths", () => {
      const store = mainModule.store;
      const foreign = path.join(os.tmpdir(), "unrelated", "x.js");
      store.addEntry("Favourites", fileA);
      store.addEntry("Favourites", foreign);

      expect(store.getFilteredEntries("Favourites")).toEqual([fileA]);
    });
  });

  describe("the tree-view.roots integration", () => {
    it("registers a section for each group and renders its entries", () => {
      mainModule.store.addEntry("Favourites", fileA);
      mainModule.syncRoots();

      const handle = mainModule.rootHandles.get("Favourites");
      expect(handle).toBeDefined();
      const entry = handle.element.querySelector(".tree-view-special-entry");
      expect(entry).not.toBeNull();
      expect(entry.getPath()).toBe(fileA);
    });

    it("adds the tree-view selection through the consumed tree-view service", () => {
      mainModule.consumeTreeViewSelection({ selectedPaths: () => [fileA, fileB] });
      mainModule.addSelected();

      expect(mainModule.store.groups.Favourites).toEqual([fileA, fileB]);
      const handle = mainModule.rootHandles.get("Favourites");
      expect(handle.element.querySelectorAll(".tree-view-special-entry").length).toBe(2);
    });

    it("removes selected special entries with tree-view-favourites:remove", () => {
      mainModule.store.addEntry("Favourites", fileA);
      mainModule.syncRoots();

      const handle = mainModule.rootHandles.get("Favourites");
      const entry = handle.element.querySelector(".tree-view-special-entry");
      entry.classList.add("selected");

      mainModule.removeSelected();

      expect(mainModule.store.getGroupNames()).toEqual([]);
      expect(mainModule.rootHandles.size).toBe(0);
    });

    it("toggles section visibility with tree-view-favourites:toggle", () => {
      mainModule.store.addEntry("Favourites", fileA);
      mainModule.syncRoots();
      const handle = mainModule.rootHandles.get("Favourites");
      expect(handle.element.style.display).toBe("");

      atom.commands.dispatch(workspaceElement, "tree-view-favourites:toggle");
      expect(handle.element.style.display).toBe("none");

      atom.commands.dispatch(workspaceElement, "tree-view-favourites:toggle");
      expect(handle.element.style.display).toBe("");
    });

    it("drops the section when the group vanishes from the store", () => {
      mainModule.store.addEntry("Favourites", fileA);
      mainModule.store.addEntry("Extras", fileB);
      mainModule.syncRoots();
      expect(Array.from(mainModule.rootHandles.keys()).sort()).toEqual(["Extras", "Favourites"]);

      const extrasElement = mainModule.rootHandles.get("Extras").element;
      mainModule.store.removeEntry("Extras", fileB);
      mainModule.syncRoots();
      expect(Array.from(mainModule.rootHandles.keys())).toEqual(["Favourites"]);
      expect(extrasElement.parentElement).toBeNull();
    });
  });

  describe("external edits to the favourites file", () => {
    it("reloads groups when favourites.json changes on disk", async () => {
      const store = mainModule.store;
      await store.file.getStartPromise();

      fs.writeFileSync(store.filePath, JSON.stringify({ External: [fileB] }, null, 2));

      await waitFor(() => store.getGroupNames().includes("External"));
      expect(store.groups.External).toEqual([fileB]);
      await waitFor(() => mainModule.rootHandles.has("External"));
    });
  });
});
