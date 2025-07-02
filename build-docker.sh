#!/bin/bash

# Build and publish TradeTally Docker image
# This script builds the Docker image with all latest features including:
# - Trade chart visualization (Alpha Vantage + lightweight-charts)
# - Short position P&L fixes
# - All API integrations (Finnhub, Gemini, Alpha Vantage)

set -e

echo "🏗️  Building TradeTally Docker image..."

# Get version from package.json or use latest
VERSION=${1:-latest}
IMAGE_NAME="potentialmidas/tradetally"

echo "📦 Building image: ${IMAGE_NAME}:${VERSION}"

# Build the Docker image
docker build -t "${IMAGE_NAME}:${VERSION}" .

# Also tag as latest if building a specific version
if [ "$VERSION" != "latest" ]; then
    docker tag "${IMAGE_NAME}:${VERSION}" "${IMAGE_NAME}:latest"
fi

echo "✅ Build complete!"
echo ""
echo "🚀 To publish to Docker Hub:"
echo "   docker push ${IMAGE_NAME}:${VERSION}"
if [ "$VERSION" != "latest" ]; then
    echo "   docker push ${IMAGE_NAME}:latest"
fi
echo ""
echo "🧪 To test locally:"
echo "   docker-compose up -d"
echo ""
echo "📋 Image includes:"
echo "   ✅ Trade chart visualization (Alpha Vantage API)"
echo "   ✅ Interactive candlestick charts (lightweight-charts v5)"
echo "   ✅ Real-time quotes (Finnhub API)"
echo "   ✅ CUSIP resolution (Finnhub + Gemini AI)"
echo "   ✅ Short position P&L fixes"
echo "   ✅ Mobile app support"
echo "   ✅ All latest features from v1.1.2+"