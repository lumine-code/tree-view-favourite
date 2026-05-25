# tree-view-favourites

Add files and folders to a favourites section in [tree-view-plus](https://github.com/asiloisad/pulsar-tree-view-plus). Favourites persist globally across projects.

![panel](https://github.com/asiloisad/pulsar-tree-view-favourites/blob/master/assets/view.png?raw=true)

## Installation

To install `tree-view-favourites` search for [tree-view-favourites](https://web.pulsar-edit.dev/packages/tree-view-favourites) in the Install pane of the Pulsar settings or run `ppm install tree-view-favourites`. Alternatively, you can run `ppm install asiloisad/pulsar-tree-view-favourites` to install a package directly from the GitHub repository.

Requires [tree-view-plus](https://github.com/asiloisad/pulsar-tree-view-plus) for the `tree-view-roots` and `tree-view` services.

## Features

- **Global favourites**: Favourite paths are stored in `~/.pulsar/favourites.cson` and persist across sessions.
- **Named groups**: Organize favourites into multiple groups (e.g. Favourites, Prototypes, Configs). Each group appears as a separate root section in the tree view.
- **Project filtering**: Only favourites within the current project's directories are shown.
- **Context menu**: Right-click any file or folder to add it to favourites. Right-click a favourite to remove it from its group.
- **Drag and drop**: Drag files from the tree view into any group section to add them.
- **Toggle visibility**: Show or hide all group sections with the `tree-view-favourites:toggle` command.
- **Edit favourites file**: Open the raw favourites file with the `tree-view-favourites:edit` command.
- **External changes**: The favourites file is watched for changes, so edits from other windows or editors are picked up automatically.

## Commands

Commands available in `atom-workspace`:

- `tree-view-favourites:toggle`: toggle favourites section visibility,
- `tree-view-favourites:edit`: open the favourites file for editing.

Commands available in `.tree-view`:

- `tree-view-favourites:add`: add selected entries to favourites,
- `tree-view-favourites:remove`: remove selected entries from their group.

## Groups

Favourites are stored in `~/.pulsar/favourites.cson` as named groups. The default group is `Favourites`. You can add custom groups by editing the file directly (`tree-view-favourites:edit`):

```cson
Favourites: [
  "C:\\Projects\\my-app\\src\\index.js"
  "C:\\Projects\\my-app\\README.md"
]
Prototypes: [
  "C:\\Projects\\my-app\\experiments\\prototype-a.js"
  "C:\\Projects\\my-app\\experiments\\prototype-b.js"
]
Configs: [
  "C:\\Projects\\my-app\\.eslintrc.js"
  "C:\\Projects\\my-app\\tsconfig.json"
]
```

Each group appears as its own collapsible root section in the tree view. Groups with no entries matching the current project are hidden automatically. Removing the last entry from a group deletes the group.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
