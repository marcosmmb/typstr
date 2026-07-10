const DEFAULT_SOURCE = `#set page(paper: "us-letter", margin: 1in)
#set text(size: 11pt)

= typstr

A small, keyboard-first editor for Typst documents.

Use *strong text*, _emphasis_, \`inline code\`, math like $a^2 + b^2 = c^2$,
and commands like #align(center)[Hello].

== Goals

- Simple editing
- Fully configurable shortcuts and themes
- Live preview while you type
- Browser and Tauri desktop targets

== A tiny table

| Feature | Status |
| Editor | working |
| Preview | working MVP |
| Native Typst | available through Tauri when the CLI is installed |

\`\`\`
#let greeting = "Hello, Typst"
#greeting
\`\`\`
`;

const DEFAULT_CONFIG = {
  theme: "light",
  editor: {
    fontSize: 16,
    tabSize: 2
  },
  preview: {
    debounceMs: 180,
    zoom: 1,
    position: "right"
  },
  keymap: {
    "mod+k": "openPalette",
    "mod+s": "saveFile",
    "mod+o": "openFile",
    "mod+b": "wrapBold",
    "mod+i": "wrapItalic",
    "mod+1": "makeHeading1",
    "mod+2": "makeHeading2",
    "mod+3": "makeHeading3",
    "mod+/": "toggleComment",
    "mod+,": "toggleSettings",
    "alt+f": "toggleFileManager",
    "alt+e": "focusEditor",
    "alt+p": "focusPreview"
  },
  customTheme: {
    bg: "#121417",
    surface: "#191d22",
    surface2: "#22272e",
    text: "#e7edf4",
    muted: "#9ba7b4",
    border: "#303842",
    accent: "#5eb1bf",
    editorBg: "#101316",
    editorText: "#e7edf4",
    previewBg: "#20242a",
    paperBg: "#f8f6f1"
  }
};

const THEMES = {
  light: {
    bg: "#f3f1ec",
    surface: "#fffdf8",
    surface2: "#ebe7de",
    text: "#22201c",
    muted: "#6f6a60",
    border: "#d8d1c4",
    accent: "#24745c",
    editorBg: "#fffdf8",
    editorText: "#24231f",
    previewBg: "#e7e2d8",
    paperBg: "#fffefb"
  },
  dark: {
    bg: "#111315",
    surface: "#181b1f",
    surface2: "#20242a",
    text: "#e9edf1",
    muted: "#9da6b0",
    border: "#2d343d",
    accent: "#62b6a1",
    editorBg: "#121519",
    editorText: "#eff3f7",
    previewBg: "#20242a",
    paperBg: "#f7f4ed"
  },
  paper: {
    bg: "#ebe4d4",
    surface: "#fbf7ed",
    surface2: "#e5dcc9",
    text: "#272017",
    muted: "#716757",
    border: "#cfc1aa",
    accent: "#7a5634",
    editorBg: "#fffaf0",
    editorText: "#2a2117",
    previewBg: "#ded3bf",
    paperBg: "#fffdf7"
  }
};

const STORAGE_KEYS = {
  config: "typstr.config",
  source: "typstr.source",
  fileName: "typstr.fileName",
  files: "typstr.files",
  activeFileId: "typstr.activeFileId"
};

const state = {
  config: loadConfig(),
  files: loadManagedFiles(),
  activeFileId: localStorage.getItem(STORAGE_KEYS.activeFileId),
  fileHandles: new Map(),
  fileHandle: null,
  fileName: localStorage.getItem(STORAGE_KEYS.fileName) || "untitled.typ",
  renderTimer: null,
  lastDiagnostics: []
};

const el = {
  app: document.querySelector(".app"),
  editor: document.getElementById("editor"),
  lineNumbers: document.getElementById("lineNumbers"),
  preview: document.getElementById("preview"),
  previewScroller: document.getElementById("previewScroller"),
  fileName: document.getElementById("fileName"),
  statusText: document.getElementById("statusText"),
  diagnosticsText: document.getElementById("diagnosticsText"),
  statsText: document.getElementById("statsText"),
  palette: document.getElementById("palette"),
  paletteInput: document.getElementById("paletteInput"),
  paletteList: document.getElementById("paletteList"),
  fileInput: document.getElementById("fileInput"),
  fileCollectionInput: document.getElementById("fileCollectionInput"),
  fileList: document.getElementById("fileList"),
  filesTabButton: document.getElementById("filesTabButton"),
  settingsPanel: document.getElementById("settingsPanel"),
  configEditor: document.getElementById("configEditor"),
  themeSelect: document.getElementById("themeSelect"),
  fontSizeInput: document.getElementById("fontSizeInput"),
  debounceInput: document.getElementById("debounceInput"),
  previewPositionSelect: document.getElementById("previewPositionSelect")
};

