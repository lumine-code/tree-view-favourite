const path = require("path");
const fs = require("fs");
const { Emitter, CompositeDisposable, Disposable, watchFile } = require("atom");

function pathKey(filePath) {
  const normalized = path.normalize(filePath);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isPathInProject(entryPath, projectPath) {
  const entry = pathKey(entryPath);
  const project = pathKey(projectPath);
  const projectWithSeparator = project.endsWith(path.sep) ? project : project + path.sep;

  return entry === project || entry.startsWith(projectWithSeparator);
}

function isSamePath(leftPath, rightPath) {
  return pathKey(leftPath) === pathKey(rightPath);
}

module.exports = class FavouriteStore {
  constructor() {
    this.emitter = new Emitter();
    this.disposables = new CompositeDisposable();
    this.groups = {};

    this.filePath = path.join(atom.getConfigDirPath(), "favourites.json");

    this.load();

    // The synchronous atom `File` was removed from Lumine; `watchFile` is the
    // async replacement. It owns a native watcher that must be disposed —
    // hence the extra Disposable (the event subscriptions alone do not stop
    // it). Watching a missing path is unreliable, so make sure the file
    // exists before arming the watcher.
    if (!fs.existsSync(this.filePath)) {
      try {
        fs.writeFileSync(this.filePath, "{}\n");
      } catch {
        /* the watcher just won't arm; favourites still work in-memory */
      }
    }
    this.file = watchFile(this.filePath);
    this.disposables.add(
      new Disposable(() => this.file.dispose()),
      this.file.onDidChange(() => {
        this.load();
        this.emitter.emit("did-change");
      }),
    );
  }

  destroy() {
    this.disposables.dispose();
    this.emitter.dispose();
  }

  onDidChange(callback) {
    return this.emitter.on("did-change", callback);
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.groups = {};
        return;
      }
      const content = fs.readFileSync(this.filePath, "utf8").trim();
      if (!content) {
        this.groups = {};
        return;
      }
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        // Migrate flat array to grouped format
        this.groups = data.length > 0 ? { Favourites: data } : {};
        this.save();
      } else if (data && typeof data === "object") {
        this.groups = data;
      } else {
        this.groups = {};
      }
    } catch (err) {
      console.warn("[tree-view-favourites] Failed to load favourites:", err);
      this.groups = {};
    }
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.groups, null, 2) + "\n");
    } catch (err) {
      console.warn("[tree-view-favourites] Failed to save favourites:", err);
    }
  }

  getGroupNames() {
    return Object.keys(this.groups);
  }

  addEntry(groupName, filePath) {
    if (!this.groups[groupName]) {
      this.groups[groupName] = [];
    }
    if (this.groups[groupName].some((entry) => isSamePath(entry, filePath))) return;
    this.groups[groupName].push(filePath);
    this.save();
  }

  removeEntry(groupName, filePath) {
    const group = this.groups[groupName];
    if (!group) return;
    const index = group.findIndex((entry) => isSamePath(entry, filePath));
    if (index === -1) return;
    group.splice(index, 1);
    if (group.length === 0) {
      delete this.groups[groupName];
    }
    this.save();
  }

  findGroupForPath(filePath) {
    for (const groupName of this.getGroupNames()) {
      if (this.groups[groupName].some((entry) => isSamePath(entry, filePath))) {
        return groupName;
      }
    }
    return null;
  }

  getFilteredEntries(groupName) {
    const group = this.groups[groupName];
    if (!group) return [];
    const projectPaths = atom.project.getPaths();
    if (projectPaths.length === 0) return [];
    return group.filter((entry) => projectPaths.some((pp) => isPathInProject(entry, pp)));
  }
};
