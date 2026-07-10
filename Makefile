PORT ?= 7777

.PHONY: web
web:
	python3 tools/dev_server.py $(PORT)
