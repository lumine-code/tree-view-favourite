# tree-view-favourite

Add files and folders to favourite sections in the tree view.

Favourites persist globally across projects.

## Features

- **Global favourites**: favourite paths are stored in `~/.lumine/favourite.json` and persist across sessions.
- **Named groups**: organize favourites into multiple groups (e.g. Favourites, Prototypes, Configs). Each group appears as a separate root section in the tree view.
- **Folders open in place**: a favourite folder expands like a project folder, so its contents are browsable without leaving the section.
- **Project filtering**: only favourites within the current project's directories are shown.
- **Context menu**: right-click any file or folder to add it to favourites. Right-click a favourite to remove it or reveal it where it lives.
- **Drag and drop**: drop entries onto a section header to add them to that group.
- **Toggle visibility**: show or hide all group sections with the `tree-view-favourite:toggle` command.
- **External changes**: the favourite file is watched, so edits from other windows or editors are picked up automatically.

## Installation

To install `tree-view-favourite` search for _tree-view-favourite_ in the Install pane of the Lumine settings or run `lumine --install lumine-code/tree-view-favourite`.

## Commands

Commands available in `atom-workspace`:

- `tree-view-favourite:toggle`: toggle favourites section visibility,
- `tree-view-favourite:edit`: open the favourite file for editing.

Commands available in `.tree-view`:

- `tree-view-favourite:add`: add the selected entries to favourites,
- `tree-view-favourite:remove`: remove the selected entries from their group,
- `tree-view-favourite:reveal`: reveal the selected favourite where it lives in the project.

The tree view's own `tree-view:remove` also removes a favourite from its group rather than deleting it, so the Delete key does the expected thing on a favourite row.

## Configuration

Favourites are stored in `~/.lumine/favourite.json` as named groups. New favourites go to the group named by the **Default group** setting, `Favourites` unless you change it. Add further groups by editing the file directly (`tree-view-favourite:edit`):

```json
{
  "Favourites": ["C:\\Projects\\my-app\\src", "C:\\Projects\\my-app\\README.md"],
  "Prototypes": ["C:\\Projects\\my-app\\experiments\\prototype-a.js"],
  "Configs": ["C:\\Projects\\my-app\\eslint.config.js", "C:\\Projects\\my-app\\tsconfig.json"]
}
```

Each group appears as its own collapsible root section, in the order the file lists them, and so do the entries within a group. Groups with no entries matching the current project are hidden automatically. Removing the last entry from a group deletes the group.

A favourite whose path no longer exists is shown struck through rather than dropped, so a rename is visible instead of silent.

## Customization

Every group gets its own classes, derived from its name: `favourites-section` on the section list, `favourites-root` on its header, and `favourites-entry` on each row in it. Paste something like this into your `styles.css` to tint one group:

```css
.tree-view .prototypes-section .prototypes-entry .name {
  color: var(--text-color-info);
}
```

## Services

- **tree-view.selection** (`^1.0.0`): consumed to read the selected entries the add, remove and reveal commands operate on.
- **tree-view.roots** (`^1.0.0`): consumed to register each favourites group as a virtual root section in the tree view.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
