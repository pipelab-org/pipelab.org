.PHONY: brand check-brand check-rules-sync preflight

brand:
	python3 scripts/render_pipelab_brand.py

check-brand:
	python3 -m unittest scripts/brand_contract_test.py
	python3 scripts/render_pipelab_brand.py --check
	python3 scripts/brand_contract.py --site .

check-rules-sync:
	bash scripts/test-sync-pipelock-rules.sh

preflight:
	$(MAKE) check-brand
	$(MAKE) check-rules-sync
	npm test
	npm run site:build
	npm run site:corpus-counts
	npm run site:version-claims
	npm run site:render-diff
