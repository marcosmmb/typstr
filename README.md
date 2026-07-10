# typstr

typstr is a small, keyboard-first Typst editor with a live preview. This first
working version is dependency-free in the browser and includes a Tauri shell for
the desktop build path.

## Run the browser version

Open `web/index.html` directly in a browser, or serve it from the project root:

```sh
python3 tools/dev_server.py 4173
```

Then visit `http://127.0.0.1:4173`.

## What works now

- Single-file `.typ` editing.
- Real-time preview for a useful Typst subset.
- Keyboard command palette.
- Configurable shortcuts and themes through JSON settings.
- Browser file open/save/download.
- Print/export preview.
- Tauri desktop scaffold with a native `compile_typst` command that can use the
  `typst` CLI when it is installed.

## Keyboard Shortcuts

- `Cmd/Ctrl+K`: command palette
- `Cmd/Ctrl+S`: save current file
- `Cmd/Ctrl+O`: open file
- `Cmd/Ctrl+B`: bold selection
- `Cmd/Ctrl+I`: italic selection
- `Cmd/Ctrl+1`, `Cmd/Ctrl+2`, `Cmd/Ctrl+3`: headings
- `Cmd/Ctrl+/`: toggle line comment
- `Cmd/Ctrl+,`: settings
- `Alt+E`: focus editor
- `Alt+P`: focus preview

## Desktop Path

The Tauri scaffold lives in `src-tauri`. Once Node/npm and Tauri dependencies are
available, the intended desktop flow is:

```sh
npm install
npm run tauri:dev
```

The desktop command currently shells out to `typst compile <input> <output.svg>`
for a true Typst render. The browser app uses its built-in preview renderer until
a full WASM Typst compiler is added.
