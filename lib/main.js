const { CompositeDisposable, Disposable } = require("atom");
const FavouriteStore = require("./favourite-store");

function toKebab(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

module.exports = {
  activate() {
    this.store = new FavouriteStore();
    this.disposables = new CompositeDisposable();
    this.treeView = null;
    this.rootsApi = null;
    this.rootHandles = new Map();

    this.disposables.add(
      atom.commands.add(".tree-view", {
        "tree-view-favourites:add": () => this.addSelected(),
        "tree-view-favourites:remove": () => this.removeSelected(),
      }),
      atom.commands.add("atom-workspace", {
        "tree-view-favourites:edit": () => atom.workspace.open(this.store.filePath),
        "tree-view-favourites:toggle": () => {
          for (const handle of this.rootHandles.values()) {
            handle.toggle();
          }
        },
      }),
    );

    this.disposables.add(atom.project.onDidChangePaths(() => this.syncRoots()));

    this.disposables.add(this.store.onDidChange(() => this.syncRoots()));
  },

  deactivate() {
    for (const handle of this.rootHandles.values()) {
      handle.dispose();
    }
    this.rootHandles.clear();
    this.rootsApi = null;
    this.disposables.dispose();
    this.store.destroy();
  },

  consumeRoots(api) {
    this.rootsApi = api;
    this.syncRoots();
    return new Disposable(() => {
      for (const handle of this.rootHandles.values()) {
        handle.dispose();
      }
      this.rootHandles.clear();
      this.rootsApi = null;
    });
  },

  consumeTreeView(treeView) {
    this.treeView = treeView;
    return new Disposable(() => {
      this.treeView = null;
    });
  },

  syncRoots() {
    if (!this.rootsApi) return;

    const groupNames = this.store.getGroupNames();
    const currentNames = Array.from(this.rootHandles.keys());

    // Remove handles for groups that no longer exist
    for (const name of currentNames) {
      if (!groupNames.includes(name)) {
        this.rootHandles.get(name).dispose();
        this.rootHandles.delete(name);
      }
    }

    // Add handles for new groups, update existing
    for (const name of groupNames) {
      const handle = this.rootHandles.get(name);
      if (handle) {
        handle.update();
      } else {
        const kebab = toKebab(name);
        this.rootHandles.set(
          name,
          this.rootsApi.registerRoot({
            name,
            iconClass: "icon-star",
            className: `${kebab}-section`,
            entryClassName: `${kebab}-entry`,
            getEntries: () => this.store.getFilteredEntries(name),
          }),
        );
      }
    }
  },

  addSelected() {
    if (!this.treeView) return;
    const paths = this.treeView.selectedPaths();
    for (const p of paths) {
      this.store.addEntry("Favourites", p);
    }
    this.syncRoots();
  },

  groupForEntry(entry) {
    const section = entry.closest(".tree-view-special");
    if (!section) return null;
    for (const [name, handle] of this.rootHandles.entries()) {
      if (handle.element === section) return name;
    }
    return null;
  },

  removeSelected() {
    const entries = document.querySelectorAll(".tree-view .tree-view-special .selected");
    for (const entry of entries) {
      const p = entry.getPath?.();
      const group = this.groupForEntry(entry);
      if (p && group) this.store.removeEntry(group, p);
    }
    this.syncRoots();
  },
};
