.PHONY: import-content validate-content test-content-solutions test-validator test-backend test-frontend lint format up

import-content:
	node scripts/import-metodichka.mjs --through=F --reset

validate-content:
	node scripts/validate-content.mjs

test-content-solutions:
	node scripts/validate-content.mjs --solutions-only

test-validator:
	node scripts/validate-content.test.mjs

test-backend:
	cd backend && go test ./...

test-frontend:
	cd frontend && npm test -- --run

lint:
	cd frontend && npm run lint

format:
	cd frontend && npm run format

up:
	docker compose up --build
