# Include Shared Maketargets and Variables
include ./common.mk

pull_base_postgres_image:
	@docker pull $(POSTGRES_IMAGE_TAG);

pull_base_node_image:
	@docker pull $(NODE_IMAGE_TAG)

pull_base_adminer_image:
	@docker pull $(ADMINER_IMAGE_TAG);

#	Currently no use, but is referenced in docker-compose.dev2.yaml
pull_tradetally_image:
	@docker pull $(TRADETALLY_IMAGE_TAG);

#	RUN multiple Pull Images: make -j $(CPU_CORES) -O pull_base_images
pull_base_images:
	$(MAKE) pull_base_postgres_image
	$(MAKE) pull_base_node_image
	$(MAKE) pull_base_adminer_image

build_image_tradetally:
	@DOCKER_BUILDKIT=1 docker build -f ./Dockerfile ./ -t $(TRADETALLY_IMAGE_TAG_DEV) $(BUILD_IMAGE_ARGS)

build_service_images:
	$(MAKE) build_image_tradetally BUILD_IMAGE_ARGS=$(BUILD_IMAGE_ARGS)

install_npm_backend:
	$(MAKE) --directory ./backend install ARGS=$(ARGS)

install_npm_frontend:
	$(MAKE) --directory ./frontend install ARGS=$(ARGS)

init:
	$(MAKE) pull_base_images
	$(MAKE) build_service_images -j $(CPU_CORES) BUILD_IMAGE_ARGS=--no-cache
	$(MAKE) install_npm_backend ARGS=--install-dev
	$(MAKE) install_npm_frontend ARGS=--install-dev

startup: check_env
	@case "$(ENV)" in \
		development) \
			docker compose -f docker-compose.dev.yaml up -d ;; \
		production) \
			docker compose -f docker-compose.yml up -d ;; \
		*) \
			echo "Invalid ENV '$(ENV)'"; exit 1 ;; \
	esac

stop:
	docker compose down --remove-orphans --volumes --timeout 10
