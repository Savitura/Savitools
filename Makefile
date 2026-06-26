.PHONY: dev seed test reset logs

dev:
	docker compose -f docker-compose.dev.yml up -d

seed:
	docker compose -f docker-compose.dev.yml exec -T api sh -c "npx ts-node scripts/seed.ts"

test:
	npm run test

reset:
	docker compose -f docker-compose.dev.yml down -v --remove-orphans
	docker compose -f docker-compose.dev.yml rm -f -v

logs:
	docker compose -f docker-compose.dev.yml logs -f
