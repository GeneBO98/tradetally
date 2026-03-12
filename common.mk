#	Include-Guard - Always keep on the Top
ifndef COMMON_MK
COMMON_MK := 1

#	Parallel Execution
CPU_CORES := `nproc` # Call System to get CPU_CORE COUNT
CPU_CORES := 4 # this is a safe setting

NODE_MODULES_BIN := ./node_modules/.bin

#	System Environment
ENV ?= development
VALID_ENVS := development production

#	ENVIRONMENT File Used in docker - currently only root .env needed, dont know why backend/frontend has one without usage
ENV_APP_FILE = .env

#	Image to Pull for Usage or Build on
POSTGRES_IMAGE_TAG = postgres:16-alpine
NODE_IMAGE_TAG = node:20-alpine3.21
ADMINER_IMAGE_TAG = adminer:latest
TRADETALLY_IMAGE_TAG = potentialmidas/tradetally:latest

# Developer Build Images
TRADETALLY_IMAGE_TAG_DEV = tradetally-app:dev

check_env:
	@if [ -z "$(filter $(ENV),$(VALID_ENVS))" ]; then \
		echo "Invalid ENV '$(ENV)'"; \
		echo "Allowed: $(VALID_ENVS)"; \
		exit 1; \
	fi

check_env_file:
	@if [ ! -f $(ENV_APP_FILE) ]; then \
		echo "$(ENV_APP_FILE) not found in $(PWD), create and configure $(ENV_APP_FILE)-example"; \
		exit 1; \
	fi

npm: ## Runs `npm <CMD> <ARGS>`
	@CID=$$(docker create --init -w /srv/app ${NODE_IMAGE_TAG} ${CMD} ${ARGS}) && \
	docker cp -a package.json $${CID}:/srv/app/. && \
	if [ -f "package-lock.json" ]; then \
		docker cp -a package-lock.json $${CID}:/srv/app/.; \
	fi && \
	if [ -d "node_modules" ]; then \
		docker cp -a node_modules $${CID}:/srv/app/.; \
	fi && \
	if [ -f ".npmrc" ]; then \
		docker cp -a .npmrc $${CID}:/srv/app/.; \
	fi && \
	docker start -a $${CID} >&1 && \
	docker cp -a $${CID}:/srv/app/package.json . && \
	docker cp -a $${CID}:/srv/app/package-lock.json . && \
	if docker cp -a $${CID}:/srv/app/node_modules ./node_modules.tmp 2>/dev/null; then \
		rm -rf node_modules; \
		mv node_modules.tmp node_modules; \
	fi && \
	if [ -v ${CID} ]; then \
		docker rm $${CID}; \
	fi

install: ## Runs `npm install <ARGS>`
	@$(MAKE) -s npm CMD="npm install"

update: ## Runs `npm update <ARGS>`
	@$(MAKE) -s npm CMD="npm update"

update_check:
	@$(MAKE) -s npm CMD="/bin/sh -c 'npm outdated; npm audit'"

build:
	@case "$(ENV)" in \
	development) \
		$(MAKE) -s npm CMD="npm run dev";; \
	production) \
		$(MAKE) -s npm CMD="npm run build";; \
	*) \
		echo "Invalid ENV '$(ENV)'"; exit 1 ;; \
	esac

test_unit: ## Runs unit tests
	@CID=$$(docker create --init -w /srv/app ${NODE_IMAGE_TAG} $(NODE_MODULES_BIN)/jest \
		--maxWorkers=$(CPU_CORES) \
		--config jest.config.js \
		--coverageThreshold=\"{}\" ${ARGS} 2>&1) && \
	docker cp -a src $${CID}:/srv/app/. && \
	docker cp -a tests $${CID}:/srv/app/. && \
	docker cp -a node_modules $${CID}:/srv/app/. && \
	docker cp -a jest.config.js $${CID}:/srv/app/. && \
	docker cp -a package.json $${CID}:/srv/app/. && \
	docker cp -a package-lock.json $${CID}:/srv/app/. && \
	docker start -a $${CID} || exit 1 && \
	docker cp -a $${CID}:/srv/app/test/coverage test/ ; \
	if [ -v ${CID} ]; then \
		docker rm $${CID}; \
	fi

#	Include-Guard End - Never write Targets below endif
endif