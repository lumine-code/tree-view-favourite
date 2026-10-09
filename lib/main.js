const { CompositeDisposable, Disposable } = require("lumine");
const FavouriteStore = require("./favourite-store");

// A section header is a label, not a path — the tree view gives it a synthetic
// URI so it can still be addressed like a row.
const SYNTHETIC_PREFIX = "special-root://";

function connectTreeService(main, owner, kind, api) {
  if (!owner || owner.retired || main.activation !== owner) return new Disposable();
  const connections = owner[kind];
  const edges = owner[`${kind}Edges`];
  let connection = connections.get(api);
  if (!connection) connection = { api, references: 0 };
  connections.set(api, connection);
  connection.references++;
  const edge = { connection };
  edges.add(edge);
  const lease = new Disposable(() => {
    owner.disposables.remove(lease);
    if (owner.retired || main.activation !== owner) return;
    edges.delete(edge);
    if (--connection.references === 0) connections.delete(api);
    main.updateTreeServices(owner);
  });
  owner.disposables.add(lease);
  main.updateTreeServices(owner);
  return lease;
}

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
  provideBackgroundTips() {
    return {
      packageName: "tree-view-favourite",
      tips: [
        "{% if keys['tree-view-favourite:toggle'] %}You can show or hide your favourite files at the top of the tree view with {{ 'tree-view-favourite:toggle' | keystroke }}{% else %}You can pin the files and folders you use most into favourite sections at the top of the tree view.{% endif %}",
        "You can drop files onto a favourite section's header to pin them, and browse a pinned folder in place.",
      ],
    };
  },

  activate() {
    this.store = new FavouriteStore();
    this.disposables = new CompositeDisposable();
    this.treeView = null;
    this.rootsApi = null;
    this.rootHandles = new Map();
    this.classNames = new Map();
    const owner = {
      roots: new Map(),
      selection: new Map(),
      rootsEdges: new Set(),
      selectionEdges: new Set(),
      disposables: this.disposables,
      store: this.store,
      retired: false,
      bindingRoots: false,
      currentRoots: null,
    };
    this.activation = owner;
    this.consumeTreeViewRoots = (api) => connectTreeService(this, owner, "roots", api);
    this.consumeTreeViewSelection = (api) => connectTreeService(this, owner, "selection", api);

    this.disposables.add(
      lumine.commands.add(".tree-view", {
        "tree-view-favourite:add": {
          description: "Add the selected entry to the favourites section.",
          didDispatch: () => this.addSelected(),
        },
        "tree-view-favourite:remove": {
          description: "Take the selected entry out of the favourites section.",
          didDispatch: () => this.removeSelected(),
        },
        "tree-view-favourite:reveal": {
          description: "Expand the tree to where the selected favourite really lives.",
          didDispatch: () => this.revealSelected(),
        },
      }),
      lumine.commands.add("lumine-workspace", {
        "tree-view-favourite:edit": {
          description: "Open the file that stores the favourites list.",
          didDispatch: () => lumine.workspace.open(this.store.filePath),
        },
        "tree-view-favourite:toggle": () => {
          for (const handle of this.rootHandles.values()) handle.toggle();
        },
      }),
      lumine.project.onDidChangePaths(() => this.syncRoots()),
      this.store.onDidChange(() => this.syncRoots()),
    );
  },

  deactivate() {
    const owner = this.activation;
    if (!owner) return;
    owner.retired = true;
    this.activation = null;
    const handles = this.rootHandles;
    this.rootHandles = new Map();
    this.classNames = new Map();
    this.rootsApi = null;
    this.treeView = null;
    owner.roots.clear();
    owner.selection.clear();
    owner.rootsEdges.clear();
    owner.selectionEdges.clear();
    try {
      for (const handle of handles.values()) handle.dispose();
    } finally {
      owner.disposables.dispose();
      owner.store.destroy();
    }
  },

  disposeHandles() {
    for (const handle of this.rootHandles.values()) handle.dispose();
    this.rootHandles.clear();
    this.classNames.clear();
  },

  consumeTreeViewRoots() {
    return new Disposable();
  },

  consumeTreeViewSelection() {
    return new Disposable();
  },

  updateTreeServices(owner) {
    if (owner.retired || this.activation !== owner) return;
    this.treeView = [...owner.selectionEdges].at(-1)?.connection.api ?? null;
    if (owner.bindingRoots) return;
    owner.bindingRoots = true;
    try {
      while (!owner.retired && this.activation === owner) {
        const connection = [...owner.rootsEdges].at(-1)?.connection ?? null;
        if (owner.currentRoots === connection) break;
        owner.currentRoots = connection;
        const handles = this.rootHandles;
        this.rootHandles = new Map();
        this.classNames = new Map();
        this.rootsApi = connection?.api ?? null;
        for (const handle of handles.values()) handle.dispose();
        if (owner.retired || this.activation !== owner) break;
        if (([...owner.rootsEdges].at(-1)?.connection ?? null) === connection) this.syncRoots();
      }
    } finally {
      owner.bindingRoots = false;
    }
  },

  syncRoots() {
    const owner = this.activation;
    const api = this.rootsApi;
    const handles = this.rootHandles;
    const classNames = this.classNames;
    const isCurrent = () =>
      owner && !owner.retired && this.activation === owner && this.rootHandles === handles;
    if (!api || !isCurrent()) return;

    const groupNames = this.store.getGroupNames();

    for (const name of Array.from(handles.keys())) {
      if (!isCurrent()) return;
      if (groupNames.includes(name)) continue;
      const handle = handles.get(name);
      handles.delete(name);
      classNames.delete(name);
      handle.dispose();
    }

    for (const name of groupNames) {
      if (!isCurrent()) return;
      const handle = handles.get(name);
      if (handle) {
        handle.update();
        continue;
      }
      const className = toClassName(name, new Set(classNames.values()));
      const registered = api.registerRoot({
        name,
        iconClass: "icon-star",
        className: `${className}-section`,
        entryClassName: `${className}-entry`,
        getEntries: () => owner.store.getFilteredEntries(name),
        onDrop: (paths) => {
          if (isCurrent()) this.addPaths(paths, name);
        },
        onRemove: (paths) => {
          if (isCurrent()) this.removePaths(paths);
        },
      });
      if (!isCurrent()) {
        registered.dispose();
        return;
      }
      classNames.set(name, className);
      handles.set(name, registered);
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
