import base64
import json
import logging
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Body, HTTPException, Path
from fastapi.responses import JSONResponse

try:
    from google.cloud import speech, texttospeech
except ImportError as exc:  # pragma: no cover
    raise RuntimeError(
        "google-cloud-speech and google-cloud-texttospeech must be installed to use voice mode."
    ) from exc

try:
    from dateutil import parser as date_parser  # type: ignore
except ImportError as exc:  # pragma: no cover
    raise RuntimeError("python-dateutil is required for parsing natural language dates.") from exc

logger = logging.getLogger(__name__)

router = APIRouter()

SESSION_TIMEOUT = timedelta(minutes=20)
GREETING = (
    "Hey I am Ava, your personalized trip planning assistant. "
    "How may I help you today?"
)


class VoiceAssistantError(RuntimeError):
    """Base error for voice assistant failures."""


class TTSUnavailableError(VoiceAssistantError):
    """Raised when Text-to-Speech is unavailable."""


_sessions: Dict[str, Dict[str, Any]] = {}
_tts_client: Optional[texttospeech.TextToSpeechClient] = None
_stt_client: Optional[speech.SpeechClient] = None


def _tts() -> texttospeech.TextToSpeechClient:
    global _tts_client
    if _tts_client is None:
        _tts_client = texttospeech.TextToSpeechClient()
    return _tts_client


def _stt() -> speech.SpeechClient:
    global _stt_client
    if _stt_client is None:
        _stt_client = speech.SpeechClient()
    return _stt_client


def _cleanup_sessions() -> None:
    now = datetime.utcnow()
    expired = [sid for sid, data in _sessions.items() if now - data["created_at"] > SESSION_TIMEOUT]
    for sid in expired:
        _sessions.pop(sid, None)


FLOW: List[Dict[str, Any]] = [
    {
        "slot": "origin",
        "question": "To begin, which city are you travelling from?",
        "ack": lambda value: f"Perfect, we'll start right from {value}.",
    },
    {
        "slot": "destination",
        "question": "Lovely. Where would you like to visit?",
        "ack": lambda value: f"Wonderful choice—{value} it is.",
    },
    {
        "slot": "start_date",
        "question": "When does your trip start? Please share the start date.",
        "ack": lambda value: f"Got it. We'll kick things off on {value}.",
    },
    {
        "slot": "end_date",
        "question": "And when will you return home?",
        "ack": lambda value: f"Great, wrapping things up on {value}.",
    },
    {
        "slot": "travellers",
        "question": "How many travellers are in your party?",
        "ack": lambda value: f"Noted. Planning for {value} traveller{'s' if int(value) != 1 else ''}.",
    },
    {
        "slot": "budget",
        "question": "What overall budget in Indian rupees should I plan within?",
        "ack": lambda value: f"Thanks. I'll keep the trip within ₹{int(value):,}.",
    },
    {
        "slot": "themes",
        "question": "What kind of experiences excite you? You can mention things like heritage, food, beaches, wellness, and more.",
        "ack": lambda value: f"Absolutely. I'll focus on {value}.",
    },
]


def _synthesize(text: str) -> str:
    try:
        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice_params = texttospeech.VoiceSelectionParams(
            language_code="en-US",
            name="en-US-Neural2-F",
            ssml_gender=texttospeech.SsmlVoiceGender.FEMALE,
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=1.02,
        )
        response = _tts().synthesize_speech(
            input=synthesis_input,
            voice=voice_params,
            audio_config=audio_config,
        )
    except Exception as exc:  # pragma: no cover
        logger.error("Text-to-Speech synthesis failed: %s", exc, exc_info=True)
        raise TTSUnavailableError("Text-to-Speech is unavailable.") from exc
    return base64.b64encode(response.audio_content).decode("utf-8")


def _transcribe(audio_base64: str) -> str:
    if not audio_base64:
        raise HTTPException(status_code=400, detail="No audio payload received.")
    audio_content = base64.b64decode(audio_base64)
    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
        language_code="en-US",
        enable_automatic_punctuation=True,
    )
    audio = speech.RecognitionAudio(content=audio_content)
    response = _stt().recognize(config=config, audio=audio)
    for result in response.results:
        if result.alternatives:
            return result.alternatives[0].transcript.strip()
    return ""


def _slot_index(session: Dict[str, Any]) -> int:
    return session.get("current_index", 0)