const commands = [
  command("openPalette", "Command palette", "mod+k", openPalette),
  command("openFile", "Open file", "mod+o", openFile),
  command("addFilesToManager", "Add files to file manager", "", addFilesToManager),
  command("openFolder", "Open folder in file manager", "", openFolder),
  command("saveFile", "Save file", "mod+s", saveFile),
  command("downloadFile", "Download .typ file", "", downloadSource),
  command("printPreview", "Print or save PDF", "", printPreview),
  command("toggleSettings", "Toggle settings", "mod+,", toggleSettings),
  command("toggleFileManager", "Toggle file manager", "alt+f", toggleFileManager),
  command("togglePreviewPosition", "Swap editor and preview", "", togglePreviewPosition),
  command("focusEditor", "Focus editor", "alt+e", () => el.editor.focus()),
  command("focusPreview", "Focus preview", "alt+p", () => el.previewScroller.focus()),
  command("wrapBold", "Bold selection", "mod+b", () => wrapSelection("*", "*", "strong text")),
  command("wrapItalic", "Italic selection", "mod+i", () => wrapSelection("_", "_", "emphasis")),
  command("makeHeading1", "Heading 1", "mod+1", () => prefixCurrentLine("= ")),
  command("makeHeading2", "Heading 2", "mod+2", () => prefixCurrentLine("== ")),
  command("makeHeading3", "Heading 3", "mod+3", () => prefixCurrentLine("=== ")),
  command("toggleComment", "Toggle line comment", "mod+/", toggleComment),
  command("zoomIn", "Zoom preview in", "", () => changeZoom(0.08)),
  command("zoomOut", "Zoom preview out", "", () => changeZoom(-0.08)),
  command("resetDocument", "Reset sample document", "", resetDocument)
];

function command(id, label, shortcut, run) {
  return { id, label, shortcut, run };
}

