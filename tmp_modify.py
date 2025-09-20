from pathlib import Path
import textwrap

path = Path('api/main.py')
text = path.read_text()
old = "        store_live_cache(cache_key, merged)\n    return merged, {\"source\": \"gemini\", \"cacheKey\": cache_key}\n"
new = "        if _matches_destination(merged, prefs.destination):\n            store_live_cache(cache_key, merged)\n        else:\n            logger.warning(\"Skipping cache store: model responded for a different city\")\n    return merged, {\"source\": \"gemini\", \"cacheKey\": cache_key}\n"
if old not in text:
    raise SystemExit('target block not found')
text = text.replace(old, new)
if '_matches_destination' not in text:
    helper = textwrap.dedent('''
        \ndef _matches_destination(payload: dict[str, Any], expected_destination: str) -> bool:
            dest = (payload.get("destination") or "").lower()
            expected = (expected_destination or "").lower()
            if dest and expected and expected not in dest:
                return False
            if "days" in payload:
                lower_expected = expected.split(",")[0].strip()
                if lower_expected:
                    for day in payload.get("days", []):
                        for activity in day.get("activities", []):
                            location = (activity.get("location") or "").lower()
                            if location and lower_expected not in location:
                                return False
            return True
    ''')
    insert_at = text.find('\ndef merge_live_payload')
    text = text[:insert_at] + helper + text[insert_at:]
path.write_text(text)
