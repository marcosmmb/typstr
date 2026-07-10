PORT ?= 7777

.PHONY: web tauri-dev macos-app deps
web:
	python3 tools/dev_server.py $(PORT)

deps: node_modules/.bin/tauri

node_modules/.bin/tauri: package.json
	npm install

tauri-dev: deps
	npm run tauri:dev

macos-app: deps
	npm run tauri:build
	@printf "\nBuilt app bundle: src-tauri/target/release/bundle/macos/typstr.app\n"