function loadConfig() {
  const raw = localStorage.getItem(STORAGE_KEYS.config);
  if (!raw) return structuredClone(DEFAULT_CONFIG);
  try {
    return mergeConfig(DEFAULT_CONFIG, JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

function mergeConfig(base, override) {
  const result = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = mergeConfig(base[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function saveConfig() {
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(state.config, null, 2));
}

function loadManagedFiles() {
  const raw = localStorage.getItem(STORAGE_KEYS.files);
  if (!raw) return [];
  try {
    const files = JSON.parse(raw);
    return Array.isArray(files) ? files.filter((file) => file.id && file.name) : [];
  } catch {
    return [];
  }
}

function saveManagedFiles() {
  const files = state.files.map(({ id, name, path, content }) => ({ id, name, path, content }));
  localStorage.setItem(STORAGE_KEYS.files, JSON.stringify(files));
}

function ensureInitialFile() {
  if (!state.files.length) {
    const content = localStorage.getItem(STORAGE_KEYS.source) || DEFAULT_SOURCE;
    const name = localStorage.getItem(STORAGE_KEYS.fileName) || "untitled.typ";
    const file = createManagedFile(name, name, content);
    state.files.push(file);
    state.activeFileId = file.id;
    saveManagedFiles();
    localStorage.setItem(STORAGE_KEYS.activeFileId, file.id);
  }

  if (!state.files.some((file) => file.id === state.activeFileId)) {
    state.activeFileId = state.files[0].id;
    localStorage.setItem(STORAGE_KEYS.activeFileId, state.activeFileId);
  }
}

function createManagedFile(name, path, content) {
  return {
    id: `${path}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    path,
    content
  };
}

function getActiveFile() {
  return state.files.find((file) => file.id === state.activeFileId) || state.files[0];
}

function updateActiveFileContent(content) {
  const activeFile = getActiveFile();
  if (!activeFile) return;
  activeFile.content = content;
  saveManagedFiles();
}

function setActiveFile(fileId) {
  const file = state.files.find((item) => item.id === fileId);
  if (!file) return;
  state.activeFileId = file.id;
  state.fileName = file.name;
  state.fileHandle = state.fileHandles.get(file.id) || null;
  localStorage.setItem(STORAGE_KEYS.activeFileId, file.id);
  localStorage.setItem(STORAGE_KEYS.fileName, file.name);
  localStorage.setItem(STORAGE_KEYS.source, file.content);
  el.editor.value = file.content;
  el.fileName.textContent = file.name;
  renderFileList();
  updateLineNumbers();
  renderNow();
  setStatus(`Opened ${file.name}`);
}

function renderFileList() {
  el.fileList.innerHTML = "";
  for (const file of state.files) {
    const button = document.createElement("button");
    button.className = `file-item${file.id === state.activeFileId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `<span>${escapeHtml(file.name)}</span><small>${escapeHtml(file.path || file.name)}</small>`;
    button.addEventListener("click", () => setActiveFile(file.id));
    el.fileList.append(button);
  }
}

function init() {
  ensureInitialFile();
  const activeFile = getActiveFile();
  el.editor.value = activeFile.content;
  state.fileName = activeFile.name;
  el.fileName.textContent = state.fileName;
  bindUi();
  applyConfig();
  updateSettingsForm();
  renderFileList();
  updateLineNumbers();
  renderNow();
  setStatus("Ready");
}

function bindUi() {
  el.editor.addEventListener("input", () => {
    localStorage.setItem(STORAGE_KEYS.source, el.editor.value);
    updateActiveFileContent(el.editor.value);
    updateLineNumbers();
    scheduleRender();
  });

  el.editor.addEventListener("scroll", () => {
    el.lineNumbers.scrollTop = el.editor.scrollTop;
  });

  document.addEventListener("keydown", handleKeydown);

  document.getElementById("openButton").addEventListener("click", openFile);
  document.getElementById("saveButton").addEventListener("click", saveFile);
  document.getElementById("addFilesButton").addEventListener("click", addFilesToManager);
  document.getElementById("openFolderButton").addEventListener("click", openFolder);
  el.filesTabButton.addEventListener("click", toggleFileManager);
  document.getElementById("paletteButton").addEventListener("click", openPalette);
  document.getElementById("settingsButton").addEventListener("click", toggleSettings);
  document.getElementById("closeSettingsButton").addEventListener("click", closeSettings);
  document.getElementById("boldButton").addEventListener("click", () => wrapSelection("*", "*", "strong text"));
  document.getElementById("italicButton").addEventListener("click", () => wrapSelection("_", "_", "emphasis"));
  document.getElementById("commentButton").addEventListener("click", toggleComment);
  document.getElementById("zoomInButton").addEventListener("click", () => changeZoom(0.08));
  document.getElementById("zoomOutButton").addEventListener("click", () => changeZoom(-0.08));
  document.getElementById("printButton").addEventListener("click", printPreview);

  el.fileInput.addEventListener("change", handlePickedFile);
  el.fileCollectionInput.addEventListener("change", handlePickedFiles);
  el.paletteInput.addEventListener("input", renderPalette);
  el.palette.addEventListener("close", () => el.editor.focus());

  el.themeSelect.addEventListener("change", () => {
    state.config.theme = el.themeSelect.value;
    saveConfig();
    applyConfig();
    updateSettingsForm();
  });

  el.fontSizeInput.addEventListener("change", () => {
    state.config.editor.fontSize = Number(el.fontSizeInput.value);
    saveConfig();
    applyConfig();
    updateSettingsForm();
  });

  el.debounceInput.addEventListener("change", () => {
    state.config.preview.debounceMs = Number(el.debounceInput.value);
    saveConfig();
    updateSettingsForm();
  });

  el.previewPositionSelect.addEventListener("change", () => {
    state.config.preview.position = el.previewPositionSelect.value;
    saveConfig();
    applyConfig();
    updateSettingsForm();
  });

  document.getElementById("applyConfigButton").addEventListener("click", applyConfigFromEditor);
  document.getElementById("resetConfigButton").addEventListener("click", resetConfig);
}

function handleKeydown(event) {
  if (el.palette.open) {
    if (event.key === "Escape") {
      event.preventDefault();
      el.palette.close();
    }
    return;
  }

  const shortcut = shortcutFromEvent(event);
  const commandId = state.config.keymap[shortcut];
  if (!commandId) return;
  const found = commands.find((item) => item.id === commandId);
  if (!found) return;
  event.preventDefault();
  found.run();
}

function shortcutFromEvent(event) {
  const parts = [];
  if (event.metaKey || event.ctrlKey) parts.push("mod");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  parts.push(key);
  return parts.join("+");
}

function applyConfig() {
  const theme = state.config.theme === "custom" ? state.config.customTheme : THEMES[state.config.theme] || THEMES.light;
  setCssVar("bg", theme.bg);
  setCssVar("surface", theme.surface);
  setCssVar("surface-2", theme.surface2);
  setCssVar("text", theme.text);
  setCssVar("muted", theme.muted);
  setCssVar("border", theme.border);
  setCssVar("accent", theme.accent);
  setCssVar("accent-2", theme.accent);
  setCssVar("editor-bg", theme.editorBg);
  setCssVar("editor-text", theme.editorText);
  setCssVar("preview-bg", theme.previewBg);
  setCssVar("paper-bg", theme.paperBg);
  document.documentElement.style.setProperty("--editor-font-size", `${state.config.editor.fontSize}px`);
  document.documentElement.style.setProperty("--preview-scale", state.config.preview.zoom);
  el.app.dataset.layout = state.config.preview.position === "left" ? "preview-left" : "preview-right";
}

function setCssVar(name, value) {
  document.documentElement.style.setProperty(`--${name}`, value);
}

function updateSettingsForm() {
  el.themeSelect.value = state.config.theme;
  el.fontSizeInput.value = state.config.editor.fontSize;
  el.debounceInput.value = state.config.preview.debounceMs;
  el.previewPositionSelect.value = state.config.preview.position;
  el.configEditor.value = JSON.stringify(state.config, null, 2);
}

function scheduleRender() {
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(renderNow, state.config.preview.debounceMs);
  setStatus("Rendering...");
}

async function renderNow() {
  const source = el.editor.value;
  const nativeSvg = await compileWithTauri(source);
  if (nativeSvg) {
    el.preview.innerHTML = nativeSvg;
    el.preview.style.fontSize = "";
    state.lastDiagnostics = [];
  } else {
    const result = renderTypstSubset(source);
    el.preview.innerHTML = result.html;
    applyPreviewStyles(result.styles);
    state.lastDiagnostics = result.diagnostics;
  }
  updateStatus(source);
}

async function compileWithTauri(source) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return null;
  try {
    const svg = await invoke("compile_typst", { source });
    setStatus("Rendered with native Typst");
    return svg;
  } catch (error) {
    state.lastDiagnostics = [{ line: 1, message: String(error) }];
    return null;
  }
}

function renderTypstSubset(source) {
  const diagnostics = getDiagnostics(source);
  const context = createRenderContext();
  const blocks = [];
  const lines = source.split(/\r?\n/);
  let paragraph = [];
  let list = null;
  let table = [];
  let inCode = false;
  let codeLines = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${formatInline(paragraph.join(" "), context)}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(`<${list.type}>${list.items.map((item) => `<li>${formatInline(item, context)}</li>`).join("")}</${list.type}>`);
      list = null;
    }
  };
  const flushTable = () => {
    if (table.length) {
      const rows = table.map((row) => {
        const cells = row.split("|").map((cell) => cell.trim()).filter(Boolean);
        return `<tr>${cells.map((cell) => `<td>${formatInline(cell, context)}</td>`).join("")}</tr>`;
      });
      blocks.push(`<table>${rows.join("")}</table>`);
      table = [];
    }
  };

  for (const line of lines) {
    const rawTrimmed = line.trim();

    if (rawTrimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      flushTable();
      if (inCode) {
        blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const visibleLine = stripTypstComment(line);
    const trimmed = visibleLine.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }

    if (applyScriptLine(trimmed, context)) {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }

    const heading = trimmed.match(/^(=+)\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      flushTable();
      const level = Math.min(heading[1].length, 6);
      blocks.push(`<h${level}>${formatInline(heading[2], context)}</h${level}>`);
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      flushTable();
      if (!list || list.type !== "ul") list = { type: "ul", items: [] };
      list.items.push(bullet[1]);
      continue;
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (ordered) {
      flushParagraph();
      flushTable();
      if (!list || list.type !== "ol") list = { type: "ol", items: [] };
      list.items.push(ordered[1]);
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushParagraph();
      flushList();
      table.push(trimmed);
      continue;
    }

    flushList();
    flushTable();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushTable();

  if (inCode) {
    diagnostics.push({ line: lines.length, message: "Unclosed code block" });
    blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }

  if (diagnostics.length) {
    blocks.push(`<p class="diagnostic">${diagnostics.map((item) => `Line ${item.line}: ${escapeHtml(item.message)}`).join("<br>")}</p>`);
  }

  return { html: blocks.join("\n"), diagnostics, styles: context.styles };
}

function createRenderContext() {
  return {
    variables: {},
    styles: {
      fontSize: null
    }
  };
}

function applyScriptLine(line, context) {
  const setText = line.match(/^#set\s+text\s*\((.*)\)\s*$/);
  if (setText) {
    const size = setText[1].match(/\bsize\s*:\s*([0-9.]+)\s*(pt|px|em|rem)?/);
    if (size) context.styles.fontSize = cssSize(size[1], size[2] || "pt");
    return true;
  }

  if (/^#set\s+/.test(line)) return true;

  const letValue = line.match(/^#let\s+([a-zA-Z_]\w*)\s*=\s*(.+)$/);
  if (letValue) {
    context.variables[letValue[1]] = parseScriptValue(letValue[2]);
    return true;
  }

  return /^#(show|import|include)\b/.test(line);
}

function parseScriptValue(raw) {
  const value = raw.trim();
  const quoted = value.match(/^["'](.*)["']$/);
  if (quoted) return quoted[1];
  if (/^[0-9.]+$/.test(value)) return value;
  return value;
}

function cssSize(value, unit) {
  if (unit === "pt") return `${Number(value) * 1.3333333333}px`;
  return `${value}${unit}`;
}

function applyPreviewStyles(styles) {
  el.preview.style.fontSize = styles.fontSize || "";
}

function stripTypstComment(line) {
  let quote = null;
  for (let index = 0; index < line.length - 1; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if ((char === '"' || char === "'") && line[index - 1] !== "\\") {
      quote = quote === char ? null : quote || char;
    }
    if (!quote && char === "/" && next === "/") return line.slice(0, index);
  }
  return line;
}

function formatInline(text, context = createRenderContext()) {
  let value = escapeHtml(text);
  value = value.replace(/#([a-zA-Z_]\w*)\b/g, (match, name) => {
    if (!Object.hasOwn(context.variables, name)) return match;
    return escapeHtml(String(context.variables[name]));
  });
  value = value.replace(/#align\((left|center|right)\)\[([^\]]+)\]/g, '<span class="align align-$1">$2</span>');
  value = value.replace(/`([^`]+)`/g, "<code>$1</code>");
  value = value.replace(/\$([^$]+)\$/g, '<span class="math">$1</span>');
  value = value.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
  value = value.replace(/_([^_]+)_/g, "<em>$1</em>");
  value = value.replace(/#([a-zA-Z][\w.]*)/g, '<span class="function">#$1</span>');
  return value;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getDiagnostics(source) {
  const diagnostics = [];
  const lines = source.split(/\r?\n/).map(stripTypstComment);
  lines.forEach((line, index) => {
    const mathCount = (line.match(/\$/g) || []).length;
    if (mathCount % 2 === 1) diagnostics.push({ line: index + 1, message: "Unmatched math delimiter `$`" });
  });

  source = lines.join("\n");
  const pairs = [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"]
  ];

  for (const [open, close] of pairs) {
    const openCount = source.split(open).length - 1;
    const closeCount = source.split(close).length - 1;
    if (openCount !== closeCount) diagnostics.push({ line: 1, message: `Unbalanced ${open}${close} delimiters` });
  }

  return diagnostics;
}

function updateStatus(source) {
  const wordCount = (source.match(/\b[\w'-]+\b/g) || []).length;
  el.statsText.textContent = `${wordCount} words`;
  el.diagnosticsText.textContent = state.lastDiagnostics.length
    ? `${state.lastDiagnostics.length} diagnostic${state.lastDiagnostics.length === 1 ? "" : "s"}`
    : "No diagnostics";
  setStatus("Ready");
}

function setStatus(message) {
  el.statusText.textContent = message;
}

function updateLineNumbers() {
  const count = el.editor.value.split(/\r?\n/).length;
  el.lineNumbers.textContent = Array.from({ length: count }, (_, index) => index + 1).join("\n");
}

async function openFile() {
  if ("showOpenFilePicker" in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "Typst", accept: { "text/plain": [".typ", ".txt"] } }]
      });
      const file = await handle.getFile();
      await loadFile(file, handle);
      return;
    } catch (error) {
      if (error.name !== "AbortError") setStatus(String(error));
    }
  }
  el.fileInput.click();
}

async function handlePickedFile(event) {
  const [file] = event.target.files;
  if (!file) return;
  await loadFile(file);
  el.fileInput.value = "";
}

async function handlePickedFiles(event) {
  const files = Array.from(event.target.files || []);
  await addFiles(files);
  el.fileCollectionInput.value = "";
}

async function loadFile(file, handle = null) {
  const managedFile = await addFile(file, handle);
  setActiveFile(managedFile.id);
}

function addFilesToManager() {
  el.fileCollectionInput.click();
}

async function openFolder() {
  if ("showDirectoryPicker" in window) {
    try {
      const directory = await window.showDirectoryPicker();
      const files = [];
      await collectDirectoryFiles(directory, files);
      await addFiles(files);
      setStatus(`Loaded ${files.length} file${files.length === 1 ? "" : "s"}`);
      return;
    } catch (error) {
      if (error.name !== "AbortError") setStatus(String(error));
    }
  }
  addFilesToManager();
}

async function collectDirectoryFiles(directory, files, prefix = "") {
  for await (const [name, handle] of directory.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      await collectDirectoryFiles(handle, files, path);
      continue;
    }
    if (!isTypstLikeFile(name)) continue;
    const file = await handle.getFile();
    files.push({ file, handle, path });
  }
}

async function addFiles(files) {
  let firstAdded = null;
  for (const entry of files) {
    const file = entry.file || entry;
    if (!isTypstLikeFile(file.name)) continue;
    const managedFile = await addFile(file, entry.handle || null, entry.path || file.webkitRelativePath || file.name);
    firstAdded ||= managedFile;
  }
  if (firstAdded) setActiveFile(firstAdded.id);
  renderFileList();
}

async function addFile(file, handle = null, path = file.name || "untitled.typ") {
  const content = await file.text();
  const name = file.name || path.split("/").pop() || "untitled.typ";
  const existing = state.files.find((item) => item.path === path);
  const managedFile = existing || createManagedFile(name, path, content);
  managedFile.name = name;
  managedFile.path = path;
  managedFile.content = content;
  if (!existing) state.files.push(managedFile);
  if (handle) state.fileHandles.set(managedFile.id, handle);
  saveManagedFiles();
  return managedFile;
}

function isTypstLikeFile(name) {
  return /\.(typ|txt)$/i.test(name);
}

async function saveFile() {
  updateActiveFileContent(el.editor.value);
  if (state.fileHandle?.createWritable) {
    try {
      const writable = await state.fileHandle.createWritable();
      await writable.write(el.editor.value);
      await writable.close();
      renderFileList();
      setStatus("Saved");
      return;
    } catch (error) {
      setStatus(String(error));
    }
  }
  localStorage.setItem(STORAGE_KEYS.source, el.editor.value);
  renderFileList();
  setStatus("Saved locally");
}

function downloadSource() {
  const blob = new Blob([el.editor.value], { type: "text/vnd.typst" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = state.fileName || "untitled.typ";
  link.click();
  URL.revokeObjectURL(url);
}

function printPreview() {
  window.print();
}

function openPalette() {
  el.paletteInput.value = "";
  renderPalette();
  el.palette.showModal();
  requestAnimationFrame(() => el.paletteInput.focus());
}

function renderPalette() {
  const query = el.paletteInput.value.trim().toLowerCase();
  const items = commands.filter((item) => item.label.toLowerCase().includes(query));
  el.paletteList.innerHTML = "";
  for (const item of items) {
    const button = document.createElement("button");
    button.className = "palette-item";
    button.innerHTML = `<span>${escapeHtml(item.label)}</span><kbd>${escapeHtml(shortcutForCommand(item.id) || item.shortcut)}</kbd>`;
    button.addEventListener("click", () => {
      el.palette.close();
      item.run();
    });
    el.paletteList.append(button);
  }
}

function shortcutForCommand(commandId) {
  const entry = Object.entries(state.config.keymap).find(([, value]) => value === commandId);
  return entry?.[0] || "";
}

function toggleSettings() {
  const open = el.app.dataset.panel === "settings";
  el.app.dataset.panel = open ? "preview" : "settings";
  if (!open) updateSettingsForm();
}

function closeSettings() {
  el.app.dataset.panel = "preview";
}

function toggleFileManager() {
  const open = el.app.dataset.files !== "closed";
  el.app.dataset.files = open ? "closed" : "open";
  el.filesTabButton.classList.toggle("active", !open);
  el.filesTabButton.setAttribute("aria-selected", String(!open));
}

function togglePreviewPosition() {
  state.config.preview.position = state.config.preview.position === "left" ? "right" : "left";
  saveConfig();
  applyConfig();
  updateSettingsForm();
  setStatus("Editor and preview swapped");
}

function applyConfigFromEditor() {
  try {
    state.config = mergeConfig(DEFAULT_CONFIG, JSON.parse(el.configEditor.value));
    saveConfig();
    applyConfig();
    updateSettingsForm();
    setStatus("Configuration applied");
  } catch (error) {
    setStatus(`Configuration error: ${error.message}`);
  }
}

function resetConfig() {
  state.config = structuredClone(DEFAULT_CONFIG);
  saveConfig();
  applyConfig();
  updateSettingsForm();
  setStatus("Configuration reset");
}

function resetDocument() {
  el.editor.value = DEFAULT_SOURCE;
  localStorage.setItem(STORAGE_KEYS.source, DEFAULT_SOURCE);
  updateActiveFileContent(DEFAULT_SOURCE);
  renderFileList();
  updateLineNumbers();
  renderNow();
}

function wrapSelection(before, after, fallback) {
  const start = el.editor.selectionStart;
  const end = el.editor.selectionEnd;
  const selection = el.editor.value.slice(start, end) || fallback;
  replaceRange(start, end, `${before}${selection}${after}`, before.length, before.length + selection.length);
}

function prefixCurrentLine(prefix) {
  const start = el.editor.selectionStart;
  const lineStart = el.editor.value.lastIndexOf("\n", start - 1) + 1;
  const lineEndIndex = el.editor.value.indexOf("\n", start);
  const lineEnd = lineEndIndex === -1 ? el.editor.value.length : lineEndIndex;
  const line = el.editor.value.slice(lineStart, lineEnd).replace(/^=+\s*/, "");
  replaceRange(lineStart, lineEnd, `${prefix}${line}`, prefix.length, prefix.length + line.length);
}

function toggleComment() {
  const start = el.editor.selectionStart;
  const end = el.editor.selectionEnd;
  const doc = el.editor.value;
  const lineStart = doc.lastIndexOf("\n", start - 1) + 1;
  const lineEndIndex = doc.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? doc.length : lineEndIndex;
  const lines = doc.slice(lineStart, lineEnd).split("\n");
  const uncomment = lines.every((line) => line.trimStart().startsWith("//"));
  const changed = lines.map((line) => {
    if (uncomment) return line.replace(/^(\s*)\/\/\s?/, "$1");
    return line.replace(/^(\s*)/, "$1// ");
  }).join("\n");
  replaceRange(lineStart, lineEnd, changed, 0, changed.length);
}

function replaceRange(start, end, value, selectionStartOffset = value.length, selectionEndOffset = value.length) {
  const current = el.editor.value;
  el.editor.value = current.slice(0, start) + value + current.slice(end);
  el.editor.focus();
  el.editor.selectionStart = start + selectionStartOffset;
  el.editor.selectionEnd = start + selectionEndOffset;
  localStorage.setItem(STORAGE_KEYS.source, el.editor.value);
  updateLineNumbers();
  renderNow();
}

function changeZoom(delta) {
  const next = Math.max(0.7, Math.min(1.4, Number(state.config.preview.zoom) + delta));
  state.config.preview.zoom = Number(next.toFixed(2));
  saveConfig();
  applyConfig();
  updateSettingsForm();
}

init();
