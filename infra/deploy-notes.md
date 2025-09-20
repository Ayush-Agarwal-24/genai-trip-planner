# Cloud Run deploy notes (draft)

## Build + push
`
gcloud builds submit --tag gcr.io//trip-planner-api ./api
`

## Deploy API
`
gcloud run deploy trip-planner-api \
  --image gcr.io//trip-planner-api \
  --region  \
  --allow-unauthenticated \
  --set-env-vars ENABLE_LIVE_SERVICES=false,GCP_PROJECT_ID=,GCP_LOCATION=
`

## Frontend
Use Cloud Run or Firebase Hosting (build via 
pm run build, deploy dist/).
