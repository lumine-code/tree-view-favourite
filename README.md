# tree-view-favourites

Add files and folders to favourite group sections in the tree view. Favourites persist globally across projects.

## Features

- **Global favourites**: favourite paths are stored in `~/.lumine/favourites.json` and persist across sessions.
- **Named groups**: organize favourites into multiple groups (e.g. Favourites, Prototypes, Configs). Each group appears as a separate root section in the tree view.
- **Project filtering**: only favourites within the current project's directories are shown.
- **Context menu**: right-click any file or folder to add it to favourites. Right-click a favourite to remove it from its group.
- **Toggle visibility**: show or hide all group sections with the `tree-view-favourites:toggle` command.
- **Edit favourites file**: open the raw favourites file with the `tree-view-favourites:edit` command.
- **External changes**: the favourites file is watched for changes, so edits from other windows or editors are picked up automatically.

## Installation

To install `tree-view-favourites` search for _tree-view-favourites_ in the Install pane of the Lumine settings or run `lumine --install lumine-code/tree-view-favourites`.

## Commands

Commands available in `atom-workspace`:

- `tree-view-favourites:toggle`: toggle favourites section visibility,
- `tree-view-favourites:edit`: open the favourites file for editing.

Commands available in `.tree-view`:

- `tree-view-favourites:add`: add selected entries to favourites,
- `tree-view-favourites:remove`: remove selected entries from their group.

## Configuration

Favourites are stored in `~/.lumine/favourites.json` as named groups. The default group is `Favourites`. You can add custom groups by editing the file directly (`tree-view-favourites:edit`):

```json
{
  "Favourites": ["C:\\Projects\\my-app\\src\\index.js", "C:\\Projects\\my-app\\README.md"],
  "Prototypes": ["C:\\Projects\\my-app\\experiments\\prototype-a.js"],
  "Configs": ["C:\\Projects\\my-app\\eslint.config.js", "C:\\Projects\\my-app\\tsconfig.json"]
}
```

Each group appears as its own collapsible root section in the tree view. Groups with no entries matching the current project are hidden automatically. Removing the last entry from a group deletes the group.

## Services

- **tree-view** (`^1.0.0`): consumed to read the selected entries that the add command operates on.
- **tree-view-roots** (`^1.0.0`): consumed to register each favourites group as a virtual root section in the tree view.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
