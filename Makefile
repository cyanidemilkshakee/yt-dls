.PHONY: build run run-dev test test-race lint cross frontend
build:
	npm run build
run:
	npm start
run-dev:
	npm run dev
test:
	npm test
test-race:
	npm run test:race
lint:
	npm run lint
cross:
	npm run build:all
frontend:
	npm run build:frontend
