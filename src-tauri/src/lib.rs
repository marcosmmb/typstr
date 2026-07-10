use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
fn compile_typst(source: String) -> Result<String, String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let dir = std::env::temp_dir().join(format!("typstr-{stamp}"));
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;

    let input = dir.join("main.typ");
    let output = dir.join("main.svg");
    fs::write(&input, source).map_err(|error| error.to_string())?;

    let result = Command::new("typst")
        .arg("compile")
        .arg(&input)
        .arg(&output)
        .output()
        .map_err(|error| format!("Could not run typst CLI: {error}"))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        let _ = fs::remove_dir_all(&dir);
        return Err(stderr.trim().to_string());
    }

    let svg = fs::read_to_string(&output).map_err(|error| error.to_string())?;
    let _ = fs::remove_dir_all(&dir);
    Ok(svg)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![compile_typst])
        .run(tauri::generate_context!())
        .expect("error while running typstr");
}
