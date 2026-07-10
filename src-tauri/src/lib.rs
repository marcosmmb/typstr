use std::path::PathBuf;
use std::sync::LazyLock;

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
    source: Source,
}

impl PreviewWorld {
    fn new(source: String) -> Result<Self, String> {
        let path = VirtualPath::new("main.typ").map_err(|error| error.to_string())?;
        let main = RootedPath::new(VirtualRoot::Project, path).intern();
        Ok(Self {
            main,
            source: Source::new(main, source),
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
        if id == self.main {
            Ok(self.source.clone())
        } else {
            Err(FileError::NotFound(PathBuf::from(
                id.vpath().get_without_slash(),
            )))
        }
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if id == self.main {
            Ok(Bytes::from_string(self.source.text().to_owned()))
        } else {
            Err(FileError::NotFound(PathBuf::from(
                id.vpath().get_without_slash(),
            )))
        }
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
fn compile_typst(source: String) -> Result<String, String> {
    let world = PreviewWorld::new(source)?;
    let result = typst::compile::<typst_layout::PagedDocument>(&world);
    let document = result.output.map_err(format_diagnostics)?;
    Ok(typst_svg::svg_merged(
        &document,
        &SvgOptions::default(),
        Abs::pt(16.0),
    ))
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
    use super::compile_typst;

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

        let svg = compile_typst(source.to_owned()).expect("Typst should render SVG");
        assert!(svg.contains("<svg"));
        assert!(svg.contains("21"));
    }
}
