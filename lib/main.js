const { CompositeDisposable, Disposable } = require("lumine");
const FavouriteStore = require("./favourite-store");

// A section header is a label, not a path — the tree view gives it a synthetic
// URI so it can still be addressed like a row.
const SYNTHETIC_PREFIX = "special-root://";

// The class has to be a usable CSS identifier and has to stay distinct: two
// groups named "Configs" and "configs!" both kebab down to `configs`, and a
// group starting with a digit yields a class no selector can name unescaped.
function toClassName(groupName, taken) {
  let base = groupName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base === "" || /^[0-9]/.test(base)) base = `group-${base}`;
  let candidate = base;
  for (let suffix = 2; taken.has(candidate); suffix++) candidate = `${base}-${suffix}`;
  return candidate;
}

module.exports = {
  activate() {
    this.store = new FavouriteStore();
    this.disposables = new CompositeDisposable();
    this.treeView = null;
    this.rootsApi = null;
    this.rootHandles = new Map();
    this.classNames = new Map();

    this.disposables.add(
      lumine.commands.add(".tree-view", {
        "tree-view-favourite:add": () => this.addSelected(),
        "tree-view-favourite:remove": () => this.removeSelected(),
        "tree-view-favourite:reveal": () => this.revealSelected(),
      }),
      lumine.commands.add("lumine-workspace", {
        "tree-view-favourite:edit": () => lumine.workspace.open(this.store.filePath),
        "tree-view-favourite:toggle": () => {
          for (const handle of this.rootHandles.values()) handle.toggle();
        },
      }),
      lumine.project.onDidChangePaths(() => this.syncRoots()),
      this.store.onDidChange(() => this.syncRoots()),
    );
  },

  deactivate() {
    this.disposeHandles();
    this.rootsApi = null;
    this.treeView = null;
    this.disposables.dispose();
    this.store.destroy();
  },

  disposeHandles() {
    for (const handle of this.rootHandles.values()) handle.dispose();
    this.rootHandles.clear();
    this.classNames.clear();
  },

  consumeTreeViewRoots(api) {
    this.rootsApi = api;
    this.syncRoots();
    return new Disposable(() => {
      this.disposeHandles();
      this.rootsApi = null;
    });
  },

  consumeTreeViewSelection(treeView) {
    this.treeView = treeView;
    return new Disposable(() => {
      this.treeView = null;
    });
  },

  syncRoots() {
    if (!this.rootsApi) return;

    const groupNames = this.store.getGroupNames();

    for (const name of Array.from(this.rootHandles.keys())) {
      if (groupNames.includes(name)) continue;
      this.rootHandles.get(name).dispose();
      this.rootHandles.delete(name);
      this.classNames.delete(name);
    }

    for (const name of groupNames) {
      const handle = this.rootHandles.get(name);
      if (handle) {
        handle.update();
        continue;
      }
      const className = toClassName(name, new Set(this.classNames.values()));
      this.classNames.set(name, className);
      this.rootHandles.set(
        name,
        this.rootsApi.registerRoot({
          name,
          iconClass: "icon-star",
          className: `${className}-section`,
          entryClassName: `${className}-entry`,
          getEntries: () => this.store.getFilteredEntries(name),
          onDrop: (paths) => this.addPaths(paths, name),
          onRemove: (paths) => this.removePaths(paths),
        }),
      );
    }
  },

  defaultGroup() {
    const configured = lumine.config.get("tree-view-favourite.defaultGroup");
    return typeof configured === "string" && configured.trim() !== "" ? configured : "Favourite";
  },

  // Only a path is worth pinning: the tree view's own selection can hold a
  // section header, whose path is a label the tree made up.
  addPaths(paths, groupName = this.defaultGroup()) {
    let changed = false;
    for (const entryPath of paths) {
      if (!entryPath || entryPath.startsWith(SYNTHETIC_PREFIX)) continue;
      // A path belongs to one group, so dropping it on another group's header
      // moves it there rather than doing nothing.
      const current = this.store.findGroupForPath(entryPath);
      if (current === groupName) continue;
      if (current) this.store.removeEntry(current, entryPath);
      if (this.store.addEntry(groupName, entryPath)) changed = true;
    }
    if (!changed) return;
    this.store.save();
    this.syncRoots();
  },

  removePaths(paths) {
    let changed = false;
    for (const entryPath of paths) {
      const group = this.store.findGroupForPath(entryPath);
      if (group && this.store.removeEntry(group, entryPath)) changed = true;
    }
    if (!changed) return;
    this.store.save();
    this.syncRoots();
  },

  selectedPaths() {
    return this.treeView?.selectedPaths() ?? [];
  },

  addSelected() {
    this.addPaths(this.selectedPaths());
  },

  removeSelected() {
    this.removePaths(this.selectedPaths());
  },

  // Clicking a pinned folder expands it in place, so this is how you get from a
  // favourite back to where it actually lives.
  revealSelected() {
    const [entryPath] = this.selectedPaths();
    if (!entryPath || entryPath.startsWith(SYNTHETIC_PREFIX)) return;
    return this.treeView?.revealPath(entryPath);
  },
};
