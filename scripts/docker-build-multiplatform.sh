#!/bin/bash

# Build multi-platform Docker image for TradeTally
# Supports both AMD64 (x64) and ARM64 architectures

IMAGE_NAME="tradetally"
VERSION="${1:-latest}"

echo "Building multi-platform Docker image: ${IMAGE_NAME}:${VERSION}"
echo "Platforms: linux/amd64, linux/arm64"

# Ensure Docker buildx is available
docker buildx create --use --name multiplatform-builder 2>/dev/null || docker buildx use multiplatform-builder

# Build for both platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t "${IMAGE_NAME}:${VERSION}" \
  --push \
  .

echo "Multi-platform build complete!"
echo "Image supports both x64 (Intel/AMD) and ARM64 (Apple Silicon) architectures"