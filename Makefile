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

#	Docker Buildkit -> docker build -file -path -tag -args - todo: maybe refactor docker stuff for better managment
build_image_tradetally:
	@DOCKER_BUILDKIT=1 docker build -f ./Dockerfile ./ -t $(TRADETALLY_IMAGE_TAG_DEV) $(BUILD_IMAGE_ARGS)

build_service_images:
	$(MAKE) build_image_tradetally

install_npm_backend:
	$(MAKE) --directory ./backend check_env_file
	$(MAKE) --directory ./backend install

install_npm_frontend:
	$(MAKE) --directory ./frontend check_env_file
	$(MAKE) --directory ./frontend install

build_npm_backend:
	$(MAKE) --directory ./frontend build

build_npm_frontend:
	$(MAKE) --directory ./backend build

init:
	$(MAKE) pull_base_images
	$(MAKE) build_service_images -j $(CPU_CORES) BUILD_IMAGE_ARGS=--no-cache
	$(MAKE) install_npm_backend
	$(MAKE) install_npm_frontend

startup: check_env_file check_env
	@case "$(ENV)" in \
		development) \
			docker compose -f docker-compose.dev.yaml up -d ;; \
		production) \
			docker compose -f docker-compose.yml up -d ;; \
		*) \
			echo "Invalid ENV '$(ENV)'"; exit 1 ;; \
	esac

docker_logs_app:
	docker compose logs -f app;

stop:
	docker compose down app postgres --remove-orphans --volumes --timeout 30