ENGINE_DIR=engine
WEB_DIR=apps/web

.PHONY: generate test-engine install-web dev-web sync-web-data

generate:
	cd $(ENGINE_DIR) && uv run python -m wordlegym.cli generate

test-engine:
	cd $(ENGINE_DIR) && uv run python -m unittest discover -s tests

install-web:
	cd $(WEB_DIR) && npm install

dev-web:
	cd $(WEB_DIR) && npm run dev

sync-web-data:
	cd $(ENGINE_DIR) && uv run python -m wordlegym.cli sync-web-data

