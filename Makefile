.PHONY: import-content import-theory validate-content validate-lesson-content lesson-content-redesign-map test-import-theory test-content-solutions test-validator test-exercise-bank exercise-redesign-map acceptance test-backend test-frontend lint format up

import-content:
	node scripts/import-metodichka.mjs --through=F --reset

import-theory:
	node scripts/import-metodichka.mjs --through=F --theory-only

validate-lesson-content:
	node scripts/validate-lesson-content.mjs

lesson-content-redesign-map:
	node scripts/write-lesson-content-redesign-map.mjs

test-import-theory:
	node scripts/import-theory.test.mjs

validate-content:
	node scripts/validate-content.mjs

test-content-solutions:
	node scripts/validate-content.mjs --solutions-only

test-validator:
	node scripts/validate-content.test.mjs

test-exercise-bank:
	node scripts/validate-exercise-bank.mjs

exercise-redesign-map:
	node scripts/write-exercise-redesign-map.mjs

acceptance:
	node scripts/final-acceptance.mjs

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
