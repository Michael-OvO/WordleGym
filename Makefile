ENGINE_DIR=engine
WEB_DIR=apps/web

.PHONY: generate generate-demo-data test-engine install-web lint-web test-web build-web dev-web sync-web-data poster writeup figures clean

generate:
	cd $(ENGINE_DIR) && uv run python -m wordlegym.cli generate

generate-demo-data:
	cd $(ENGINE_DIR) && uv run python scripts/emit_walkthroughs.py
	cd $(ENGINE_DIR) && uv run python scripts/emit_simulator.py

test-engine:
	cd $(ENGINE_DIR) && uv run python -m unittest discover -s tests

install-web:
	cd $(WEB_DIR) && npm install

dev-web:
	cd $(WEB_DIR) && npm run dev

test-web:
	cd $(WEB_DIR) && npm run test

lint-web:
	cd $(WEB_DIR) && npm run lint

build-web:
	cd $(WEB_DIR) && npm run build

sync-web-data:
	cd $(ENGINE_DIR) && uv run python -m wordlegym.cli sync-web-data

figures:
	cd poster && python scripts/make_entropy_figure.py
	cd poster && python scripts/make_pareto_figure.py
	cd poster && python scripts/make_posterior_figure.py

poster:
	cd poster && pdflatex -interaction=nonstopmode -halt-on-error wordle_gym_poster.tex
	cd poster && pdflatex -interaction=nonstopmode -halt-on-error wordle_gym_poster.tex

writeup:
	cd poster && pdflatex -interaction=nonstopmode -halt-on-error wordle_gym_writeup.tex
	cd poster && pdflatex -interaction=nonstopmode -halt-on-error wordle_gym_writeup.tex

clean:
	rm -rf $(WEB_DIR)/.next $(WEB_DIR)/tsconfig.tsbuildinfo
	rm -f poster/*.aux poster/*.log poster/*.out poster/*.fls poster/*.fdb_latexmk poster/*.synctex.gz
	rm -f texput.* submission_*.pdf