def _next_slot(session: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    index = _slot_index(session)
    if index >= len(FLOW):
        return None
    return FLOW[index]


def _parse_slot_value(slot: str, utterance: str) -> Optional[Any]:
    utterance = utterance.strip()
    if not utterance:
        return None
    lower = utterance.lower()
    if slot in {"origin", "destination"}:
        return utterance.title()
    if slot in {"start_date", "end_date"}:
        try:
            date_value = date_parser.parse(utterance, fuzzy=True).date()
            return date_value.isoformat()
        except Exception:
            return None
    if slot == "travellers":
        match = re.search(r"\d+", lower)
        if match:
            value = max(1, int(match.group()))
            return value
        words_to_numbers = {
            "one": 1,
            "two": 2,
            "three": 3,
            "four": 4,
            "five": 5,
            "six": 6,
        }
        for word, number in words_to_numbers.items():
            if word in lower:
                return number
        return None
    if slot == "budget":
        digits = re.findall(r"\d+", lower.replace(",", ""))
        if digits:
            amount = int("".join(digits))
            if amount < 5000:
                amount *= 100  # assume spoken in thousands
            return max(10000, amount)
        return None
    if slot == "themes":
        tokens = re.split(r"[,&]| and ", lower)
        cleaned = [token.strip().title() for token in tokens if token.strip()]
        return ", ".join(cleaned) if cleaned else None
    return utterance


def _acknowledge(slot: str, value: Any) -> str:
    for step in FLOW:
        if step["slot"] == slot:
            ack = step["ack"]
            return ack(value) if callable(ack) else str(ack)
    return "Great."


def _compose_question(slot: Dict[str, Any]) -> str:
    question = slot.get("question")
    return str(question) if question else ""


def _build_preferences(session: Dict[str, Any]) -> Dict[str, Any]:
    slots = session["slots"]
    themes_text = slots.get("themes") or ""
    theme_list = [item.strip().title() for item in themes_text.split(",") if item.strip()]
    if not theme_list:
        theme_list = ["Highlights"]
    travellers = int(slots["travellers"])
    travellers = max(1, min(6, travellers))
    budget_value = int(slots["budget"])
    budget_value = max(10000, min(500000, budget_value))
    preferences = {
        "origin": slots["origin"],
        "destination": slots["destination"],
        "startDate": slots["start_date"],
        "endDate": slots["end_date"],
        "budget": budget_value,
        "themes": theme_list,
        "travellers": travellers,
        "language": "English",
        "enableLiveData": True,
    }
    return preferences


def _generate_itinerary(pref_dict: Dict[str, Any]) -> Dict[str, Any]:
    from main import TripPreferences, ItineraryRequest, generate_live_itinerary  # lazy import to avoid cycle

    preferences = TripPreferences(**pref_dict)
    request = ItineraryRequest(preferences=preferences)
    response = generate_live_itinerary(request)
    if isinstance(response, JSONResponse):
        return json.loads(response.body)
    return response  # pragma: no cover


def _finalize_itinerary(session: Dict[str, Any]) -> Dict[str, Any]:
    preferences = _build_preferences(session)
    try:
        itinerary = _generate_itinerary(preferences)
    except Exception as exc:
        logger.error("Voice itinerary generation failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="I couldn't generate the itinerary right now.")
    summary = (
        f"All set. I've drafted a tailored itinerary from {preferences['startDate']} to {preferences['endDate']} "
        f"for your {preferences['destination']} getaway. The full plan is ready for you."
    )
    session["complete"] = True
    session["itinerary"] = itinerary
    session["preferences"] = preferences
    return {"message": summary, "itinerary": itinerary, "preferences": preferences}


def _ensure_session(session_id: str) -> Dict[str, Any]:
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")
    return session


@router.post("/api/v1/voice/session/start")
def start_voice_session():
    _cleanup_sessions()
    session_id = uuid4().hex
    session = {
        "id": session_id,
        "created_at": datetime.utcnow(),
        "current_index": 0,
        "slots": {},
        "complete": False,
    }
    _sessions[session_id] = session
    next_slot = _next_slot(session)
    question = _compose_question(next_slot) if next_slot else ""
    reply_text = f"{GREETING} {question}".strip()
    warnings: List[str] = []
    audio: Optional[str] = None
    try:
        audio = _synthesize(reply_text)
    except TTSUnavailableError:
        warnings.append(
            "Voice playback is unavailable right now, but we can continue via text prompts."
        )
    return JSONResponse(
        {
            "sessionId": session_id,
            "text": reply_text,
            "audio": audio,
            "warnings": warnings or None,
        }
    )


@router.post("/api/v1/voice/session/{session_id}/transcribe")
def transcribe_audio(session_id: str = Path(...), payload: Dict[str, Any] = Body(...)):
    _ensure_session(session_id)
    audio_b64 = payload.get("audio")
    transcript = _transcribe(audio_b64 or "")
    return JSONResponse({"transcript": transcript})


@router.post("/api/v1/voice/session/{session_id}/message")
def voice_session_message(session_id: str = Path(...), payload: Dict[str, Any] = Body(...)):
    session = _ensure_session(session_id)
    if session.get("complete"):
        itinerary = session.get("itinerary")
        preferences = session.get("preferences")
        reply_text = "Your itinerary is already ready. Feel free to ask for another plan whenever you like."
        return JSONResponse(
            {
                "reply": reply_text,
                "audio": None,
                "complete": True,
                "itinerary": itinerary,
                "preferences": preferences,
            }
        )

    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    current_step = _next_slot(session)
    if not current_step:
        if not session.get("complete"):
            try:
                final_result = _finalize_itinerary(session)
            except HTTPException as exc:
                raise exc
            except Exception as exc:  # pragma: no cover
                logger.error("Voice finalization failed: %s", exc, exc_info=True)
                raise HTTPException(status_code=500, detail="Something went wrong while preparing the itinerary.")
            reply_text = final_result["message"]
            warnings: List[str] = []
            audio: Optional[str] = None
            try:
                audio = _synthesize(reply_text)
            except TTSUnavailableError:
                warnings.append("Voice playback is unavailable right now, but your itinerary is ready in the planner.")
            return JSONResponse(
                {
                    "reply": reply_text,
                    "audio": audio,
                    "complete": True,
                    "itinerary": final_result["itinerary"],
                    "preferences": final_result["preferences"],
                    "warnings": warnings or None,
                }
            )
        reply_text = "Your itinerary is already ready. Feel free to ask for another plan whenever you like."
        return JSONResponse({"reply": reply_text, "audio": None, "complete": True})

    slot_name = current_step["slot"]
    parsed_value = _parse_slot_value(slot_name, message)
    if parsed_value is None:
        if slot_name == "start_date":
            prompt = "I missed that start date. Could you share it once more, including the month and day?"
        elif slot_name == "end_date":
            prompt = "I didn't quite catch the return date. Could you repeat it?"
        elif slot_name == "travellers":
            prompt = "Could you tell me how many travellers are going?"
        elif slot_name == "budget":
            prompt = "What total trip budget should I plan within in Indian rupees?"
        else:
            prompt = "Could you repeat that for me?"
        return JSONResponse({"reply": prompt, "audio": _synthesize(prompt), "complete": False})

    session["slots"][slot_name] = parsed_value
    session["current_index"] = _slot_index(session) + 1

    next_step = _next_slot(session)
    ack_text = _acknowledge(slot_name, parsed_value)
    if next_step:
        warnings: List[str] = []
        reply_text = f"{ack_text} {_compose_question(next_step)}"
        audio: Optional[str] = None
        try:
            audio = _synthesize(reply_text)
        except TTSUnavailableError:
            warnings.append("Voice playback is unavailable right now, continuing in text.")
        return JSONResponse(
            {"reply": reply_text, "audio": audio, "complete": False, "warnings": warnings or None}
        )

    # all slots collected
    try:
        final_result = _finalize_itinerary(session)
    except HTTPException as exc:
        raise exc
    except Exception as exc:  # pragma: no cover
        logger.error("Voice finalization failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Something went wrong while preparing the itinerary.")

    reply_text = final_result["message"]
    warnings: List[str] = []
    audio: Optional[str] = None
    try:
        audio = _synthesize(reply_text)
    except TTSUnavailableError:
        warnings.append("Voice playback is unavailable right now, but your itinerary is ready in the planner.")
    return JSONResponse(
        {
            "reply": reply_text,
            "audio": audio,
            "complete": True,
            "itinerary": final_result["itinerary"],
            "preferences": final_result["preferences"],
            "warnings": warnings or None,
        }
    )
