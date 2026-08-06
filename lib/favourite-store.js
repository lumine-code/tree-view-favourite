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
  constructor(filePath = path.join(atom.getConfigDirPath(), "favourite.json")) {
    this.emitter = new Emitter();
    this.disposables = new CompositeDisposable();
    this.groups = {};
    this.filePath = filePath;

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
        // Every save trips the watcher. Re-reading what this window just wrote
        // would rebuild the tree rows a second time, so only an edit from
        // somewhere else is worth reloading for.
        if (this.contentsOnDisk() === this.serialize()) return;
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

  contentsOnDisk() {
    try {
      return fs.readFileSync(this.filePath, "utf8");
    } catch {
      return null;
    }
  }

  serialize() {
    return JSON.stringify(this.groups, null, 2) + "\n";
  }

  load() {
    const content = this.contentsOnDisk()?.trim();
    if (!content) {
      this.groups = {};
      return;
    }
    let data;
    try {
      data = JSON.parse(content);
    } catch (error) {
      // Keep what is already loaded: an editor saving a half-typed file must
      // not look like the user emptying their favourites.
      atom.notifications.addWarning(`Could not read ${path.basename(this.filePath)}`, {
        detail: error.message,
        dismissable: true,
      });
      return;
    }
    this.groups = {};
    if (!data || typeof data !== "object" || Array.isArray(data)) return;
    for (const [name, entries] of Object.entries(data)) {
      if (Array.isArray(entries)) {
        this.groups[name] = entries.filter(
          (entry) => typeof entry === "string" && entry.length > 0,
        );
      }
    }
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, this.serialize());
    } catch (error) {
      atom.notifications.addError(`Could not write ${path.basename(this.filePath)}`, {
        detail: error.message,
        dismissable: true,
      });
    }
  }

  getGroupNames() {
    return Object.keys(this.groups);
  }

  addEntry(groupName, filePath) {
    if (!this.groups[groupName]) {
      this.groups[groupName] = [];
    }
    if (this.groups[groupName].some((entry) => isSamePath(entry, filePath))) return false;
    this.groups[groupName].push(filePath);
    return true;
  }

  removeEntry(groupName, filePath) {
    const group = this.groups[groupName];
    if (!group) return false;
    const index = group.findIndex((entry) => isSamePath(entry, filePath));
    if (index === -1) return false;
    group.splice(index, 1);
    if (group.length === 0) {
      delete this.groups[groupName];
    }
    return true;
  }

  // A path belongs to at most one group, so removing it needs no help from
  // whatever the tree view happens to be rendering.
  findGroupForPath(filePath) {
    for (const groupName of this.getGroupNames()) {
      if (this.groups[groupName].some((entry) => isSamePath(entry, filePath))) {
        return groupName;
      }
    }
    return null;
  }

  has(filePath) {
    return this.findGroupForPath(filePath) !== null;
  }

  getFilteredEntries(groupName) {
    const group = this.groups[groupName];
    if (!group) return [];
    const projectPaths = atom.project.getPaths();
    if (projectPaths.length === 0) return [];
    return group.filter((entry) => projectPaths.some((pp) => isPathInProject(entry, pp)));
  }
};
