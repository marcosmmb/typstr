use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::LazyLock;

use serde::Deserialize;
use typst::diag::{FileError, FileResult};
use typst::ecow::EcoVec;
use typst::foundations::{Bytes, Datetime, Duration};
use typst::layout::Abs;
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::{Library, LibraryExt, World};
use typst_svg::SvgOptions;

static LIBRARY: LazyLock<typst::utils::LazyHash<Library>> =
    LazyLock::new(|| typst::utils::LazyHash::new(Library::default()));

static FONTS: LazyLock<Vec<Font>> = LazyLock::new(|| {
    typst_assets::fonts()
        .flat_map(|data| Font::iter(Bytes::new(data)))
        .collect()
});

static FONT_BOOK: LazyLock<typst::utils::LazyHash<FontBook>> =
    LazyLock::new(|| typst::utils::LazyHash::new(FontBook::from_fonts(FONTS.iter())));

struct PreviewWorld {
    main: FileId,
    sources: HashMap<FileId, Source>,
    bytes: HashMap<FileId, Bytes>,
}

#[derive(Clone, Deserialize)]
struct PreviewFile {
    path: String,
    content: String,
}

impl PreviewWorld {
    fn new(
        source: String,
        active_path: Option<String>,
        mut files: Vec<PreviewFile>,
    ) -> Result<Self, String> {
        let main_path = active_path.unwrap_or_else(|| "main.typ".to_owned());
        upsert_preview_file(&mut files, main_path.clone(), source);

        let main = file_id_for_path(&main_path)?;
        let mut sources = HashMap::new();
        let mut bytes = HashMap::new();

        for file in files {
            let id = file_id_for_path(&file.path)?;
            bytes.insert(id, Bytes::from_string(file.content.clone()));
            sources.insert(id, Source::new(id, file.content));
        }

        Ok(Self {
            main,
            sources,
            bytes,
        })
    }
}

impl World for PreviewWorld {
    fn library(&self) -> &typst::utils::LazyHash<Library> {
        &LIBRARY
    }

    fn book(&self) -> &typst::utils::LazyHash<FontBook> {
        &FONT_BOOK
    }

    fn main(&self) -> FileId {
        self.main
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        self.sources
            .get(&id)
            .cloned()
            .ok_or_else(|| FileError::NotFound(PathBuf::from(id.vpath().get_without_slash())))
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        self.bytes
            .get(&id)
            .cloned()
            .ok_or_else(|| FileError::NotFound(PathBuf::from(id.vpath().get_without_slash())))
    }

    fn font(&self, index: usize) -> Option<Font> {
        FONTS.get(index).cloned()
    }

    fn today(&self, offset: Option<Duration>) -> Option<Datetime> {
        let _ = offset;
        Datetime::from_ymd(2026, 7, 10)
    }
}

#[tauri::command]
fn compile_typst(
    source: String,
    active_path: Option<String>,
    files: Vec<PreviewFile>,
) -> Result<String, String> {
    let world = PreviewWorld::new(source, active_path, files)?;
    let result = typst::compile::<typst_layout::PagedDocument>(&world);
    let document = result.output.map_err(format_diagnostics)?;
    Ok(typst_svg::svg_merged(
        &document,
        &SvgOptions::default(),
        Abs::pt(16.0),
    ))
}

fn file_id_for_path(path: &str) -> Result<FileId, String> {
    let normalized = normalize_project_path(path);
    let path = VirtualPath::new(&normalized).map_err(|error| error.to_string())?;
    Ok(RootedPath::new(VirtualRoot::Project, path).intern())
}

fn normalize_project_path(path: &str) -> String {
    path.replace('\\', "/").trim_start_matches('/').to_owned()
}

fn upsert_preview_file(files: &mut Vec<PreviewFile>, path: String, content: String) {
    let normalized_path = normalize_project_path(&path);
    if let Some(file) = files
        .iter_mut()
        .find(|file| normalize_project_path(&file.path) == normalized_path)
    {
        file.path = normalized_path;
        file.content = content;
        return;
    }

    files.push(PreviewFile {
        path: normalized_path,
        content,
    });
}

fn format_diagnostics(diagnostics: EcoVec<typst::diag::SourceDiagnostic>) -> String {
    diagnostics
        .into_iter()
        .map(|diagnostic| diagnostic.message.to_string())
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![compile_typst])
        .run(tauri::generate_context!())
        .expect("error while running typstr");
}

#[cfg(test)]
mod tests {
    use super::{compile_typst, PreviewFile};

    fn compile_test(
        source: &str,
        active_path: &str,
        files: Vec<PreviewFile>,
    ) -> Result<String, String> {
        compile_typst(source.to_owned(), Some(active_path.to_owned()), files)
    }

    #[test]
    fn renders_typst_scripting_with_official_compiler() {
        let source = r#"
#let count = 8
#let nums = range(1, count + 1)
#let fib(n) = (
  if n <= 2 { 1 }
  else { fib(n - 1) + fib(n - 2) }
)

#align(center, table(
  columns: count,
  ..nums.map(n => $F_#n$),
  ..nums.map(n => str(fib(n))),
))
"#;

        let svg = compile_test(source, "main.typ", Vec::new()).expect("Typst should render SVG");
        assert!(svg.contains("<svg"));
        assert!(svg.contains("21"));
    }

    #[test]
    fn resolves_included_files_from_project_map() {
        let svg = compile_test(
            r#"#include "chapters/intro.typ""#,
            "main.typ",
            vec![PreviewFile {
                path: "chapters/intro.typ".to_owned(),
                content: "Included chapter 42".to_owned(),
            }],
        )
        .expect("Typst should render included file");

        assert!(svg.contains("<svg"));
        assert!(svg.contains("42"));
    }
}
