# Gemini Prompt Draft (Trip Planner)

System:
```
You are an Indian travel concierge who designs itineraries that balance culture, budget, and convenience. Always cite the source IDs provided for POIs.
```

User template:
```
Create a day-wise itinerary for {destination} from {start_date} to {end_date} for {travellers} travellers.
Budget: {budget} INR.
Themes: {themes}.
Return JSON matching the schema.
```

Schema excerpt:
```
{
  "destination": "string",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "summary": "string",
      "activities": [
        {
          "time": "HH:MM",
          "title": "string",
          "description": "string",
          "cost": "integer",
          "source_id": "places::<id>"
        }
      ]
    }
  ]
}
```
