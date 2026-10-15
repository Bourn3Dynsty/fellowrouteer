#!/usr/bin/env bash
# Deploys Fellowroute to Google Cloud Run, set up to cost as little as possible:
# - scales to zero when nobody is using it (no idle cost)
# - one instance at most, because live-session rooms are held in that instance's memory
# - CPU billed only while handling requests (WebSocket connections count as requests)
#
# Usage: PROJECT=<gcp-project-id> [REGION=us-central1] deploy/cloudrun.sh
set -euo pipefail

PROJECT="${PROJECT:?set PROJECT to your Google Cloud project id}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-fellowroute}"

cd "$(dirname "$0")/.."

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
	--project "$PROJECT"

# Builds the Dockerfile with Cloud Build and deploys it.
gcloud run deploy "$SERVICE" \
	--project "$PROJECT" \
	--region "$REGION" \
	--source . \
	--allow-unauthenticated \
	--min-instances 0 \
	--max-instances 1 \
	--concurrency 250 \
	--cpu 1 \
	--memory 512Mi \
	--timeout 3600 \
	--session-affinity \
	--quiet

gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)'
